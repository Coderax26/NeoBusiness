import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { v7 as uuidv7 } from 'uuid';
import { Qty } from '../../shared/utils/qty.util.js';
import { Clock } from '../../shared/utils/clock.util.js';
import { ConfigService } from '../m0-platform/config.service.js';
import {
  WorkOrderRepository,
  WorkOrderHeaderRow,
  WorkOrderMaterialRow,
  WorkOrderOutputRow,
} from './repositories/work-order.repository.js';
import { BomService } from './bom.service.js';
import { BomHeaderResponseDto } from './bom.service.js';
import {
  CreateWorkOrderDto,
  WorkOrderStatus,
  WorkOrderResponseDto,
  WorkOrderMaterialResponseDto,
  WorkOrderOutputResponseDto,
  RecordConsumptionDto,
  RecordOutputDto,
} from './dto/work-order.dto.js';
import {
  EXCEPTION_PORT,
  INVENTORY_PORT,
  ITEM_PORT,
  type ExceptionPort,
  type InventoryPort,
  type ItemPort,
} from '../../shared/ports/ports.interface.js';
import { OutboxService } from '../../shared/events/outbox.service.js';

/**
 * Work Order Service — manages production work orders through their lifecycle.
 *
 * State Machine: PLANNED → IN_PROGRESS → COMPLETED | CANCELLED
 *
 * Key responsibilities:
 * - Create work orders from BOMs with scaled RM planned quantities
 * - Validate RM availability via InventoryPort.checkATP() & reserve() when starting
 * - Record consumption & output strictly through InventoryPort (no direct M3 table writes)
 * - Enforce BR-06 / OD-012 mass balance: (Output + Wastage) / Issued RM within ±3% tolerance
 * - Raise YIELD_VARIANCE exception via EXCEPTION_PORT when tolerance exceeded
 */
