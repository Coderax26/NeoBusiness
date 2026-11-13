/**
 * @neo/shared — Control Tower, Approvals, Step-up Auth & Analytics Guards (Phase F10)
 * Implements Acceptance Criteria #1–#5.
 */

import type { UserRole } from './permissions.js';
import { CONFIRMED_BUSINESS_CONFIG } from './business-rules.js';

export type ExceptionType =
  | 'PRICE_OVERRIDE'
  | 'CREDIT_BREACH'
  | 'SUPPLIER_PRICE_SPIKE'
  | 'SUPPLIER_SHORTFALL'
  | 'YIELD_VARIANCE'
  | 'WASTAGE_WRITEOFF'
  | 'STOCK_VARIANCE'
  | 'CASH_HANDOVER_VARIANCE'
  | 'DELIVERY_DISPUTE'
  | 'CREDIT_REBATE_WRITEOFF'
  | 'MANUAL_LEDGER_ADJUSTMENT'
  | 'COD_ONLY';

export interface ExceptionItem {
  id: string;
  type: ExceptionType;
  title: string;
  siteId: string;
  siteName: string;
  requesterName: string;
  amountInr: number;
  waitingMinutes: number;
  escalatesInMinutes: number;
  delegatedTo?: string;
  status: 'PENDING' | 'APPROVED' | 'COUNTERED' | 'REJECTED';
  resolvedBy?: string;
  resolvedAt?: string;
  remarks?: string;
  counterValueInr?: number;
  originOrderNo?: string;
  originOrderUnlocked?: boolean;
  facts: Record<string, string | number>;
}

export function evaluatePulseStaleness(missedRefreshes: number): {
  isStale: boolean;
  label: string;
} {
  if (missedRefreshes >= 2) {
    return { isStale: true, label: `Stale (${missedRefreshes} missed refreshes)` };
  }
  return { isStale: false, label: 'Live (30s auto-refresh)' };
}

export function requiresStepUpAuth(amountInr: number): boolean {
  return amountInr >= CONFIRMED_BUSINESS_CONFIG.OWNER_ESCALATION_THRESHOLD_INR;
}

export function resolveExceptionWithConcurrency(input: {
  exceptions: ExceptionItem[];
  exceptionId: string;
  action: 'APPROVE' | 'COUNTER' | 'REJECT';
  actorName: string;
  remarks?: string;
  counterValueInr?: number;
  stepUpPassword?: string;
  nowIso?: string;
}): {
  exceptions: ExceptionItem[];
  alreadyResolved: boolean;
  stepUpRequired: boolean;
  friendlyMessage: string;
  originOrderUnlocked: boolean;
} {
  const target = input.exceptions.find((e) => e.id === input.exceptionId);
  if (!target) {
    return {
      exceptions: input.exceptions,
      alreadyResolved: false,
      stepUpRequired: false,
      friendlyMessage: 'Exception not found.',
      originOrderUnlocked: false,
    };
  }

  if (target.status !== 'PENDING') {
    return {
      exceptions: input.exceptions,
      alreadyResolved: true,
      stepUpRequired: false,
      friendlyMessage: `Already resolved by ${target.resolvedBy ?? 'another approver'} at ${target.resolvedAt ?? 'earlier'}.`,
      originOrderUnlocked: !!target.originOrderUnlocked,
    };
  }

  if (
    (input.action === 'APPROVE' || input.action === 'COUNTER') &&
    requiresStepUpAuth(target.amountInr) &&
    !input.stepUpPassword?.trim()
  ) {
    return {
      exceptions: input.exceptions,
      alreadyResolved: false,
      stepUpRequired: true,
      friendlyMessage: 'Owner step-up password required for high-value approvals (≥ ₹5,000).',
      originOrderUnlocked: false,
    };
  }

  const nextStatus: ExceptionItem['status'] =
    input.action === 'APPROVE'
      ? 'APPROVED'
      : input.action === 'COUNTER'
        ? 'COUNTERED'
        : 'REJECTED';

  const unlockOrder =
    (input.action === 'APPROVE' || input.action === 'COUNTER') &&
    Boolean(target.originOrderNo);

  const resolvedAt = input.nowIso ?? 'Just now';

  const updated = input.exceptions.map((e) =>
    e.id === target.id
      ? {
          ...e,
          status: nextStatus,
          resolvedBy: input.actorName,
          resolvedAt,
          remarks: input.remarks ?? e.remarks,
          counterValueInr:
            input.action === 'COUNTER' ? (input.counterValueInr ?? e.counterValueInr) : e.counterValueInr,
          originOrderUnlocked: unlockOrder ? true : e.originOrderUnlocked,
        }
      : e,
  );

  return {
    exceptions: updated,
    alreadyResolved: false,
    stepUpRequired: false,
    friendlyMessage: `${target.title} marked ${nextStatus}.`,
    originOrderUnlocked: unlockOrder,
  };
}

export function canAccessAnalytics(role: UserRole): boolean {
  return role === 'OWNER' || role === 'OPS_COORD';
}

export function toCsvExport(
  headers: string[],
  rows: Array<Array<string | number>>,
): string {
  const escapeCell = (val: string | number): string => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return [
    headers.map(escapeCell).join(','),
    ...rows.map((r) => r.map(escapeCell).join(',')),
  ].join('\n');
}

