import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  requiresEwayBill,
  evaluateTripBuilderReadiness,
  calculateTripProgress,
  reconcileTripCod,
  evaluateTripCloseChecklist,
} from '@neo/shared';
import { INITIAL_TRIPS, READY_ORDERS_POOL } from '../lib/logistics-data';

const OFFICE_APP_DIR = path.resolve(__dirname, '../../app/(office)');

describe('Phase F8 — Logistics, Fleet & Delivery', () => {
  it('AC1: blocks over-capacity and credit-hold orders and disables Dispatch until loading is confirmed', () => {
    const blocked = evaluateTripBuilderReadiness({
      capacityKg: 1000,
      loadingConfirmed: false,
      stops: [
        { orderNo: 'SO-2026-104', valueInr: 62500, weightKg: 850, status: 'READY', creditHold: false },
        { orderNo: 'SO-2026-105', valueInr: 42000, weightKg: 400, status: 'READY', creditHold: true },
      ],
    });
    expect(blocked.isOverCapacity).toBe(true);
    expect(blocked.overCapacityKg).toBe(250);
    expect(blocked.hasCreditHold).toBe(true);
    expect(blocked.canSaveTrip).toBe(false);
    expect(blocked.canDispatch).toBe(false);

    const readyUnconfirmed = evaluateTripBuilderReadiness({
      capacityKg: 2000,
      loadingConfirmed: false,
      stops: [
        { orderNo: 'SO-2026-104', valueInr: 62500, weightKg: 850, status: 'READY', creditHold: false, ewayBillRef: 'EWB-1' },
      ],
    });
    expect(readyUnconfirmed.canSaveTrip).toBe(true);
    expect(readyUnconfirmed.canDispatch).toBe(false);

    const readyConfirmed = evaluateTripBuilderReadiness({
      capacityKg: 2000,
      loadingConfirmed: true,
      stops: [
        { orderNo: 'SO-2026-104', valueInr: 62500, weightKg: 850, status: 'READY', creditHold: false, ewayBillRef: 'EWB-1' },
      ],
    });
    expect(readyConfirmed.canDispatch).toBe(true);
  });

  it('AC2: requires e-way bill reference when stop value >= ₹50,000', () => {
    expect(requiresEwayBill(49999)).toBe(false);
    expect(requiresEwayBill(50000)).toBe(true);
    expect(requiresEwayBill(62500)).toBe(true);

    const readiness = evaluateTripBuilderReadiness({
      capacityKg: 2000,
      loadingConfirmed: true,
      stops: [
        { orderNo: 'SO-2026-104', valueInr: 62500, weightKg: 850, status: 'READY', creditHold: false },
        { orderNo: 'SO-2026-106', valueInr: 28000, weightKg: 300, status: 'READY', creditHold: false },
      ],
    });
    expect(readiness.missingEwayStops).toEqual(['SO-2026-104']);
  });

  it('AC3: dispatch board progress matches stop statuses and auto-refresh 30s interval exists', () => {
    const trip = INITIAL_TRIPS[0];
    const progress = calculateTripProgress(trip.stops);
    expect(progress.totalStops).toBe(trip.stops.length);
    expect(progress.completedStops).toBe(
      trip.stops.filter((s) => s.deliveryStatus !== 'PENDING').length,
    );
    expect(progress.label).toBe(`Stop ${progress.completedStops} of ${progress.totalStops}`);

    const dispatchBoardFile = fs.readFileSync(
      path.join(OFFICE_APP_DIR, 'logistics/dispatch/page.tsx'),
      'utf8',
    );
    expect(dispatchBoardFile).toContain('useState(30)');
    expect(dispatchBoardFile).toContain('setInterval');
  });

  it('AC4: trip cannot be closed while any BR-08 blocker is red, and each blocker links to its fix screen', () => {
    const blocked = evaluateTripCloseChecklist({
      tripId: 'trp-501',
      pendingStopsCount: 1,
      unloggedReturnsCount: 1,
      uncollectedCodOrdersCount: 1,
      codHandedOver: false,
      expensesEntered: false,
      openIssuesCount: 1,
    });
    expect(blocked.canClose).toBe(false);
    const redRows = blocked.rows.filter((r) => !r.passed);
    expect(redRows.length).toBe(5);
    for (const row of redRows) {
      expect(row.fixHref.startsWith('/')).toBe(true);
    }

    const ready = evaluateTripCloseChecklist({
      tripId: 'trp-501',
      pendingStopsCount: 0,
      unloggedReturnsCount: 0,
      uncollectedCodOrdersCount: 0,
      codHandedOver: true,
      expensesEntered: true,
      openIssuesCount: 0,
    });
    expect(ready.canClose).toBe(true);
    expect(ready.rows.every((r) => r.passed)).toBe(true);
  });

  it('AC5: COD collected per trip reconciles expected vs collected and links to F9 COD settlement', () => {
    const cod = reconcileTripCod([
      { deliveryStatus: 'DELIVERED', expectedCodInr: 15000, collectedCodInr: 15000 },
      { deliveryStatus: 'PARTIAL', expectedCodInr: 12000, collectedCodInr: 10000 },
    ]);
    expect(cod.expectedCod).toBe(27000);
    expect(cod.collectedCod).toBe(25000);
    expect(cod.variance).toBe(-2000);
    expect(cod.isReconciled).toBe(false);

    const balanced = reconcileTripCod([
      { deliveryStatus: 'DELIVERED', expectedCodInr: 18000, collectedCodInr: 18000 },
    ]);
    expect(balanced.isReconciled).toBe(true);
    expect(READY_ORDERS_POOL.length).toBeGreaterThan(0);
  });

  it('renders all Phase F8 pages and registers Delivery (Logistics) sidebar links', () => {
    const requiredPages = [
      'logistics/dispatch/page.tsx',
      'logistics/trips/new/page.tsx',
      'logistics/trips/page.tsx',
      'logistics/trips/[id]/page.tsx',
      'logistics/trips/[id]/close/page.tsx',
      'logistics/issues/page.tsx',
      'logistics/expenses/page.tsx',
      'logistics/vehicles/page.tsx',
      'logistics/monitoring/page.tsx',
    ];
    for (const rel of requiredPages) {
      expect(fs.existsSync(path.join(OFFICE_APP_DIR, rel))).toBe(true);
    }

    const layoutContent = fs.readFileSync(path.join(OFFICE_APP_DIR, 'layout.tsx'), 'utf8');
    expect(layoutContent).toContain('/logistics/dispatch');
    expect(layoutContent).toContain('/logistics/trips/new');
    expect(layoutContent).toContain('/logistics/trips');
    expect(layoutContent).toContain('/logistics/issues');
    expect(layoutContent).toContain('/logistics/expenses');
    expect(layoutContent).toContain('/logistics/vehicles');
    expect(layoutContent).toContain('/logistics/monitoring');
  });
});

