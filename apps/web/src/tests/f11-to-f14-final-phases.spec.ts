import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  canAccessAdminRoute,
  filterUserSites,
  searchAuditTrail,
  toCsvExport,
  validateApprovalRuleConfig,
} from '@neo/shared';
import {
  INITIAL_APPROVAL_POLICIES,
  INITIAL_AUDIT_LOGS,
  INITIAL_SITES,
} from '../lib/admin-data';
import { INITIAL_REPORTS, PRINTABLE_DOCUMENTS } from '../lib/reports-data';
import { INITIAL_EXTENSIONS, BATCH_TRACE_SAMPLE } from '../lib/extensions-data';
import { E2E_SCENARIO_MATRIX, HELP_ARTICLES, PERFORMANCE_BUDGETS } from '../lib/rollout-data';

const OFFICE_APP_DIR = path.resolve(__dirname, '../../app/(office)');

describe('Phases F11–F14 — Admin, Reports, Extensions & Rollout', () => {
  it('F11 AC1 & AC5: filters user sites (OD-007) and restricts /admin/* routes to OWNER only', () => {
    const visible = filterUserSites(INITIAL_SITES, ['site-baramati']);
    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('site-baramati');

    expect(canAccessAdminRoute('OWNER')).toBe(true);
    expect(canAccessAdminRoute('OPS_COORD')).toBe(false);
    expect(canAccessAdminRoute('PROD_MGR')).toBe(false);
    expect(canAccessAdminRoute('STOREKEEPER')).toBe(false);
    expect(canAccessAdminRoute('DRIVER')).toBe(false);
    expect(canAccessAdminRoute('COLLECTOR')).toBe(false);
  });

  it('F11 AC3: blocks silent auto-approval without an explicit approver', () => {
    const valid = validateApprovalRuleConfig(INITIAL_APPROVAL_POLICIES[0]);
    expect(valid.valid).toBe(true);

    const invalid = validateApprovalRuleConfig({
      ...INITIAL_APPROVAL_POLICIES[0],
      requireApprover: false,
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.error).toContain('prohibited');
  });

  it('F11 AC4: audit search returns order changes with before/after diff', () => {
    const results = searchAuditTrail(INITIAL_AUDIT_LOGS, { query: 'SO-2611-0042' });
    expect(results).toHaveLength(1);
    expect(results[0].beforeJson).toEqual({ creditLimit: 100000 });
    expect(results[0].afterJson).toEqual({ creditLimit: 150000 });
  });

  it('F12: report library exports CSV and covers printable business documents', () => {
    const rpt = INITIAL_REPORTS[0];
    const csv = toCsvExport(rpt.columns, rpt.rows);
    expect(csv).toContain('Sahyadri Dairy');
    expect(INITIAL_REPORTS.some((r) => r.favourite)).toBe(true);
    expect(PRINTABLE_DOCUMENTS.length).toBeGreaterThanOrEqual(5);
  });

  it('F13 & F14: validates R4+ extensions, E1-E12 matrix, performance budgets, and Help Centre', () => {
    expect(INITIAL_EXTENSIONS.length).toBeGreaterThanOrEqual(8);
    expect(BATCH_TRACE_SAMPLE.deliveries.length).toBeGreaterThan(0);
    expect(E2E_SCENARIO_MATRIX).toHaveLength(12);
    expect(PERFORMANCE_BUDGETS.every((b) => b.ok)).toBe(true);
    expect(HELP_ARTICLES.length).toBeGreaterThanOrEqual(4);
  });

  it('renders all F11-F14 pages and registers sidebar navigation links', () => {
    const requiredPages = [
      'admin/users/page.tsx',
      'admin/roles/page.tsx',
      'admin/sites/page.tsx',
      'admin/company/page.tsx',
      'admin/business-rules/page.tsx',
      'admin/approval-rules/page.tsx',
      'admin/templates/page.tsx',
      'control/audit/page.tsx',
      'admin/system/page.tsx',
      'admin/rollout/page.tsx',
      'reports/page.tsx',
      'reports/scheduled/page.tsx',
      'extensions/page.tsx',
      'help/page.tsx',
    ];
    for (const rel of requiredPages) {
      expect(fs.existsSync(path.join(OFFICE_APP_DIR, rel))).toBe(true);
    }

    const layoutContent = fs.readFileSync(path.join(OFFICE_APP_DIR, 'layout.tsx'), 'utf8');
    for (const href of [
      '/admin/users',
      '/admin/roles',
      '/admin/sites',
      '/admin/company',
      '/admin/business-rules',
      '/admin/approval-rules',
      '/admin/templates',
      '/control/audit',
      '/admin/system',
      '/admin/rollout',
      '/reports',
      '/reports/scheduled',
      '/extensions',
      '/help',
    ]) {
      expect(layoutContent).toContain(href);
    }
  });
});

