/**
 * @neo/shared — Procurement, Supplier Price Spike, Blind GRN & 3-Way Match Rules (Phase F5)
 * Implements:
 * - BR-03 / OD-009: Supplier Price Spike plain-language warning & Owner gate
 * - BR-05: Blind GRN payload masking (strips ordered qty & price for Storekeeper)
 * - 3-Way Match evaluation (PO vs GRN vs Supplier Bill)
 * - Grouped Requisition -> One PO per supplier conversion
 */

import { cmpMoney, pctOf, subMoney } from './money.js';

export type ThreeWayMatchStatus =
  | 'MATCHES'
  | 'TIMING_DIFFERS'
  | 'AMOUNT_DIFFERS'
  | 'DOES_NOT_MATCH';

export interface ThreeWayMatchLineInput {
  itemId: string;
  itemName: string;
  poQty: number;
  grnQty: number;
  billQty: number;
  poRate: number;
  billRate: number;
}

export interface ThreeWayMatchLineResult extends ThreeWayMatchLineInput {
  qtyMatchesPoAndGrn: boolean;
  qtyMatchesGrnAndBill: boolean;
  rateMatchesPoAndBill: boolean;
  lineStatus: 'MATCH' | 'TIMING_DIFF' | 'AMOUNT_DIFF' | 'MISMATCH';
  icon: '✓' | '✗';
  varianceAmount: number;
}

export interface ThreeWayMatchEvaluation {
  three_way_status: ThreeWayMatchStatus;
  label: string;
  badgeColor: 'emerald' | 'amber' | 'rose';
  totalPoAmount: number;
  totalGrnAmount: number;
  totalBillAmount: number;
  netVariance: number;
  lines: ThreeWayMatchLineResult[];
}

/**
 * Evaluates 3-way match across PO, GRN, and Supplier Bill.
 * Uses ✓ / ✗ per line for non-technical users.
 */
export function evaluateThreeWayMatch(
  lines: ThreeWayMatchLineInput[],
): ThreeWayMatchEvaluation {
  let hasAmountDiff = false;
  let hasTimingDiff = false;
  let hasHardMismatch = false;

  let totalPoAmount = 0;
  let totalGrnAmount = 0;
  let totalBillAmount = 0;

  const evaluatedLines: ThreeWayMatchLineResult[] = lines.map((line) => {
    const poLineAmt = Number((line.poQty * line.poRate).toFixed(2));
    const grnLineAmt = Number((line.grnQty * line.poRate).toFixed(2));
    const billLineAmt = Number((line.billQty * line.billRate).toFixed(2));

    totalPoAmount += poLineAmt;
    totalGrnAmount += grnLineAmt;
    totalBillAmount += billLineAmt;

    const qtyMatchesPoAndGrn = line.poQty === line.grnQty;
    const qtyMatchesGrnAndBill = line.grnQty === line.billQty;
    const rateMatchesPoAndBill = cmpMoney(line.poRate, line.billRate) === 0;

    let lineStatus: ThreeWayMatchLineResult['lineStatus'] = 'MATCH';
    if (!qtyMatchesGrnAndBill || (!qtyMatchesPoAndGrn && !rateMatchesPoAndBill)) {
      lineStatus = 'MISMATCH';
      hasHardMismatch = true;
    } else if (!rateMatchesPoAndBill) {
      lineStatus = 'AMOUNT_DIFF';
      hasAmountDiff = true;
    } else if (!qtyMatchesPoAndGrn && qtyMatchesGrnAndBill) {
      lineStatus = 'TIMING_DIFF';
      hasTimingDiff = true;
    }

    const varianceAmount = Number((billLineAmt - grnLineAmt).toFixed(2));

    return {
      ...line,
      qtyMatchesPoAndGrn,
      qtyMatchesGrnAndBill,
      rateMatchesPoAndBill,
      lineStatus,
      icon: lineStatus === 'MATCH' ? '✓' : '✗',
      varianceAmount,
    };
  });

  let three_way_status: ThreeWayMatchStatus = 'MATCHES';
  let label = 'Matches';
  let badgeColor: 'emerald' | 'amber' | 'rose' = 'emerald';

  if (hasHardMismatch || (hasAmountDiff && hasTimingDiff)) {
    three_way_status = 'DOES_NOT_MATCH';
    label = 'Does not match';
    badgeColor = 'rose';
  } else if (hasAmountDiff) {
    three_way_status = 'AMOUNT_DIFFERS';
    label = 'Amount differs';
    badgeColor = 'amber';
  } else if (hasTimingDiff) {
    three_way_status = 'TIMING_DIFFERS';
    label = 'Timing differs';
    badgeColor = 'amber';
  }

  return {
    three_way_status,
    label,
    badgeColor,
    totalPoAmount: Number(totalPoAmount.toFixed(2)),
    totalGrnAmount: Number(totalGrnAmount.toFixed(2)),
    totalBillAmount: Number(totalBillAmount.toFixed(2)),
    netVariance: Number((totalBillAmount - totalGrnAmount).toFixed(2)),
    lines: evaluatedLines,
  };
}

