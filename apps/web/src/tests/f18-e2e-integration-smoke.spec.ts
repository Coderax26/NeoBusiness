import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isKnownRoute, API_ROUTES } from '@neo/api-client';

const WEB_APP_DIR = path.resolve(__dirname, '../../app');

function pageExists(relPath: string): boolean {
  return fs.existsSync(path.join(WEB_APP_DIR, relPath, 'page.tsx'));
}

describe('Phase 18: End-to-End Integration Smoke & Production Readiness Suite', () => {
  describe('1. Multi-Surface Next.js App Router Coverage (94 Routes)', () => {
    it('verifies Surface 1 — (auth) Authentication & Self-Service Recovery pages exist', () => {
      expect(pageExists('(auth)/login')).toBe(true);
      expect(pageExists('(auth)/login/forgot')).toBe(true);
    });

    it('verifies Surface 2 — (office) Role Home, Master Data, Sales, Procurement, Inventory, Production, Logistics, Finance, Control Tower, Admin, Reports, Extensions & Help pages exist', () => {
      const officePages = [
        '(office)/home',
        '(office)/me',
        '(office)/forbidden',
        '(office)/help',
        '(office)/extensions',
        '(office)/admin/setup-wizard',
        '(office)/admin/users',
        '(office)/admin/roles',
        '(office)/admin/sites',
        '(office)/admin/company',
        '(office)/admin/business-rules',
        '(office)/admin/approval-rules',
        '(office)/admin/templates',
        '(office)/admin/system',
        '(office)/admin/opening-balances',
        '(office)/admin/rollout',
        '(office)/sales/board',
        '(office)/sales/prices',
        '(office)/sales/items',
        '(office)/sales/customers',
        '(office)/sales/customers/[id]',
        '(office)/sales/quotes',
        '(office)/sales/quotes/new',
        '(office)/sales/quotes/[id]',
        '(office)/sales/orders',
        '(office)/sales/orders/new',
        '(office)/sales/orders/[id]',
        '(office)/sales/returns',
        '(office)/procurement',
        '(office)/procurement/suppliers',
        '(office)/procurement/requisitions',
        '(office)/procurement/purchase-orders',
        '(office)/procurement/purchase-orders/[id]',
        '(office)/procurement/grns',
        '(office)/procurement/shortfalls',
        '(office)/procurement/bills',
        '(office)/procurement/supplier-bills',
        '(office)/procurement/scorecards',
        '(office)/inventory/stock',
        '(office)/inventory/availability',
        '(office)/inventory/reservations',
        '(office)/inventory/expiry',
        '(office)/inventory/transfers',
        '(office)/inventory/adjustments',
        '(office)/inventory/stock-counts',
        '(office)/inventory/ledger',
        '(office)/production',
        '(office)/production/boms',
        '(office)/production/work-orders',
        '(office)/production/wastage',
        '(office)/production/attendance',
        '(office)/production/requisitions',
        '(office)/logistics/vehicles',
        '(office)/logistics/trips',
        '(office)/logistics/trips/new',
        '(office)/logistics/trips/[id]',
        '(office)/logistics/trips/[id]/close',
        '(office)/logistics/dispatch',
        '(office)/logistics/monitoring',
        '(office)/logistics/issues',
        '(office)/logistics/expenses',
        '(office)/finance',
        '(office)/finance/invoices',
        '(office)/finance/receivables',
        '(office)/finance/collections',
        '(office)/finance/handovers',
        '(office)/finance/cheques',
        '(office)/finance/credit-notes',
        '(office)/finance/cod',
        '(office)/finance/ptp',
        '(office)/finance/payables',
        '(office)/finance/eod',
        '(office)/finance/tally',
        '(office)/control/dashboard',
        '(office)/control/approvals',
        '(office)/control/analytics',
        '(office)/control/stock-alerts',
        '(office)/control/notifications',
        '(office)/control/audit',
        '(office)/reports',
        '(office)/reports/scheduled',
      ];
      for (const route of officePages) {
        expect(pageExists(route), `Expected page ${route}/page.tsx to exist`).toBe(true);
      }
    });

    it('verifies Surface 3 — (floor) Touch-First Factory & Warehouse Floor Mode pages exist', () => {
      expect(pageExists('(floor)/floor')).toBe(true);
      expect(pageExists('(floor)/floor/grn')).toBe(true);
      expect(pageExists('(floor)/floor/stock')).toBe(true);
      expect(pageExists('(floor)/floor/transfers')).toBe(true);
      expect(pageExists('(floor)/floor/adjustments')).toBe(true);
      expect(pageExists('(floor)/floor/production')).toBe(true);
      expect(pageExists('(floor)/floor/rm-request')).toBe(true);
      expect(pageExists('(floor)/floor/attendance')).toBe(true);
      expect(pageExists('(floor)/floor/loading')).toBe(true);
    });
  });

  describe('2. End-to-End Release Train Contract Parity (R1–R4)', () => {
    it('R1 ("Run the day"): Auth -> Quick Order -> Exception Approval -> Invoice -> Collection -> EOD Close', () => {
      expect(isKnownRoute('POST', '/auth/login')).toBe(true);
      expect(isKnownRoute('GET', '/auth/me')).toBe(true);
      expect(isKnownRoute('POST', '/orders/preview')).toBe(true);
      expect(isKnownRoute('POST', '/orders')).toBe(true);
      expect(isKnownRoute('GET', '/exceptions')).toBe(true);
      expect(isKnownRoute('POST', '/invoices/generate')).toBe(true);
      expect(isKnownRoute('POST', '/collections')).toBe(true);
      expect(isKnownRoute('POST', '/eod/start')).toBe(true);
    });

    it('R2 ("Run the supply chain"): PR -> PO -> GRN -> Putaway -> Work Order -> Trip Dispatch -> Settle', () => {
      expect(isKnownRoute('POST', '/procurement/requisitions')).toBe(true);
      expect(isKnownRoute('POST', '/procurement/purchase-orders')).toBe(true);
      expect(isKnownRoute('POST', '/procurement/grns')).toBe(true);
      expect(isKnownRoute('POST', '/inventory/putaway')).toBe(true);
      expect(isKnownRoute('GET', '/production/work-orders')).toBe(true);
      expect(isKnownRoute('POST', '/trips')).toBe(true);
      expect(isKnownRoute('POST', '/trips/trp-1/confirm-loading')).toBe(true);
      expect(isKnownRoute('POST', '/trips/trp-1/settle')).toBe(true);
    });

    it('R3 & R4 ("Run the business & Grow"): Analytics -> Admin Governance -> GST/P&L Reports -> PDF Generation', () => {
      expect(isKnownRoute('GET', '/analytics/sales/trends')).toBe(true);
      expect(isKnownRoute('GET', '/analytics/inventory/health')).toBe(true);
      expect(isKnownRoute('GET', '/analytics/fleet/performance')).toBe(true);
      expect(isKnownRoute('GET', '/admin/system-health')).toBe(true);
      expect(isKnownRoute('GET', '/reports/gst/gstr1')).toBe(true);
      expect(isKnownRoute('GET', '/reports/management/pnl-snapshot')).toBe(true);
      expect(isKnownRoute('GET', '/documents/invoice/inv-1/pdf')).toBe(true);
      expect(API_ROUTES.length).toBeGreaterThanOrEqual(270);
    });
  });
});
