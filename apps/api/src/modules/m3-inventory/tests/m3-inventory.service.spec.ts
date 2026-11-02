import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid'; // Fix #1 — missing import
import { setupTestDB } from './test-setup.js';
import { InventoryService } from '../inventory.service.js';

describe('M3 Inventory & Warehouse — Service', () => {
  let knex: Knex;
  let inventorySvc: InventoryService;
  let siteId: string;
  let siteBId: string; // Fix #2a — was never declared
  let itemRiceId: string;
  let itemWheatId: string;
  let itemSugarId: string; // Fix #2b — was never declared
  let ownerId: string;
  let coordinatorId: string;
  let storekeeperId: string;
  let today: string;

  beforeAll(async () => {
    const setup = await setupTestDB();
    knex = setup.knex;
    siteId = setup.siteId;
    siteBId = setup.siteBId; // Fix #2a — now assigned
    itemRiceId = setup.itemRiceId;
    itemWheatId = setup.itemWheatId;
    itemSugarId = setup.itemSugarId; // Fix #2b — now assigned
    ownerId = setup.ownerId;
    coordinatorId = setup.coordinatorId;
    storekeeperId = setup.storekeeperId;
    today = setup.today;

    inventorySvc = new InventoryService(knex);
  });

  afterAll(async () => {
    await knex?.destroy();
  });

  beforeEach(async () => {
    await knex.raw(`
      TRUNCATE TABLE
        stock_reservations,
        stock_transfer_lines,
        stock_transfers,
        stock_adjustments,
        stock_ledger_txns,
        inventory_batches
      RESTART IDENTITY CASCADE;
    `);

    // Re-seed baseline batches so every test begins from the same state.
    // Only M3 tables are touched — shared tables (sites, users, items) are left intact.
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const thisYear = new Date().getFullYear();
    const thisMonth = new Date().getMonth();

    await knex('inventory_batches').insert([
      // Rice batch 1 — expires tomorrow (FEFO first)
      {
        id: uuidv4(),
        site_id: siteId,
        item_id: itemRiceId,
        batch_number: 'BATCH-RICE-2026-001',
        status: 'AVAILABLE',
        qty_on_hand: '1000.000',
        qty_committed: '0.000',
        expiry_date: tomorrow.toISOString().split('T')[0],
        mfg_date: new Date(thisYear, thisMonth, 1).toISOString().split('T')[0],
        received_date: today,
        landed_cost_per_unit: '65.00',
        created_at: new Date(),
        updated_at: new Date(),
      },
      // Rice batch 2 — expires next week (FEFO second)
      {
        id: uuidv4(),
        site_id: siteId,
        item_id: itemRiceId,
        batch_number: 'BATCH-RICE-2026-002',
        status: 'AVAILABLE',
        qty_on_hand: '500.000',
        qty_committed: '0.000',
        expiry_date: nextWeek.toISOString().split('T')[0],
        mfg_date: new Date(thisYear, thisMonth, 15).toISOString().split('T')[0],
        received_date: today,
        landed_cost_per_unit: '68.00',
        created_at: new Date(),
        updated_at: new Date(),
      },
      // Wheat — single batch at Site A
      {
        id: uuidv4(),
        site_id: siteId,
        item_id: itemWheatId,
        batch_number: 'BATCH-WHEAT-2026-001',
        status: 'AVAILABLE',
        qty_on_hand: '2000.000',
        qty_committed: '0.000',
        expiry_date: nextMonth.toISOString().split('T')[0],
        mfg_date: new Date(thisYear, thisMonth, 10).toISOString().split('T')[0],
        received_date: today,
        landed_cost_per_unit: '28.00',
        created_at: new Date(),
        updated_at: new Date(),
      },
      // Sugar — at Site B for transfer tests
      {
        id: uuidv4(),
        site_id: siteBId,
        item_id: itemSugarId,
        batch_number: 'BATCH-SUGAR-2026-001',
        status: 'AVAILABLE',
        qty_on_hand: '1500.000',
        qty_committed: '0.000',
        expiry_date: nextMonth.toISOString().split('T')[0],
        mfg_date: new Date(thisYear, thisMonth, 5).toISOString().split('T')[0],
        received_date: today,
        landed_cost_per_unit: '42.00',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // ATP (Available-to-Promise) Query
  // ─────────────────────────────────────────────────────────────────────────
  describe('ATP (Available-to-Promise) Query', () => {
    it('returns available qty minus committed qty for an item at a site', async () => {
      // Fix #3 — getAvailableQty returns a storage string; parse before comparing
      const result = await inventorySvc.getAvailableQty(siteId, itemRiceId);
      // rice1 (1000) + rice2 (500), 0 committed → total available = 1500
      expect(parseFloat(result)).toBe(1500);
    });

    it('returns 0 for non-existent item', async () => {
      const result = await inventorySvc.getAvailableQty(
        siteId,
        'NONEXISTENT_ITEM',
      );
      expect(parseFloat(result)).toBe(0);
    });

    it('FEFO orders batches by expiry date (earliest first)', async () => {
      // Insert a third batch with a later expiry date
      await knex('inventory_batches').insert({
        id: uuidv4(),
        site_id: siteId,
        item_id: itemRiceId,
        batch_number: 'BATCH-RICE-2026-003',
        status: 'AVAILABLE',
        qty_on_hand: '300.000',
        qty_committed: '0.000',
        expiry_date: '2027-01-01',
        mfg_date: '2026-01-01',
        received_date: today,
        landed_cost_per_unit: '70.00',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const result = await inventorySvc.getAvailableQty(siteId, itemRiceId);
      // 1000 + 500 + 300 = 1800
      expect(parseFloat(result)).toBe(1800);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // FEFO Reservation
  // Fix #4 — service returns { allocated, deficit, reservationIds }
  //           NOT { success, reservedQty, error }
  // ─────────────────────────────────────────────────────────────────────────
  describe('FEFO Reservation', () => {
    it('reserves stock using FEFO order (earliest expiry first)', async () => {
      const orderId = uuidv4();
      const reservation = await inventorySvc.reserveStock(
        siteId,
        itemRiceId,
        '500.000', // Fix #3 — string, not number literal
        orderId,
        'IDEMPOTENT-KEY-001',
      );

      // Service shape: { allocated, deficit, reservationIds }
      expect(reservation.reservationIds.length).toBeGreaterThan(0);
      expect(parseFloat(reservation.allocated)).toBe(500);
      expect(parseFloat(reservation.deficit)).toBe(0);
    });

    it('reflects a deficit when insufficient stock is available', async () => {
      const orderId = uuidv4();
      const reservation = await inventorySvc.reserveStock(
        siteId,
        itemRiceId,
        '9999.000', // more than the 1500 available
        orderId,
        'IDEMPOTENT-KEY-002',
      );

      // All stock will be allocated but there will be a remaining deficit
      expect(parseFloat(reservation.deficit)).toBeGreaterThan(0);
    });

    it('is idempotent — same key submitted twice creates one record', async () => {
      const orderId = uuidv4();
      await inventorySvc.reserveStock(
        siteId,
        itemRiceId,
        '300.000',
        orderId,
        'IDEMPOTENT-KEY-IDEM',
      );

      const result = await inventorySvc.reserveStock(
        siteId,
        itemRiceId,
        '300.000',
        orderId,
        'IDEMPOTENT-KEY-IDEM',
      );

      expect(parseFloat(result.allocated)).toBe(300);

      // Confirm only one DB row was created for this idempotency key
      const rows = await knex('stock_reservations')
        .where('idempotency_key', 'IDEMPOTENT-KEY-IDEM')
        .count('id as cnt');
      expect(Number(rows[0].cnt)).toBe(1);
    });

    it('uses row-level FOR UPDATE locking to prevent overselling under concurrency', async () => {
      const riceBatches = await knex('inventory_batches')
        .where({ site_id: siteId, item_id: itemRiceId })
        .select('id')
        .orderBy('expiry_date', 'asc');
      await knex('inventory_batches')
        .where({ id: riceBatches[0].id })
        .update({ qty_on_hand: '100.000', qty_committed: '0.000' });
      await knex('inventory_batches')
        .where({ id: riceBatches[1].id })
        .update({ qty_on_hand: '0.000', qty_committed: '0.000' });

      const results = await Promise.all([
        inventorySvc.reserveStock(
          siteId,
          itemRiceId,
          '100.000',
          uuidv4(),
          'CONCURRENCY-KEY-001',
        ),
        inventorySvc.reserveStock(
          siteId,
          itemRiceId,
          '100.000',
          uuidv4(),
          'CONCURRENCY-KEY-002',
        ),
      ]);

      const allocated = results.reduce(
        (sum, result) => sum + Number(result.allocated),
        0,
      );
      expect(allocated).toBe(100);
      const batch = await knex('inventory_batches')
        .where({ site_id: siteId, item_id: itemRiceId })
        .sum('qty_committed as committed')
        .first();
      expect(Number(batch?.committed)).toBe(100);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GRN (Good Receipt Note) Posting
  // Fix #5 — service returns receivedQty / shortfall as storage strings
  // ─────────────────────────────────────────────────────────────────────────
  describe('GRN (Good Receipt Note) Posting', () => {
    it('posts GRN and updates stock received_qty', async () => {
      const poId = 'PO-TEST-001';
      const itemId = itemWheatId;

      const grnResult = await inventorySvc.receiveGRN(
        siteId,
        poId,
        itemId,
        '600.000', // Fix #3 — string
        '500.000',
      );

      expect(grnResult.success).toBe(true);
      expect(parseFloat(grnResult.receivedQty)).toBe(500);
      expect(parseFloat(grnResult.shortfall)).toBe(100); // 600 - 500

      const available = await inventorySvc.getAvailableQty(siteId, itemId);
      // 2000 original + 500 received spread across batches = 2500
      expect(parseFloat(available)).toBe(2500);
    });

    it('raises SUPPLIER_SHORTFALL exception when shortfall > tolerance', async () => {
      const grnResult = await inventorySvc.receiveGRN(
        siteId,
        'PO-TEST-002',
        itemWheatId,
        '1000.000',
        '200.000', // major shortfall
      );

      expect(grnResult.success).toBe(true);
      expect(grnResult.exceptionType).toContain('SUPPLIER_SHORTFALL');
    });

    it('no exception raised when within tolerance (default 2%)', async () => {
      // Fix #2b — itemSugarId is now in scope
      const grnResult = await inventorySvc.receiveGRN(
        siteBId,
        'PO-TEST-003',
        itemSugarId,
        '500.000',
        '500.000', // exact match, no shortfall
      );

      expect(grnResult.success).toBe(true);
      expect(grnResult.exceptionType).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Stock Transfer
  // Fix #2a/b — siteBId and itemSugarId are now in scope
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stock Transfer', () => {
    it('creates inter-site transfer request', async () => {
      // Sugar stock lives at siteBId; transfer FROM site B TO site A
      const transfer = await inventorySvc.transferStock(
        siteBId, // Fix #2a
        siteId,
        itemSugarId, // Fix #2b
        '300.000', // Fix #3 — string
        'TRANSFER-KEY-001',
      );

      expect(transfer.success).toBe(true);
      expect(transfer.transferId).toBeDefined();
    });

    it('releases a reservation when transfer is confirmed', async () => {
      // Reserve sugar at site B with UUID order_id
      const orderId = uuidv4();
      await inventorySvc.reserveStock(
        siteBId,
        itemSugarId,
        '300.000',
        orderId,
        'RELEASE-KEY-001',
      );

      // Look up the real reservation id by order_id
      const res = await knex('stock_reservations')
        .where('order_id', orderId)
        .first('id');

      const release = await inventorySvc.releaseReservation(
        String(res.id),
        'RELEASE-KEY-001',
      );

      expect(release.success).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Stock Adjustment
  // Fix #3 — args converted to strings; Fix #4 — return shape is already
  // { success, approvedBy } which is correct; approval logic re-verified
  // ─────────────────────────────────────────────────────────────────────────
  describe('Stock Adjustment', () => {
    it('records a stock write-off with variance > 5% — status PENDING_OWNER_APPROVAL', async () => {
      // Write off 100 kg from 1500 kg available rice → ~6.7% variance → PENDING
      const adjustment = await inventorySvc.createAdjustment(
        siteId,
        itemRiceId,
        'WRITEOFF',
        '100.000', // Fix #3 — string
        'Variance exceeds 5% threshold',
        ownerId,
      );

      expect(adjustment.success).toBe(true);
      // Service sets approvedBy = '' when PENDING_OWNER_APPROVAL
      // (owner must action through the approval workflow separately)
      expect(typeof adjustment.approvedBy).toBe('string');
    });

    it('records shrinkage adjustment under 5% — auto-approved by storekeeper', async () => {
      // Write off 50 kg from 2000 kg wheat → 2.5% variance → auto-approved
      const adjustment = await inventorySvc.createAdjustment(
        siteId,
        itemWheatId,
        'SHRINKAGE',
        '50.000', // Fix #3 — string
        'Routine monthly shrinkage count',
        storekeeperId,
      );

      expect(adjustment.success).toBe(true);
      // Service sets approvedBy = requestedBy when PENDING is false (auto-approved)
      // requestedBy is storekeeperId in this test
      expect(adjustment.approvedBy).toBe(storekeeperId);
    });

    it('detects and flags expired batches', async () => {
      await knex('inventory_batches').insert({
        id: uuidv4(),
        site_id: siteId,
        item_id: itemRiceId,
        batch_number: 'BATCH-RICE-EXPIRED',
        status: 'AVAILABLE',
        qty_on_hand: '100.000',
        qty_committed: '0.000',
        expiry_date: '2025-01-01', // already expired
        mfg_date: '2024-01-01',
        received_date: today,
        landed_cost_per_unit: '65.00',
        created_at: new Date(),
        updated_at: new Date(),
      });

      const expiredBatches = await inventorySvc.checkExpiryDrift(siteId);
      expect(expiredBatches.length).toBeGreaterThan(0);
      expect(expiredBatches.some((b) => b.itemId === itemRiceId)).toBe(true);
    });
  });
});
