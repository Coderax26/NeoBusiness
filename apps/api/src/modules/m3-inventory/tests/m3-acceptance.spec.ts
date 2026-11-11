import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Knex } from 'knex';
import { createKnex } from '../../../shared/database/knex-instance.js';
import { InventoryService } from '../inventory.service.js';
import { setupTestDB } from './test-setup.js';
import { v4 as uuidv4 } from 'uuid';

describe('M3 Acceptance — Scenario C: Multi-site Inventory Flow', () => {
  let knex: Knex;
  let inventoryService: InventoryService;

  let siteId: string;
  let siteBId: string;
  let ownerId: string;
  let coordinatorId: string;
  let storekeeperId: string;
  let itemRiceId: string;
  let itemWheatId: string;
  let itemSugarId: string;
  let batchRice1Id: string;
  let batchRice2Id: string;
  let batchWheat1Id: string;
  let batchSugar1Id: string;
  let today: string;

  // UUID order IDs for tests
  const orderId1 = uuidv4();
  const orderId2 = uuidv4();
  const orderId3 = uuidv4();
  const orderId4 = uuidv4();
  const orderId5 = uuidv4();
  const orderId6 = uuidv4();

  beforeAll(async () => {
    const setup = await setupTestDB();
    knex = setup.knex;
    siteId = setup.siteId;
    siteBId = setup.siteBId;
    ownerId = setup.ownerId;
    coordinatorId = setup.coordinatorId;
    storekeeperId = setup.storekeeperId;
    itemRiceId = setup.itemRiceId;
    itemWheatId = setup.itemWheatId;
    itemSugarId = setup.itemSugarId;
    batchRice1Id = setup.batchRice1Id;
    batchRice2Id = setup.batchRice2Id;
    batchWheat1Id = setup.batchWheat1Id;
    batchSugar1Id = setup.batchSugar1Id;
    today = setup.today;
    inventoryService = new InventoryService(knex);
  });

  afterAll(async () => {
    await knex?.destroy();
  });

  beforeEach(async () => {
    // TRUNCATE M3 tables carefully - only those that don't have cross-module FK issues
    // We don't truncate stock_adjustments, stock_transfers, stock_transfer_lines
    // in beforeEach because they have dependencies on inventory_batches.
    // Items and sites are shared across modules and must not be touched.
    await knex.raw(`
      TRUNCATE TABLE stock_reservations, stock_ledger_txns, inventory_batches RESTART IDENTITY CASCADE;
    `);

    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextMonth = new Date(now);
    nextMonth.setDate(nextMonth.getDate() + 30);

    await knex('inventory_batches').insert([
      {
        id: batchRice1Id,
        site_id: siteId,
        item_id: itemRiceId,
        batch_number: 'BATCH-RICE-2026-001',
        status: 'AVAILABLE',
        qty_on_hand: '1000.000',
        qty_committed: '0.000',
        expiry_date: tomorrow.toISOString().split('T')[0],
        mfg_date: new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split('T')[0],
        received_date: now.toISOString().split('T')[0],
        landed_cost_per_unit: '65.00',
        created_at: now,
        updated_at: now,
      },
      {
        id: batchRice2Id,
        site_id: siteId,
        item_id: itemRiceId,
        batch_number: 'BATCH-RICE-2026-002',
        status: 'AVAILABLE',
        qty_on_hand: '500.000',
        qty_committed: '0.000',
        expiry_date: nextWeek.toISOString().split('T')[0],
        mfg_date: new Date(now.getFullYear(), now.getMonth(), 15)
          .toISOString()
          .split('T')[0],
        received_date: now.toISOString().split('T')[0],
        landed_cost_per_unit: '68.00',
        created_at: now,
        updated_at: now,
      },
      {
        id: batchWheat1Id,
        site_id: siteId,
        item_id: itemWheatId,
        batch_number: 'BATCH-WHEAT-2026-001',
        status: 'AVAILABLE',
        qty_on_hand: '2000.000',
        qty_committed: '0.000',
        expiry_date: nextMonth.toISOString().split('T')[0],
        mfg_date: new Date(now.getFullYear(), now.getMonth(), 10)
          .toISOString()
          .split('T')[0],
        received_date: now.toISOString().split('T')[0],
        landed_cost_per_unit: '28.00',
        created_at: now,
        updated_at: now,
      },
      {
        id: batchSugar1Id,
        site_id: siteId, // Sugar at Site A for GRN tests
        item_id: itemSugarId,
        batch_number: 'BATCH-SUGAR-2026-001',
        status: 'AVAILABLE',
        qty_on_hand: '1500.000',
        qty_committed: '0.000',
        expiry_date: nextMonth.toISOString().split('T')[0],
        mfg_date: new Date(now.getFullYear(), now.getMonth(), 5)
          .toISOString()
          .split('T')[0],
        received_date: now.toISOString().split('T')[0],
        landed_cost_per_unit: '42.00',
        created_at: now,
        updated_at: now,
      },
      // Sugar at Site B for transfer tests
      {
        id: uuidv4(),
        site_id: siteBId,
        item_id: itemSugarId,
        batch_number: 'BATCH-SUGAR-2026-002',
        status: 'AVAILABLE',
        qty_on_hand: '1500.000',
        qty_committed: '0.000',
        expiry_date: nextMonth.toISOString().split('T')[0],
        mfg_date: new Date(now.getFullYear(), now.getMonth(), 5)
          .toISOString()
          .split('T')[0],
        received_date: now.toISOString().split('T')[0],
        landed_cost_per_unit: '42.00',
        created_at: now,
        updated_at: now,
      },
    ]);
  });

  describe('GRN receipt with shortfall', () => {
    it('increases stock on GRN receipt', async () => {
      const beforeStock = await inventoryService.getAvailableQty(
        siteId,
        itemSugarId,
      );
      expect(parseFloat(beforeStock)).toBe(1500);
      const result = await inventoryService.receiveGRN(
        siteId,
        'test-po-001',
        itemSugarId,
        '100.000',
        '100.000',
      );
      expect(result.success).toBe(true);
      expect(parseFloat(result.receivedQty)).toBe(100);
      expect(parseFloat(result.shortfall)).toBe(0);
      const afterStock = await inventoryService.getAvailableQty(
        siteId,
        itemSugarId,
      );
      expect(parseFloat(afterStock)).toBe(1600);
    });

    it('no exception when shortfall within 2% tolerance', async () => {
      const result = await inventoryService.receiveGRN(
        siteId,
        'test-po-002',
        itemSugarId,
        '100.000',
        '99.000',
      );
      expect(result.success).toBe(true);
      expect(result.exceptionType).toBeUndefined();
      expect(parseFloat(result.shortfall)).toBe(1);
    });

    it('raises SUPPLIER_SHORTFALL when shortfall exceeds 2%', async () => {
      const result = await inventoryService.receiveGRN(
        siteId,
        'test-po-003',
        itemSugarId,
        '100.000',
        '95.000',
      );
      expect(result.success).toBe(true);
      expect(result.exceptionType).toBe('SUPPLIER_SHORTFALL');
    });

    it('is idempotent', async () => {
      await inventoryService.receiveGRN(
        siteId,
        'test-po-004',
        itemSugarId,
        '100.000',
        '100.000',
      );
      const result2 = await inventoryService.receiveGRN(
        siteId,
        'test-po-004',
        itemSugarId,
        '100.000',
        '100.000',
      );
      expect(result2.success).toBe(true);
      expect(parseFloat(result2.receivedQty)).toBe(100);
      const stock = await inventoryService.getAvailableQty(siteId, itemSugarId);
      expect(parseFloat(stock)).toBe(1600);
    });
  });

  describe('FEFO reservations', () => {
    it('reserves earliest-expiry batch first (FEFO)', async () => {
      const result = await inventoryService.reserveStock(
        siteId,
        itemRiceId,
        '300.000',
        orderId1,
        'idem-key-reserve-1',
      );
      expect(result.deficit).toBe('0.000');
      const reservations = await knex('stock_reservations')
        .where('order_id', orderId1)
        .select('batch_id', 'qty', 'status')
        .orderBy('batch_id');
      expect(reservations.length).toBe(1);
      expect(reservations[0].batch_id).toBe(batchRice1Id);
      expect(parseFloat(reservations[0].qty)).toBe(300);
      expect(reservations[0].status).toBe('ACTIVE');
    });

    it('splits reservation across batches when qty exceeds single batch', async () => {
      const result = await inventoryService.reserveStock(
        siteId,
        itemRiceId,
        '1200.000',
        orderId2,
        'idem-key-reserve-2',
      );
      expect(parseFloat(result.allocated)).toBe(1200);
      expect(parseFloat(result.deficit)).toBe(0);
      expect(result.reservationIds.length).toBe(2);
      const reservations = await knex('stock_reservations')
        .where('order_id', orderId2)
        .select('batch_id', 'qty')
        .orderBy('batch_id');
      const batch1Res = reservations.find(
        (r: any) => r.batch_id === batchRice1Id,
      );
      const batch2Res = reservations.find(
        (r: any) => r.batch_id === batchRice2Id,
      );
      expect(parseFloat(batch1Res.qty)).toBe(1000);
      expect(parseFloat(batch2Res.qty)).toBe(200);
    });

    it('returns deficit when not enough stock', async () => {
      const result = await inventoryService.reserveStock(
        siteId,
        itemRiceId,
        '2000.000',
        orderId3,
        'idem-key-reserve-3',
      );
      expect(parseFloat(result.allocated)).toBe(1500);
      expect(parseFloat(result.deficit)).toBe(500);
    });

    it('is idempotent on repeat reservation', async () => {
      const result1 = await inventoryService.reserveStock(
        siteId,
        itemRiceId,
        '300.000',
        orderId4,
        'idem-key-reserve-4',
      );
      const result2 = await inventoryService.reserveStock(
        siteId,
        itemRiceId,
        '300.000',
        orderId4,
        'idem-key-reserve-4',
      );
      expect(result2.allocated).toBe(result1.allocated);
      expect(result2.deficit).toBe(result1.deficit);
      const reservations = await knex('stock_reservations')
        .where('order_id', orderId4)
        .select('id');
      expect(reservations.length).toBe(1);
    });

    it('releases reservation and restores qty_committed', async () => {
      await inventoryService.reserveStock(
        siteId,
        itemRiceId,
        '300.000',
        orderId5,
        'idem-key-reserve-5',
      );
      const batchBefore = await knex('inventory_batches')
        .where('id', batchRice1Id)
        .first('qty_on_hand', 'qty_committed', 'qty_available');
      expect(parseFloat(batchBefore.qty_committed)).toBe(300);
      const reservation = await knex('stock_reservations')
        .where('order_id', orderId5)
        .first('id');
      await inventoryService.releaseReservation(
        String(reservation.id),
        'idem-key-release-5',
      );
      const batchAfter = await knex('inventory_batches')
        .where('id', batchRice1Id)
        .where('id', batchRice1Id)
        .first('qty_on_hand', 'qty_committed', 'qty_available');
      expect(parseFloat(batchAfter.qty_committed)).toBe(0);
      expect(parseFloat(batchAfter.qty_available)).toBe(1000);
    });

    it('returns ATP with canFulfil true when sufficient stock', async () => {
      const atp = await inventoryService.getATP(siteId, itemRiceId, '500.000');
      expect(atp.canFulfil).toBe(true);
      expect(parseFloat(atp.availableQty)).toBe(1500);
    });

    it('returns ATP with canFulfil false when insufficient stock', async () => {
      const atp = await inventoryService.getATP(siteId, itemRiceId, '2000.000');
      expect(atp.canFulfil).toBe(false);
    });
  });

  describe('Inter-site transfers', () => {
    it('transfers stock from Site B to Site A', async () => {
      const result = await inventoryService.transferStock(
        siteBId,
        siteId,
        itemSugarId,
        '500.000',
        'idem-key-transfer-1',
      );
      expect(result.success).toBe(true);
      expect(result.transferId).toBeDefined();
    });

    it('fails with shortfall when insufficient stock', async () => {
      const result = await inventoryService.transferStock(
        siteBId,
        siteId,
        itemSugarId,
        '2000.000',
        'idem-key-transfer-2',
      );
      expect(result.success).toBe(false);
      expect(parseFloat(result.shortfall!)).toBe(500);
    });

    it('is idempotent on repeat transfer', async () => {
      const result1 = await inventoryService.transferStock(
        siteBId,
        siteId,
        itemSugarId,
        '300.000',
        'idem-key-transfer-3',
      );
      const result2 = await inventoryService.transferStock(
        siteBId,
        siteId,
        itemSugarId,
        '300.000',
        'idem-key-transfer-3',
      );
      expect(result2.success).toBe(true);
      expect(result2.transferId).toBe(result1.transferId);
    });
  });

  describe('Stock adjustments', () => {
    it('auto-approves adjustment when variance within 5% threshold', async () => {
      const result = await inventoryService.createAdjustment(
        siteId,
        itemWheatId,
        'SHRINKAGE',
        '50.000',
        'Minor shrinkage detected',
        storekeeperId,
      );
      expect(result.success).toBe(true);
      expect(result.approvedBy).toBe(storekeeperId);
      const adjustment = await knex('stock_adjustments')
        .where({ adjustment_type: 'SHRINKAGE' })
        .first('status', 'variance_pct');
      expect(adjustment.status).toBe('APPROVED');
    });

    it('sets adjustment to PENDING when variance exceeds 5% threshold', async () => {
      const result = await inventoryService.createAdjustment(
        siteId,
        itemWheatId,
        'WRITEOFF',
        '200.000',
        'Major spoilage',
        storekeeperId,
      );
      expect(result.success).toBe(true);
      expect(result.approvedBy).toBe('');
      const adjustment = await knex('stock_adjustments')
        .where({ adjustment_type: 'WRITEOFF' })
        .first('status', 'variance_pct');
      expect(adjustment.status).toBe('PENDING');
      expect(parseFloat(adjustment.variance_pct)).toBe(10);
    });

    it('fails when adjustment qty exceeds available stock', async () => {
      const result = await inventoryService.createAdjustment(
        siteId,
        itemWheatId,
        'WRITEOFF',
        '3000.000',
        'Too much',
        storekeeperId,
      );
      expect(result.success).toBe(false);
    });
  });

  describe('Expiry drift detection', () => {
    it('returns empty when no batches expired', async () => {
      const drifted = await inventoryService.checkExpiryDrift(siteId);
      expect(drifted.length).toBe(0);
    });

    it('detects batches with past expiry', async () => {
      await knex('inventory_batches')
        .where('id', batchRice1Id)
        .update({ expiry_date: '2000-01-01' });
      const drifted = await inventoryService.checkExpiryDrift(siteId);
      expect(drifted.length).toBeGreaterThanOrEqual(1);
      const expired = drifted.find((d: any) => d.batchId === batchRice1Id);
      expect(expired).toBeDefined();
      expect(expired.daysDrifted).toBeGreaterThan(0);
    });

    it('does not detect batches with future expiry', async () => {
      await knex('inventory_batches')
        .where('id', batchRice1Id)
        .update({ expiry_date: '2099-12-31' });
      const drifted = await inventoryService.checkExpiryDrift(siteId);
      const expired = drifted.find((d: any) => d.batchId === batchRice1Id);
      expect(expired).toBeUndefined();
    });
  });

  describe('ATP cross-module availability', () => {
    it('returns ATP with canFulfil when sufficient stock', async () => {
      const atp = await inventoryService.getATP(siteId, itemWheatId, '500.000');
      expect(atp.canFulfil).toBe(true);
      expect(parseFloat(atp.availableQty)).toBe(2000);
    });

    it('shows zero available for item at another site', async () => {
      // Use a non-existent item ID
      const nonExistentItemId = '00000000-0000-0000-0000-000000000000';
      const atp = await inventoryService.getATP(
        siteId,
        nonExistentItemId,
        '100.000',
      );
      expect(atp.canFulfil).toBe(false);
      expect(parseFloat(atp.availableQty)).toBe(0);
    });
  });
});