@Injectable()
export class WorkOrderService {
  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly woRepo: WorkOrderRepository,
    private readonly bomService: BomService,
    @Inject(INVENTORY_PORT) private readonly inventoryPort: InventoryPort,
    @Inject(ITEM_PORT) private readonly itemPort: ItemPort,
    @Inject(forwardRef(() => OutboxService))
    private readonly outbox: OutboxService,
    @Optional()
    @Inject(EXCEPTION_PORT)
    private readonly exceptionPort?: ExceptionPort,
    @Optional() private readonly configService?: ConfigService,
  ) {}

  /**
   * Create a new work order from an ACTIVE BOM.
   * Generates unique wo_no when omitted, creates header in PLANNED status with scaled RM lines.
   */
  async createWorkOrder(
    dto: CreateWorkOrderDto,
    createdBy: string,
  ): Promise<WorkOrderResponseDto> {
    // Validate BOM exists and is ACTIVE
    const bom = await this.bomService.getBom(dto.bomHeaderId);
    if (!bom) {
      throw new NotFoundException(`BOM ${dto.bomHeaderId} not found`);
    }
    if (bom.status !== 'ACTIVE') {
      throw new BadRequestException(
        'Cannot create work order from non-ACTIVE BOM',
      );
    }

    const effectiveSiteId = dto.siteId || bom.siteId;
    if (!effectiveSiteId) {
      throw new BadRequestException('siteId is required to create a work order');
    }

    const woNo =
      dto.woNo?.trim() ||
      `WO-${Clock.nowUtc().toISOString().slice(0, 10).replace(/-/g, '')}-${uuidv7().slice(-4).toUpperCase()}`;

    // Check if work order number already exists for this site
    const exists = await this.woRepo.headerExists(woNo, effectiveSiteId);
    if (exists) {
      throw new ConflictException(
        `Work order number ${woNo} already exists for this site`,
      );
    }

    const woPlannedQty = Qty.of(dto.plannedQty, dto.uom);

    return await this.knex.transaction(async (trx) => {
      const headerId = uuidv7();
      await trx('production_work_orders')
        .insert({
          id: headerId,
          wo_no: woNo,
          site_id: effectiveSiteId,
          bom_header_id: dto.bomHeaderId,
          planned_qty: woPlannedQty.toStorageString(),
          uom: dto.uom,
          status: WorkOrderStatus.PLANNED,
          created_by: createdBy,
          updated_by: createdBy,
        })
        .returning('*');

      // Create scaled material lines from BOM (omit GENERATED ALWAYS variance_pct)
      for (let i = 0; i < bom.lines.length; i++) {
        const bomLine = bom.lines[i];
        const qtyPerUnit = parseFloat(bomLine.qtyPerUnit);
        const scaledPlanned = woPlannedQty.mul(
          Number.isFinite(qtyPerUnit) ? qtyPerUnit : 0,
        );
        await trx('work_order_materials').insert({
          id: uuidv7(),
          work_order_id: headerId,
          item_id: bomLine.itemId,
          planned_qty: scaledPlanned.toStorageString(),
          actual_qty: '0.000',
          uom: bomLine.uom,
        });
      }

      // Emit domain event
      await this.outbox.raise(
        trx,
        'production.work_order_created',
        headerId,
        {
          workOrderId: headerId,
          woNo,
          siteId: effectiveSiteId,
          bomHeaderId: dto.bomHeaderId,
          plannedQty: woPlannedQty.toStorageString(),
          uom: dto.uom,
          createdBy,
        },
        'm4',
      );

      return this.toResponseDto(headerId, bom);
    });
  }

  /**
   * Start a work order.
   * Transitions: PLANNED → IN_PROGRESS
   * Validates RM availability via InventoryPort.checkATP() & reserve()
   */
  async startWorkOrder(
    woId: string,
    startedBy: string,
    siteId?: string,
  ): Promise<WorkOrderResponseDto> {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) {
      throw new NotFoundException(`Work order ${woId} not found`);
    }

    if (header.status !== WorkOrderStatus.PLANNED) {
      throw new BadRequestException(
        `Cannot start work order in ${header.status} status`,
      );
    }

    const effectiveSiteId = siteId || header.site_id;
    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException(`BOM for work order not found`);
    }

    // Prefer persisted material lines so reservation uses their real UUIDs
    const materials = await this.woRepo.getMaterials(woId);
    const rmRequirements =
      materials.length > 0
        ? materials.map((mat) => ({
            refId: mat.id,
            itemId: mat.item_id,
            requiredQty: mat.planned_qty,
            uom: mat.uom,
            itemName:
              bom.lines.find((l) => l.itemId === mat.item_id)?.itemName ??
              mat.item_id,
          }))
        : bom.lines.map((line) => {
            const plannedQty = Qty.of(header.planned_qty, header.uom);
            const requiredQty = plannedQty
              .mul(parseFloat(line.qtyPerUnit))
              .toStorageString();
            return {
              refId: woId,
              itemId: line.itemId,
              requiredQty,
              uom: line.uom,
              itemName: line.itemName,
            };
          });

    const reservations: Array<{
      reservationId: string;
      itemId: string;
      qty: string;
    }> = [];
    const deliveryDate = Clock.nowUtc().toISOString().split('T')[0];

    for (const rm of rmRequirements) {
      const atpResult = await this.inventoryPort.checkATP(
        effectiveSiteId,
        rm.itemId,
        rm.requiredQty,
        deliveryDate,
      );

      if (!atpResult.canFulfil) {
        throw new BadRequestException(
          `Insufficient stock for ${rm.itemName}. Required: ${rm.requiredQty}`,
        );
      }

      const reserveResult = await this.inventoryPort.reserve(
        rm.refId,
        effectiveSiteId,
        rm.itemId,
        rm.requiredQty,
        deliveryDate,
      );

      reservations.push(
        ...reserveResult.reservationIds.map((id) => ({
          reservationId: id,
          itemId: rm.itemId,
          qty: rm.requiredQty,
        })),
      );
    }

    return await this.knex.transaction(async (trx) => {
      await this.woRepo.updateHeader(woId, {
        status: WorkOrderStatus.IN_PROGRESS,
        started_at: Clock.nowUtc().toISOString(),
        started_by: startedBy,
      });

      await this.outbox.raise(
        trx,
        'production.work_order_started',
        woId,
        {
          workOrderId: woId,
          status: WorkOrderStatus.IN_PROGRESS,
          startedBy,
          reservations: reservations.length,
        },
        'm4',
      );

      return this.toResponseDto(woId, bom);
    });
  }

  /**
   * Record consumption of raw materials strictly via InventoryPort.postConsumption().
   */
  async recordConsumption(
    woId: string,
    dto: RecordConsumptionDto,
    _recordedBy: string,
    siteId?: string,
  ): Promise<WorkOrderResponseDto> {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) {
      throw new NotFoundException(`Work order ${woId} not found`);
    }

    if (header.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot record consumption on work order in ${header.status} status`,
      );
    }

    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException('BOM not found');
    }

    const effectiveSiteId = siteId || header.site_id;
    const existingMaterials = await this.woRepo.getMaterials(woId);

    for (const line of dto.lines) {
      const material = existingMaterials.find(
        (m) => m.item_id === line.itemId,
      );
      if (!material) {
        throw new NotFoundException(
          `Consumption line for item ${line.itemId} not found on work order`,
        );
      }

      if (!line.actualQty) {
        throw new BadRequestException(
          `Actual quantity required for item ${line.itemId}`,
        );
      }

      const resolvedBatchId = await this.inventoryPort.postConsumption(
        woId,
        material.id,
        line.itemId,
        line.batchId ?? '',
        line.actualQty,
        { siteId: effectiveSiteId, uom: line.uom ?? material.uom },
      );

      const consumedQty = Qty.of(line.actualQty, material.uom);
      const prevActual = Qty.of(material.actual_qty || '0', material.uom);
      const nextActual = prevActual.add(consumedQty).toStorageString();
      material.actual_qty = nextActual;

      await this.woRepo.updateMaterial(material.id, {
        actual_qty: nextActual,
        batch_id:
          typeof resolvedBatchId === 'string' && resolvedBatchId
            ? resolvedBatchId
            : (line.batchId ?? material.batch_id),
      });

      await this.outbox.raiseStandalone(
        'production.consumption_recorded',
        woId,
        {
          workOrderId: woId,
          itemId: line.itemId,
          batchId:
            typeof resolvedBatchId === 'string' && resolvedBatchId
              ? resolvedBatchId
              : (line.batchId ?? null),
          actualQty: consumedQty.toStorageString(),
          plannedQty: material.planned_qty,
        },
        'm4',
      );
    }

    return this.toResponseDto(woId, bom);
  }

  /**
   * Record output of finished goods strictly via InventoryPort.postOutput().
   * Omits GENERATED column yield_pct on work_order_outputs insert.
   */
  async recordOutput(
    woId: string,
    dto: RecordOutputDto,
    recordedBy: string,
    siteId?: string,
  ): Promise<WorkOrderResponseDto> {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) {
      throw new NotFoundException(`Work order ${woId} not found`);
    }

    if (header.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot record output on work order in ${header.status} status`,
      );
    }

    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException(`BOM for work order not found`);
    }
    const finishedItemId = bom.itemId;
    const effectiveSiteId = siteId || header.site_id;

    for (const line of dto.lines) {
      if (line.itemId !== finishedItemId) {
        throw new BadRequestException(
          `Output item must be the finished good ${finishedItemId}`,
        );
      }

      if (!line.actualQty) {
        throw new BadRequestException(
          'Actual quantity required for output line',
        );
      }

      const outputQty = Qty.of(line.actualQty, line.uom ?? header.uom);
      const resolvedBatchId = await this.inventoryPort.postOutput(
        woId,
        finishedItemId,
        line.batchId ?? '',
        outputQty.toStorageString(),
        {
          siteId: effectiveSiteId,
          batchNumber: line.batchNumber,
          uom: line.uom ?? header.uom,
          createdBy: recordedBy,
        },
      );

      await this.woRepo.createOutputs([
        {
          work_order_id: woId,
          item_id: finishedItemId,
          batch_id:
            typeof resolvedBatchId === 'string' && resolvedBatchId
              ? resolvedBatchId
              : (line.batchId ?? null),
          planned_qty: line.plannedQty ?? header.planned_qty,
          actual_qty: outputQty.toStorageString(),
          uom: line.uom ?? header.uom,
        },
      ]);

      await this.outbox.raiseStandalone(
        'production.output_recorded',
        woId,
        {
          workOrderId: woId,
          itemId: finishedItemId,
          batchId:
            typeof resolvedBatchId === 'string' && resolvedBatchId
              ? resolvedBatchId
              : (line.batchId ?? null),
          batchNumber: line.batchNumber ?? null,
          actualQty: outputQty.toStorageString(),
          plannedQty: header.planned_qty,
          recordedBy,
        },
        'm4',
      );
    }

    return this.toResponseDto(woId, bom);
  }

  /**
   * Complete a work order.
   * Transitions: IN_PROGRESS → COMPLETED (never blocks completion).
   * Enforces OD-012 / BR-06:
   * - Mass balance against issued RM: (actualOutput + recordedWastage) / totalIssuedRm
   * - Default tolerance ±3% (configurable via yield_variance_tolerance_pct)
   * - Raises YIELD_VARIANCE via EXCEPTION_PORT when tolerance exceeded.
   */
  async completeWorkOrder(
    woId: string,
    completedBy: string,
    siteId?: string,
  ): Promise<
    WorkOrderResponseDto & {
      yieldExceptionId?: string | null;
      actualYieldPct?: number;
      yieldVariancePct?: number;
      tolerancePct?: number;
    }
  > {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) {
      throw new NotFoundException(`Work order ${woId} not found`);
    }

    if (header.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot complete work order in ${header.status} status`,
      );
    }

    const effectiveSiteId = siteId || header.site_id;
    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException('BOM not found');
    }

    const [materials, outputs] = await Promise.all([
      this.woRepo.getMaterials(woId),
      this.woRepo.getOutputs(woId),
    ]);

    const totalIssuedRmQty = materials.reduce(
      (sum, m) => sum + (parseFloat(m.actual_qty) || 0),
      0,
    );
    const totalActualOutput = outputs.reduce(
      (sum, o) => sum + (parseFloat(o.actual_qty) || 0),
      0,
    );

    let totalWastageQty = 0;
    try {
      const wastageRows = await this.knex('wastage_records')
        .where('work_order_id', woId)
        .select('qty');
      if (Array.isArray(wastageRows)) {
        totalWastageQty = wastageRows.reduce(
          (sum, w: any) => sum + (parseFloat(w.qty) || 0),
          0,
        );
      }
    } catch {
      totalWastageQty = 0;
    }

    const rawTol = this.configService?.get?.('yield_variance_tolerance_pct');
    const tolerancePct =
      rawTol !== undefined && Number.isFinite(Number(rawTol)) && Number(rawTol) > 0
        ? Number(rawTol)
        : 3;
    const basis = String(
      this.configService?.get?.('yield_variance_basis') ?? 'ISSUED_RAW_MATERIAL',
    );

    let actualYieldPct = 100;
    let yieldVariancePct = 0;

    if (basis === 'ISSUED_RAW_MATERIAL' && totalIssuedRmQty > 0) {
      const accountedQty = totalActualOutput + totalWastageQty;
      actualYieldPct = (accountedQty / totalIssuedRmQty) * 100;
      yieldVariancePct = Math.abs(100 - actualYieldPct);
    } else {
      const plannedQtyNum = parseFloat(header.planned_qty) || 0;
      const expectedYieldPct = parseFloat(bom.yieldPct) || 100;
      actualYieldPct =
        plannedQtyNum > 0 ? (totalActualOutput / plannedQtyNum) * 100 : 0;
      yieldVariancePct = Math.abs(expectedYieldPct - actualYieldPct);
    }

    let yieldExceptionId: string | null = null;
    if (yieldVariancePct > tolerancePct) {
      yieldExceptionId = await this.raiseYieldVarianceException(
        woId,
        header,
        bom,
        totalIssuedRmQty,
        totalActualOutput,
        totalWastageQty,
        actualYieldPct,
        yieldVariancePct,
        tolerancePct,
        completedBy,
        effectiveSiteId,
      );
    }

    await this.woRepo.updateHeader(woId, {
      status: WorkOrderStatus.COMPLETED,
      completed_at: Clock.nowUtc().toISOString(),
      completed_by: completedBy,
    });

    await this.outbox.raiseStandalone(
      'production.work_order_completed',
      woId,
      {
        workOrderId: woId,
        woNo: header.wo_no,
        siteId: effectiveSiteId,
        status: WorkOrderStatus.COMPLETED,
        plannedQty: header.planned_qty,
        actualQty: totalActualOutput.toFixed(3),
        totalIssuedRmQty: totalIssuedRmQty.toFixed(3),
        totalWastageQty: totalWastageQty.toFixed(3),
        actualYield: actualYieldPct.toFixed(2),
        yieldVariancePct: yieldVariancePct.toFixed(2),
        tolerancePct,
        completedBy,
        yieldExceptionRaised: yieldVariancePct > tolerancePct,
        yieldExceptionId,
      },
      'm4',
    );

    const response = await this.toResponseDto(woId, bom);
    return {
      ...response,
      yieldExceptionId,
      actualYieldPct: Number(actualYieldPct.toFixed(2)),
      yieldVariancePct: Number(yieldVariancePct.toFixed(2)),
      tolerancePct,
    };
  }

  /**
   * Cancel a work order (from PLANNED or IN_PROGRESS status only).
   * Releases any RM reservations if IN_PROGRESS.
   */
  async cancelWorkOrder(woId: string, cancelledBy: string): Promise<void> {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) {
      throw new NotFoundException(`Work order ${woId} not found`);
    }

    if (header.status === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a COMPLETED work order');
    }

    if (header.status === WorkOrderStatus.IN_PROGRESS) {
      const materials = await this.woRepo.getMaterials(woId);
      for (const mat of materials) {
        await this.inventoryPort.release(mat.id);
      }
      if (materials.length === 0) {
        await this.inventoryPort.release(woId);
      }
    }

    await this.woRepo.updateHeader(woId, {
      status: WorkOrderStatus.CANCELLED,
      completed_at: Clock.nowUtc().toISOString(),
      completed_by: cancelledBy,
    });
  }

  /**
   * List work orders for a site.
   */
  async listWorkOrders(
    siteId?: string,
    status?: string,
  ): Promise<WorkOrderResponseDto[]> {
    const headers = await this.woRepo.getHeaders(siteId, status);
    const results: WorkOrderResponseDto[] = [];
    for (const header of headers) {
      const bom = await this.bomService.getBom(header.bom_header_id);
      if (bom) {
        results.push(await this.toResponseDto(header.id, bom));
      }
    }
    return results;
  }

  /**
   * Get work order by ID.
   */
  async getWorkOrder(woId: string): Promise<WorkOrderResponseDto> {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) {
      throw new NotFoundException(`Work order ${woId} not found`);
    }
    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException(`BOM for work order not found`);
    }
    return this.toResponseDto(woId, bom);
  }

  /**
   * ProductionPort interface implementation.
   * Returns work order status with planned and actual output quantities.
   * Used by M1/M3 modules via port token.
   */
  async workOrderStatus(workOrderId: string): Promise<{
    status: string;
    plannedQty: string;
    actualOutputQty: string | null;
  } | null> {
    const header = await this.woRepo.getHeaderById(workOrderId);
    if (!header) {
      return null;
    }

    const outputs = await this.woRepo.getOutputs(workOrderId);
    const totalActualQty = outputs.reduce(
      (sum, o) => sum + parseFloat(o.actual_qty),
      0,
    );

    return {
      status: header.status,
      plannedQty: header.planned_qty,
      actualOutputQty: totalActualQty > 0 ? totalActualQty.toString() : null,
    };
  }

  /**
   * Raise YIELD_VARIANCE exception via EXCEPTION_PORT when OD-012 mass-balance
   * variance exceeds configured tolerance (default ±3%).
   */
  private async raiseYieldVarianceException(
    woId: string,
    header: WorkOrderHeaderRow,
    bom: BomHeaderResponseDto,
    totalIssuedRmQty: number,
    totalActualOutput: number,
    totalWastageQty: number,
    actualYieldPct: number,
    variancePct: number,
    tolerancePct: number,
    raisedBy: string,
    siteId: string,
  ): Promise<string | null> {
    const baseQty =
      totalIssuedRmQty > 0
        ? totalIssuedRmQty
        : parseFloat(header.planned_qty) || 0;
    const valueAtRisk = (baseQty * (variancePct / 100)).toFixed(2);
    const payload = {
      title: `Yield Variance Exceeded (±${tolerancePct}%) on ${header.wo_no}`,
      summary: `Work order ${header.wo_no} accounted yield ${actualYieldPct.toFixed(2)}% (${variancePct.toFixed(2)}% variance vs ±${tolerancePct}% tolerance). Issued RM: ${totalIssuedRmQty.toFixed(3)} ${header.uom}, Output: ${totalActualOutput.toFixed(3)} ${header.uom}, Wastage: ${totalWastageQty.toFixed(3)} ${header.uom}.`,
      facts: [
        { label: 'Work Order', value: header.wo_no },
        { label: 'BOM', value: bom.bomNo },
        { label: 'Issued RM', value: `${totalIssuedRmQty.toFixed(3)} ${header.uom}` },
        { label: 'Actual Output', value: `${totalActualOutput.toFixed(3)} ${header.uom}` },
        { label: 'Recorded Wastage', value: `${totalWastageQty.toFixed(3)} ${header.uom}` },
        { label: 'Mass Balance Yield', value: `${actualYieldPct.toFixed(2)}%` },
        { label: 'Variance', value: `${variancePct.toFixed(2)}% (limit ±${tolerancePct}%)` },
      ],
      impact: 'Issued raw material mass balance exceeds acceptable tolerance',
      actions: [
        { code: 'APPROVE_WRITEOFF', label: 'Acknowledge & Approve' },
        { code: 'INVESTIGATE', label: 'Investigate Variance' },
      ],
      deepLink: '/production/work-orders',
      valueAtRisk,
    };

    if (this.exceptionPort) {
      return this.exceptionPort.raise(
        'YIELD_VARIANCE',
        'production_work_orders',
        woId,
        raisedBy,
        payload,
        siteId,
      );
    }

    const exceptionId = uuidv7();
    await this.outbox.raiseStandalone(
      'exception.yield_variance_raised',
      woId,
      {
        workOrderId: woId,
        exceptionId,
        actualYield: actualYieldPct.toFixed(2),
        variance: variancePct.toFixed(2),
        tolerancePct,
        valueAtRisk,
      },
      'm4',
    );
    return exceptionId;
  }

  /**
   * Convert work order to response DTO.
   */
  private async toResponseDto(
    woId: string,
    bom: BomHeaderResponseDto,
  ): Promise<WorkOrderResponseDto> {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) throw new NotFoundException('Work order not found');

    const materials = await this.woRepo.getMaterialsWithItems(woId);
    const outputs = await this.woRepo.getOutputsWithItems(woId);
    const item = await this.itemPort.getItem(bom.itemId);

    return {
      id: header.id,
      woNo: header.wo_no,
      siteId: header.site_id,
      bomHeaderId: header.bom_header_id,
      bomNo: bom.bomNo,
      finishedItemId: bom.itemId,
      finishedItemName: item?.name ?? bom.itemName ?? '',
      finishedItemSkuCode: item?.skuCode ?? bom.itemSkuCode ?? '',
      plannedQty: header.planned_qty,
      uom: header.uom,
      status: header.status as WorkOrderStatus,
      startedAt: header.started_at,
      completedAt: header.completed_at,
      startedBy: header.started_by,
      completedBy: header.completed_by,
      materials: materials.map((m): WorkOrderMaterialResponseDto => ({
        id: m.id,
        workOrderId: m.work_order_id,
        itemId: m.item_id,
        itemName: m.item_name,
        itemSkuCode: m.item_sku_code,
        batchId: m.batch_id,
        batchNumber: m.batch_number,
        plannedQty: m.planned_qty,
        actualQty: m.actual_qty,
        uom: m.uom,
        variancePct: m.variance_pct,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
      outputs: outputs.map((o): WorkOrderOutputResponseDto => ({
        id: o.id,
        workOrderId: o.work_order_id,
        itemId: o.item_id,
        itemName: o.item_name,
        itemSkuCode: o.item_sku_code,
        batchId: o.batch_id,
        batchNumber: o.batch_number,
        plannedQty: o.planned_qty,
        actualQty: o.actual_qty,
        uom: o.uom,
        yieldPct: o.yield_pct,
        createdAt: o.created_at,
        updatedAt: o.updated_at,
      })),
      createdAt: header.created_at,
      updatedAt: header.updated_at,
    };
  }
}
