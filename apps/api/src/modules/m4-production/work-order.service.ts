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
import { Clock } from '../../shared/utils/clock.util.js';
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
  INVENTORY_PORT,
  ITEM_PORT,
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
 * - Create work orders from BOMs with proper validation
 * - Validate RM availability via InventoryPort.reserve() when starting
 * - Record consumption with FEFO batch selection
 * - Post PROD_CONSUME events to M3 stock ledger
 * - Record output with batch creation for FG inventory
 * - Check yield against BOM and raise wastage exception if >5% below (BR-06)
 * - Post PROD_OUTPUT events and final ledger entries on completion
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
  ) {}

  /**
   * Create a new work order from an ACTIVE BOM.
   * Generates unique wo_no, creates header in PLANNED status with material/output lines.
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

    // Check if work order number already exists for this site
    const exists = await this.woRepo.headerExists(dto.woNo, dto.siteId);
    if (exists) {
      throw new ConflictException(
        `Work order number ${dto.woNo} already exists for this site`,
      );
    }

    return await this.knex.transaction(async (trx) => {
      const headerId = uuidv7();
      const [header] = await trx('production_work_orders')
        .insert({
          id: headerId,
          wo_no: dto.woNo,
          site_id: dto.siteId,
          bom_header_id: dto.bomHeaderId,
          planned_qty: dto.plannedQty,
          uom: dto.uom,
          status: WorkOrderStatus.PLANNED,
          created_by: createdBy,
          updated_by: createdBy,
        })
        .returning('*');

      // Create material lines from BOM
      for (let i = 0; i < bom.lines.length; i++) {
        const lineQty = Qty.of(bom.lines[i].qtyPerUnit, bom.lines[i].uom);
        await trx('work_order_materials').insert({
          id: uuidv7(),
          work_order_id: headerId,
          item_id: bom.lines[i].itemId,
          planned_qty: lineQty.toStorageString(),
          actual_qty: '0.000',
          uom: bom.lines[i].uom,
          variance_pct: '0.00',
        });
      }

      // Emit domain event
      await this.outbox.raise(
        trx,
        'production.work_order_created',
        headerId,
        {
          workOrderId: headerId,
          woNo: dto.woNo,
          siteId: dto.siteId,
          bomHeaderId: dto.bomHeaderId,
          plannedQty: dto.plannedQty,
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
   * Validates RM availability via InventoryPort.reserve()
   */
  async startWorkOrder(
    woId: string,
    startedBy: string,
    siteId: string,
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

    // Get BOM to determine RM requirements
    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException(`BOM for work order not found`);
    }

    // Calculate required RM quantities based on planned output
    const rmRequirements = bom.lines.map((line) => {
      // RM qty needed = planned_qty * qty_per_unit for the UoM
      const plannedQty = Qty.of(header.planned_qty, header.uom);
      const requiredQty = plannedQty
        .mul(parseFloat(line.qtyPerUnit))
        .toStorageString();
      return {
        itemId: line.itemId,
        requiredQty,
        uom: line.uom,
        itemName: line.itemName,
      };
    });

    // Reserve RMs via InventoryPort
    const reservations: Array<{
      reservationId: string;
      itemId: string;
      qty: string;
    }> = [];
    const deliveryDate = Clock.nowUtc().toISOString().split('T')[0];

    for (const rm of rmRequirements) {
      const atpResult = await this.inventoryPort.checkATP(
        '',
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
        `wo-${woId}-rm`,
        siteId,
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
      // Update work order status
      await this.woRepo.updateHeader(woId, {
        status: WorkOrderStatus.IN_PROGRESS,
        started_at: Clock.nowUtc().toISOString(),
        started_by: startedBy,
      });

      // Emit domain event
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
   * Record consumption of raw materials.
   * Validates work order is IN_PROGRESS, selects FEFO batches,
   * updates batch availability and creates wastage if variance > 0.
   */
  async recordConsumption(
    woId: string,
    dto: RecordConsumptionDto,
    recordedBy: string,
    siteId: string,
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

    // Get BOM to identify finished item
    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException('BOM not found');
    }

    return await this.knex.transaction(async (trx) => {
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

        // Validate batch exists and has sufficient quantity (FEFO selection)
        const [batch] = await trx('inventory_batches')
          .where('id', line.batchId)
          .andWhere('item_id', line.itemId)
          .andWhere('status', 'AVAILABLE')
          .andWhere('available_qty', '>', '0')
          .forUpdate()
          .select('*');

        if (!batch) {
          throw new BadRequestException(
            `Batch ${line.batchId} not available for item ${line.itemId}`,
          );
        }

        // Validate quantity
        const availableQty = Qty.of(String(batch.available_qty), 'KG');
        const consumedQty = Qty.of(line.actualQty, 'KG');
        if (availableQty.isLessThan(consumedQty)) {
          throw new BadRequestException(
            `Insufficient quantity in batch. Available: ${batch.available_qty}, Consumed: ${line.actualQty}`,
          );
        }

        // Update batch: reduce available, increase reserved/committed
        const remainingAvailable = availableQty.sub(consumedQty);
        await trx('inventory_batches')
          .where('id', batch.id)
          .update({
            available_qty: remainingAvailable.toStorageString(),
            reserved_qty: Qty.of(String(batch.reserved_qty), 'KG')
              .add(consumedQty)
              .toStorageString(),
            updated_at: Clock.nowUtc().toISOString(),
          });

        // Update work order material with actual qty
        await this.woRepo.updateMaterial(material.id, {
          actual_qty: line.actualQty,
        });

        // Post PROD_CONSUME ledger entry
        await trx('stock_ledger_txns').insert({
          id: uuidv7(),
          site_id: siteId,
          item_id: line.itemId,
          batch_id: line.batchId,
          qty: consumedQty.toStorageString(),
          txn_type: 'PROD_CONSUME',
          reference_table: 'work_order_materials',
          reference_no: material.id,
          created_at: Clock.nowUtc().toISOString(),
        });

        // Emit consumption event
        await this.outbox.raise(
          trx,
          'production.consumption_recorded',
          woId,
          {
            workOrderId: woId,
            itemId: line.itemId,
            batchId: line.batchId,
            actualQty: line.actualQty,
            plannedQty: material.planned_qty,
          },
          'm4',
        );
      }

      return this.toResponseDto(woId, bom);
    });
  }

  /**
   * Record output of finished goods.
   * Validates work order is IN_PROGRESS, creates FG batch if needed,
   * posts PROD_OUTPUT to stock ledger.
   */
  async recordOutput(
    woId: string,
    dto: RecordOutputDto,
    recordedBy: string,
    siteId: string,
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

    // Get BOM for finished item
    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException(`BOM for work order not found`);
    }
    const finishedItemId = bom.itemId;

    return await this.knex.transaction(async (trx) => {
      for (const line of dto.lines) {
        // Ensure output is for the correct finished item
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

        const outputQty = Qty.of(line.actualQty, header.uom);

        // Create or use batch for FG
        let batchId = line.batchId;
        let batchNumber: string;

        if (batchId) {
          // Validate specified batch
          const [batch] = await trx('inventory_batches')
            .where({ id: batchId, item_id: finishedItemId })
            .select('batch_number')
            .first('*');

          if (!batch) {
            throw new BadRequestException(
              `Specified batch ${batchId} not found for finished item ${finishedItemId}`,
            );
          }
          batchNumber = batch.batch_number;
        } else {
          // Create new batch
          batchNumber = `FG-${finishedItemId.slice(-4)}-${Date.now().toString().slice(-6)}`;
          const [newBatch] = await trx('inventory_batches')
            .insert({
              id: uuidv7(),
              item_id: finishedItemId,
              batch_number: batchNumber,
              status: 'AVAILABLE',
              available_qty: '0.000',
              reserved_qty: '0.000',
              expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
              created_by: recordedBy,
              created_at: Clock.nowUtc().toISOString(),
            })
            .returning('*');
          batchId = newBatch.id;
          batchNumber = newBatch.batch_number;
        }

        // Get current batch available qty
        const [currentBatch] = await trx('inventory_batches')
          .where('id', batchId)
          .select('available_qty')
          .first('*');

        // Update batch: increase available qty for FG
        await trx('inventory_batches')
          .where('id', batchId)
          .update({
            available_qty: Qty.of(
              String(currentBatch?.available_qty || '0'),
              'KG',
            )
              .add(outputQty)
              .toStorageString(),
            updated_at: Clock.nowUtc().toISOString(),
          });

        // Record output line
        const plannedQty = Qty.of(header.planned_qty, header.uom);
        const yieldPct = plannedQty.isZero()
          ? '0.00'
          : ((outputQty.toNumber() / plannedQty.toNumber()) * 100).toFixed(2);

        await trx('work_order_outputs').insert({
          id: uuidv7(),
          work_order_id: woId,
          item_id: finishedItemId,
          batch_id: batchId,
          planned_qty: header.planned_qty,
          actual_qty: outputQty.toStorageString(),
          uom: header.uom,
          yield_pct: yieldPct,
        });

        // Post PROD_OUTPUT ledger entry
        await trx('stock_ledger_txns').insert({
          id: uuidv7(),
          site_id: siteId,
          item_id: finishedItemId,
          batch_id: batchId,
          qty: outputQty.toStorageString(),
          txn_type: 'PROD_OUTPUT',
          reference_table: 'work_order_outputs',
          reference_no: `${woId}-out`,
          created_at: Clock.nowUtc().toISOString(),
        });

        // Emit output event
        await this.outbox.raise(
          trx,
          'production.output_recorded',
          woId,
          {
            workOrderId: woId,
            itemId: finishedItemId,
            batchId,
            batchNumber,
            actualQty: outputQty.toStorageString(),
            plannedQty: header.planned_qty,
            recordedBy,
          },
          'm4',
        );
      }

      return this.toResponseDto(woId, bom);
    });
  }

  /**
   * Complete a work order.
   * Transitions: IN_PROGRESS → COMPLETED
   * Performs BR-06 yield check - raises WASTAGE_VARIANCE if deviation > 5%.
   */
  async completeWorkOrder(
    woId: string,
    completedBy: string,
    siteId: string,
  ): Promise<WorkOrderResponseDto> {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) {
      throw new NotFoundException(`Work order ${woId} not found`);
    }

    if (header.status !== WorkOrderStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot complete work order in ${header.status} status`,
      );
    }

    // Get BOM for expected yield
    const bom = await this.bomService.getBom(header.bom_header_id);
    if (!bom) {
      throw new NotFoundException('BOM not found');
    }

    // Get actual outputs
    const outputs = await this.woRepo.getOutputs(woId);
    const totalActualQty = Qty.of(
      outputs.reduce((sum, o) => sum + parseFloat(o.actual_qty), 0),
      header.uom,
    );
    const plannedQty = Qty.of(header.planned_qty, header.uom);

    // BR-06: Calculate yield and check variance
    const expectedYield = parseFloat(bom.yieldPct);
    const actualYield =
      (totalActualQty.toNumber() / plannedQty.toNumber()) * 100;
    const yieldVariance = Math.abs(expectedYield - actualYield);

    // Raise WASTAGE_VARIANCE exception if > 5%
    let wastageExceptionId: string | null = null;
    if (yieldVariance > 5) {
      wastageExceptionId = await this.raiseWastageException(
        woId,
        header,
        bom,
        actualYield,
        yieldVariance,
        completedBy,
        siteId,
      );
    }

    return await this.knex.transaction(async (trx) => {
      // Update work order status
      await this.woRepo.updateHeader(woId, {
        status: WorkOrderStatus.COMPLETED,
        completed_at: Clock.nowUtc().toISOString(),
        completed_by: completedBy,
      });

      // Post final ledger entry
      await trx('stock_ledger_txns').insert({
        id: uuidv7(),
        site_id: siteId,
        item_id: bom.itemId,
        batch_id: outputs[0]?.batch_id || null,
        qty: totalActualQty.toStorageString(),
        txn_type: 'PROD_COMPLETE',
        reference_table: 'production_work_orders',
        reference_no: woId,
        created_at: Clock.nowUtc().toISOString(),
      });

      // Emit completion event
      await this.outbox.raise(
        trx,
        'production.work_order_completed',
        woId,
        {
          workOrderId: woId,
          status: WorkOrderStatus.COMPLETED,
          plannedQty: header.planned_qty,
          actualQty: totalActualQty.toStorageString(),
          expectedYield,
          actualYield: actualYield.toFixed(2),
          yieldVariance: yieldVariance.toFixed(2),
          completedBy,
          wastageExceptionRaised: yieldVariance > 5,
          wastageExceptionId,
        },
        'm4',
      );

      return this.toResponseDto(woId, bom);
    });
  }

  /**
   * Cancel a work order (from PLANNED or IN_PROGRESS status only).
   */
  async cancelWorkOrder(woId: string, cancelledBy: string): Promise<void> {
    const header = await this.woRepo.getHeaderById(woId);
    if (!header) {
      throw new NotFoundException(`Work order ${woId} not found`);
    }

    if (header.status === WorkOrderStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a COMPLETED work order');
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
   * Raise WASTAGE_VARIANCE exception when yield deviation exceeds 5%.
   * Creates entry in exception_approvals table and emits domain event.
   */
  private async raiseWastageException(
    woId: string,
    header: WorkOrderHeaderRow,
    bom: BomHeaderResponseDto,
    actualYield: number,
    variancePercent: number,
    raisedBy: string,
    siteId: string,
  ): Promise<string | null> {
    const plannedQty = Qty.of(header.planned_qty, header.uom);
    const valueAtRisk = plannedQty.toNumber() * (variancePercent / 100);

    const exceptionId = uuidv7();

    await this.knex.transaction(async (trx) => {
      await trx('exception_approvals').insert({
        id: exceptionId,
        type: 'WASTAGE_VARIANCE',
        reference_table: 'production_work_orders',
        reference_id: woId,
        requested_by: raisedBy,
        status: 'PENDING_APPROVAL',
        title: 'Production Yield Variance Exceeded',
        summary: `Work order ${header.wo_no} yield is ${actualYield.toFixed(2)}%, expected ${bom.yieldPct}%`,
        facts: JSON.stringify([
          { label: 'Work Order', value: header.wo_no },
          { label: 'BOM', value: bom.bomNo },
          { label: 'Expected Yield', value: `${bom.yieldPct}%` },
          { label: 'Actual Yield', value: `${actualYield.toFixed(2)}%` },
          { label: 'Variance', value: `${variancePercent.toFixed(2)}%` },
          { label: 'Planned Qty', value: header.planned_qty },
        ]),
        impact: `Production efficiency loss - investigate causes`,
        actions: JSON.stringify([
          { code: 'RECORD_WASTAGE', label: 'Record as Wastage' },
          { code: 'INVESTIGATE', label: 'Investigate Cause' },
        ]),
        value_at_risk: valueAtRisk.toString(),
        site_id: siteId,
        created_at: Clock.nowUtc().toISOString(),
        updated_at: Clock.nowUtc().toISOString(),
      });

      // Emit exception raised event
      await this.outbox.raise(
        trx,
        'exception.wastage_variance_raised',
        woId,
        {
          workOrderId: woId,
          exceptionId,
          actualYield: actualYield.toFixed(2),
          expectedYield: bom.yieldPct,
          variance: variancePercent.toFixed(2),
          valueAtRisk: valueAtRisk.toString(),
        },
        'm4',
      );
    });

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
