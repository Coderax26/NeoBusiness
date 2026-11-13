import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeAtp,
  classifyExpiryBucket,
  canQueueFloorCommandOffline,
  replayFloorOutbox,
  maskGrnForBlindView,
  type FloorOutboxItem,
} from '@neo/shared';
import {
  INITIAL_STOCK_ROWS,
  INITIAL_ATP_PROJECTIONS,
  INITIAL_LEDGER_ENTRIES,
  INITIAL_FLOOR_EXPECTED_POS,
} from '../lib/inventory-data';

const OFFICE_APP_DIR = path.resolve(__dirname, '../../app/(office)');
const FLOOR_APP_DIR = path.resolve(__dirname, '../../app/(floor)/floor');

describe('Phase F6 — Inventory, Warehouse & Floor Mode', () => {
  it('AC1: ATP equals on hand minus reserved across stock overview & ATP checker', () => {
    for (const row of INITIAL_STOCK_ROWS) {
      expect(computeAtp(row.onHand, row.reserved)).toBe(
        Math.max(0, row.onHand - row.reserved),
      );
    }
    const soyProj = INITIAL_ATP_PROJECTIONS[0];
    expect(computeAtp(soyProj.onHand, soyProj.reserved)).toBe(1400);
  });

  it('AC2: Blind GRN payload and floor DOM contain zero orderedQty or unitPrice', () => {
    const po = INITIAL_FLOOR_EXPECTED_POS[0];
    const masked = maskGrnForBlindView(
      po.lines.map((l) => ({
        lineId: l.lineId,
        itemId: l.itemId,
        itemSku: l.itemSku,
        itemName: l.itemName,
        uom: l.uom,
        orderedQty: l.orderedQty,
        unitPrice: l.unitPrice,
        receivedQty: 0,
      })),
    );

    for (const line of masked) {
      expect(line).not.toHaveProperty('orderedQty');
      expect(line).not.toHaveProperty('unitPrice');
      expect(line).not.toHaveProperty('rate');
    }

    const floorGrnSrc = fs.readFileSync(path.join(FLOOR_APP_DIR, 'grn/page.tsx'), 'utf8');
    expect(floorGrnSrc).toContain('maskGrnForBlindView');
    expect(floorGrnSrc).not.toContain('line.orderedQty');
    expect(floorGrnSrc).not.toContain('line.unitPrice');
  });

  it('AC3: Offline Floor Outbox queues allowed commands, blocks approvals offline, and replays exactly once', async () => {
    expect(canQueueFloorCommandOffline('GRN_CAPTURE').allowed).toBe(true);
    expect(canQueueFloorCommandOffline('TRANSFER_RECEIVE').allowed).toBe(true);
    expect(canQueueFloorCommandOffline('ADJUSTMENT_REQUEST').allowed).toBe(true);
    expect(canQueueFloorCommandOffline('APPROVAL_ACTION').allowed).toBe(false);
    expect(canQueueFloorCommandOffline('PRICING_CHANGE').allowed).toBe(false);

    const queue: FloorOutboxItem[] = [
      {
        id: '1',
        idempotencyKey: 'idem-grn-1',
        type: 'GRN_CAPTURE',
        endpoint: '/api/bff/procurement/grns',
        payload: { poId: 'po-104' },
        captured_at: '2026-11-13T10:00:00Z',
        status: 'QUEUED',
      },
      {
        id: '2',
        idempotencyKey: 'idem-grn-1', // duplicate key should be skipped!
        type: 'GRN_CAPTURE',
        endpoint: '/api/bff/procurement/grns',
        payload: { poId: 'po-104' },
        captured_at: '2026-11-13T10:00:01Z',
        status: 'QUEUED',
      },
      {
        id: '3',
        idempotencyKey: 'idem-trf-1',
        type: 'TRANSFER_RECEIVE',
        endpoint: '/api/bff/inventory/transfers/trf-1/receive',
        payload: { qty: 500 },
        captured_at: '2026-11-13T10:01:00Z',
        status: 'QUEUED',
      },
      {
        id: '4',
        idempotencyKey: 'idem-adj-1',
        type: 'ADJUSTMENT_REQUEST',
        endpoint: '/api/bff/inventory/adjustments',
        payload: { qtyDelta: -5 },
        captured_at: '2026-11-13T10:02:00Z',
        status: 'QUEUED',
      },
    ];

    const sentKeys: string[] = [];
    const res = await replayFloorOutbox(queue, async (item) => {
      sentKeys.push(item.idempotencyKey);
      return { ok: true };
    });

    expect(res.syncedCount).toBe(3);
    expect(res.failedCount).toBe(0);
    expect(sentKeys).toEqual(['idem-grn-1', 'idem-trf-1', 'idem-adj-1']);
  });

  it('AC4: Ledger shows reversals linked with no edit or delete controls', () => {
    const reversal = INITIAL_LEDGER_ENTRIES.find((e) => e.type === 'REVERSAL');
    const original = INITIAL_LEDGER_ENTRIES.find((e) => e.reversedById === reversal?.id);
    expect(reversal).toBeDefined();
    expect(original).toBeDefined();

    const ledgerSrc = fs.readFileSync(path.join(OFFICE_APP_DIR, 'inventory/ledger/page.tsx'), 'utf8');
    expect(ledgerSrc).toContain('Reversed by');
    expect(ledgerSrc).not.toContain('Delete');
    expect(ledgerSrc).not.toContain('Edit');
  });

  it('AC5: Expiry threshold filtering and bucket classification work accurately', () => {
    expect(classifyExpiryBucket(-2).bucket).toBe('EXPIRED');
    expect(classifyExpiryBucket(2).bucket).toBe('LE_3_DAYS');
    expect(classifyExpiryBucket(6).bucket).toBe('LE_7_DAYS');
    expect(classifyExpiryBucket(20).bucket).toBe('LE_30_DAYS');
    expect(classifyExpiryBucket(45).bucket).toBe('HEALTHY');

    const le7 = INITIAL_STOCK_ROWS.filter((r) => r.daysToExpiry <= 7);
    const le30 = INITIAL_STOCK_ROWS.filter((r) => r.daysToExpiry <= 30);
    expect(le7.length).toBe(3);
    expect(le30.length).toBe(3);
  });

  it('verifies all Phase F6 office and floor pages + nav links exist', () => {
    const officePages = [
      'inventory/stock/page.tsx',
      'inventory/availability/page.tsx',
      'inventory/expiry/page.tsx',
      'inventory/transfers/page.tsx',
      'inventory/adjustments/page.tsx',
      'inventory/ledger/page.tsx',
      'inventory/reservations/page.tsx',
      'inventory/stock-counts/page.tsx',
      'control/stock-alerts/page.tsx',
    ];
    for (const rel of officePages) {
      expect(fs.existsSync(path.join(OFFICE_APP_DIR, rel)), `Missing office page: ${rel}`).toBe(true);
    }

    const floorPages = [
      'grn/page.tsx',
      'loading/page.tsx',
      'transfers/page.tsx',
      'stock/page.tsx',
      'adjustments/page.tsx',
    ];
    for (const rel of floorPages) {
      expect(fs.existsSync(path.join(FLOOR_APP_DIR, rel)), `Missing floor page: ${rel}`).toBe(true);
    }

    const layoutSrc = fs.readFileSync(path.join(OFFICE_APP_DIR, 'layout.tsx'), 'utf8');
    expect(layoutSrc).toContain('/inventory/stock');
    expect(layoutSrc).toContain('/inventory/availability');
    expect(layoutSrc).toContain('/inventory/expiry');
    expect(layoutSrc).toContain('/inventory/adjustments');
    expect(layoutSrc).toContain('/inventory/ledger');
    expect(layoutSrc).toContain('/inventory/reservations');
    expect(layoutSrc).toContain('/control/stock-alerts');
  });
});

