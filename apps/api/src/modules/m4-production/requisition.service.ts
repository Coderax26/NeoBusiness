import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import { Qty } from '../../shared/utils/qty.util.js';
import {
  RequisitionRepository,
  RequisitionHeaderRow,
  RequisitionLineRow,
  RequisitionLineWithItem,
} from './repositories/requisition.repository.js';
import {
  CreateRequisitionDto,
  UpdateRequisitionDto,
  RequisitionStatus,
  RequisitionResponseDto,
  RequisitionLineResponseDto,
} from './dto/requisition.dto.js';
import {
  INVENTORY_PORT,
  PROCUREMENT_PORT,
  ITEM_PORT,
  type InventoryPort,
  type ProcurementPort,
  type ItemPort,
  type ItemSummary,
  type AtpResult,
} from '../../shared/ports/ports.interface.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { BomService } from './bom.service.js';

interface NetRequirement {
  itemId: string;
  itemName: string;
  itemSkuCode: string;
  requiredQty: string;
  uom: string;
  availableQty: string;
  inboundQty: string;
  netQty: string;
}

interface BomExplosionResult {
  itemId: string;
  totalQty: string;
  uom: string;
  sourceBomIds: string[];
}

@Injectable()
export class RequisitionService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly reqRepo: RequisitionRepository,
    private readonly bomService: BomService,
    @Inject(INVENTORY_PORT) private readonly inventoryPort: InventoryPort,
    @Inject(PROCUREMENT_PORT) private readonly procurementPort: ProcurementPort,
    @Inject(ITEM_PORT) private readonly itemPort: ItemPort,
    @Inject(forwardRef(() => OutboxService))
    private readonly outbox: OutboxService,
  ) {}

  async createRequisitionFromDto(
    dto: CreateRequisitionDto,
    createdBy: string,
  ): Promise<RequisitionResponseDto> {
    if (!dto.siteId) {
      throw new BadRequestException('siteId is required for requisition');
    }
    const reqNo =
      dto.reqNo?.trim() ||
      `REQ-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv7().slice(-4).toUpperCase()}`;
    const requestedBy = dto.requestedBy || createdBy;

    // Check if requisition number already exists for this site
    const exists = await this.reqRepo.headerExists(reqNo, dto.siteId);
    if (exists) {
      throw new ConflictException(
        `Requisition number ${reqNo} already exists for this site`,
      );
    }

    // Validate all line items exist and are RAW_MATERIAL or PACKAGING
    for (const line of dto.lines) {
      const lineItem = await this.itemPort.getItem(line.itemId);
      if (!lineItem) {
        throw new NotFoundException(`Line item ${line.itemId} not found`);
      }
      if (!['RAW_MATERIAL', 'PACKAGING'].includes(lineItem.category)) {
        throw new BadRequestException(
          `Requisition line item ${line.itemId} must be RAW_MATERIAL or PACKAGING, got ${lineItem.category}`,
        );
      }
    }

    // Validate BOM references if provided
    if (dto.lines.some((l) => l.bomHeaderId)) {
      for (const line of dto.lines) {
        if (line.bomHeaderId) {
          const bom = await this.bomService.getBom(line.bomHeaderId);
          if (!bom) {
            throw new NotFoundException(`BOM ${line.bomHeaderId} not found`);
          }
          if (bom.status !== 'ACTIVE') {
            throw new BadRequestException(
              `BOM ${line.bomHeaderId} is not ACTIVE`,
            );
          }
        }
      }
    }

    const createdHeaderId = await this.knex.transaction(async (trx) => {
      const headerId = uuidv7();
      await trx('production_requisitions')
        .insert({
          id: headerId,
          req_no: reqNo,
          site_id: dto.siteId,
          requested_by: requestedBy,
          required_by_date: dto.requiredByDate,
          status: dto.status,
          created_by: createdBy,
          updated_by: createdBy,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning('*');

      const lines = dto.lines.map((line) => ({
        id: uuidv7(),
        requisition_id: headerId,
        item_id: line.itemId,
        required_qty: line.requiredQty,
        uom: line.uom,
        bom_header_id: line.bomHeaderId || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      if (lines.length > 0) {
        await trx('production_requisition_lines').insert(lines);
      }

      return headerId;
    });

    return this.getRequisitionResponse(createdHeaderId);
  }

  /**
   * ProductionPort interface implementation.
   * Creates a production requisition from a sales order line demand.
   * Used by M1 Commercial module via port token.
   */
  async createRequisition(
    sourceOrderLineId: string,
    finishedItemId: string,
    netQty: string,
    requiredBy: Date,
  ): Promise<string> {
    const context = await this.resolveOrderContext(sourceOrderLineId);
    const siteId = context.siteId || (await this.getSiteIdForItem(finishedItemId));
    const actorId = context.actorId || (await this.getDefaultActorId());
    if (!actorId) {
      throw new BadRequestException(
        'Cannot create production requisition without a valid actor user UUID',
      );
    }

    const activeBom = await this.bomService.getActiveBom(
      finishedItemId,
      siteId,
    );
    if (!activeBom) {
      throw new NotFoundException(
        `No active BOM found for finished item ${finishedItemId} at site ${siteId}`,
      );
    }

    // Explode BOM to get raw material requirements
    const linesWithItems = await this.knex('bom_lines as bl')
      .join('items as i', 'bl.item_id', 'i.id')
      .where('bl.bom_header_id', activeBom.id)
      .select(
        'bl.*',
        'i.name as item_name',
        'i.sku_code as item_sku_code',
        'i.primary_uom as item_primary_uom',
        'i.item_category as item_category',
      );

    // Calculate required RM quantities based on netQty
    const netQtyObj = Qty.of(netQty, 'KG'); // finished goods UoM
    const reqLines: Array<{
      itemId: string;
      requiredQty: string;
      uom: string;
      bomHeaderId: string;
    }> = [];

    for (const line of linesWithItems) {
      if (!['RAW_MATERIAL', 'PACKAGING'].includes(line.item_category)) {
        continue; // skip non-raw material lines
      }
      const qtyPerUnit = Qty.of(line.qty_per_unit, line.item_primary_uom);
      const requiredQty = netQtyObj
        .mul(qtyPerUnit.toNumber())
        .toStorageString();

      reqLines.push({
        itemId: line.item_id,
        requiredQty,
        uom: line.item_primary_uom,
        bomHeaderId: activeBom.id,
      });
    }

    if (reqLines.length === 0) {
      throw new BadRequestException(
        `No raw material lines found in BOM ${activeBom.bomNo} for finished item ${finishedItemId}`,
      );
    }

    // Create requisition with valid UUID actor references
    const reqNo = `REQ-${sourceOrderLineId.slice(-8)}-${uuidv7().slice(-4).toUpperCase()}`;
    const reqDto: CreateRequisitionDto = {
      reqNo,
      siteId,
      requestedBy: actorId,
      requiredByDate: requiredBy.toISOString().split('T')[0],
      status: RequisitionStatus.DRAFT,
      lines: reqLines,
    };

    const result = await this.createRequisitionFromDto(reqDto, actorId);
    return result.id;
  }

  private async resolveOrderContext(
    sourceOrderLineId: string,
  ): Promise<{ siteId: string | null; actorId: string | null }> {
    try {
      const row = await this.knex('sales_order_lines as sol')
        .join('sales_orders as so', 'sol.order_id', 'so.id')
        .where('sol.id', sourceOrderLineId)
        .first('so.site_id', 'so.created_by');
      if (row) {
        return {
          siteId: row.site_id ? String(row.site_id) : null,
          actorId: row.created_by ? String(row.created_by) : null,
        };
      }
    } catch {
      // Fallback for mocked or non-UUID source IDs
    }
    return { siteId: null, actorId: null };
  }

  private async getDefaultActorId(): Promise<string | null> {
    try {
      const [user] = await this.knex('users')
        .where('is_active', true)
        .limit(1)
        .select('id');
      return user?.id ? String(user.id) : null;
    } catch {
      return null;
    }
  }

  private async getSiteIdForItem(itemId: string): Promise<string> {
    const item = await this.itemPort.getItem(itemId);
    if (!item) {
      throw new NotFoundException(`Item ${itemId} not found`);
    }
    // Default to first site for now - in practice, resolve from context
    const [site] = await this.knex('sites').where('is_active', true).limit(1);
    return site?.id ?? '';
  }

  async generateRequisitionFromDemand(
    siteId: string,
    demands: Array<{ itemId: string; qty: string; requiredBy: string }>,
    requestedBy: string,
    reqNoPrefix = 'REQ',
  ): Promise<RequisitionResponseDto> {
    let effectiveDemands = Array.isArray(demands) ? demands : [];
    if (effectiveDemands.length === 0) {
      const plannedWos = await this.knex('production_work_orders as wo')
        .join('bom_headers as bh', 'wo.bom_header_id', 'bh.id')
        .where({ 'wo.site_id': siteId, 'wo.status': 'PLANNED' })
        .select('bh.item_id', 'wo.planned_qty');
      effectiveDemands = plannedWos.map((w: any) => ({
        itemId: String(w.item_id),
        qty: String(w.planned_qty),
        requiredBy: new Date().toISOString().slice(0, 10),
      }));
    }
    if (effectiveDemands.length === 0) {
      // Fallback: inspect confirmed / sourcing sales orders at this site that have an active BOM
      const soDemandRows = await this.knex('sales_order_lines as sol')
        .join('sales_orders as so', 'sol.order_id', 'so.id')
        .join('bom_headers as bh', function () {
          this.on('bh.item_id', '=', 'sol.item_id')
            .andOn('bh.site_id', '=', 'so.fulfillment_site_id')
            .andOnVal('bh.status', '=', 'ACTIVE');
        })
        .where('so.fulfillment_site_id', siteId)
        .whereIn('so.order_status', ['CONFIRMED', 'IN_PRODUCTION_SOURCING'])
        .select('sol.item_id', 'sol.ordered_qty as planned_qty', 'so.delivery_date');
      effectiveDemands = soDemandRows.map((r: any) => ({
        itemId: String(r.item_id),
        qty: String(r.planned_qty),
        requiredBy: r.delivery_date
          ? new Date(r.delivery_date).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10),
      }));
    }
    if (effectiveDemands.length === 0) {
      throw new BadRequestException(
        'No planned Work Orders or active Sales Orders with an ACTIVE BOM found at this site. Create a Work Order or create a manual Raw Material Requisition.',
      );
    }

    // Step 1: Explode BOMs for each finished good demand
    const explosions: BomExplosionResult[] = [];
    for (const demand of effectiveDemands) {
      const activeBom = await this.bomService.getActiveBom(
        demand.itemId,
        siteId,
      );
      if (!activeBom) {
        throw new NotFoundException(
          `No active BOM found for item ${demand.itemId} at site ${siteId}`,
        );
      }
      const linesWithItems = await this.knex('bom_lines as bl')
        .join('items as i', 'bl.item_id', 'i.id')
        .where('bl.bom_header_id', activeBom.id)
        .select(
          'bl.*',
          'i.name as item_name',
          'i.sku_code as item_sku_code',
          'i.primary_uom as item_primary_uom',
        );

      for (const line of linesWithItems) {
        // Calculate total required qty = demand.qty * qty_per_unit
        const demandQty = Qty.of(demand.qty, line.item_primary_uom);
        const qtyPerUnit = Qty.of(line.qty_per_unit, line.item_primary_uom);
        const requiredQty = demandQty
          .mul(qtyPerUnit.toNumber())
          .toStorageString();

        const existing = explosions.find((e) => e.itemId === line.item_id);
        if (existing) {
          const existingQty = Qty.of(existing.totalQty, existing.uom);
          const addQty = Qty.of(requiredQty, line.item_primary_uom);
          existing.totalQty = existingQty.add(addQty).toStorageString();
          existing.sourceBomIds.push(activeBom.id);
        } else {
          explosions.push({
            itemId: line.item_id,
            totalQty: requiredQty,
            uom: line.item_primary_uom,
            sourceBomIds: [activeBom.id],
          });
        }
      }
    }

    // Step 2: Aggregate by item_id (deduplicate across multiple BOMs)
    const aggregated = new Map<string, BomExplosionResult>();
    for (const exp of explosions) {
      const existing = aggregated.get(exp.itemId);
      if (existing) {
        const existingQty = Qty.of(existing.totalQty, existing.uom);
        const addQty = Qty.of(exp.totalQty, exp.uom);
        existing.totalQty = existingQty.add(addQty).toStorageString();
        existing.sourceBomIds.push(...exp.sourceBomIds);
      } else {
        aggregated.set(exp.itemId, {
          ...exp,
          sourceBomIds: [...exp.sourceBomIds],
        });
      }
    }

    // Step 3: For each item, check available stock and inbound POs
    const netRequirements: NetRequirement[] = [];
    for (const [itemId, exp] of aggregated) {
      const item = await this.itemPort.getItem(itemId);
      if (!item) continue;

      // Get available stock from InventoryPort using real siteId
      const atpResult = await this.inventoryPort.checkATP(
        siteId,
        itemId,
        exp.totalQty,
        new Date().toISOString().split('T')[0],
      );

      const availableQty = atpResult?.availableQty ?? '0';
      const totalQty = Qty.of(exp.totalQty, exp.uom);
      const availQty = Qty.of(availableQty, exp.uom);

      // Get inbound PO quantity from ProcurementPort
      const inboundQtyStr = await this.procurementPort.getInboundQty(
        itemId,
        siteId,
      );
      const inboundQty = Qty.of(inboundQtyStr, exp.uom);

      // Net = required - available - inbound (POs not yet received)
      const totalCovered = availQty.add(inboundQty);
      const netQty = totalQty.sub(totalCovered).toStorageString();

      if (Qty.of(netQty, exp.uom).isGreaterThan(Qty.zero(exp.uom))) {
        netRequirements.push({
          itemId,
          itemName: item.name,
          itemSkuCode: item.skuCode,
          requiredQty: exp.totalQty,
          uom: exp.uom,
          availableQty,
          inboundQty: inboundQty.toStorageString(),
          netQty,
        });
      }
    }

    // Step 4: Create requisition with only positive net requirements
    if (netRequirements.length === 0) {
      throw new BadRequestException(
        'All raw material requirements are covered by existing stock',
      );
    }

    // Generate requisition number
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = await this.getNextSequence(siteId, 'REQ');
    const reqNo = `${reqNoPrefix}-${dateStr}-${String(seq).padStart(4, '0')}`;

    const lines: CreateRequisitionDto['lines'] = netRequirements.map((nr) => ({
      itemId: nr.itemId,
      requiredQty: nr.netQty,
      uom: nr.uom,
      bomHeaderId: undefined,
    }));

    return this.createRequisitionFromDto(
      {
        reqNo,
        siteId,
        requestedBy,
        requiredByDate:
          effectiveDemands[0]?.requiredBy ??
          new Date().toISOString().slice(0, 10),
        status: RequisitionStatus.DRAFT,
        lines,
      },
      requestedBy,
    );
  }

  private async getNextSequence(
    siteId: string,
    docType: string,
  ): Promise<number> {
    const [row] = await this.knex('doc_sequences')
      .where('doc_type', docType)
      .andWhere('site_id', siteId)
      .increment('last_no', 1)
      .returning('last_no');
    return row?.last_no ?? Number(Date.now().toString().slice(-4));
  }

  async getRequisition(reqId: string): Promise<RequisitionResponseDto> {
    const header = await this.reqRepo.getHeaderById(reqId);
    if (!header) {
      throw new NotFoundException(`Requisition ${reqId} not found`);
    }
    return this.getRequisitionResponse(reqId);
  }

  async listRequisitions(
    siteId?: string,
    status?: string,
  ): Promise<RequisitionResponseDto[]> {
    const headers = await this.reqRepo.getHeaders(siteId, status);
    const results: RequisitionResponseDto[] = [];
    for (const header of headers) {
      results.push(await this.getRequisitionResponse(header.id));
    }
    return results;
  }

  async updateRequisition(
    reqId: string,
    dto: UpdateRequisitionDto,
    updatedBy: string,
  ): Promise<RequisitionResponseDto> {
    const header = await this.reqRepo.getHeaderById(reqId);
    if (!header) {
      throw new NotFoundException(`Requisition ${reqId} not found`);
    }

    if (
      header.status === RequisitionStatus.CONVERTED ||
      header.status === RequisitionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot update requisition in ${header.status} status`,
      );
    }

    const updateData: Record<string, unknown> = {
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };

    if (dto.status) updateData.status = dto.status;
    if (dto.requiredByDate) updateData.required_by_date = dto.requiredByDate;

    await this.reqRepo.updateHeader(reqId, updateData);

    if (dto.lines) {
      // Validate all line items
      for (const line of dto.lines) {
        const lineItem = await this.itemPort.getItem(line.itemId);
        if (!lineItem) {
          throw new NotFoundException(`Line item ${line.itemId} not found`);
        }
        if (!['RAW_MATERIAL', 'PACKAGING'].includes(lineItem.category)) {
          throw new BadRequestException(
            `Requisition line item ${line.itemId} must be RAW_MATERIAL or PACKAGING`,
          );
        }
      }

      // Delete and recreate lines
      await this.reqRepo.deleteLines(reqId);
      const lines = dto.lines.map((line, index) => ({
        id: uuidv7(),
        requisition_id: reqId,
        item_id: line.itemId,
        required_qty: line.requiredQty,
        uom: line.uom,
        bom_header_id: line.bomHeaderId ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
      await this.reqRepo.createLines(lines);
    }

    return this.getRequisitionResponse(reqId);
  }

  async approveRequisition(
    reqId: string,
    approvedBy: string,
  ): Promise<RequisitionResponseDto> {
    const header = await this.reqRepo.getHeaderById(reqId);
    if (!header) {
      throw new NotFoundException(`Requisition ${reqId} not found`);
    }

    if (
      header.status !== RequisitionStatus.DRAFT &&
      header.status !== RequisitionStatus.PENDING
    ) {
      throw new BadRequestException(
        `Cannot approve requisition in ${header.status} status`,
      );
    }

    await this.reqRepo.updateHeader(reqId, {
      status: RequisitionStatus.APPROVED,
      updated_by: approvedBy,
      updated_at: new Date().toISOString(),
    });

    return this.getRequisitionResponse(reqId);
  }

  async convertToPo(
    reqId: string,
    convertedBy: string,
  ): Promise<{ requisition: RequisitionResponseDto; poIds: string[] }> {
    const header = await this.reqRepo.getHeaderById(reqId);
    if (!header) {
      throw new NotFoundException(`Requisition ${reqId} not found`);
    }

    if (header.status !== RequisitionStatus.APPROVED) {
      throw new BadRequestException(
        `Can only convert APPROVED requisitions to PO, current status: ${header.status}`,
      );
    }

    const lines = await this.reqRepo.getLinesWithItems(reqId);
    const poIds: string[] = [];
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const now = new Date();

    // Group lines by primary approved supplier when available; otherwise queue purchase_requisitions
    for (const line of lines) {
      const supplierRow = await this.knex('supplier_items as si')
        .join('suppliers as s', 'si.supplier_id', 's.id')
        .where({ 'si.item_id': line.item_id, 's.is_active': true })
        .orderByRaw('si.is_primary DESC, s.is_approved DESC')
        .first('s.id as supplier_id', 's.lead_time_days_avg');

      if (supplierRow?.supplier_id) {
        const rateRow = await this.knex('supplier_rate_quotes')
          .where({ supplier_id: supplierRow.supplier_id, item_id: line.item_id })
          .orderBy('quoted_at', 'desc')
          .first('quoted_price');
        const poLineFallback = !rateRow
          ? await this.knex('purchase_order_lines')
              .where({ item_id: line.item_id })
              .orderBy('created_at', 'desc')
              .first('unit_price')
          : null;
        const unitPrice = Number(
          rateRow?.quoted_price ?? poLineFallback?.unit_price ?? 0,
        );
        const qtyNum = Number(line.required_qty || 0);
        const lineTotal = Number((qtyNum * unitPrice).toFixed(2));
        const poSeq = await this.getNextSequence(header.site_id, 'PO');
        const poId = uuidv7();
        const poNo = `PO-${dateStr}-${String(poSeq).padStart(4, '0')}`;
        const leadDays = Number(supplierRow.lead_time_days_avg ?? 2);
        const expectedDate = new Date(Date.now() + leadDays * 86400000);

        await this.knex.transaction(async (trx) => {
          await trx('purchase_orders').insert({
            id: poId,
            po_no: poNo,
            supplier_id: supplierRow.supplier_id,
            receiving_site_id: header.site_id,
            po_status: 'DRAFT',
            total_amount: lineTotal.toFixed(2),
            expected_delivery: expectedDate.toISOString().slice(0, 10),
            created_at: now,
            created_by: convertedBy,
            updated_at: now,
            updated_by: convertedBy,
          });
          await trx('purchase_order_lines').insert({
            id: uuidv7(),
            po_id: poId,
            item_id: line.item_id,
            ordered_qty: line.required_qty,
            confirmed_qty: line.required_qty,
            received_qty: '0.000',
            unit_price: unitPrice.toFixed(2),
            last_purchase_price_snapshot: unitPrice.toFixed(2),
            price_variance_pct: '0.0000',
            created_at: now,
            created_by: convertedBy,
            updated_at: now,
            updated_by: convertedBy,
          });
        });
        poIds.push(poId);
      } else {
        // Queue in M2 Purchase Requisitions for buyer supplier assignment
        const prId = uuidv7();
        const prSeq = await this.getNextSequence(header.site_id, 'PR');
        await this.knex('purchase_requisitions').insert({
          id: prId,
          req_no: `PR-${dateStr}-${String(prSeq).padStart(4, '0')}`,
          item_id: line.item_id,
          qty: line.required_qty,
          needed_by: header.required_by_date,
          source: 'PRODUCTION',
          source_ref_id: header.id,
          status: 'OPEN',
          requested_by: convertedBy,
          created_at: now,
          created_by: convertedBy,
          updated_at: now,
          updated_by: convertedBy,
        });
        poIds.push(prId);
      }
    }

    // Mark requisition as CONVERTED
    await this.reqRepo.updateHeader(reqId, {
      status: RequisitionStatus.CONVERTED,
      updated_by: convertedBy,
      updated_at: new Date().toISOString(),
    });

    // Emit domain event
    await this.outbox.raiseStandalone(
      'production.requisition_converted',
      reqId,
      {
        requisitionId: reqId,
        reqNo: header.req_no,
        siteId: header.site_id,
        poIds,
      },
      'm4',
    );

    return {
      requisition: await this.getRequisitionResponse(reqId),
      poIds,
    };
  }

  async cancelRequisition(reqId: string, cancelledBy: string): Promise<void> {
    const header = await this.reqRepo.getHeaderById(reqId);
    if (!header) {
      throw new NotFoundException(`Requisition ${reqId} not found`);
    }

    if (header.status === RequisitionStatus.CONVERTED) {
      throw new BadRequestException('Cannot cancel a CONVERTED requisition');
    }

    await this.reqRepo.updateHeader(reqId, {
      status: RequisitionStatus.CANCELLED,
      updated_by: cancelledBy,
      updated_at: new Date().toISOString(),
    });
  }

  async deleteRequisition(reqId: string): Promise<void> {
    const header = await this.reqRepo.getHeaderById(reqId);
    if (!header) {
      throw new NotFoundException(`Requisition ${reqId} not found`);
    }

    if (
      header.status !== RequisitionStatus.DRAFT &&
      header.status !== RequisitionStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Can only delete DRAFT or CANCELLED requisitions',
      );
    }

    await this.reqRepo.deleteLines(reqId);
    await this.reqRepo.deleteHeader(reqId);
  }

  private async getRequisitionResponse(
    reqId: string,
  ): Promise<RequisitionResponseDto> {
    const header = await this.reqRepo.getHeaderById(reqId);
    if (!header) throw new NotFoundException('Requisition not found');

    const linesWithItems = await this.reqRepo.getLinesWithItems(reqId);

    return {
      id: header.id,
      reqNo: header.req_no,
      siteId: header.site_id,
      requestedBy: header.requested_by,
      requiredByDate: header.required_by_date,
      status: header.status as RequisitionStatus,
      lines: linesWithItems.map((l) => ({
        id: l.id,
        requisitionId: l.requisition_id,
        itemId: l.item_id,
        itemName: l.item_name,
        itemSkuCode: l.item_sku_code,
        itemCategory: l.item_category,
        requiredQty: l.required_qty,
        uom: l.uom,
        bomHeaderId: l.bom_header_id,
        createdAt: l.created_at,
        updatedAt: l.updated_at,
      })),
      createdAt: header.created_at,
      updatedAt: header.updated_at,
    };
  }
}
