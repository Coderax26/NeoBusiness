/**
 * @neo/shared — Business Rules & Confirmed Phase P2 Decision Evaluators
 *
 * Implements all UI-side business rules (BR-01 through BR-08) and confirmed
 * Phase P2 decisions (OD-001 through OD-025).
 */

import { absMoney, addMoney, cmpMoney, fromScaled, mulMoney, pctOf, subMoney, toScaled } from './money.js';

export const CONFIRMED_BUSINESS_CONFIG = {
  OWNER_ESCALATION_THRESHOLD_INR: 5000, // OD-002
  CURRENCY: 'INR', // OD-003
  EINVOICING_ENABLED: false, // OD-004
  EWAY_BILL_THRESHOLD_INR: 50000, // OD-005
  OTP_CHANNEL_DEFAULT: 'SMS', // OD-006
  MULTISITE_COORDINATOR_ENABLED: true, // OD-007
  DEFAULT_LANGUAGE: 'en', // OD-008
  SUPPLIER_PRICE_SPIKE_BASELINE: 'SAME_SUPPLIER_FIRST', // OD-009
  BACKUP_SUPPLIER_TOLERANCE_PCT: 2, // OD-010
  LANDED_COST_FREIGHT_ALLOCATION: 'NONE_MVP', // OD-011
  YIELD_VARIANCE_BASIS: 'ISSUED_RAW_MATERIAL', // OD-012
  YIELD_VARIANCE_TOLERANCE_PCT: 3, // OD-012
  PRODUCTION_MODE: 'MAKE_TO_ORDER_PRIMARY', // OD-013
  EPOD_OTP_REQUIRED: false, // OD-014
  CUSTODY_WALLET_SCOPE: 'CASH_AND_CHEQUE', // OD-015
  HANDOVER_CASHIER_ROLE: 'OPS_COORD', // OD-016
  INVOICE_ALLOCATION_POLICY: 'FIFO', // OD-017
  ACCOUNTING_BRIDGE_TARGET: 'TALLY_PRIME', // OD-018
  ESCALATION_WAIT_MINUTES: 60, // OD-019
  TODAYS_SALES_DEFINITION: 'TAX_INVOICES_ISSUED', // OD-020
  DASHBOARD_REFRESH_INTERVAL_SECONDS: 30, // OD-021
  STANDING_CUSTOMER_PRICES_ENABLED: false, // OD-022
  OPENING_BALANCE_IMPORT_MODE: 'CSV_ATOMIC', // OD-023
  WHATSAPP_BSP_ADAPTER: 'GENERIC_WEBHOOK', // OD-024
  INTERSITE_ORDER_FULFILLMENT: 'HUB_AND_SPOKE', // OD-025
  SUPPLIER_BILL_AUTO_APPROVE_CAP_INR: 25000,
} as const;

export type PriceBandStatus = 'IN_BAND' | 'BELOW_TARGET' | 'BELOW_FLOOR';

export interface PriceBandEvaluation {
  status: PriceBandStatus;
  deltaFromFloor: number;
  marginPct: number;
  requiresOverride: boolean;
  chipLabel: string;
  chipColor: 'emerald' | 'amber' | 'rose';
}

/**
 * BR-01: Evaluates an order line price against Floor, Target, and Landed Cost.
 */
export function evaluatePriceBand(
  unitPrice: number,
  floorPrice: number,
  targetPrice: number,
  landedCost: number,
): PriceBandEvaluation {
  const marginPct =
    Number(pctOf(subMoney(unitPrice, landedCost, 6), unitPrice, 2));
  const deltaFromFloor = Number(subMoney(unitPrice, floorPrice));

  if (cmpMoney(unitPrice, floorPrice) < 0) {
    return {
      status: 'BELOW_FLOOR',
      deltaFromFloor,
      marginPct,
      requiresOverride: true,
      chipLabel: `Below floor by ₹${Math.abs(deltaFromFloor).toFixed(2)}`,
      chipColor: 'rose',
    };
  }

  if (cmpMoney(unitPrice, targetPrice) < 0) {
    return {
      status: 'BELOW_TARGET',
      deltaFromFloor,
      marginPct,
      requiresOverride: false,
      chipLabel: 'In band (Below target)',
      chipColor: 'amber',
    };
  }

  return {
    status: 'IN_BAND',
    deltaFromFloor,
    marginPct,
    requiresOverride: false,
    chipLabel: 'In band',
    chipColor: 'emerald',
  };
}

