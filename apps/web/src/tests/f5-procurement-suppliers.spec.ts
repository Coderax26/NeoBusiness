import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateSupplierPriceSpike,
  formatPriceSpikePlainWarning,
  rankBackupSuppliers,
  maskGrnForBlindView,
  groupRequisitionsBySupplier,
  evaluateThreeWayMatch,
} from '@neo/shared';
import {
  INITIAL_REQUISITIONS,
  INITIAL_PURCHASE_ORDERS,
  INITIAL_GRNS,
  INITIAL_SHORTFALLS,
  INITIAL_SUPPLIER_BILLS,
  INITIAL_SUPPLIER_SCORECARDS,
  INITIAL_MISSING_RATES,
  INITIAL_PRICE_TRENDS,
} from '../lib/procurement-data';

const WEB_APP_DIR = path.resolve(__dirname, '../../app/(office)');

describe('Phase F5 — Procurement & Suppliers', () => {
  it('AC1: groups selected open requisitions by supplier into one PO per supplier', () => {
    const openReqs = INITIAL_REQUISITIONS.filter((r) => r.status === 'OPEN');
    const grouped = groupRequisitionsBySupplier(
      openReqs.map((r) => ({
        id: r.id,
        requisitionNo: r.requisitionNo,
        supplierId: r.preferredSupplierId,
        supplierName: r.preferredSupplierName,
        itemId: r.itemId,
        itemSku: r.itemSku,
        itemName: r.itemName,
        qty: r.qty,
        uom: r.uom,
        latestRate: r.latestRate,
        neededBy: r.neededBy,
      })),
    );

    const uniqueSuppliers = new Set(openReqs.map((r) => r.preferredSupplierId));
    expect(grouped.length).toBe(uniqueSuppliers.size);
    const saiGroup = grouped.find((g) => g.supplierId === 'sup-1');
    expect(saiGroup?.requisitionIds.length).toBe(2);
    expect(saiGroup?.estimatedTotal).toBe(500 * 48 + 1200 * 26);
  });

  it('AC2: detects supplier price spike >5% and generates plain-language warning', () => {
    const spike = evaluateSupplierPriceSpike(54, 48, 48, 5);
    expect(spike.baselineSource).toBe('SAME_SUPPLIER');
    expect(spike.variancePct).toBe(12.5);
    expect(spike.exceedsTolerance).toBe(true);
    expect(spike.requiresOwnerApproval).toBe(true);

    const msg = formatPriceSpikePlainWarning(54, 48, 'kg');
    expect(msg).toBe('₹54/kg is 12.5% higher than last time (₹48/kg)');

    const normal = evaluateSupplierPriceSpike(49, 48, 48, 5);
    expect(normal.requiresOwnerApproval).toBe(false);
  });

  it('AC3: masks orderedQty and unitPrice from Blind GRN Storekeeper payload', () => {
    const grn = INITIAL_GRNS[0];
    const masked = maskGrnForBlindView(
      grn.lines.map((l) => ({
        lineId: l.lineId,
        itemId: l.itemId,
        itemSku: l.itemSku,
        itemName: l.itemName,
        uom: l.uom,
        orderedQty: l.orderedQty,
        unitPrice: l.unitPrice,
        receivedQty: l.receivedQty,
      })),
    );

    expect(masked).toHaveLength(grn.lines.length);
    for (const line of masked) {
      expect(line).not.toHaveProperty('orderedQty');
      expect(line).not.toHaveProperty('unitPrice');
      expect(line).not.toHaveProperty('rate');
      expect(line).not.toHaveProperty('lineTotal');
      expect(line.receivedQty).toBe(800);
    }
  });

  it('AC4: ranks backup suppliers and marks candidates within 2% tolerance (OD-010)', () => {
    const sf = INITIAL_SHORTFALLS[0];
    const ranked = rankBackupSuppliers(sf.primaryRate, sf.backups);
    expect(ranked[0].supplierId).toBe('sup-2');
    expect(ranked[0].withinTolerance).toBe(true);
    expect(ranked[0].deltaPct).toBeLessThanOrEqual(2);
    expect(ranked[1].withinTolerance).toBe(false);
  });

  it('AC5: evaluates 3-way match statuses matching backend three_way_status', () => {
    const match = evaluateThreeWayMatch([
      { itemId: '1', itemName: 'Soy', poQty: 600, grnQty: 600, billQty: 600, poRate: 48, billRate: 48 },
    ]);
    expect(match.three_way_status).toBe('MATCHES');
    expect(match.lines[0].icon).toBe('✓');

    const timing = evaluateThreeWayMatch([
      { itemId: '1', itemName: 'Maize', poQty: 1000, grnQty: 800, billQty: 800, poRate: 26, billRate: 26 },
    ]);
    expect(timing.three_way_status).toBe('TIMING_DIFFERS');

    const amount = evaluateThreeWayMatch([
      { itemId: '1', itemName: 'Molasses', poQty: 1200, grnQty: 1200, billQty: 1200, poRate: 18, billRate: 19.5 },
    ]);
    expect(amount.three_way_status).toBe('AMOUNT_DIFFERS');
    expect(amount.lines[0].icon).toBe('✗');

    const mismatch = evaluateThreeWayMatch([
      { itemId: '1', itemName: 'Maize', poQty: 1000, grnQty: 800, billQty: 900, poRate: 26, billRate: 26 },
    ]);
    expect(mismatch.three_way_status).toBe('DOES_NOT_MATCH');
    expect(mismatch.lines[0].icon).toBe('✗');
  });

  it('verifies all Phase F5 pages, sidebar links, and seed datasets exist', () => {
    const requiredPages = [
      'procurement/page.tsx',
      'procurement/requisitions/page.tsx',
      'procurement/purchase-orders/page.tsx',
      'procurement/purchase-orders/[id]/page.tsx',
      'procurement/grns/page.tsx',
      'procurement/shortfalls/page.tsx',
      'procurement/supplier-bills/page.tsx',
      'procurement/bills/page.tsx',
      'procurement/scorecards/page.tsx',
    ];

    for (const rel of requiredPages) {
      const fullPath = path.join(WEB_APP_DIR, rel);
      expect(fs.existsSync(fullPath), `Missing page: ${rel}`).toBe(true);
    }

    const layoutSrc = fs.readFileSync(path.join(WEB_APP_DIR, 'layout.tsx'), 'utf8');
    expect(layoutSrc).toContain('/procurement');
    expect(layoutSrc).toContain('/procurement/requisitions');
    expect(layoutSrc).toContain('/procurement/purchase-orders');
    expect(layoutSrc).toContain('/procurement/grns');
    expect(layoutSrc).toContain('/procurement/shortfalls');
    expect(layoutSrc).toContain('/procurement/supplier-bills');
    expect(layoutSrc).toContain('/procurement/scorecards');

    const poDetailSrc = fs.readFileSync(
      path.join(WEB_APP_DIR, 'procurement/purchase-orders/[id]/page.tsx'),
      'utf8',
    );
    expect(poDetailSrc).toContain('disabled={po.priceSpikeException');
    expect(poDetailSrc).toContain('Waiting for Owner');

    expect(INITIAL_PURCHASE_ORDERS.some((p) => p.priceSpikeException)).toBe(true);
    expect(INITIAL_SUPPLIER_BILLS.length).toBeGreaterThanOrEqual(3);
    expect(INITIAL_SUPPLIER_SCORECARDS.length).toBeGreaterThanOrEqual(4);
    expect(INITIAL_MISSING_RATES.length).toBeGreaterThanOrEqual(2);
    expect(INITIAL_PRICE_TRENDS.length).toBeGreaterThanOrEqual(2);
  });
});

