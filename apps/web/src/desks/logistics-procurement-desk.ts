/**
 * Milestones F5 & F7 — Logistics Trip Builder (M5) & Procurement Desk (M2)
 *
 * Implements:
 * - F5.1 & F5.2: 3-Pane Trip Builder with vehicle weight/crate capacity gauge & credit-hold block
 * - F5.3: Dispatch lock requiring warehouse tablet loading confirmation
 * - F5.4: Delivery dispute escalation to Owner when value >= ₹5,000 (OD-002)
 * - F7.1 & F7.2: PO Builder with same-supplier price-spike baseline (OD-009) & backup supplier ranking within 2% (OD-010)
 */

import {
  evaluateSupplierPriceSpike,
  rankBackupSuppliers,
  CONFIRMED_BUSINESS_CONFIG,
  type BackupSupplierCandidate,
} from '@neo/shared';

export interface TripStopOrder {
  orderId: string;
  customerName: string;
  weightKg: number;
  cratesCount: number;
  status: 'READY' | 'PENDING_APPROVAL' | 'DRAFT';
  onCreditHold: boolean;
}

export interface TripBuilderEvaluation {
  totalWeightKg: number;
  totalCrates: number;
  weightUtilizationPct: number;
  crateUtilizationPct: boolean;
  isOverCapacity: boolean;
  hasCreditHoldOrder: boolean;
  hasUnreadyOrder: boolean;
  isLoadingConfirmedOnTablet: boolean;
  canDispatch: boolean;
  blockingReasons: string[];
}

export class LogisticsProcurementDeskController {
  /**
   * F5.1, F5.2, F5.3: Evaluates a planned trip against vehicle capacity, order readiness,
   * credit holds, and tablet loading confirmation.
   */
  evaluateTripPlan(input: {
    vehicleMaxWeightKg: number;
    vehicleMaxCrates: number;
    stops: TripStopOrder[];
    isLoadingConfirmedOnTablet: boolean;
  }): TripBuilderEvaluation {
    const totalWeightKg = input.stops.reduce((s, o) => s + o.weightKg, 0);
    const totalCrates = input.stops.reduce((s, o) => s + o.cratesCount, 0);
    const weightUtilizationPct =
      input.vehicleMaxWeightKg > 0
        ? Number(((totalWeightKg / input.vehicleMaxWeightKg) * 100).toFixed(1))
        : 100;

    const isOverCapacity =
      totalWeightKg > input.vehicleMaxWeightKg ||
      totalCrates > input.vehicleMaxCrates;
    const hasCreditHoldOrder = input.stops.some((o) => o.onCreditHold);
    const hasUnreadyOrder = input.stops.some((o) => o.status !== 'READY');

    const blockingReasons: string[] = [];
    if (isOverCapacity) {
      blockingReasons.push('Vehicle weight or crate capacity exceeded');
    }
    if (hasCreditHoldOrder) {
      blockingReasons.push('Includes order on Credit Hold');
    }
    if (hasUnreadyOrder) {
      blockingReasons.push('Includes order not yet in READY status');
    }
    if (!input.isLoadingConfirmedOnTablet) {
      blockingReasons.push('Warehouse tablet loading checklist not yet confirmed');
    }

    return {
      totalWeightKg,
      totalCrates,
      weightUtilizationPct,
      crateUtilizationPct: totalCrates <= input.vehicleMaxCrates,
      isOverCapacity,
      hasCreditHoldOrder,
      hasUnreadyOrder,
      isLoadingConfirmedOnTablet: input.isLoadingConfirmedOnTablet,
      canDispatch: blockingReasons.length === 0 && input.stops.length > 0,
      blockingReasons,
    };
  }

  /**
   * F5.4 & OD-002: Evaluates a delivery return/dispute and determines if Owner escalation is required.
   */
  evaluateDeliveryDispute(disputedValueInr: number): {
    requiresOwnerEscalation: boolean;
    thresholdInr: number;
  } {
    return {
      requiresOwnerEscalation:
        disputedValueInr >= CONFIRMED_BUSINESS_CONFIG.OWNER_ESCALATION_THRESHOLD_INR,
      thresholdInr: CONFIRMED_BUSINESS_CONFIG.OWNER_ESCALATION_THRESHOLD_INR,
    };
  }

  /**
   * F7.1 & F7.2: Evaluates a Purchase Order line for price spikes (OD-009) and ranks backup suppliers (OD-010).
   */
  evaluatePurchaseOrderLine(input: {
    poUnitPrice: number;
    sameSupplierLastPrice: number | null;
    itemWideLastCost: number;
    tolerancePct?: number;
    backupCandidates?: BackupSupplierCandidate[];
  }) {
    const spike = evaluateSupplierPriceSpike(
      input.poUnitPrice,
      input.sameSupplierLastPrice,
      input.itemWideLastCost,
      input.tolerancePct ?? 5,
    );

    const rankedBackups = rankBackupSuppliers(
      spike.baselinePrice,
      input.backupCandidates ?? [],
    );

    return {
      ...spike,
      issueButtonDisabled: spike.requiresOwnerApproval,
      bannerMessage: spike.requiresOwnerApproval
        ? 'Waiting for owner price-spike approval'
        : null,
      recommendedBackupsWithin2Pct: rankedBackups.filter((b) => b.withinTolerance),
      allRankedBackups: rankedBackups,
    };
  }
}