export interface CounterOfferSimulation {
  proposedPrice: number;
  quantity: number;
  lineTotal: number;
  grossProfit: number;
  marginPct: number;
  deltaFromFloor: number;
  isAboveFloor: boolean;
  requiresPinPrompt: boolean;
}

/**
 * Interactive Margin Simulator for Control Tower Exception Workbench (F2.5).
 * Recalculates gross profit, margin %, and PIN prompt requirement in real time as the slider moves.
 */
export function simulateCounterOfferMargin(
  proposedPrice: number,
  floorPrice: number,
  landedCost: number,
  quantity: number,
  originalRequestedPrice?: number,
): CounterOfferSimulation {
  const lineTotal = Number(mulMoney(proposedPrice, quantity));
  const grossProfit = Number(mulMoney(subMoney(proposedPrice, landedCost, 6), quantity));
  const marginPct =
    Number(pctOf(subMoney(proposedPrice, landedCost, 6), proposedPrice, 2));
  const deltaFromFloor = Number(subMoney(proposedPrice, floorPrice));
  const discountValueAtRisk =
    originalRequestedPrice !== undefined
      ? Number(absMoney(mulMoney(subMoney(floorPrice, originalRequestedPrice, 6), quantity)))
      : Number(absMoney(mulMoney(subMoney(floorPrice, proposedPrice, 6), quantity)));

  return {
    proposedPrice: Number(fromScaled(toScaled(proposedPrice))),
    quantity,
    lineTotal,
    grossProfit,
    marginPct,
    deltaFromFloor,
    isAboveFloor: cmpMoney(proposedPrice, floorPrice) >= 0,
    requiresPinPrompt:
      lineTotal >= CONFIRMED_BUSINESS_CONFIG.OWNER_ESCALATION_THRESHOLD_INR ||
      discountValueAtRisk >= CONFIRMED_BUSINESS_CONFIG.OWNER_ESCALATION_THRESHOLD_INR,
  };
}

export interface CreditEvaluation {
  projectedExposure: number;
  utilizationPct: number;
  isOverLimit: boolean;
  isBlockedForDispatch: boolean;
  status: 'OK' | 'WARNING' | 'HOLD';
  warningBanner: string | null;
}

/**
 * BR-02: Evaluates customer credit exposure (AR + current order vs limit & overdue days).
 */
export function evaluateCreditStatus(
  currentAr: number,
  orderAmount: number,
  creditLimit: number,
  overdueDays: number,
  explicitCreditHold = false,
): CreditEvaluation {
  const projectedExposure = Number(addMoney(currentAr, orderAmount));
  const utilizationPct =
    creditLimit > 0 ? Number(pctOf(projectedExposure, creditLimit, 1)) : 100;
  const isOverLimit = cmpMoney(projectedExposure, creditLimit) > 0;
  const isHold = explicitCreditHold || overdueDays > 30 || isOverLimit;

  if (isHold) {
    const reasons: string[] = [];
    if (explicitCreditHold) reasons.push('Account on Credit Hold');
    if (overdueDays > 30) reasons.push(`${overdueDays} days overdue`);
    if (isOverLimit) reasons.push(`Exceeds credit limit by ₹${subMoney(projectedExposure, creditLimit)}`);
    return {
      projectedExposure,
      utilizationPct,
      isOverLimit,
      isBlockedForDispatch: true,
      status: 'HOLD',
      warningBanner: `CREDIT HOLD: ${reasons.join(' · ')}. Dispatch will be blocked until resolved.`,
    };
  }

  if (utilizationPct >= 85 || overdueDays > 7) {
    return {
      projectedExposure,
      utilizationPct,
      isOverLimit: false,
      isBlockedForDispatch: false,
      status: 'WARNING',
      warningBanner: `High credit utilization (${utilizationPct}%)`,
    };
  }

  return {
    projectedExposure,
    utilizationPct,
    isOverLimit: false,
    isBlockedForDispatch: false,
    status: 'OK',
    warningBanner: null,
  };
}

