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
import { Money } from '../../shared/utils/money.util.js';
import {
  BomRepository,
  BomHeaderRow,
  BomLineRow,
  BomLineWithItem,
} from './repositories/bom.repository.js';
import {
  CreateBomDto,
  BomStatus,
  BomHeaderResponseDto,
  BomLineResponseDto,
} from './dto/bom.dto.js';

export { BomHeaderResponseDto };
import {
  ITEM_PORT,
  type ItemPort,
} from '../../shared/ports/ports.interface.js';
import { OutboxService } from '../../shared/events/outbox.service.js';

@Injectable()
export class BomService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly bomRepo: BomRepository,
    @Inject(ITEM_PORT) private readonly itemPort: ItemPort,
    @Inject(forwardRef(() => OutboxService))
    private readonly outbox: OutboxService,
  ) {}

  async createBom(
    dto: CreateBomDto,
    createdBy: string,
  ): Promise<BomHeaderResponseDto> {
    // Validate output item exists and is PROCESSED_FG
    const outputItem = await this.itemPort.getItem(dto.itemId);
    if (!outputItem) {
      throw new NotFoundException(`Output item ${dto.itemId} not found`);
    }
    if (outputItem.category !== 'PROCESSED_FG') {
      throw new BadRequestException(
        'BOM output item must be PROCESSED_FG category',
      );
    }

    // Check if BOM number already exists for this site
    if (!dto.siteId) {
      throw new BadRequestException('siteId is required to create a BOM');
    }
    const exists = await this.bomRepo.headerExists(dto.bomNo, dto.siteId);
    if (exists) {
      throw new ConflictException(
        `BOM number ${dto.bomNo} already exists for this site`,
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
          `BOM line item ${line.itemId} must be RAW_MATERIAL or PACKAGING, got ${lineItem.category}`,
        );
      }
    }

    // If this is the first BOM for this item/site, or we're creating as ACTIVE, handle versioning
    let version = dto.version;
    if (version === 1) {
      const existingHeaders = await this.bomRepo.getHeadersByItem(
        dto.itemId,
        dto.siteId,
      );
      if (existingHeaders.length > 0) {
        version = Math.max(...existingHeaders.map((h) => h.version)) + 1;
      }
    }

    // Use transaction for atomic BOM creation
    return await this.knex.transaction(async (trx) => {
      // Create BOM header with proper required fields
      const headerId = uuidv7();
      const [header] = await trx('bom_headers')
        .insert({
          id: headerId,
          bom_no: dto.bomNo,
          item_id: dto.itemId,
          site_id: dto.siteId,
          version,
          status: dto.status,
          effective_from: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : null,
          effective_to: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
          yield_pct: dto.yieldPct,
          created_by: createdBy,
          updated_by: createdBy,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('*');

      // Create BOM lines
      const lines = dto.lines.map((line, index) => ({
        id: uuidv7(),
        bom_header_id: headerId,
        item_id: line.itemId,
        qty_per_unit: line.qtyPerUnit,
        uom: line.uom,
        sequence_no: line.sequenceNo ?? index + 1,
        is_critical: line.isCritical ?? false,
        created_at: new Date(),
        updated_at: new Date(),
      }));

      if (lines.length > 0) {
        await trx('bom_lines').insert(lines);
      }

      // If ACTIVE, deactivate other versions and emit event
      if (dto.status === BomStatus.ACTIVE) {
        await this.activateBomInTransaction(
          trx,
          headerId,
          header.item_id,
          header.site_id,
          createdBy,
        );
      }

      return this.getBomResponse(headerId);
    });
  }

  async activateBom(
    bomId: string,
    requestedBy: string,
  ): Promise<BomHeaderResponseDto> {
    const header = await this.bomRepo.getHeaderById(bomId);
    if (!header) {
      throw new NotFoundException(`BOM ${bomId} not found`);
    }

    if (header.status === BomStatus.ACTIVE) {
      throw new BadRequestException('BOM is already ACTIVE');
    }

    if (header.status === BomStatus.OBSOLETE) {
      throw new BadRequestException('Cannot activate an OBSOLETE BOM');
    }

    await this.bomRepo.activateBom(
      bomId,
      header.item_id,
      header.site_id,
      requestedBy,
    );

    return this.getBomResponse(bomId);
  }

  private async activateBomInTransaction(
    trx: Knex.Transaction,
    bomId: string,
    itemId: string,
    siteId: string,
    requestedBy: string,
  ): Promise<void> {
    // Deactivate any other ACTIVE BOM for this item/site
    await trx('bom_headers')
      .where('id', '!=', bomId)
      .andWhere('item_id', itemId)
      .andWhere('site_id', siteId)
      .andWhere('status', 'ACTIVE')
      .update({
        status: 'OBSOLETE',
        updated_by: requestedBy,
        updated_at: new Date(),
      });

    // Activate the requested BOM
    await trx('bom_headers').where('id', bomId).update({
      status: 'ACTIVE',
      effective_from: new Date(),
      updated_by: requestedBy,
      updated_at: new Date(),
    });

    // Emit domain event
    await this.outbox.raise(
      trx,
      'production.bom_activated',
      bomId,
      {
        bomId,
        bomNo: (await this.bomRepo.getHeaderById(bomId))?.bom_no ?? '',
        itemId,
        siteId,
        version: 1,
        yieldPct: '95.00',
      },
      'm4',
    );
  }

  async getBom(bomId: string): Promise<BomHeaderResponseDto> {
    const header = await this.bomRepo.getHeaderById(bomId);
    if (!header) {
      throw new NotFoundException(`BOM ${bomId} not found`);
    }
    return this.getBomResponse(bomId);
  }

  async getActiveBom(
    itemId: string,
    siteId: string,
  ): Promise<BomHeaderResponseDto | null> {
    const header = await this.bomRepo.getActiveBom(itemId, siteId);
    if (!header) return null;
    return this.getBomResponse(header.id);
  }

  async listBoms(
    itemId?: string,
    siteId?: string,
  ): Promise<BomHeaderResponseDto[]> {
    const headers = await this.bomRepo.getHeadersByItem(itemId, siteId);
    const results: BomHeaderResponseDto[] = [];
    for (const header of headers) {
      results.push(await this.getBomResponse(header.id));
    }
    return results;
  }

  async updateBom(
    bomId: string,
    dto: Partial<CreateBomDto>,
    updatedBy: string,
  ): Promise<BomHeaderResponseDto> {
    const header = await this.bomRepo.getHeaderById(bomId);
    if (!header) {
      throw new NotFoundException(`BOM ${bomId} not found`);
    }

    if (header.status === BomStatus.ACTIVE) {
      throw new BadRequestException(
        'Cannot update an ACTIVE BOM. Create a new version instead.',
      );
    }

    // Update header fields (excluding immutable fields)
    const updateData: Record<string, unknown> = {
      updated_by: updatedBy,
      updated_at: new Date(),
    };

    if (dto.bomNo && dto.bomNo !== header.bom_no) {
      const exists = await this.bomRepo.headerExists(dto.bomNo, header.site_id);
      if (exists) {
        throw new ConflictException(
          `BOM number ${dto.bomNo} already exists for this site`,
        );
      }
      updateData.bom_no = dto.bomNo;
    }

    if (dto.yieldPct) updateData.yield_pct = dto.yieldPct;
    if (dto.effectiveFrom !== undefined)
      updateData.effective_from = dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : null;
    if (dto.effectiveTo !== undefined)
      updateData.effective_to = dto.effectiveTo
        ? new Date(dto.effectiveTo)
        : null;

    await this.bomRepo.updateHeader(bomId, updateData);

    // Update lines if provided
    if (dto.lines) {
      // Validate all line items
      for (const line of dto.lines) {
        const lineItem = await this.itemPort.getItem(line.itemId);
        if (!lineItem) {
          throw new NotFoundException(`Line item ${line.itemId} not found`);
        }
        if (!['RAW_MATERIAL', 'PACKAGING'].includes(lineItem.category)) {
          throw new BadRequestException(
            `BOM line item ${line.itemId} must be RAW_MATERIAL or PACKAGING`,
          );
        }
      }

      // Delete and recreate lines
      await this.bomRepo.deleteLines(bomId);
      const lines = dto.lines.map((line, index) => ({
        id: uuidv7(),
        bom_header_id: bomId,
        item_id: line.itemId,
        qty_per_unit: line.qtyPerUnit,
        uom: line.uom,
        sequence_no: line.sequenceNo ?? index + 1,
        is_critical: line.isCritical ?? false,
        created_at: new Date(),
        updated_at: new Date(),
      }));
      await this.bomRepo.createLines(lines);
    }

    return this.getBomResponse(bomId);
  }

  async deleteBom(bomId: string): Promise<void> {
    const header = await this.bomRepo.getHeaderById(bomId);
    if (!header) {
      throw new NotFoundException(`BOM ${bomId} not found`);
    }

    if (header.status === BomStatus.ACTIVE) {
      throw new BadRequestException('Cannot delete an ACTIVE BOM');
    }

    await this.bomRepo.deleteLines(bomId);
    await this.bomRepo.deleteHeader(bomId);
  }

  async getBomCostRollup(bomId: string): Promise<{
    bomId: string;
    bomNo: string;
    estimatedCostPerUnitInr: string;
    currency: string;
    breakdown: Array<{
      itemId: string;
      itemName: string;
      qtyPerUnit: string;
      uom: string;
      unitCostInr: string;
      lineCostInr: string;
    }>;
  }> {
    const header = await this.bomRepo.getHeaderById(bomId);
    if (!header) throw new NotFoundException(`BOM ${bomId} not found`);
    const lines = await this.bomRepo.getLinesWithItems(bomId);
    const breakdown = [];
    let totalCost = 0;

    for (const line of lines) {
      const rateRow = await this.knex('supplier_rate_quotes')
        .where('item_id', line.item_id)
        .orderBy('effective_from', 'desc')
        .orderBy('created_at', 'desc')
        .first('unit_price');
      let unitCost = Number(rateRow?.unit_price ?? 0);
      if (unitCost === 0) {
        const poRow = await this.knex('purchase_order_lines')
          .where('item_id', line.item_id)
          .orderBy('created_at', 'desc')
          .first('unit_price');
        unitCost = Number(poRow?.unit_price ?? 0);
      }
      const qty = Number(line.qty_per_unit || 0);
      const lineCost = qty * unitCost;
      totalCost += lineCost;
      breakdown.push({
        itemId: String(line.item_id),
        itemName: line.item_name,
        qtyPerUnit: String(line.qty_per_unit),
        uom: line.uom,
        unitCostInr: unitCost.toFixed(2),
        lineCostInr: lineCost.toFixed(2),
      });
    }

    return {
      bomId: header.id,
      bomNo: header.bom_no,
      estimatedCostPerUnitInr: totalCost.toFixed(2),
      currency: 'INR',
      breakdown,
    };
  }

  private async getBomResponse(bomId: string): Promise<BomHeaderResponseDto> {
    const header = await this.bomRepo.getHeaderById(bomId);
    if (!header) throw new NotFoundException('BOM not found');

    const [fgItem, linesWithItems] = await Promise.all([
      this.knex('items')
        .where('id', header.item_id)
        .first('name', 'sku_code'),
      this.bomRepo.getLinesWithItems(bomId),
    ]);

    const formatDate = (d: Date | null | undefined): string | null => {
      if (!d) return null;
      return d instanceof Date
        ? d.toISOString().slice(0, 10)
        : String(d).slice(0, 10);
    };

    return {
      id: header.id,
      bomNo: header.bom_no,
      itemId: header.item_id,
      itemName: fgItem?.name ?? linesWithItems[0]?.item_name ?? '',
      itemSkuCode: fgItem?.sku_code ?? linesWithItems[0]?.item_sku_code ?? '',
      siteId: header.site_id,
      version: header.version,
      status: header.status as BomStatus,
      effectiveFrom: formatDate(header.effective_from),
      effectiveTo: formatDate(header.effective_to),
      yieldPct: header.yield_pct,
      lines: linesWithItems.map((l) => ({
        id: l.id,
        itemId: l.item_id,
        itemName: l.item_name,
        itemSkuCode: l.item_sku_code,
        qtyPerUnit: l.qty_per_unit,
        uom: l.uom,
        sequenceNo: l.sequence_no,
        isCritical: l.is_critical,
      })),
      createdAt: header.created_at,
      updatedAt: header.updated_at,
    };
  }
}
