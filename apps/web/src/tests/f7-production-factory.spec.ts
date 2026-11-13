import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  scaleBomIngredients,
  calculateBomCostRollup,
  activateBomVersion,
  generateRmRequisitionsFromPlan,
  evaluateWoYieldStatus,
  maskWorkOrderForProdMgr,
} from '@neo/shared';
import { INITIAL_BOMS, INITIAL_WORK_ORDERS } from '../lib/production-data';

const OFFICE_APP_DIR = path.resolve(__dirname, '../../app/(office)');
const FLOOR_APP_DIR = path.resolve(__dirname, '../../app/(floor)/floor');

describe('Phase F7 — Production & Factory', () => {
  it('AC1 & AC2: evaluates yield variance outside ±3%, raises YIELD_VARIANCE, and never blocks completion', () => {
    const okYield = evaluateWoYieldStatus(200, 198, 2);
    expect(okYield.exceedsTolerance).toBe(false);
    expect(okYield.label).toBe('Good');
    expect(okYield.canComplete).toBe(true);
    expect(okYield.warningBanner).toBeNull();

    const lowYield = evaluateWoYieldStatus(200, 192, 0);
    expect(lowYield.yieldPct).toBe(96);
    expect(lowYield.exceedsTolerance).toBe(true);
    expect(lowYield.raisesYieldVarianceException).toBe(true);
    expect(lowYield.canComplete).toBe(true);
    expect(lowYield.warningBanner).toContain('outside ±3%, Owner will be informed');
  });

  it('AC3: activating a BOM version deactivates the previous active version for the same item', () => {
    const res = activateBomVersion(INITIAL_BOMS, 'bom-feed-v3');
    const v2 = res.updated.find((b) => b.id === 'bom-feed-v2');
    const v3 = res.updated.find((b) => b.id === 'bom-feed-v3');
    const calf = res.updated.find((b) => b.id === 'bom-calf-v1');

    expect(v3?.status).toBe('ACTIVE');
    expect(v2?.status).toBe('ARCHIVED');
    expect(calf?.status).toBe('ACTIVE');
    expect(res.deactivatedIds).toEqual(['bom-feed-v2']);
  });

  it('AC4: generates RM requisitions matching BOM x planned qty - stock', () => {
    const plannedWos = INITIAL_WORK_ORDERS.filter((w) => w.status === 'PLANNED').map((w) => ({
      id: w.id,
      woNumber: w.woNumber,
      finishedItemId: w.finishedItemId,
      bomId: w.bomId,
      plannedQty: w.plannedQty,
      status: w.status,
    }));

    // Total planned for feed = 1500 + 800 = 2300 kg (23x base 100kg BOM)
    // Maize required = 23 * 55 = 1265 kg. Stock = 620 kg -> shortfall = 645 kg
    const needs = generateRmRequisitionsFromPlan(plannedWos, INITIAL_BOMS, {
      'itm-maize': 620,
      'itm-soy': 1850,
      'itm-molasses': 500,
      'itm-mineral': 20,
    });

    const maizeNeed = needs.find((n) => n.itemId === 'itm-maize');
    expect(maizeNeed?.requiredQty).toBe(1265);
    expect(maizeNeed?.shortfallQty).toBe(645);
    expect(needs.some((n) => n.itemId === 'itm-soy')).toBe(false);
  });

  it('AC5: masks cost/price fields for PROD_MGR and scales BOMs cleanly', () => {
    const scaled = scaleBomIngredients(INITIAL_BOMS[0].ingredients, 100, 500);
    expect(scaled[0].scaledQty).toBe(Number((55 * 5 * 1.02).toFixed(2)));

    const rollup = calculateBomCostRollup(INITIAL_BOMS[0].ingredients, 100);
    expect(rollup.totalBatchCost).toBeGreaterThan(0);

    const masked = maskWorkOrderForProdMgr({
      woNumber: 'WO-2026-088',
      plannedQty: 1000,
      unitCost: 34,
      totalCost: 34000,
      price: 50,
    });
    expect(masked).not.toHaveProperty('unitCost');
    expect(masked).not.toHaveProperty('totalCost');
    expect(masked).not.toHaveProperty('price');
    expect(masked.woNumber).toBe('WO-2026-088');
  });

  it('verifies all Phase F7 office and floor pages + nav links exist', () => {
    const officePages = [
      'production/page.tsx',
      'production/boms/page.tsx',
      'production/work-orders/page.tsx',
      'production/requisitions/page.tsx',
      'production/wastage/page.tsx',
      'production/attendance/page.tsx',
    ];
    for (const rel of officePages) {
      expect(fs.existsSync(path.join(OFFICE_APP_DIR, rel)), `Missing office page: ${rel}`).toBe(true);
    }

    const floorPages = ['production/page.tsx', 'rm-request/page.tsx', 'attendance/page.tsx'];
    for (const rel of floorPages) {
      expect(fs.existsSync(path.join(FLOOR_APP_DIR, rel)), `Missing floor page: ${rel}`).toBe(true);
    }

    const layoutSrc = fs.readFileSync(path.join(OFFICE_APP_DIR, 'layout.tsx'), 'utf8');
    expect(layoutSrc).toContain('/production');
    expect(layoutSrc).toContain('/production/boms');
    expect(layoutSrc).toContain('/production/work-orders');
    expect(layoutSrc).toContain('/production/requisitions');
    expect(layoutSrc).toContain('/production/wastage');
    expect(layoutSrc).toContain('/production/attendance');
  });
});