/**
 * Plain-sentence price spike warning for non-tech users (§4):
 * e.g., "₹54/kg is 12.5% higher than last time (₹48/kg)"
 */
export function formatPriceSpikePlainWarning(
  poRate: number,
  lastRate: number | null,
  uom = 'kg',
): string | null {
  if (!lastRate || lastRate <= 0 || poRate <= lastRate) return null;
  const pct = Number(pctOf(subMoney(poRate, lastRate, 6), lastRate, 1));
  return `₹${poRate}/${uom} is ${pct}% higher than last time (₹${lastRate}/${uom})`;
}

export interface BlindGrnSourceLine {
  lineId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  uom: string;
  orderedQty?: number;
  unitPrice?: number;
  rate?: number;
  lineTotal?: number;
  receivedQty?: number;
}

export interface BlindGrnMaskedLine {
  lineId: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  uom: string;
  receivedQty: number;
}

/**
 * BR-05: Strips orderedQty, unitPrice, rate, and lineTotal so Storekeeper blind GRN
 * payload and DOM contain no ordered quantities or prices.
 */
export function maskGrnForBlindView(
  lines: BlindGrnSourceLine[],
): BlindGrnMaskedLine[] {
  return lines.map((line) => ({
    lineId: line.lineId,
    itemId: line.itemId,
    itemSku: line.itemSku,
    itemName: line.itemName,
    uom: line.uom,
    receivedQty: line.receivedQty ?? 0,
  }));
}

export interface RequisitionGroupInput {
  id: string;
  requisitionNo: string;
  supplierId: string;
  supplierName: string;
  itemId: string;
  itemSku: string;
  itemName: string;
  qty: number;
  uom: string;
  latestRate: number;
  neededBy: string;
}

export interface SupplierRequisitionGroup {
  supplierId: string;
  supplierName: string;
  requisitionIds: string[];
  lines: RequisitionGroupInput[];
  estimatedTotal: number;
}

/**
 * Groups selected open requisitions by supplier so Convert-to-PO produces
 * exactly one PO per supplier (Acceptance Criterion #1).
 */
export function groupRequisitionsBySupplier(
  requisitions: RequisitionGroupInput[],
): SupplierRequisitionGroup[] {
  const map = new Map<string, SupplierRequisitionGroup>();

  for (const req of requisitions) {
    const existing = map.get(req.supplierId);
    const lineTotal = Number((req.qty * req.latestRate).toFixed(2));
    if (existing) {
      existing.requisitionIds.push(req.id);
      existing.lines.push(req);
      existing.estimatedTotal = Number((existing.estimatedTotal + lineTotal).toFixed(2));
    } else {
      map.set(req.supplierId, {
        supplierId: req.supplierId,
        supplierName: req.supplierName,
        requisitionIds: [req.id],
        lines: [req],
        estimatedTotal: lineTotal,
      });
    }
  }

  return Array.from(map.values());
}

