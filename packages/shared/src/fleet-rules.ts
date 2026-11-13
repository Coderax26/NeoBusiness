/**
 * @neo/shared — Fleet, Trip Planning, E-Way Bill & BR-08 Trip Closure Rules (Phase F8)
 * Implements:
 * - Acceptance Criterion #1: Over-capacity, credit-hold, and loading-confirmed dispatch gates
 * - Acceptance Criterion #2: E-Way bill requirement when stop value >= ₹50,000 (OD-005)
 * - Acceptance Criterion #3: Stop progress calculation
 * - Acceptance Criterion #4: BR-08 Close-trip checklist blockers with fix links
 * - Acceptance Criterion #5: Trip COD reconciliation
 */

import { evaluateTripClosureReadiness } from './business-rules.js';

export interface TripStopReadinessInput {
  orderNo: string;
  valueInr: number;
  weightKg: number;
  status: string;
  creditHold?: boolean;
  ewayBillRef?: string;
}

export interface TripBuilderReadinessResult {
  totalWeightKg: number;
  capacityKg: number;
  overCapacityKg: number;
  isOverCapacity: boolean;
  hasCreditHold: boolean;
  hasUnreadyOrder: boolean;
  missingEwayStops: string[];
  canSaveTrip: boolean;
  canDispatch: boolean;
  blockers: string[];
}

export function requiresEwayBill(stopValueInr: number): boolean {
  return stopValueInr >= 50000;
}

export function evaluateTripBuilderReadiness(input: {
  capacityKg: number;
  stops: TripStopReadinessInput[];
  loadingConfirmed: boolean;
}): TripBuilderReadinessResult {
  const totalWeightKg = Number(
    input.stops.reduce((sum, s) => sum + s.weightKg, 0).toFixed(1),
  );
  const overCapacityKg = Math.max(
    0,
    Number((totalWeightKg - input.capacityKg).toFixed(1)),
  );
  const isOverCapacity = totalWeightKg > input.capacityKg;
  const hasCreditHold = input.stops.some((s) => !!s.creditHold);
  const hasUnreadyOrder = input.stops.some((s) => s.status !== 'READY');
  const missingEwayStops = input.stops
    .filter((s) => requiresEwayBill(s.valueInr) && !s.ewayBillRef?.trim())
    .map((s) => s.orderNo);

  const blockers: string[] = [];
  if (input.stops.length === 0) {
    blockers.push('Add at least one READY order to the trip.');
  }
  if (isOverCapacity) {
    blockers.push(`This trip is ${overCapacityKg} kg over the truck's limit.`);
  }
  if (hasCreditHold) {
    blockers.push('One or more orders are on credit hold.');
  }
  if (hasUnreadyOrder) {
    blockers.push('All stops must be in READY status.');
  }
  if (!input.loadingConfirmed) {
    blockers.push('Floor loading confirmation required before dispatch.');
  }

  return {
    totalWeightKg,
    capacityKg: input.capacityKg,
    overCapacityKg,
    isOverCapacity,
    hasCreditHold,
    hasUnreadyOrder,
    missingEwayStops,
    canSaveTrip: input.stops.length > 0 && !isOverCapacity && !hasCreditHold && !hasUnreadyOrder,
    canDispatch:
      input.stops.length > 0 &&
      !isOverCapacity &&
      !hasCreditHold &&
      !hasUnreadyOrder &&
      input.loadingConfirmed,
    blockers,
  };
}

export interface TripStopProgressInput {
  deliveryStatus: 'PENDING' | 'DELIVERED' | 'PARTIAL' | 'FAILED';
  expectedCodInr: number;
  collectedCodInr: number;
}

export function calculateTripProgress(stops: TripStopProgressInput[]): {
  completedStops: number;
  totalStops: number;
  pct: number;
  label: string;
} {
  const totalStops = stops.length;
  const completedStops = stops.filter((s) => s.deliveryStatus !== 'PENDING').length;
  const pct = totalStops > 0 ? Math.round((completedStops / totalStops) * 100) : 0;
  return {
    completedStops,
    totalStops,
    pct,
    label: `Stop ${completedStops} of ${totalStops}`,
  };
}

export function reconcileTripCod(stops: TripStopProgressInput[]): {
  expectedCod: number;
  collectedCod: number;
  variance: number;
  isReconciled: boolean;
} {
  const expectedCod = Number(
    stops.reduce((s, st) => s + st.expectedCodInr, 0).toFixed(2),
  );
  const collectedCod = Number(
    stops.reduce((s, st) => s + st.collectedCodInr, 0).toFixed(2),
  );
  const variance = Number((collectedCod - expectedCod).toFixed(2));
  return {
    expectedCod,
    collectedCod,
    variance,
    isReconciled: variance === 0,
  };
}

export interface TripCloseChecklistRow {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
  fixHref: string;
}

export function evaluateTripCloseChecklist(input: {
  tripId: string;
  pendingStopsCount: number;
  unloggedReturnsCount: number;
  uncollectedCodOrdersCount: number;
  codHandedOver: boolean;
  expensesEntered: boolean;
  openIssuesCount: number;
}): { canClose: boolean; rows: TripCloseChecklistRow[] } {
  const br08 = evaluateTripClosureReadiness({
    pendingStopsCount: input.pendingStopsCount,
    unloggedReturnsCount: input.unloggedReturnsCount,
    uncollectedCodOrdersCount: input.uncollectedCodOrdersCount,
  });

  const rows: TripCloseChecklistRow[] = [
    {
      key: 'stops',
      label: 'All stops resolved',
      passed: input.pendingStopsCount === 0,
      detail:
        input.pendingStopsCount === 0
          ? 'Every stop marked Delivered, Partial, or Failed'
          : `${input.pendingStopsCount} stop(s) still pending`,
      fixHref: `/logistics/trips/${input.tripId}`,
    },
    {
      key: 'returns',
      label: 'Returns logged at warehouse',
      passed: input.unloggedReturnsCount === 0,
      detail:
        input.unloggedReturnsCount === 0
          ? 'All rejected/returned items logged'
          : `${input.unloggedReturnsCount} return(s) not yet logged`,
      fixHref: '/sales/returns',
    },
    {
      key: 'cod',
      label: 'COD cash handed over & settled',
      passed: input.uncollectedCodOrdersCount === 0 && input.codHandedOver,
      detail:
        input.uncollectedCodOrdersCount === 0 && input.codHandedOver
          ? 'COD collected and handed over to cashier'
          : 'Pending COD collection or cashier handover',
      fixHref: '/finance/handovers',
    },
    {
      key: 'expenses',
      label: 'Trip expenses entered',
      passed: input.expensesEntered,
      detail: input.expensesEntered
        ? 'Fuel/toll/loading expenses recorded'
        : 'No trip expenses recorded yet',
      fixHref: '/logistics/expenses',
    },
    {
      key: 'issues',
      label: 'Delivery issues resolved',
      passed: input.openIssuesCount === 0,
      detail:
        input.openIssuesCount === 0
          ? 'No open delivery disputes or issues'
          : `${input.openIssuesCount} open issue(s) need resolution`,
      fixHref: '/logistics/issues',
    },
  ];

  const canClose = br08.canClose && rows.every((r) => r.passed);
  return { canClose, rows };
}

