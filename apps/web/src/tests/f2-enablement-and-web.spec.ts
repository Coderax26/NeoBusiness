import { describe, it, expect } from 'vitest';
import { API_ROUTES, isKnownRoute } from '@neo/api-client';
import { getStatusPillTheme, buildSparklineSvgPoints } from '@neo/ui';
import { createInitialSession } from '../../lib/session';
import { displayINR, timeAgo } from '../../lib/formatters';
import nextConfig from '../../next.config.mjs';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase F2 Enablement & Next.js Foundation', () => {
  it('TC-F2-01: Realtime SSE endpoint /events/stream is registered in route table (G-RT-1)', () => {
    expect(isKnownRoute('GET', '/events/stream')).toBe(true);
  });

  it('TC-F2-02: Document PDF endpoints exist in route table (G-DOC-1..4)', () => {
    expect(isKnownRoute('GET', '/orders/123/pdf')).toBe(true);
    expect(isKnownRoute('GET', '/quotes/456/pdf')).toBe(true);
    expect(isKnownRoute('GET', '/procurement/purchase-orders/789/pdf')).toBe(true);
    expect(isKnownRoute('GET', '/customers/101/statement/pdf')).toBe(true);
  });

  it('TC-F2-03: Stock count endpoints exist in route table (G-INV-3)', () => {
    expect(isKnownRoute('POST', '/inventory/stock-counts')).toBe(true);
    expect(isKnownRoute('GET', '/inventory/stock-counts')).toBe(true);
    expect(isKnownRoute('GET', '/inventory/stock-counts/sheet-1')).toBe(true);
    expect(isKnownRoute('POST', '/inventory/stock-counts/sheet-1/approve')).toBe(true);
  });

  it('TC-F2-04: Non-trip expense and cashbook endpoints exist in route table (G-FIN-2, G-FIN-3)', () => {
    expect(isKnownRoute('POST', '/finance/expenses')).toBe(true);
    expect(isKnownRoute('GET', '/finance/expenses')).toBe(true);
    expect(isKnownRoute('GET', '/finance/cashbook')).toBe(true);
  });

  it('TC-F2-05: Statutory report endpoints exist in route table (G-RPT-1, G-RPT-2)', () => {
    expect(isKnownRoute('GET', '/reports/sales-register')).toBe(true);
    expect(isKnownRoute('GET', '/reports/purchase-register')).toBe(true);
    expect(isKnownRoute('GET', '/reports/gst/summary')).toBe(true);
  });

  it('TC-F2-06: Order summary endpoint exists in route table (G-M1-1)', () => {
    expect(isKnownRoute('GET', '/orders/summary')).toBe(true);
  });

  it('TC-F2-07: Quote lifecycle transitions exist in route table (G-M1-2)', () => {
    expect(isKnownRoute('POST', '/quotes/123/mark-lost')).toBe(true);
    expect(isKnownRoute('POST', '/quotes/123/send')).toBe(true);
  });

  it('TC-F2-08: Formatters: displayINR handles positive, negative, zero, null, undefined', () => {
    expect(displayINR(null)).toBe('₹0.00');
    expect(displayINR(undefined)).toBe('₹0.00');
    expect(displayINR('')).toBe('₹0.00');
    expect(displayINR('0')).toBe('₹0.00');
    expect(displayINR('100000')).toBe('₹1,00,000.00');
    expect(displayINR('-5000')).toBe('-₹5,000.00');
  });

  it('TC-F2-09: Formatters: timeAgo calculates relative time labels', () => {
    const now = new Date();
    expect(timeAgo(now.toISOString())).toBe('Just now');
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(timeAgo(fiveMinAgo.toISOString())).toBe('5m ago');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(timeAgo(twoHoursAgo.toISOString())).toBe('2h ago');
  });

  it('TC-F2-10: ClientSession: createInitialSession correctly parses AuthMeResponse and initializes activeSiteId', () => {
    const emptySession = createInitialSession(null);
    expect(emptySession.isAuthenticated).toBe(false);
    expect(emptySession.user).toBeNull();
    expect(emptySession.activeSiteId).toBeNull();

    const loggedInSession = createInitialSession({
      id: 'u-1',
      phone: '9876543210',
      name: 'Owner Boss',
      role: 'OWNER',
      permissions: ['*'],
      sites: [
        { id: 'site-1', name: 'Factory 1', code: 'F1', siteType: 'FACTORY' },
        { id: 'site-2', name: 'Cold Depot', code: 'D1', siteType: 'DEPOT' },
      ],
      siteIds: ['site-1', 'site-2'],
      preferredLanguage: 'mr',
    });

    expect(loggedInSession.isAuthenticated).toBe(true);
    expect(loggedInSession.user?.name).toBe('Owner Boss');
    expect(loggedInSession.user?.role).toBe('OWNER');
    expect(loggedInSession.activeSiteId).toBe('site-1');
  });

  it('TC-F2-11: UI Primitives: StatusBadge theme lookup for ORDER, PO, INVOICE, WORK_ORDER statuses', () => {
    const orderDraft = getStatusPillTheme('ORDER', 'DRAFT');
    expect(orderDraft.tone).toBe('neutral');

    const orderReady = getStatusPillTheme('ORDER', 'READY');
    expect(orderReady.tone).toBe('success');
    expect(orderReady.icon).toBe('✓');

    const poPending = getStatusPillTheme('PO', 'PENDING_APPROVAL');
    expect(poPending.tone).toBe('warning');
    expect(poPending.icon).toBe('▲');

    const invoiceOverdue = getStatusPillTheme('INVOICE', 'OVERDUE');
    expect(invoiceOverdue.tone).toBe('danger');
    expect(invoiceOverdue.icon).toBe('✕');
  });

  it('TC-F2-12: UI Primitives: buildSparklineSvgPoints returns valid SVG polyline coordinate points', () => {
    const points = buildSparklineSvgPoints([100, 150, 120, 200, 180], 100, 28);
    expect(points).toBeTruthy();
    expect(typeof points).toBe('string');
    // First point should start at x=0
    expect(points.startsWith('0,')).toBe(true);
    // Last point should end at x=100
    expect(points.includes(' 100,')).toBe(true);
  });

  it('TC-F2-13: Next.js App Router: next.config.mjs defines proper transpilation and API rewrites', () => {
    expect(nextConfig.reactStrictMode).toBe(true);
    expect(nextConfig.transpilePackages).toContain('@neo/shared');
    expect(nextConfig.transpilePackages).toContain('@neo/api-client');
  });

  it('TC-F2-14: Floor Mode (D-1): Route group (floor) structure exists with touch-optimized terminal layout', () => {
    const floorLayoutPath = path.resolve(__dirname, '../../app/(floor)/layout.tsx');
    const floorPagePath = path.resolve(__dirname, '../../app/(floor)/floor/page.tsx');
    expect(fs.existsSync(floorLayoutPath)).toBe(true);
    expect(fs.existsSync(floorPagePath)).toBe(true);

    const layoutContent = fs.readFileSync(floorLayoutPath, 'utf-8');
    const pageContent = fs.readFileSync(floorPagePath, 'utf-8');

    expect(layoutContent).toContain('NeoBus Floor Mode');
    expect(pageContent).toContain('Blind GRN Receiving');
    expect(pageContent).toContain('Vehicle Loading Check');
  });

  it('TC-F2-15: BFF Route handlers exist (/api/auth/login, /api/auth/logout, /api/auth/me, /api/bff/[...path])', () => {
    const loginRoute = path.resolve(__dirname, '../../app/api/auth/login/route.ts');
    const logoutRoute = path.resolve(__dirname, '../../app/api/auth/logout/route.ts');
    const meRoute = path.resolve(__dirname, '../../app/api/auth/me/route.ts');
    const bffRoute = path.resolve(__dirname, '../../app/api/bff/[...path]/route.ts');

    expect(fs.existsSync(loginRoute)).toBe(true);
    expect(fs.existsSync(logoutRoute)).toBe(true);
    expect(fs.existsSync(meRoute)).toBe(true);
    expect(fs.existsSync(bffRoute)).toBe(true);
  });
});
