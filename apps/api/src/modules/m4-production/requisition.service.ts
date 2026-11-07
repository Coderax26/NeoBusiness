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
    // Validate site_id matches user's site (RLS will enforce)
    // Validate requested_by user exists (optional check)

    // Check if requisition number already exists for this site
    const exists = await this.reqRepo.headerExists(dto.reqNo, dto.siteId);
    if (exists) {
      throw new ConflictException(
        `Requisition number ${dto.reqNo} already exists for this site`,
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

    return await this.knex.transaction(async (trx) => {
      const headerId = uuidv7();
      const [header] = await trx('production_requisitions')
        .insert({
          id: headerId,
          req_no: dto.reqNo,
          site_id: dto.siteId,
          requested_by: dto.requestedBy,
          required_by_date: dto.requiredByDate,
          status: dto.status,
          created_by: createdBy,
          updated_by: createdBy,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .returning('*');

      const lines = dto.lines.map((line, index) => ({
        id: uuidv7(),
        requisition_id: headerId,
        item_id: line.itemId,
        required_qty: line.requiredQty,
        uom: line.uom,
        bom_header_id: line.bomHeaderId ?? null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      if (lines.length > 0) {
        await trx('production_requisition_lines').insert(lines);
      }

      return this.getRequisitionResponse(headerId);
    });
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
    // Get active BOM for the finished item
    const siteId = await this.getSiteIdForItem(finishedItemId);
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

    // Create requisition
    const reqNo = `REQ-${sourceOrderLineId.slice(-8)}`;
    const reqDto: CreateRequisitionDto = {
      reqNo,
      siteId,
      requestedBy: '', // will be filled by caller via port
      requiredByDate: requiredBy.toISOString().split('T')[0],
      status: RequisitionStatus.DRAFT,
      lines: reqLines,
    };

    const result = await this.createRequisitionFromDto(reqDto, 'system');
    return result.id;
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
    // Step 1: Explode BOMs for each finished good demand
    const explosions: BomExplosionResult[] = [];
    for (const demand of demands) {
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

      // Get available stock from InventoryPort
      const atpResult = await this.inventoryPort.checkATP(
        '', // locationId - would need to be resolved from site
        itemId,
        exp.totalQty,
        new Date().toISOString().split('T')[0],
      );

      const availableQty = atpResult?.availableQty ?? '0';
      const totalQty = Qty.of(exp.totalQty, exp.uom);
      const availQty = Qty.of(availableQty, exp.uom);
      const netQty = totalQty.sub(availQty).toStorageString();

      if (Qty.of(netQty, exp.uom).isGreaterThan(Qty.zero(exp.uom))) {
        netRequirements.push({
          itemId,
          itemName: item.name,
          itemSkuCode: item.skuCode,
          requiredQty: exp.totalQty,
          uom: exp.uom,
          availableQty,
          inboundQty: '0', // placeholder
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
      bomHeaderId: '', // would link to source BOM
    }));

    return this.createRequisitionFromDto(
      {
        reqNo,
        siteId,
        requestedBy,
        requiredByDate:
          demands[0]?.requiredBy ?? new Date().toISOString().slice(0, 10),
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
    return row?.last_no ?? 1;
  }

  async getRequisition(reqId: string): Promise<RequisitionResponseDto> {
    const header = await this.reqRepo.getHeaderById(reqId);
    if (!header) {
      throw new NotFoundException(`Requisition ${reqId} not found`);
    }
    return this.getRequisitionResponse(reqId);
  }

  async listRequisitions(
    siteId: string,
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

    // For each line, create a back-to-back PO via ProcurementPort
    for (const line of lines) {
      // In real implementation, this would create a PO draft
      const poId = await this.procurementPort.createBackToBackPO(line.id);
      poIds.push(poId);
    }

    // Mark requisition as CONVERTED
    await this.reqRepo.updateHeader(reqId, {
      status: RequisitionStatus.CONVERTED,
      updated_by: convertedBy,
      updated_at: new Date().toISOString(),
    });

    // Emit domain event
    await this.outbox.raiseStandalone(
      'production.requisition_created',
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
