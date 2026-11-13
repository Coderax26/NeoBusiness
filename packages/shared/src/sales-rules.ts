/**
 * @neo/shared — Sales, Pricing, Credit & Order Lifecycle Business Rules (Phase F4)
 * Implements BR-01 (Price Band), BR-02 (Credit Exposure), BR-04 (ATP Stock), and Ledger Running Balance.
 */

import { evaluatePriceBand } from './business-rules.js';

/**
 * §3 Auto-floor suggestion: cost / (1 - pct/100) rounded up to nearest ₹0.50.
 */
export function calculateAutoFloorPrice(landedCost: number, minMarginPct: number): number {
  if (landedCost <= 0) return 0;
  const pct = Math.min(Math.max(minMarginPct, 0), 99);
  const raw = landedCost / (1 - pct / 100);
  // Round up to nearest ₹0.50
  return Math.ceil(raw * 2 - 1e-9) / 2;
}

export type CreditExposureStatus = 'OK' | 'NEAR_LIMIT' | 'BREACH' | 'HOLD';

export interface CreditExposureResult {
  status: CreditExposureStatus;
  projectedOutstanding: number;
  utilizationPct: number;
  breachAmount: number;
  requiresApproval: boolean;
  reason?: string;
}

/**
 * BR-02: Evaluates customer credit meter including current order total.
 */
export function evaluateCreditExposure(
  creditLimit: number,
  currentOutstanding: number,
  newOrderTotal: number,
  creditHold: boolean,
): CreditExposureResult {
  const projectedOutstanding = Number((currentOutstanding + newOrderTotal).toFixed(2));
  const utilizationPct =
    creditLimit > 0 ? Math.round((projectedOutstanding / creditLimit) * 100) : 100;

  if (creditHold) {
    return {
      status: 'HOLD',
      projectedOutstanding,
      utilizationPct,
      breachAmount: Math.max(0, projectedOutstanding - creditLimit),
      requiresApproval: true,
      reason: 'Customer is on manual credit hold — Owner approval needed',
    };
  }

  if (creditLimit > 0 && projectedOutstanding > creditLimit) {
    const breachAmount = Number((projectedOutstanding - creditLimit).toFixed(2));
    return {
      status: 'BREACH',
      projectedOutstanding,
      utilizationPct,
      breachAmount,
      requiresApproval: true,
      reason: `Over credit limit by ₹${breachAmount.toLocaleString('en-IN')} — Owner approval needed`,
    };
  }

  if (creditLimit > 0 && utilizationPct >= 85) {
    return {
      status: 'NEAR_LIMIT',
      projectedOutstanding,
      utilizationPct,
      breachAmount: 0,
      requiresApproval: false,
    };
  }

  return {
    status: 'OK',
    projectedOutstanding,
    utilizationPct,
    breachAmount: 0,
    requiresApproval: false,
  };
}

export interface StockAvailabilityResult {
  status: 'AVAILABLE' | 'SHORT';
  shortQty: number;
  suggestion: string;
}

/**
 * BR-04: Evaluates Available-to-Promise (ATP) stock and returns non-tech guidance.
 */
export function evaluateStockAvailability(
  availableAtp: number,
  requestedQty: number,
  category: 'RAW_MATERIAL' | 'PROCESSED_FG' | 'TRADED_GOOD',
): StockAvailabilityResult {
  if (requestedQty <= availableAtp) {
    return {
      status: 'AVAILABLE',
      shortQty: 0,
      suggestion: `${availableAtp} in stock`,
    };
  }
  const shortQty = Number((requestedQty - Math.max(0, availableAtp)).toFixed(2));
  const suggestion =
    category === 'PROCESSED_FG'
      ? `Short by ${shortQty} — Will be produced`
      : `Short by ${shortQty} — Back-to-back purchase suggested`;

  return {
    status: 'SHORT',
    shortQty,
    suggestion,
  };
}

export interface OrderApprovalEvaluation {
  primaryAction: 'CONFIRM' | 'SEND_FOR_APPROVAL';
  buttonLabel: 'Confirm order' | 'Send for Owner approval';
  reasons: string[];
}

/**
 * Combines BR-01 (price band) and BR-02 (credit) to determine order primary button state.
 */
export function evaluateOrderApprovalNeed(
  lines: { itemName: string; unitPrice: number; floorPrice: number; targetPrice: number }[],
  creditResult: CreditExposureResult,
): OrderApprovalEvaluation {
  const reasons: string[] = [];

  for (const line of lines) {
    const band = evaluatePriceBand(line.unitPrice, line.floorPrice, line.targetPrice, line.floorPrice * 0.85);
    if (band.status === 'BELOW_FLOOR') {
      reasons.push(`${line.itemName} is ₹${Math.abs(band.deltaFromFloor)} below today's floor → needs Owner approval`);
    }
  }

  if (creditResult.requiresApproval && creditResult.reason) {
    reasons.push(creditResult.reason);
  }

  if (reasons.length > 0) {
    return {
      primaryAction: 'SEND_FOR_APPROVAL',
      buttonLabel: 'Send for Owner approval',
      reasons,
    };
  }

  return {
    primaryAction: 'CONFIRM',
    buttonLabel: 'Confirm order',
    reasons: [],
  };
}

export interface LedgerEntryInput {
  id: string;
  date: string;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'OPENING';
  reference: string;
  description: string;
  debit: number;
  credit: number;
}

export interface LedgerEntryWithBalance extends LedgerEntryInput {
  runningBalance: number;
}

/**
 * §8 / AC-7: Computes Customer Statement running balance sequentially.
 */
export function computeRunningLedgerBalance(
  entries: LedgerEntryInput[],
  openingBalance = 0,
): LedgerEntryWithBalance[] {
  let balance = openingBalance;
  return entries.map((entry) => {
    balance = Number((balance + entry.debit - entry.credit).toFixed(2));
    return {
      ...entry,
      runningBalance: balance,
    };
  });
}

/**
 * AC-6: Margin and Cost visibility is restricted strictly to OWNER.
 */
export function canViewMarginAndCost(role?: string | null): boolean {
  return role === 'OWNER';
}

export const ORDER_LIFECYCLE_STEPS = [
  'Draft',
  'Approved',
  'Confirmed',
  'Made/Sourced',
  'Ready',
  'Dispatched',
  'Delivered',
  'Invoiced',
  'Paid',
] as const;

export const CANCEL_REASONS = [
  'Customer cancelled',
  'Wrong entry',
  'Out of stock',
  'Other',
] as const;
