import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants.js';
import { GRNService } from '../modules/m2-procurement/grn.service.js';
import { POService } from '../modules/m2-procurement/po.service.js';
import { POController } from '../modules/m2-procurement/po.controller.js';
import { ShortfallService } from '../modules/m2-procurement/shortfall.service.js';
import { SupplierBillService } from '../modules/m2-procurement/supplier-bill.service.js';
import { SupplierBillController } from '../modules/m2-procurement/supplier-bill.controller.js';
import { InventoryService } from '../modules/m3-inventory/inventory.service.js';
import { InventoryEventHandler } from '../modules/m3-inventory/inventory-event.handler.js';
import { InventoryController } from '../modules/m3-inventory/inventory.controller.js';
import { RbacGuard } from '../modules/m0-platform/rbac.service.js';
import { BillStatus } from '../modules/m2-procurement/supplier-bill.types.js';

const WEB_APP_DIR = path.resolve(__dirname, '../../../web/app');
const API_SRC_DIR = path.resolve(__dirname, '..');

function makeKnexStub(tableHandler: (table: string) => any) {
  const fn: any = (table: string) => tableHandler(table);
  fn.raw = vi.fn((sql: string, params?: any[]) => ({ sql, params }));
  fn.fn = { now: () => new Date() };
  fn.transaction = async (cb: (trx: any) => any) => cb(fn);
  return fn;
}

