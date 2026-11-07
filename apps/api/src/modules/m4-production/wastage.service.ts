import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import { Clock } from '../../shared/utils/clock.util.js';
import {
  WastageRepository,
  WastageRecordWithItems,
} from './repositories/wastage.repository.js';
import {
  CreateWastageDto,
  UpdateWastageDto,
  WastageResponseDto,
  WastageReasonType,
  WastageStatus,
} from './dto/wastage.dto.js';
import { WorkOrderRepository } from './repositories/work-order.repository.js';
import { ITEM_PORT } from '../../shared/ports/ports.interface.js';
import type { ItemPort } from '../../shared/ports/ports.interface.js';

@Injectable()
export class WastageService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly wastageRepo: WastageRepository,
    private readonly woRepo: WorkOrderRepository,
    @Inject(ITEM_PORT) private readonly itemPort: ItemPort,
  ) {}

  async recordWastage(
    dto: CreateWastageDto,
    recordedBy: string,
  ): Promise<WastageResponseDto> {
    const wo = await this.woRepo.getHeaderById(dto.workOrderId);
    if (!wo) {
      throw new NotFoundException(`Work order ${dto.workOrderId} not found`);
    }

    const item = await this.itemPort.getItem(dto.itemId);
    if (!item) {
      throw new NotFoundException(`Item ${dto.itemId} not found`);
    }

    let batchNumber: string | null = null;
    if (dto.batchId) {
      const batch = await this.knex('inventory_batches')
        .where('id', dto.batchId)
        .first('batch_number');
      batchNumber = batch?.batch_number ?? null;
    }

    const now = Clock.nowUtc().toISOString();
    const [row] = await this.knex('wastage_records').insert({
      id: uuidv7(),
      work_order_id: dto.workOrderId,
      item_id: dto.itemId,
      batch_id: dto.batchId ?? null,
      qty: dto.qty,
      uom: dto.uom,
      reason_type: dto.reasonType,
      status: WastageStatus.RECORDED,
      created_by: recordedBy,
      created_at: now,
      updated_at: now,
    });

    return this.mapRowToDto(row, item.name, item.skuCode, batchNumber);
  }

  async getWastageByWo(woId: string): Promise<WastageResponseDto[]> {
    const rows = await this.wastageRepo.getByWorkOrderId(woId);
    return rows.map((r) =>
      this.mapRowToDto(r, r.item_name, r.item_sku_code, r.batch_number),
    );
  }

  async listWastage(
    siteId: string,
    status?: string,
  ): Promise<WastageResponseDto[]> {
    const rows = await this.wastageRepo.list(siteId, status);
    return rows.map((r) =>
      this.mapRowToDto(r, r.item_name, r.item_sku_code, r.batch_number),
    );
  }

  async updateWastage(
    id: string,
    dto: UpdateWastageDto,
  ): Promise<WastageResponseDto> {
    const existing = await this.wastageRepo.getById(id);
    if (!existing) {
      throw new NotFoundException(`Wastage record ${id} not found`);
    }

    let row: any = existing;

    if (
      dto.status === WastageStatus.APPROVED &&
      existing.status !== WastageStatus.APPROVED
    ) {
      if (!dto.approvedBy) {
        throw new BadRequestException('approvedBy is required when approving');
      }
      row = await this.wastageRepo.approve(id, dto.approvedBy);
    } else if (dto.status === WastageStatus.WRITTEN_OFF) {
      if (!dto.approvedBy) {
        throw new BadRequestException(
          'approvedBy is required when writing off',
        );
      }
      row = await this.wastageRepo.writeOff(id, dto.approvedBy);
    } else if (dto.status && dto.status !== existing.status) {
      row = await this.wastageRepo.update(id, { status: dto.status } as any);
    }

    const item = await this.itemPort.getItem(row.item_id);
    let batchNumber: string | null = null;
    if (row.batch_id) {
      const batch = await this.knex('inventory_batches')
        .where('id', row.batch_id)
        .first('batch_number');
      batchNumber = batch?.batch_number ?? null;
    }

    return this.mapRowToDto(
      row,
      item?.name ?? '',
      item?.skuCode ?? '',
      batchNumber,
    );
  }

  private mapRowToDto(
    row: any,
    itemName: string,
    itemSkuCode: string,
    batchNumber: string | null,
  ): WastageResponseDto {
    return {
      id: row.id,
      workOrderId: row.work_order_id,
      itemId: row.item_id,
      itemName,
      itemSkuCode,
      batchId: row.batch_id,
      batchNumber,
      qty: row.qty,
      uom: row.uom,
      reasonType: row.reason_type as WastageReasonType,
      status: row.status as WastageStatus,
      approvedBy: row.approved_by,
      approvedAt: row.approved_at,
      createdBy: row.created_by,
      createdAt: row.created_at,
    };
  }
}
