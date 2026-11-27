import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { InventoryService } from '../modules/m3-inventory/inventory.service.js';
import { WorkOrderService } from '../modules/m4-production/work-order.service.js';
import { WastageService } from '../modules/m4-production/wastage.service.js';
import { RequisitionService } from '../modules/m4-production/requisition.service.js';
import { BomService } from '../modules/m4-production/bom.service.js';
import { AttendanceService } from '../modules/m4-production/attendance.service.js';
import { WorkOrderController } from '../modules/m4-production/work-order.controller.js';
import { WorkersController } from '../modules/m4-production/workers.controller.js';
import { CreateWorkOrderDto } from '../modules/m4-production/dto/work-order.dto.js';
import { CreateBomDto } from '../modules/m4-production/dto/bom.dto.js';
import { CreateRequisitionDto } from '../modules/m4-production/dto/requisition.dto.js';
import { CreateWastageDto } from '../modules/m4-production/dto/wastage.dto.js';

const WEB_APP_DIR = path.resolve(__dirname, '../../../web/app');
const API_SRC_DIR = path.resolve(__dirname, '..');

function makeKnexStub(tableHandler: (table: string) => any) {
  const fn: any = (table: string) => tableHandler(table);
  fn.raw = vi.fn((sql: string, params?: any[]) => ({ sql, params }));
  fn.fn = { now: () => new Date() };
  fn.transaction = async (cb: (trx: any) => any) => cb(fn);
  return fn;
}

const UUID_1 = '11111111-1111-4111-8111-111111111111';
const UUID_2 = '22222222-2222-4222-8222-222222222222';
const UUID_3 = '33333333-3333-4333-8333-333333333333';
const UUID_4 = '44444444-4444-4444-8444-444444444444';
const UUID_5 = '55555555-5555-4555-8555-555555555555';