describe('Phase 3 — Procurement (M2) ↔ Inventory (M3) & Web Verification', () => {
  it('TC-P3-01: GRNService.createBlindGRN emits grn.posted with lines[].requestedQty + metadata and calls inventoryPort.postGRN', async () => {
    const outboxPayloads: any[] = [];
    const postGrnCalls: string[] = [];

    const knex = makeKnexStub((table) => {
      if (table === 'goods_receipts') {
        return {
          insert: (row: any) => ({
            returning: async () => [{ id: row.id, grn_no: row.grn_no }],
          }),
        };
      }
      if (table === 'goods_receipt_lines') {
        return {
          insert: async () => [],
          join: () => ({
            where: () => ({
              select: async () => [
                { item_id: 'item-1', received_qty: '80.000' },
              ],
            }),
          }),
        };
      }
      if (table === 'items') {
        return {
          where: () => ({
            first: async () => ({ primary_uom: 'KG' }),
          }),
        };
      }
      if (table === 'po_shortfalls') {
        return {
          insert: (row: any) => ({
            returning: async () => [row],
          }),
        };
      }
      if (table === 'purchase_order_lines') {
        return {
          where: () => ({
            select: async () => [
              { id: 'pol-1', item_id: 'item-1', confirmed_qty: '100.000', received_qty: '0.000' },
            ],
            update: async () => 1,
          }),
        };
      }
      if (table === 'purchase_orders') {
        return {
          where: () => ({
            update: async () => 1,
          }),
        };
      }
      return {};
    });

    const outbox: any = {
      raise: vi.fn(async (_trx, type, _id, payload) => {
        outboxPayloads.push({ type, payload });
        return 'ev-1';
      }),
    };
    const poSvc: any = {
      getById: async () => ({
        id: 'po-1',
        supplier_id: 'sup-1',
        receiving_site_id: '11111111-1111-4111-8111-111111111111',
      }),
      getLines: async () => [
        {
          id: 'pol-1',
          itemId: 'item-1',
          confirmedQty: '100.000',
          orderedQty: '100.000',
          itemSku: 'SKU-1',
          itemName: 'Maize',
        },
      ],
    };
    const exSvc: any = { raise: vi.fn().mockResolvedValue('ex-1') };
    const inventoryPort: any = {
      postGRN: vi.fn(async (id: string) => {
        postGrnCalls.push(id);
      }),
    };

    const grnSvc = new GRNService(
      knex,
      { next: async () => 'GRN-2611-0001' } as any,
      {} as any,
      outbox,
      exSvc,
      {} as any,
      poSvc,
      inventoryPort,
    );

    const res = await grnSvc.createBlindGRN({
      poId: 'po-1',
      siteId: '', // should auto-resolve from PO receiving_site_id
      locationId: 'loc-1',
      receivedBy: 'usr-1',
      userId: 'usr-1',
      lines: [
        {
          itemId: 'item-1',
          receivedQty: '80.000',
          batchLotNo: 'BAT-99',
        },
      ],
    });

    expect(res.grnNo).toBe('GRN-2611-0001');
    expect(res.shortfalls).toHaveLength(1);
    expect(postGrnCalls).toEqual([res.id]);
    expect(outboxPayloads).toHaveLength(1);
    expect(outboxPayloads[0].type).toBe('grn.posted');
    expect(outboxPayloads[0].payload.locationId).toBe('loc-1');
    expect(outboxPayloads[0].payload.lines[0]).toMatchObject({
      itemId: 'item-1',
      requestedQty: '100.000',
      receivedQty: '80.000',
      batchLotNo: 'BAT-99',
    });
  });

  it('TC-P3-02: InventoryEventHandler consumes both M2 lines[] grn.posted payload and legacy flat payload', async () => {
    const receiveMock = vi.fn().mockResolvedValue({ success: true });
    const handler = new InventoryEventHandler({ receiveGRN: receiveMock } as any);

    await handler.handle({
      event_type: 'grn.posted',
      aggregate_id: 'grn-1',
      payload: {
        grnId: 'grn-1',
        grnNo: 'GRN-001',
        poId: 'po-1',
        siteId: 'site-1',
        locationId: 'loc-1',
        receivedBy: 'usr-1',
        lines: [
          { itemId: 'itm-1', requestedQty: '100.000', receivedQty: '95.000', batchLotNo: 'B-1' },
          { itemId: 'itm-2', receivedQty: '50.000' },
        ],
      },
    });

    expect(receiveMock).toHaveBeenCalledTimes(2);
    expect(receiveMock).toHaveBeenNthCalledWith(
      1,
      'site-1',
      'po-1',
      'itm-1',
      '100.000',
      '95.000',
      expect.objectContaining({ grnId: 'grn-1', grnNo: 'GRN-001', batchLotNo: 'B-1' }),
    );
    expect(receiveMock).toHaveBeenNthCalledWith(
      2,
      'site-1',
      'po-1',
      'itm-2',
      '50.000',
      '50.000',
      expect.objectContaining({ grnId: 'grn-1', grnNo: 'GRN-001' }),
    );

    await handler.handle({
      event_type: 'grn.posted',
      aggregate_id: 'grn-legacy',
      payload: {
        siteId: 'site-1',
        poId: 'po-legacy',
        itemId: 'itm-legacy',
        requestedQty: '10.000',
        receivedQty: '10.000',
      },
    });
    expect(receiveMock).toHaveBeenCalledTimes(3);
  });

  it('TC-P3-03: InventoryService.postGRN creates batch metadata, allows two partial GRNs on same PO, and stays idempotent per GRN', async () => {
    const postedReceipts: Array<{ refNo: string; qty: string; batchId?: string }> = [];
    const createdBatches: any[] = [];
    const ledgerPosting = {
      post: vi.fn(async (_trx: any, entry: any) => {
        postedReceipts.push({
          refNo: entry.referenceNo,
          qty: entry.qty,
          batchId: entry.batchId,
        });
        return 'txn-1';
      }),
    } as any;

    const knex = makeKnexStub((table) => {
      if (table === 'goods_receipts') {
        return {
          where: ({ id }: any) => ({
            first: async () =>
              id === 'grn-1'
                ? {
                    id: 'grn-1',
                    grn_no: 'GRN-001',
                    po_id: 'po-1',
                    site_id: '11111111-1111-4111-8111-111111111111',
                    location_id: '22222222-2222-4222-8222-222222222222',
                    received_by: '33333333-3333-4333-8333-333333333333',
                  }
                : {
                    id: 'grn-2',
                    grn_no: 'GRN-002',
                    po_id: 'po-1',
                    site_id: '11111111-1111-4111-8111-111111111111',
                    received_by: '33333333-3333-4333-8333-333333333333',
                  },
          }),
        };
      }
      if (table === 'goods_receipt_lines') {
        return {
          where: ({ grn_id }: any) => ({
            select: async () => [
              {
                item_id: 'itm-1',
                received_qty: grn_id === 'grn-1' ? '40.000' : '60.000',
                batch_lot_no: grn_id === 'grn-1' ? 'LOT-A' : 'LOT-B',
              },
            ],
          }),
        };
      }
      if (table === 'purchase_order_lines') {
        return {
          where: () => ({
            select: async () => [{ item_id: 'itm-1', confirmed_qty: '100.000', ordered_qty: '100.000' }],
          }),
        };
      }
      if (table === 'stock_ledger_txns') {
        return {
          where: ({ reference_no }: any) => ({
            first: async () => postedReceipts.find((r) => r.refNo === reference_no) || null,
          }),
        };
      }
      if (table === 'inventory_batches') {
        return {
          where: () => ({
            first: async () => null,
            orderBy: () => ({ first: async () => null }),
          }),
          insert: async (row: any) => {
            createdBatches.push(row);
            return [];
          },
        };
      }
      return {};
    });

    const invSvc = new InventoryService(knex, undefined, undefined, undefined, ledgerPosting);
    await invSvc.postGRN('grn-1');
    await invSvc.postGRN('grn-1'); // duplicate delivery of grn-1 must be idempotent
    await invSvc.postGRN('grn-2'); // second partial GRN on same PO must still post

    expect(postedReceipts).toHaveLength(2);
    expect(postedReceipts[0]).toMatchObject({ refNo: 'GRN-001', qty: '40.000' });
    expect(postedReceipts[1]).toMatchObject({ refNo: 'GRN-002', qty: '60.000' });
    expect(createdBatches[0].batch_number).toBe('LOT-A');
    expect(createdBatches[0].location_id).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('TC-P3-04: GRNService.getById supports direct GRNs via leftJoin and getBlindReceiveView resolves real item UoMs', async () => {
    let usedLeftJoin = false;
    const knex = makeKnexStub((table) => {
      if (table === 'goods_receipts') {
        return {
          join: () => ({
            leftJoin: () => {
              usedLeftJoin = true;
              return {
                where: () => ({
                  select: () => ({
                    first: async () => ({ id: 'grn-direct', po_no: null }),
                  }),
                }),
              };
            },
          }),
        };
      }
      if (table === 'items') {
        return {
          whereIn: () => ({
            select: async () => [{ id: 'itm-1', primary_uom: 'KG', secondary_uom: 'BAG' }],
          }),
        };
      }
      return {};
    });

    const svc = new GRNService(
      knex,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getById: async () => ({ company_name: 'Sup' }) } as any,
      {
        getById: async () => ({ id: 'po-1', po_no: 'PO-1', supplier_id: 'sup-1' }),
        getLines: async () => [{ itemId: 'itm-1', itemSku: 'SKU-1', itemName: 'Soy' }],
      } as any,
    );

    const grn = await svc.getById('grn-direct');
    expect(usedLeftJoin).toBe(true);
    expect(grn.po_no).toBeNull();

    const blind = await svc.getBlindReceiveView('po-1');
    expect(blind.lines[0].primaryUom).toBe('KG');
    expect(blind.lines[0].secondaryUom).toBe('BAG');
  });

  it('TC-P3-05: M2ProcurementModule shares singleton ExceptionService and POService skips spike on zero baseline + passes siteId', async () => {
    const m2Mod = fs.readFileSync(
      path.join(API_SRC_DIR, 'modules/m2-procurement/m2-procurement.module.ts'),
      'utf8',
    );
    expect(m2Mod).not.toContain('ExceptionService,');

    const poUpdates: any[] = [];
    const exRaise = vi.fn().mockResolvedValue('ex-1');
    const knex = makeKnexStub((table) => {
      if (table === 'purchase_orders as po') {
        return {
          leftJoin: () => ({
            leftJoin: () => ({
              where: () => ({
                select: () => ({
                  first: async () => ({
                    id: 'po-1',
                    po_no: 'PO-1',
                    po_status: 'DRAFT',
                    receiving_site_id: 'site-1',
                    supplier_id: 'sup-1',
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'purchase_orders') {
        return {
          where: () => ({
            first: async () => ({ id: 'po-1', po_no: 'PO-1', po_status: 'DRAFT', receiving_site_id: 'site-1', supplier_id: 'sup-1' }),
            update: async (patch: any) => {
              poUpdates.push(patch);
              return 1;
            },
          }),
        };
      }
      if (table === 'purchase_order_lines') {
        return {
          where: () => ({
            where: () => ({
              first: async () => ({
                id: 'pol-1',
                po_id: 'po-1',
                item_id: 'itm-1',
                ordered_qty: '100',
                last_purchase_price_snapshot: '0.00',
              }),
            }),
            update: async () => 1,
            select: async () => [{ ordered_qty: '100', confirmed_qty: '90', unit_price: '55.00' }],
          }),
        };
      }
      if (table === 'items') {
        return { where: () => ({ first: async () => ({ primary_uom: 'KG' }) }) };
      }
      return {};
    });

    const poSvc = new POService(
      knex,
      {} as any,
      {} as any,
      { raise: vi.fn().mockResolvedValue('ev') } as any,
      { onResolved: vi.fn(), raise: exRaise } as any,
      {} as any,
    );

    const out = await poSvc.confirmQuantities({
      poId: 'po-1',
      confirmations: [{ lineId: 'pol-1', confirmedQty: '90', unitPrice: '55.00', userId: 'u-1' }],
    });
    expect(out.poStatus).toBe('DRAFT');
    expect(exRaise).not.toHaveBeenCalled();
    expect(poUpdates[0].total_amount).toBe('4950.00');
  });

  it('TC-P3-06: POController.getPdf maps camelCase POLineSummary properties cleanly', async () => {
    const poSrc = fs.readFileSync(
      path.join(API_SRC_DIR, 'modules/m2-procurement/po.controller.ts'),
      'utf8',
    );
    expect(poSrc).toContain('l.itemName || l.item_name');
    expect(poSrc).toContain('l.orderedQty ?? l.ordered_qty');
    expect(poSrc).toContain('l.unitPrice ?? l.unit_price');
  });

  it('TC-P3-07: ShortfallService ranks lower/equal-price backup suppliers ahead of expensive ones', async () => {
    const knex = makeKnexStub((table) => {
      if (table === 'supplier_items as si') {
        return {
          where: () => ({
            join: () => ({
              join: () => ({
                where: () => ({
                  where: () => ({
                    where: () => ({
                      select: () => ({
                        distinct: async () => [
                          {
                            supplier_id: 'sup-exp',
                            supplier_code: 'S-EXP',
                            company_name: 'Expensive Sup',
                            reliability_score_pct: 90,
                            lead_time_days_avg: 2,
                          },
                          {
                            supplier_id: 'sup-cheap',
                            supplier_code: 'S-CHEAP',
                            company_name: 'Best Rate Sup',
                            reliability_score_pct: 90,
                            lead_time_days_avg: 2,
                          },
                        ],
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const supSvc: any = {
      getLatestRate: async (supId: string) => (supId === 'sup-exp' ? '120.00' : '101.00'),
    };
    const sfSvc = new ShortfallService(knex, {} as any, {} as any, {} as any, supSvc, {} as any, {} as any);
    const ranked = await sfSvc.getRankedBackups('itm-1', '100.00');

    expect(ranked[0].supplierId).toBe('sup-cheap');
    expect(ranked[0].priceVariancePct).toBeCloseTo(0.01, 4);
    expect(ranked[1].supplierId).toBe('sup-exp');
    expect(ranked[1].priceVariancePct).toBeCloseTo(0.2, 4);
  });

  it('TC-P3-08: SupplierBillController uses resolveUserSiteId and SupplierBillService aggregates all GRNs for a PO', async () => {
    const grnWhereInCalls: any[] = [];
    const knex = makeKnexStub((table) => {
      if (table === 'purchase_orders') {
        return { where: () => ({ first: async () => ({ id: 'po-1', created_at: new Date(), total_amount: '1000.00' }) }) };
      }
      if (table === 'suppliers') {
        return { where: () => ({ first: async () => ({ id: 'sup-1', state_code: 'MH' }) }) };
      }
      if (table === 'goods_receipts') {
        return { where: () => ({ select: async () => [{ id: 'grn-1', received_at: new Date() }, { id: 'grn-2', received_at: new Date() }] }) };
      }
      if (table === 'goods_receipt_lines') {
        return {
          whereIn: (col: string, ids: string[]) => {
            grnWhereInCalls.push({ col, ids });
            return { sum: () => ({ first: async () => ({ total_qty: '100.000' }) }) };
          },
        };
      }
      if (table === 'items') {
        return { where: () => ({ first: async () => ({ id: 'itm-1', name: 'Soy' }) }) };
      }
      if (table === 'supplier_bills') {
        return {
          where: () => ({
            orWhere: () => ({
              count: () => ({ first: async () => ({ count: '0' }) }),
            }),
            count: () => ({ first: async () => ({ count: '0' }) }),
            first: async () => ({ id: 'bill-1', bill_number: 'BILL-01', status: BillStatus.PENDING_APPROVAL }),
          }),
          insert: async () => [],
        };
      }
      if (table === 'supplier_bill_items') {
        return {
          where: () => ({ select: async () => [] }),
          insert: async () => [],
        };
      }
      return {};
    });

    const billSvc = new SupplierBillService(
      knex,
      {} as any,
      {} as any,
      {} as any,
      { raise: vi.fn().mockResolvedValue('ev') } as any,
      { next: async () => 'BILL-01' } as any,
    );
    await billSvc.create(
      {
        supplier_id: 'sup-1',
        po_id: 'po-1',
        site_id: 'site-1',
        items: [{ item_id: 'itm-1', batch_id: 'bat-1', item_name: 'Soy', quantity: '100', rate_per_unit: '10', tax_amount: '0', line_total: '1000' }],
      } as any,
      'usr-1',
    );
    expect(grnWhereInCalls[0].ids).toEqual(['grn-1', 'grn-2']);

    const mockBillSvc = { list: vi.fn().mockResolvedValue([]) } as any;
    const ctrl = new SupplierBillController(mockBillSvc, {} as any);
    await ctrl.list({}, { user: { role: 'OPS_COORD', siteIds: ['11111111-1111-4111-8111-111111111111'] } });
    expect(mockBillSvc.list).toHaveBeenCalledWith(
      expect.objectContaining({ site_id: '11111111-1111-4111-8111-111111111111' }),
    );
  });

  it('TC-P3-09: InventoryController enforces RbacGuard in NestJS guard metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, InventoryController) || [];
    expect(guards).toContain(RbacGuard);
  });

  it('TC-P3-10: InventoryService.approveStockCount posts surplus and deficit ledger movements and updates sheet', async () => {
    const ledgerEntries: any[] = [];
    const sheetUpdates: any[] = [];
    const ledgerPosting = {
      post: vi.fn(async (_trx: any, entry: any) => {
        ledgerEntries.push(entry);
        return 'txn-1';
      }),
    } as any;

    const knex = makeKnexStub((table) => {
      if (table === 'stock_count_sheets as scs') {
        return {
          where: () => ({
            forUpdate: () => ({
              first: async () => ({ id: 'cnt-1', site_id: 'site-1', count_no: 'CNT-1', status: 'DRAFT', created_by: 'usr-1' }),
            }),
          }),
        };
      }
      if (table === 'stock_count_sheets') {
        return {
          where: () => ({
            update: async (patch: any) => {
              sheetUpdates.push(patch);
              return 1;
            },
          }),
        };
      }
      if (table === 'stock_count_items as sci') {
        return {
          leftJoin: () => ({
            where: () => ({
              select: async () => [
                { item_id: 'itm-surplus', variance_qty: '5.000', system_qty: '10.000', batch_no: 'B-1', primary_uom: 'KG' },
                { item_id: 'itm-deficit', variance_qty: '-3.000', system_qty: '20.000', batch_no: 'B-2', primary_uom: 'KG' },
              ],
            }),
          }),
        };
      }
      if (table === 'stock_adjustments') {
        return { insert: () => ({ returning: async () => [{ id: 'adj-1' }] }) };
      }
      if (table === 'inventory_batches') {
        return {
          where: ({ item_id }: any) => ({
            first: async () => ({ id: item_id === 'itm-surplus' ? 'bat-s' : 'bat-d' }),
            where: () => ({
              orderBy: () => ({
                forUpdate: () => ({
                  select: async () => [{ id: 'bat-d', qty_available: '20.000' }],
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const invSvc = new InventoryService(knex, undefined, undefined, undefined, ledgerPosting);
    const res = await invSvc.approveStockCount('cnt-1', 'owner-1');
    expect(res.status).toBe('APPROVED');
    expect(ledgerEntries).toHaveLength(2);
    expect(ledgerEntries[0]).toMatchObject({ itemId: 'itm-surplus', onHandDelta: 5, txnType: 'ADJUSTMENT' });
    expect(ledgerEntries[1]).toMatchObject({ itemId: 'itm-deficit', qty: '3.000', txnType: 'ADJUSTMENT' });
    expect(sheetUpdates[0].status).toBe('APPROVED');
  });

  it('TC-P3-11: Procurement web and floor pages wire real API endpoints and DTOs without unsafe assumptions', () => {
    const floorGrn = fs.readFileSync(path.join(WEB_APP_DIR, '(floor)/floor/grn/page.tsx'), 'utf8');
    expect(floorGrn).toContain('PARTIALLY_RECEIVED');
    expect(floorGrn).toContain('/api/proxy/procurement/grns');

    const poDetail = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/procurement/purchase-orders/[id]/page.tsx'), 'utf8');
    expect(poDetail).toContain('/issue');

    const suppliers = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/procurement/suppliers/page.tsx'), 'utf8');
    expect(suppliers).toContain('/rates');
    expect(suppliers).toContain('/update-reliability');

    const shortfalls = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/procurement/shortfalls/page.tsx'), 'utf8');
    expect(shortfalls).toContain('(sf.impactedSalesOrders || [])');
    expect(shortfalls).toContain('/ranked-backups');
  });

  it('TC-P3-12: Inventory web and floor pages map API responses cleanly and send real DTOs', () => {
    const transfers = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/inventory/transfers/page.tsx'), 'utf8');
    expect(transfers).toContain('normalizeTransferStatus');
    expect(transfers).toContain('idempotencyKey');

    const stockCounts = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/inventory/stock-counts/page.tsx'), 'utf8');
    expect(stockCounts).toContain('/api/proxy/inventory/stock-counts');
    expect(stockCounts).toContain('/approve');

    const reservations = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/inventory/reservations/page.tsx'), 'utf8');
    expect(reservations).toContain('idempotencyKey');

    const availability = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/inventory/availability/page.tsx'), 'utf8');
    expect(availability).toContain('/api/proxy/inventory/stock/projection');

    const expiry = fs.readFileSync(path.join(WEB_APP_DIR, '(office)/inventory/expiry/page.tsx'), 'utf8');
    expect(expiry).toContain('/api/proxy/inventory/adjustments');
  });
});