export interface SupplierPriceSpikeEvaluation {
  baselinePrice: number;
  baselineSource: 'SAME_SUPPLIER' | 'ITEM_WIDE';
  variancePct: number;
  exceedsTolerance: boolean;
  requiresOwnerApproval: boolean;
}

/**
 * BR-03 & OD-009: Evaluates supplier PO line price against same-supplier last price first,
 * falling back to item-wide last cost.
 */
export function evaluateSupplierPriceSpike(
  poUnitPrice: number,
  sameSupplierLastPrice: number | null,
  itemWideLastCost: number,
  tolerancePct = 5,
): SupplierPriceSpikeEvaluation {
  const baselinePrice =
    sameSupplierLastPrice !== null && sameSupplierLastPrice > 0
      ? sameSupplierLastPrice
      : itemWideLastCost;
  const baselineSource =
    sameSupplierLastPrice !== null && sameSupplierLastPrice > 0
      ? 'SAME_SUPPLIER'
      : 'ITEM_WIDE';

  const variancePct =
    baselinePrice > 0
      ? Number(pctOf(subMoney(poUnitPrice, baselinePrice, 6), baselinePrice, 2))
      : 0;
  const exceedsTolerance = variancePct > tolerancePct;

  return {
    baselinePrice,
    baselineSource,
    variancePct,
    exceedsTolerance,
    requiresOwnerApproval: exceedsTolerance,
  };
}

export interface BackupSupplierCandidate {
  supplierId: string;
  supplierName: string;
  quotedRate: number;
  fillRate: number;
}

/**
 * OD-010: Ranks backup suppliers and filters those within 2% tolerance of primary supplier rate.
 */
export function rankBackupSuppliers(
  primaryRate: number,
  candidates: BackupSupplierCandidate[],
  tolerancePct = CONFIRMED_BUSINESS_CONFIG.BACKUP_SUPPLIER_TOLERANCE_PCT,
): Array<BackupSupplierCandidate & { deltaPct: number; withinTolerance: boolean }> {
  return candidates
    .map((c) => {
      const deltaPct =
        primaryRate > 0 ? Number(pctOf(subMoney(c.quotedRate, primaryRate, 6), primaryRate, 2)) : 0;
      return {
        ...c,
        deltaPct,
        withinTolerance: deltaPct <= tolerancePct,
      };
    })
    .sort((a, b) => {
      if (a.withinTolerance !== b.withinTolerance) {
        return a.withinTolerance ? -1 : 1;
      }
      if (a.quotedRate !== b.quotedRate) {
        return a.quotedRate - b.quotedRate;
      }
      return b.fillRate - a.fillRate;
    });
}

export interface BatchYieldEvaluation {
  issuedRmKg: number;
  actualOutputKg: number;
  scrapKg: number;
  totalAccountedKg: number;
  yieldPct: number;
  massBalanceVariancePct: number;
  exceedsTolerance: boolean;
}

/**
 * BR-06 & OD-012: Evaluates factory batch yield based on actual issued raw material mass balance.
 */
export function evaluateBatchYield(
  issuedRmKg: number,
  actualOutputKg: number,
  scrapKg: number,
  tolerancePct = CONFIRMED_BUSINESS_CONFIG.YIELD_VARIANCE_TOLERANCE_PCT,
): BatchYieldEvaluation {
  const totalAccountedKg = Number((actualOutputKg + scrapKg).toFixed(3));
  const yieldPct =
    issuedRmKg > 0 ? Number(((actualOutputKg / issuedRmKg) * 100).toFixed(2)) : 0;
  const massBalanceVariancePct =
    issuedRmKg > 0
      ? Number((((totalAccountedKg - issuedRmKg) / issuedRmKg) * 100).toFixed(2))
      : 0;

  return {
    issuedRmKg,
    actualOutputKg,
    scrapKg,
    totalAccountedKg,
    yieldPct,
    massBalanceVariancePct,
    exceedsTolerance: Math.abs(massBalanceVariancePct) > tolerancePct,
  };
}