describe('Phase 4 — Production (M4) ↔ Inventory (M3) & Web/Floor Verification', () => {
  it('TC-P4-01: WorkOrderService.createWorkOrder scales BOM qtyPerUnit * plannedQty and omits generated variance_pct', async () => {
    const insertedMaterials: any[] = [];
    const knex = makeKnexStub((table) => {
      if (table === 'production_work_orders') {
        return {
          insert: (row: any) => ({
            returning: async () => [{ ...row }],
          }),
        };
      }
      if (table === 'work_order_materials') {
        return {
          insert: async (row: any) => {
            insertedMaterials.push(row);
            return [row];
          },
        };
      }
      return { where: () => ({ first: async () => null }) };
    });

    const woRepo: any = {
      headerExists: vi.fn().mockResolvedValue(false),
      getHeaderById: vi.fn().mockResolvedValue({
        id: UUID_4,
        wo_no: 'WO-001',
        site_id: UUID_1,
        bom_header_id: UUID_2,
        planned_qty: '100.000',
        uom: 'KG',
        status: 'PLANNED',
        started_at: null,
        completed_at: null,
        started_by: null,
        completed_by: null,
        created_by: UUID_5,
        updated_by: UUID_5,
        created_at: '2026-11-27T00:00:00Z',
        updated_at: '2026-11-27T00:00:00Z',
      }),
      getMaterialsWithItems: vi.fn().mockResolvedValue([]),
      getOutputsWithItems: vi.fn().mockResolvedValue([]),
    };

    const bomService: any = {
      getBom: vi.fn().mockResolvedValue({
        id: UUID_2,
        bomNo: 'BOM-FEED-V1',
        itemId: UUID_3,
        itemName: 'Dairy Feed',
        itemSkuCode: 'FG-01',
        siteId: UUID_1,
        version: 1,
        status: 'ACTIVE',
        yieldPct: '97.00',
        lines: [
          { itemId: UUID_4, itemName: 'Maize', qtyPerUnit: '0.55', uom: 'KG', sequenceNo: 1 },
          { itemId: UUID_5, itemName: 'Soy', qtyPerUnit: '0.45', uom: 'KG', sequenceNo: 2 },
        ],
      }),
    };

    const svc = new WorkOrderService(
      knex,
      woRepo,
      bomService,
      {} as any,
      { getItem: vi.fn().mockResolvedValue({ name: 'Dairy Feed', skuCode: 'FG-01' }) } as any,
      { raise: vi.fn().mockResolvedValue('evt-1') } as any,
    );

    await svc.createWorkOrder(
      { woNo: 'WO-001', siteId: UUID_1, bomHeaderId: UUID_2, plannedQty: '100', uom: 'KG' } as any,
      UUID_5,
    );

    expect(insertedMaterials).toHaveLength(2);
    expect(insertedMaterials[0].planned_qty).toBe('55.000');
    expect(insertedMaterials[1].planned_qty).toBe('45.000');
    expect(insertedMaterials[0]).not.toHaveProperty('variance_pct');
    expect(insertedMaterials[1]).not.toHaveProperty('variance_pct');
  });

  it('TC-P4-02: WorkOrderService.startWorkOrder passes effectiveSiteId to checkATP and material UUID to reserve', async () => {
    const checkCalls: any[] = [];
    const reserveCalls: any[] = [];
    const knex = makeKnexStub(() => ({}));

    const matUuid = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const woRepo: any = {
      getHeaderById: vi.fn().mockResolvedValue({
        id: UUID_4,
        wo_no: 'WO-START-1',
        site_id: UUID_1,
        bom_header_id: UUID_2,
        planned_qty: '200.000',
        uom: 'KG',
        status: 'PLANNED',
      }),
      getMaterials: vi.fn().mockResolvedValue([
        { id: matUuid, item_id: UUID_3, planned_qty: '110.000', actual_qty: '0.000', uom: 'KG' },
      ]),
      updateHeader: vi.fn().mockResolvedValue(undefined),
      getMaterialsWithItems: vi.fn().mockResolvedValue([]),
      getOutputsWithItems: vi.fn().mockResolvedValue([]),
    };

    const bomService: any = {
      getBom: vi.fn().mockResolvedValue({
        id: UUID_2,
        bomNo: 'BOM-1',
        itemId: UUID_5,
        status: 'ACTIVE',
        yieldPct: '97.00',
        lines: [{ itemId: UUID_3, itemName: 'Maize', qtyPerUnit: '0.55', uom: 'KG' }],
      }),
    };

    const inventoryPort: any = {
      checkATP: vi.fn(async (siteId, itemId, qty) => {
        checkCalls.push({ siteId, itemId, qty });
        return { itemId, siteId, availableQty: '500.000', uom: 'KG', canFulfil: true };
      }),
      reserve: vi.fn(async (refId, siteId, itemId, qty) => {
        reserveCalls.push({ refId, siteId, itemId, qty });
        return { allocated: qty, deficit: '0.000', reservationIds: ['res-1'] };
      }),
    };

    const svc = new WorkOrderService(
      knex,
      woRepo,
      bomService,
      inventoryPort,
      { getItem: vi.fn().mockResolvedValue({ name: 'FG', skuCode: 'FG-1' }) } as any,
      { raise: vi.fn().mockResolvedValue('evt-1') } as any,
    );

    await svc.startWorkOrder(UUID_4, UUID_5, '');
    expect(checkCalls[0].siteId).toBe(UUID_1);
    expect(reserveCalls[0].siteId).toBe(UUID_1);
    expect(reserveCalls[0].refId).toBe(matUuid);
    expect(reserveCalls[0].refId.startsWith('wo-')).toBe(false);
  });

  it('TC-P4-03: WorkOrderService.recordConsumption delegates strictly to InventoryPort.postConsumption with zero direct M3 writes', async () => {
    const touchedTables: string[] = [];
    const postConsumptionCalls: any[] = [];

    const knex = makeKnexStub((table) => {
      touchedTables.push(table);
      return {};
    });

    const matUuid = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const woRepo: any = {
      getHeaderById: vi.fn().mockResolvedValue({
        id: UUID_4,
        wo_no: 'WO-CONS-1',
        site_id: UUID_1,
        bom_header_id: UUID_2,
        planned_qty: '200.000',
        uom: 'KG',
        status: 'IN_PROGRESS',
      }),
      getMaterials: vi.fn().mockResolvedValue([
        { id: matUuid, item_id: UUID_3, batch_id: null, planned_qty: '200.000', actual_qty: '0.000', uom: 'KG' },
      ]),
      updateMaterial: vi.fn().mockResolvedValue(undefined),
      getMaterialsWithItems: vi.fn().mockResolvedValue([]),
      getOutputsWithItems: vi.fn().mockResolvedValue([]),
    };

    const bomService: any = {
      getBom: vi.fn().mockResolvedValue({ id: UUID_2, bomNo: 'B1', itemId: UUID_5, lines: [] }),
    };

    const inventoryPort: any = {
      postConsumption: vi.fn(async (woId, matId, itemId, batchId, qty, opts) => {
        postConsumptionCalls.push({ woId, matId, itemId, batchId, qty, opts });
        return 'batch-rm-1';
      }),
    };

    const svc = new WorkOrderService(
      knex,
      woRepo,
      bomService,
      inventoryPort,
      { getItem: vi.fn().mockResolvedValue({ name: 'FG', skuCode: 'FG-1' }) } as any,
      { raiseStandalone: vi.fn().mockResolvedValue('evt-1') } as any,
    );

    await svc.recordConsumption(
      UUID_4,
      { lines: [{ itemId: UUID_3, actualQty: '195' }] },
      UUID_5,
      UUID_1,
    );

    expect(postConsumptionCalls).toHaveLength(1);
    expect(postConsumptionCalls[0]).toMatchObject({
      woId: UUID_4,
      matId: matUuid,
      itemId: UUID_3,
      qty: '195',
      opts: { siteId: UUID_1, uom: 'KG' },
    });
    expect(woRepo.updateMaterial).toHaveBeenCalledWith(matUuid, {
      actual_qty: '195.000',
      batch_id: 'batch-rm-1',
    });
    expect(touchedTables).not.toContain('inventory_batches');
    expect(touchedTables).not.toContain('stock_ledger_txns');
  });

  it('TC-P4-04: WorkOrderService.recordOutput & InventoryService.postOutput keep produced FG AVAILABLE (no committedDelta)', async () => {
    const createdOutputs: any[] = [];
    const postOutputCalls: any[] = [];

    const woRepo: any = {
      getHeaderById: vi.fn().mockResolvedValue({
        id: UUID_4,
        wo_no: 'WO-OUT-1',
        site_id: UUID_1,
        bom_header_id: UUID_2,
        planned_qty: '200.000',
        uom: 'KG',
        status: 'IN_PROGRESS',
      }),
      createOutputs: vi.fn(async (rows) => {
        createdOutputs.push(...rows);
        return rows;
      }),
      getMaterialsWithItems: vi.fn().mockResolvedValue([]),
      getOutputsWithItems: vi.fn().mockResolvedValue([]),
    };

    const bomService: any = {
      getBom: vi.fn().mockResolvedValue({ id: UUID_2, bomNo: 'B1', itemId: UUID_5, lines: [] }),
    };

    const inventoryPort: any = {
      postOutput: vi.fn(async (woId, itemId, batchId, qty, opts) => {
        postOutputCalls.push({ woId, itemId, batchId, qty, opts });
        return 'fg-batch-99';
      }),
    };

    const woSvc = new WorkOrderService(
      makeKnexStub(() => ({})),
      woRepo,
      bomService,
      inventoryPort,
      { getItem: vi.fn().mockResolvedValue({ name: 'FG', skuCode: 'FG-1' }) } as any,
      { raiseStandalone: vi.fn().mockResolvedValue('evt-2') } as any,
    );

    await woSvc.recordOutput(
      UUID_4,
      { lines: [{ itemId: UUID_5, actualQty: '196', batchNumber: 'LOT-FG-99' }] },
      UUID_1,
      UUID_1,
    );

    expect(postOutputCalls).toHaveLength(1);
    expect(createdOutputs).toHaveLength(1);
    expect(createdOutputs[0].batch_id).toBe('fg-batch-99');
    expect(createdOutputs[0]).not.toHaveProperty('yield_pct');

    // Verify real M3 InventoryService.postOutput creates batch and does NOT set committedDelta
    const ledgerEntries: any[] = [];
    const invKnex = makeKnexStub((table) => {
      if (table === 'locations') {
        return { where: () => ({ first: async () => ({ id: UUID_2 }) }) };
      }
      if (table === 'inventory_batches') {
        return { insert: async () => [] };
      }
      return {};
    });
    const ledgerPosting: any = {
      post: vi.fn(async (_trx, entry) => {
        ledgerEntries.push(entry);
        return 'txn-1';
      }),
    };
    const invSvc = new InventoryService(
      invKnex,
      undefined,
      undefined,
      undefined,
      ledgerPosting,
    );
    const createdBatchId = await invSvc.postOutput(UUID_4, UUID_5, '', '196.000', {
      siteId: UUID_1,
      batchNumber: 'LOT-FG-99',
      createdBy: UUID_1,
    });
    expect(typeof createdBatchId).toBe('string');
    expect(ledgerEntries[0].txnType).toBe('PROD_OUTPUT');
    expect(ledgerEntries[0].committedDelta).toBeUndefined();
  });

  it('TC-P4-05: completeWorkOrder enforces OD-012 BR-06 ±3% issued-material mass balance via EXCEPTION_PORT', async () => {
    const raisedExceptions: any[] = [];
    const knex = makeKnexStub((table) => {
      if (table === 'wastage_records') {
        return { where: () => ({ select: async () => [] }) };
      }
      return {};
    });

    const exceptionPort: any = {
      raise: vi.fn(async (...args) => {
        raisedExceptions.push(args);
        return 'exc-yield-1';
      }),
    };

    const configService: any = {
      get: vi.fn((key: string) => {
        if (key === 'yield_variance_basis') return 'ISSUED_RAW_MATERIAL';
        if (key === 'yield_variance_tolerance_pct') return 3;
        return undefined;
      }),
    };

    const makeSvc = (issued: string, output: string) => {
      const woRepo: any = {
        getHeaderById: vi.fn().mockResolvedValue({
          id: UUID_4,
          wo_no: 'WO-BR06',
          site_id: UUID_1,
          bom_header_id: UUID_2,
          planned_qty: '200.000',
          uom: 'KG',
          status: 'IN_PROGRESS',
        }),
        getMaterials: vi.fn().mockResolvedValue([{ item_id: UUID_3, actual_qty: issued, uom: 'KG' }]),
        getOutputs: vi.fn().mockResolvedValue([{ item_id: UUID_5, actual_qty: output, uom: 'KG' }]),
        updateHeader: vi.fn().mockResolvedValue(undefined),
        getMaterialsWithItems: vi.fn().mockResolvedValue([]),
        getOutputsWithItems: vi.fn().mockResolvedValue([]),
      };
      return new WorkOrderService(
        knex,
        woRepo,
        { getBom: vi.fn().mockResolvedValue({ id: UUID_2, bomNo: 'B1', itemId: UUID_5, yieldPct: '95.00', lines: [] }) } as any,
        {} as any,
        { getItem: vi.fn().mockResolvedValue({ name: 'FG', skuCode: 'FG-1' }) } as any,
        { raiseStandalone: vi.fn().mockResolvedValue('evt') } as any,
        exceptionPort,
        configService,
      );
    };

    // Within ±3%: 200 issued -> 195 output = 97.5% yield (2.5% variance <= 3%) => NO exception
    const okRes = await makeSvc('200.000', '195.000').completeWorkOrder(UUID_4, UUID_1, UUID_1);
    expect(okRes.yieldExceptionId).toBeNull();
    expect(okRes.yieldVariancePct).toBe(2.5);
    expect(raisedExceptions).toHaveLength(0);

    // Outside ±3%: 200 issued -> 192 output = 96.0% yield (4.0% variance > 3%) => raises YIELD_VARIANCE
    const failRes = await makeSvc('200.000', '192.000').completeWorkOrder(UUID_4, UUID_1, UUID_1);
    expect(failRes.yieldExceptionId).toBe('exc-yield-1');
    expect(failRes.yieldVariancePct).toBe(4);
    expect(raisedExceptions).toHaveLength(1);
    expect(raisedExceptions[0][0]).toBe('YIELD_VARIANCE');
    expect(raisedExceptions[0][1]).toBe('production_work_orders');
  });

  it('TC-P4-06: completeWorkOrder includes recorded wastage in OD-012 mass balance', async () => {
    const exceptionPort: any = { raise: vi.fn().mockResolvedValue('exc-1') };
    const knex = makeKnexStub((table) => {
      if (table === 'wastage_records') {
        return { where: () => ({ select: async () => [{ qty: '6.000' }] }) };
      }
      return {};
    });

    const woRepo: any = {
      getHeaderById: vi.fn().mockResolvedValue({
        id: UUID_4,
        wo_no: 'WO-WST-1',
        site_id: UUID_1,
        bom_header_id: UUID_2,
        planned_qty: '200.000',
        uom: 'KG',
        status: 'IN_PROGRESS',
      }),
      getMaterials: vi.fn().mockResolvedValue([{ item_id: UUID_3, actual_qty: '200.000', uom: 'KG' }]),
      getOutputs: vi.fn().mockResolvedValue([{ item_id: UUID_5, actual_qty: '192.000', uom: 'KG' }]),
      updateHeader: vi.fn().mockResolvedValue(undefined),
      getMaterialsWithItems: vi.fn().mockResolvedValue([]),
      getOutputsWithItems: vi.fn().mockResolvedValue([]),
    };

    const svc = new WorkOrderService(
      knex,
      woRepo,
      { getBom: vi.fn().mockResolvedValue({ id: UUID_2, bomNo: 'B1', itemId: UUID_5, yieldPct: '95.00', lines: [] }) } as any,
      {} as any,
      { getItem: vi.fn().mockResolvedValue({ name: 'FG', skuCode: 'FG-1' }) } as any,
      { raiseStandalone: vi.fn().mockResolvedValue('evt') } as any,
      exceptionPort,
    );

    // (192 output + 6 wastage) / 200 issued RM = 99% accounted -> 1% variance <= 3% -> NO exception
    const res = await svc.completeWorkOrder(UUID_4, UUID_1, UUID_1);
    expect(res.actualYieldPct).toBe(99);
    expect(res.yieldVariancePct).toBe(1);
    expect(res.yieldExceptionId).toBeNull();
    expect(exceptionPort.raise).not.toHaveBeenCalled();
  });

  it('TC-P4-07: cancelWorkOrder releases RM stock reservations when IN_PROGRESS', async () => {
    const releasedIds: string[] = [];
    const woRepo: any = {
      getHeaderById: vi.fn().mockResolvedValue({ id: UUID_4, status: 'IN_PROGRESS' }),
      getMaterials: vi.fn().mockResolvedValue([{ id: UUID_1 }, { id: UUID_2 }]),
      updateHeader: vi.fn().mockResolvedValue(undefined),
    };
    const svc = new WorkOrderService(
      makeKnexStub(() => ({})),
      woRepo,
      {} as any,
      { release: vi.fn(async (id) => { releasedIds.push(id); }) } as any,
      {} as any,
      {} as any,
    );
    await svc.cancelWorkOrder(UUID_4, UUID_5);
    expect(releasedIds).toEqual([UUID_1, UUID_2]);
    expect(woRepo.updateHeader).toHaveBeenCalledWith(
      UUID_4,
      expect.objectContaining({ status: 'CANCELLED', completed_by: UUID_5 }),
    );
  });

  it('TC-P4-08: M4 DTO validation accepts valid numeric strings (no broken @Min/@Max on strings)', async () => {
    const woDto = plainToInstance(CreateWorkOrderDto, {
      woNo: 'WO-VALID-01',
      siteId: UUID_1,
      bomHeaderId: UUID_2,
      plannedQty: '250.500',
      uom: 'KG',
    });
    const bomDto = plainToInstance(CreateBomDto, {
      bomNo: 'BOM-VALID-01',
      itemId: UUID_3,
      siteId: UUID_1,
      yieldPct: '97.00',
      lines: [{ itemId: UUID_4, qtyPerUnit: '0.55', uom: 'KG', sequenceNo: 1 }],
    });
    const reqDto = plainToInstance(CreateRequisitionDto, {
      reqNo: 'REQ-VALID-01',
      siteId: UUID_1,
      requestedBy: UUID_5,
      requiredByDate: '2026-11-30',
      lines: [{ itemId: UUID_4, requiredQty: '125.000', uom: 'KG' }],
    });
    const wstDto = plainToInstance(CreateWastageDto, {
      workOrderId: UUID_4,
      itemId: UUID_3,
      qty: '5.500',
      uom: 'KG',
      reasonType: 'DAMAGE',
    });

    expect(await validate(woDto)).toHaveLength(0);
    expect(await validate(bomDto)).toHaveLength(0);
    expect(await validate(reqDto)).toHaveLength(0);
    expect(await validate(wstDto)).toHaveLength(0);
  });

  it('TC-P4-09: WastageService uses returning(*) without updated_at, RequisitionService uses real siteId, BomService emits production.bom_activated', async () => {
    let insertedWastagePayload: any = null;
    const wstKnex = makeKnexStub((table) => {
      if (table === 'wastage_records') {
        return {
          insert: (row: any) => {
            insertedWastagePayload = row;
            return { returning: async () => [{ ...row }] };
          },
        };
      }
      return {};
    });
    const wstSvc = new WastageService(
      wstKnex,
      {} as any,
      { getHeaderById: vi.fn().mockResolvedValue({ id: UUID_4, site_id: UUID_1 }) } as any,
      { getItem: vi.fn().mockResolvedValue({ name: 'Feed', skuCode: 'FG-1' }) } as any,
    );
    const wstRes = await wstSvc.recordWastage(
      { workOrderId: UUID_4, itemId: UUID_3, qty: '5', uom: 'KG', reasonType: 'DAMAGE' as any },
      UUID_5,
    );
    expect(insertedWastagePayload).not.toHaveProperty('updated_at');
    expect(wstRes.id).toBeTruthy();

    const bomEvents: string[] = [];
    const bomKnex = makeKnexStub((table) => ({
      where: () => ({
        andWhere: () => ({
          andWhere: () => ({
            andWhere: () => ({ update: async () => 0 }),
          }),
        }),
        update: async () => 1,
      }),
    }));
    const bomSvc = new BomService(
      bomKnex,
      { getHeaderById: vi.fn().mockResolvedValue({ id: UUID_2, bom_no: 'BOM-1' }) } as any,
      {} as any,
      {
        raise: vi.fn(async (_trx, evtName) => {
          bomEvents.push(evtName);
          return 'evt-bom';
        }),
      } as any,
    );
    await (bomSvc as any).activateBomInTransaction(bomKnex, UUID_2, UUID_3, UUID_1, UUID_5);
    expect(bomEvents).toEqual(['production.bom_activated']);

    const reqSrc = fs.readFileSync(
      path.join(API_SRC_DIR, 'modules/m4-production/requisition.service.ts'),
      'utf8',
    );
    expect(reqSrc).toContain('this.inventoryPort.checkATP(\n        siteId,');
    expect(reqSrc).toContain("'production.requisition_converted'");
    expect(reqSrc).not.toContain("bomHeaderId: ''");
  });

  it('TC-P4-10: WorkersController & AttendanceService.listWorkers serve GET /production/workers cleanly', async () => {
    const usersChain = {
      leftJoin: () => usersChain,
      where: () => usersChain,
      andWhere: () => usersChain,
      distinct: () => usersChain,
      orderBy: async () => [
        { id: UUID_5, full_name: 'Ramesh Patil', role_code: 'FLOOR_SUPERVISOR' },
      ],
    };
    const monthChain = {
      where: () => monthChain,
      modify: () => monthChain,
      select: async () => [{ worker_id: UUID_5, hours_worked: '8', overtime_hours: '1' }],
    };
    const attKnex = makeKnexStub((table) => {
      if (table === 'users as u') return usersChain;
      if (table === 'labour_attendance_logs') return monthChain;
      return {};
    });

    const attSvc = new AttendanceService(attKnex, {
      list: vi.fn().mockResolvedValue([]),
    } as any);
    const ctl = new WorkersController(attSvc);
    const workers = await ctl.listWorkers(
      { user: { sub: UUID_1, role: 'OWNER', siteIds: [UUID_1] } },
      UUID_1,
    );
    expect(workers).toHaveLength(1);
    expect(workers[0]).toMatchObject({
      id: UUID_5,
      name: 'Ramesh Patil',
      monthlyHours: 9,
      status: 'OUT',
    });
  });

  it('TC-P4-11: Scenario F End-to-End Orchestration — SO Shortage Requisition -> WO Lifecycle -> M3 Stock -> OD-012 BR-06', async () => {
    const stockOnHand = new Map<string, number>([[UUID_4, 300], [UUID_3, 0]]);
    const events: string[] = [];

    const reqKnex = makeKnexStub((table) => {
      if (table === 'sales_order_lines as sol') {
        return {
          join: () => ({
            where: () => ({
              first: async () => ({ site_id: UUID_1, created_by: UUID_5 }),
            }),
          }),
        };
      }
      if (table === 'bom_lines as bl') {
        return {
          join: () => ({
            where: () => ({
              select: async () => [
                {
                  item_id: UUID_4,
                  qty_per_unit: '1.00',
                  item_primary_uom: 'KG',
                  item_category: 'RAW_MATERIAL',
                },
              ],
            }),
          }),
        };
      }
      if (table === 'production_requisitions') {
        return { insert: (r: any) => ({ returning: async () => [r] }) };
      }
      if (table === 'production_requisition_lines') {
        return { insert: async () => [] };
      }
      return {};
    });

    const reqSvc = new RequisitionService(
      reqKnex,
      { headerExists: vi.fn().mockResolvedValue(false) } as any,
      {
        getActiveBom: vi.fn().mockResolvedValue({ id: UUID_2, bomNo: 'BOM-F', status: 'ACTIVE', siteId: UUID_1, itemId: UUID_3 }),
        getBom: vi.fn().mockResolvedValue({ id: UUID_2, bomNo: 'BOM-F', status: 'ACTIVE', siteId: UUID_1, itemId: UUID_3 }),
      } as any,
      {} as any,
      {} as any,
      {
        getItem: vi.fn().mockResolvedValue({ id: UUID_4, name: 'Maize', skuCode: 'RM-1', category: 'RAW_MATERIAL', primaryUom: 'KG' }),
      } as any,
      { raise: vi.fn(), raiseStandalone: vi.fn() } as any,
    );
    (reqSvc as any).getRequisitionResponse = vi.fn(async (id) => ({ id, reqNo: 'REQ-SCENF', siteId: UUID_1 }));

    const createdReqId = await reqSvc.createRequisition('sol-1', UUID_3, '200.000', new Date('2026-11-30'));
    expect(createdReqId).toBeTruthy();

    const inventoryPort: any = {
      checkATP: vi.fn(async (_site, itemId, qty) => ({
        itemId,
        siteId: UUID_1,
        availableQty: String(stockOnHand.get(itemId) ?? 0),
        uom: 'KG',
        canFulfil: (stockOnHand.get(itemId) ?? 0) >= Number(qty),
      })),
      reserve: vi.fn(async (_ref, _site, _item, qty) => ({ allocated: qty, deficit: '0.000', reservationIds: ['r1'] })),
      postConsumption: vi.fn(async (_wo, _mat, itemId, _b, qty) => {
        stockOnHand.set(itemId, (stockOnHand.get(itemId) ?? 0) - Number(qty));
        return 'rm-batch-1';
      }),
      postOutput: vi.fn(async (_wo, itemId, _b, qty) => {
        stockOnHand.set(itemId, (stockOnHand.get(itemId) ?? 0) + Number(qty));
        return 'fg-batch-1';
      }),
    };

    const woState: any = { status: 'PLANNED', actualRm: '0.000', actualOut: '0.000' };
    const woRepo: any = {
      headerExists: vi.fn().mockResolvedValue(false),
      getHeaderById: vi.fn(async () => ({
        id: UUID_4,
        wo_no: 'WO-SCENF',
        site_id: UUID_1,
        bom_header_id: UUID_2,
        planned_qty: '200.000',
        uom: 'KG',
        status: woState.status,
      })),
      getMaterials: vi.fn(async () => [{ id: UUID_5, item_id: UUID_4, planned_qty: '200.000', actual_qty: woState.actualRm, uom: 'KG' }]),
      getOutputs: vi.fn(async () => (Number(woState.actualOut) > 0 ? [{ item_id: UUID_3, actual_qty: woState.actualOut, uom: 'KG' }] : [])),
      updateHeader: vi.fn(async (_id, upd) => { woState.status = upd.status; }),
      updateMaterial: vi.fn(async (_id, upd) => { woState.actualRm = upd.actual_qty; }),
      createOutputs: vi.fn(async (rows) => { woState.actualOut = rows[0].actual_qty; return rows; }),
      getMaterialsWithItems: vi.fn().mockResolvedValue([]),
      getOutputsWithItems: vi.fn().mockResolvedValue([]),
    };

    const woSvc = new WorkOrderService(
      makeKnexStub((t) => (t === 'wastage_records' ? { where: () => ({ select: async () => [] }) } : {})),
      woRepo,
      {
        getBom: vi.fn().mockResolvedValue({
          id: UUID_2,
          bomNo: 'BOM-F',
          itemId: UUID_3,
          siteId: UUID_1,
          status: 'ACTIVE',
          yieldPct: '98.00',
          lines: [{ itemId: UUID_4, itemName: 'Maize', qtyPerUnit: '1.00', uom: 'KG' }],
        }),
      } as any,
      inventoryPort,
      { getItem: vi.fn().mockResolvedValue({ name: 'Cattle Feed', skuCode: 'FG-F' }) } as any,
      {
        raise: vi.fn(async (_t, name) => { events.push(name); return 'e1'; }),
        raiseStandalone: vi.fn(async (name) => { events.push(name); return 'e2'; }),
      } as any,
      { raise: vi.fn().mockResolvedValue('exc-scenF') } as any,
    );

    await woSvc.startWorkOrder(UUID_4, UUID_5, UUID_1);
    await woSvc.recordConsumption(UUID_4, { lines: [{ itemId: UUID_4, actualQty: '200' }] }, UUID_5, UUID_1);
    await woSvc.recordOutput(UUID_4, { lines: [{ itemId: UUID_3, actualQty: '197' }] }, UUID_5, UUID_1);
    const done = await woSvc.completeWorkOrder(UUID_4, UUID_5, UUID_1);

    expect(done.status).toBe('COMPLETED');
    expect(done.actualYieldPct).toBe(98.5);
    expect(done.yieldExceptionId).toBeNull();
    expect(stockOnHand.get(UUID_4)).toBe(100);
    expect(stockOnHand.get(UUID_3)).toBe(197);
    expect(events).toContain('production.work_order_started');
    expect(events).toContain('production.consumption_recorded');
    expect(events).toContain('production.output_recorded');
    expect(events).toContain('production.work_order_completed');
  });

  it('TC-P4-12: Verifies Office & Floor Production frontend wiring and controller site resolution', () => {
    const overview = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/production/page.tsx'), 'utf8');
    const woPage = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/production/work-orders/page.tsx'), 'utf8');
    const bomPage = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/production/boms/page.tsx'), 'utf8');
    const reqPage = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/production/requisitions/page.tsx'), 'utf8');
    const wstPage = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/production/wastage/page.tsx'), 'utf8');
    const attPage = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/production/attendance/page.tsx'), 'utf8');
    const flWo = fs.readFileSync(path.join(WEB_APP_DIR, '(floor)/floor/production/page.tsx'), 'utf8');
    const flReq = fs.readFileSync(path.join(WEB_APP_DIR, '(floor)/floor/rm-request/page.tsx'), 'utf8');
    const flAtt = fs.readFileSync(path.join(WEB_APP_DIR, '(floor)/floor/attendance/page.tsx'), 'utf8');

    expect(overview).toContain('o.actualQty');
    expect(overview).not.toContain("r.status === 'OPEN'");
    expect(woPage).toContain('/start');
    expect(woPage).toContain('/consumption');
    expect(woPage).toContain('/output');
    expect(woPage).toContain('/complete');
    expect(bomPage).toContain('/api/proxy/production/boms');
    expect(bomPage).toContain('/cost-rollup');
    expect(bomPage).not.toContain("'itm-feed-fg'");
    expect(reqPage).toContain('/api/proxy/production/requisitions/generate');
    expect(reqPage).toContain('CONVERTED');
    expect(wstPage).toContain('reasonType');
    expect(wstPage).toContain('WRITTEN_OFF');
    expect(attPage).toContain('/api/proxy/production/attendance');
    expect(flWo).toContain('/api/proxy/production/work-orders');
    expect(flWo).toContain('/consumption');
    expect(flReq).toContain('requiredByDate');
    expect(flAtt).toContain('/api/proxy/production/attendance');

    const woCtlSrc = fs.readFileSync(
      path.join(API_SRC_DIR, 'modules/m4-production/work-order.controller.ts'),
      'utf8',
    );
    expect(woCtlSrc).toContain('resolveUserSiteId');
    expect(woCtlSrc).not.toContain('req.user.siteId');
    expect(WorkOrderController).toBeDefined();
  });
});
