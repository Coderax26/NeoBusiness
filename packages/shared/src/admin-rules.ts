/**
 * @neo/shared — Admin Access, Business Rule Cache, Approval Guards & Audit Search (Phase F11)
 * Implements Acceptance Criteria #1–#5.
 */

import type { UserRole } from './permissions.js';

export interface AuditLogEntry {
  id: string;
  timestampIst: string;
  actorName: string;
  actorRole: UserRole;
  module: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT';
  entityType: string;
  entityNo: string;
  summary: string;
  beforeJson?: Record<string, unknown>;
  afterJson?: Record<string, unknown>;
  ipAddress: string;
}

export interface ApprovalPolicyConfig {
  id: string;
  exceptionType: string;
  primaryApproverRole: UserRole;
  delegateUser: string;
  delegateCapInr: number;
  escalationWaitMinutes: number;
  secondEscalationUser: string;
  requireApprover: boolean;
  active: boolean;
}

export function canAccessAdminRoute(role: UserRole): boolean {
  return role === 'OWNER';
}

export function filterUserSites<T extends { id: string }>(
  allSites: T[],
  assignedSiteIds: string[],
): T[] {
  return allSites.filter((s) => assignedSiteIds.includes(s.id));
}

export function validateApprovalRuleConfig(policy: ApprovalPolicyConfig): {
  valid: boolean;
  error?: string;
} {
  if (!policy.requireApprover || !policy.primaryApproverRole) {
    return {
      valid: false,
      error: 'Silent auto-approval without an approver is prohibited (OD-019).',
    };
  }
  if (policy.escalationWaitMinutes <= 0) {
    return {
      valid: false,
      error: 'Escalation wait minutes must be greater than 0.',
    };
  }
  return { valid: true };
}

export function searchAuditTrail(
  logs: AuditLogEntry[],
  filters: {
    query?: string;
    module?: string;
    action?: string;
  },
): AuditLogEntry[] {
  const q = filters.query?.trim().toLowerCase() ?? '';
  return logs.filter((entry) => {
    const modOk = !filters.module || filters.module === 'ALL' || entry.module === filters.module;
    const actOk = !filters.action || filters.action === 'ALL' || entry.action === filters.action;
    const queryOk =
      !q ||
      entry.entityNo.toLowerCase().includes(q) ||
      entry.actorName.toLowerCase().includes(q) ||
      entry.summary.toLowerCase().includes(q);
    return modOk && actOk && queryOk;
  });
}

