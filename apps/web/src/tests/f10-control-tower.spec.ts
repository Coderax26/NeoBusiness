import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  canAccessAnalytics,
  evaluatePulseStaleness,
  resolveExceptionWithConcurrency,
  toCsvExport,
} from '@neo/shared';
import { ANALYTICS_CUSTOMERS, INITIAL_EXCEPTIONS } from '../lib/control-tower-data';

const OFFICE_APP_DIR = path.resolve(__dirname, '../../app/(office)');
const COMPONENTS_DIR = path.resolve(__dirname, '../components');

describe('Phase F10 — Control Tower, Approvals & Analytics', () => {
  it('AC1: pulse refreshes every 30s and shows stale state after 2 missed refreshes', () => {
    expect(evaluatePulseStaleness(0).isStale).toBe(false);
    expect(evaluatePulseStaleness(1).isStale).toBe(false);
    const stale = evaluatePulseStaleness(2);
    expect(stale.isStale).toBe(true);
    expect(stale.label).toContain('Stale');

    const pulseFile = fs.readFileSync(path.join(COMPONENTS_DIR, 'PulseHeader.tsx'), 'utf8');
    expect(pulseFile).toContain('setInterval');
    expect(pulseFile).toContain('29');
  });

  it('AC2: approving a high-value price override requires step-up auth and unlocks originating order', () => {
    const needsStepUp = resolveExceptionWithConcurrency({
      exceptions: INITIAL_EXCEPTIONS,
      exceptionId: 'exc-1',
      action: 'APPROVE',
      actorName: 'Owner',
    });
    expect(needsStepUp.stepUpRequired).toBe(true);
    expect(needsStepUp.originOrderUnlocked).toBe(false);

    const approved = resolveExceptionWithConcurrency({
      exceptions: INITIAL_EXCEPTIONS,
      exceptionId: 'exc-1',
      action: 'APPROVE',
      actorName: 'Owner',
      stepUpPassword: 'owner-secret-password',
      nowIso: '17:20',
    });
    expect(approved.stepUpRequired).toBe(false);
    expect(approved.originOrderUnlocked).toBe(true);
    const updated = approved.exceptions.find((e) => e.id === 'exc-1');
    expect(updated?.status).toBe('APPROVED');
    expect(updated?.originOrderUnlocked).toBe(true);
  });

  it('AC3: double-resolve returns friendly already-resolved state without error', () => {
    const first = resolveExceptionWithConcurrency({
      exceptions: INITIAL_EXCEPTIONS,
      exceptionId: 'exc-2',
      action: 'APPROVE',
      actorName: 'Owner',
      nowIso: '17:21',
    });
    expect(first.alreadyResolved).toBe(false);

    const second = resolveExceptionWithConcurrency({
      exceptions: first.exceptions,
      exceptionId: 'exc-2',
      action: 'REJECT',
      actorName: 'Ops Coord',
    });
    expect(second.alreadyResolved).toBe(true);
    expect(second.friendlyMessage).toContain('Already resolved by Owner at 17:21');
  });

  it('AC4: analytics CSV export produces valid header and rows', () => {
    const csv = toCsvExport(
      ['Customer', 'Revenue INR', 'Gross Profit INR', 'Margin %', 'Orders'],
      ANALYTICS_CUSTOMERS.map((c) => [c.customer, c.revenue, c.grossProfit, c.marginPct, c.orders]),
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Customer,Revenue INR,Gross Profit INR,Margin %,Orders');
    expect(lines.length).toBe(ANALYTICS_CUSTOMERS.length + 1);
    expect(csv).toContain('Sahyadri Dairy');
  });

  it('AC5: masked roles cannot access analytics routes while Owner and Ops Coord can', () => {
    expect(canAccessAnalytics('OWNER')).toBe(true);
    expect(canAccessAnalytics('OPS_COORD')).toBe(true);
    expect(canAccessAnalytics('PROD_MGR')).toBe(false);
    expect(canAccessAnalytics('STOREKEEPER')).toBe(false);
    expect(canAccessAnalytics('DRIVER')).toBe(false);
    expect(canAccessAnalytics('COLLECTOR')).toBe(false);
  });

  it('renders all Phase F10 pages and registers Control Tower sidebar links', () => {
    const requiredPages = [
      'control/dashboard/page.tsx',
      'control/approvals/page.tsx',
      'control/analytics/page.tsx',
      'control/stock-alerts/page.tsx',
      'control/notifications/page.tsx',
    ];
    for (const rel of requiredPages) {
      expect(fs.existsSync(path.join(OFFICE_APP_DIR, rel))).toBe(true);
    }

    const layoutContent = fs.readFileSync(path.join(OFFICE_APP_DIR, 'layout.tsx'), 'utf8');
    expect(layoutContent).toContain('/control/dashboard');
    expect(layoutContent).toContain('/control/approvals');
    expect(layoutContent).toContain('/control/analytics');
    expect(layoutContent).toContain('/control/notifications');
  });
});