export interface HandoverVarianceEvaluation {
  expectedCash: number;
  countedCash: number | null;
  cashVariance: number;
  canVerify: boolean;
  isDisputed: boolean;
  escalateToOwner: boolean;
}

/**
 * BR-07, OD-015, OD-016, OD-002: Evaluates cashier handover verification.
 * Verify button remains disabled until countedCash is explicitly provided.
 */
export function evaluateHandoverVariance(
  expectedCash: number,
  countedCash: number | null | undefined,
): HandoverVarianceEvaluation {
  if (countedCash === null || countedCash === undefined || Number.isNaN(countedCash)) {
    return {
      expectedCash,
      countedCash: null,
      cashVariance: 0,
      canVerify: false,
      isDisputed: false,
      escalateToOwner: false,
    };
  }

  const cashVariance = Number(subMoney(countedCash, expectedCash));
  const absVariance = Math.abs(cashVariance);
  const isDisputed = absVariance > 0;

  return {
    expectedCash,
    countedCash,
    cashVariance,
    canVerify: true,
    isDisputed,
    escalateToOwner:
      absVariance >= CONFIRMED_BUSINESS_CONFIG.OWNER_ESCALATION_THRESHOLD_INR,
  };
}

export interface TripClosureReadiness {
  canClose: boolean;
  blockers: string[];
}

/**
 * BR-08: Evaluates whether a delivery trip can be closed.
 */
export function evaluateTripClosureReadiness(input: {
  pendingStopsCount: number;
  unloggedReturnsCount: number;
  uncollectedCodOrdersCount: number;
}): TripClosureReadiness {
  const blockers: string[] = [];
  if (input.pendingStopsCount > 0) {
    blockers.push(`${input.pendingStopsCount} delivery stop(s) still pending completion`);
  }
  if (input.unloggedReturnsCount > 0) {
    blockers.push(`${input.unloggedReturnsCount} rejected return item(s) not yet logged at warehouse`);
  }
  if (input.uncollectedCodOrdersCount > 0) {
    blockers.push(`${input.uncollectedCodOrdersCount} COD delivery stop(s) missing cash/cheque capture`);
  }

  return {
    canClose: blockers.length === 0,
    blockers,
  };
}

export interface FifoInvoiceItem {
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  outstandingAmount: number;
}

export interface FifoAllocationResult {
  invoiceId: string;
  invoiceNumber: string;
  allocatedAmount: number;
  remainingInvoiceBalance: number;
}

/**
 * OD-017: Allocates a customer receipt across open invoices using FIFO (oldest invoice first).
 */
export function allocateReceiptFifo(
  receiptAmount: number,
  openInvoices: FifoInvoiceItem[],
): { allocations: FifoAllocationResult[]; unallocatedAdvance: number } {
  const sorted = [...openInvoices].sort(
    (a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime(),
  );

  let remainingReceipt = Number(fromScaled(toScaled(receiptAmount)));
  const allocations: FifoAllocationResult[] = [];

  for (const inv of sorted) {
    if (remainingReceipt <= 0) break;
    if (inv.outstandingAmount <= 0) continue;

    const roundedAlloc = Number(
      fromScaled(
        toScaled(cmpMoney(remainingReceipt, inv.outstandingAmount) <= 0 ? remainingReceipt : inv.outstandingAmount),
      ),
    );
    remainingReceipt = Number(subMoney(remainingReceipt, roundedAlloc));

    allocations.push({
      invoiceId: inv.invoiceId,
      invoiceNumber: inv.invoiceNumber,
      allocatedAmount: roundedAlloc,
      remainingInvoiceBalance: Number(subMoney(inv.outstandingAmount, roundedAlloc)),
    });
  }

  return {
    allocations,
    unallocatedAdvance: remainingReceipt,
  };
}

