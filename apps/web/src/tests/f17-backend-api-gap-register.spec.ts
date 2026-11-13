import { describe, it, expect } from 'vitest';
import { isKnownRoute, API_ROUTES } from '@neo/api-client';

describe('Phase 17: Backend API Gap Register (17_BACKEND_API_GAP_REGISTER.md)', () => {
  it('exposes a comprehensive generated route registry with > 230 routes', () => {
    expect(Array.isArray(API_ROUTES)).toBe(true);
    expect(API_ROUTES.length).toBeGreaterThan(230);
  });

  describe('2.1 Auth, RBAC, Platform & Cross-Cutting (M0)', () => {
    it('G-M0-1: Rich GET /auth/me identity & RBAC payload', () => {
      expect(isKnownRoute('GET', '/auth/me')).toBe(true);
    });

    it('G-M0-5: PIN / Password self-service recovery (/auth/forgot-pin, /auth/reset-pin)', () => {
      expect(isKnownRoute('POST', '/auth/forgot-pin')).toBe(true);
      expect(isKnownRoute('POST', '/auth/reset-pin')).toBe(true);
    });

    it('G-M0-6: User profile self-service update & password change', () => {
      expect(isKnownRoute('PATCH', '/auth/me')).toBe(true);
      expect(isKnownRoute('POST', '/auth/change-password')).toBe(true);
    });

    it('G-SRCH-1: Global cross-entity search endpoint', () => {
      expect(isKnownRoute('GET', '/search')).toBe(true);
    });

    it('G-FILE-1: Presigned upload & attachment registry', () => {
      expect(isKnownRoute('POST', '/files/presign-upload')).toBe(true);
      expect(isKnownRoute('POST', '/files/confirm')).toBe(true);
      expect(isKnownRoute('GET', '/files/Order/ord-101')).toBe(true);
    });

    it('G-RT-1: Realtime event stream (SSE)', () => {
      expect(isKnownRoute('GET', '/events/stream')).toBe(true);
    });

    it('G-PREF-1: User UI preferences & saved views', () => {
      expect(isKnownRoute('GET', '/me/preferences')).toBe(true);
      expect(isKnownRoute('PUT', '/me/preferences')).toBe(true);
    });
  });

  describe('2.2 Admin, Master Governance & System Configuration (M0 / F11)', () => {
    it('G-ADM-1: User CRUD & Role/Warehouse Assignment', () => {
      expect(isKnownRoute('GET', '/admin/users')).toBe(true);
      expect(isKnownRoute('POST', '/admin/users')).toBe(true);
      expect(isKnownRoute('PATCH', '/admin/users/usr-1')).toBe(true);
      expect(isKnownRoute('POST', '/admin/users/usr-1/reset-pin')).toBe(true);
      expect(isKnownRoute('POST', '/admin/users/usr-1/revoke-sessions')).toBe(true);
    });

    it('G-ADM-2: Role & Permission Matrix Inspection', () => {
      expect(isKnownRoute('GET', '/admin/roles')).toBe(true);
      expect(isKnownRoute('GET', '/admin/permissions')).toBe(true);
    });

    it('G-ADM-3: Warehouse & Bin CRUD', () => {
      expect(isKnownRoute('GET', '/warehouses')).toBe(true);
      expect(isKnownRoute('POST', '/warehouses')).toBe(true);
      expect(isKnownRoute('PATCH', '/warehouses/wh-1')).toBe(true);
      expect(isKnownRoute('GET', '/warehouses/wh-1/bins')).toBe(true);
      expect(isKnownRoute('POST', '/warehouses/wh-1/bins')).toBe(true);
    });

    it('G-ADM-4: Company Profile & GSTIN Configuration', () => {
      expect(isKnownRoute('GET', '/admin/company-profile')).toBe(true);
      expect(isKnownRoute('PUT', '/admin/company-profile')).toBe(true);
    });

    it('G-ADM-5: Document Numbering Series Management', () => {
      expect(isKnownRoute('GET', '/admin/numbering-series')).toBe(true);
      expect(isKnownRoute('PATCH', '/admin/numbering-series/ser-1')).toBe(true);
    });

    it('G-ADM-6: Approval Policy Threshold Configuration', () => {
      expect(isKnownRoute('GET', '/admin/approval-policies')).toBe(true);
      expect(isKnownRoute('PATCH', '/admin/approval-policies/pol-1')).toBe(true);
    });

    it('G-ADM-7: Notification Template Management', () => {
      expect(isKnownRoute('GET', '/admin/notification-templates')).toBe(true);
      expect(isKnownRoute('PATCH', '/admin/notification-templates/ORDER_CONFIRMED')).toBe(true);
    });

    it('G-ADM-8: Feature Flag Management', () => {
      expect(isKnownRoute('GET', '/admin/feature-flags')).toBe(true);
      expect(isKnownRoute('PATCH', '/admin/feature-flags/ENABLE_PORTAL')).toBe(true);
    });

    it('G-ADM-9: Detailed System Health & Diagnostics', () => {
      expect(isKnownRoute('GET', '/admin/system-health')).toBe(true);
    });

    it('G-AUD-1: Audit Log Query & Export', () => {
      expect(isKnownRoute('GET', '/audit-logs')).toBe(true);
      expect(isKnownRoute('GET', '/audit-logs/al-1')).toBe(true);
    });

    it('G-NOTIF-1 & G-NOTIF-2: Notification Delivery Logs & Retry / Send Document', () => {
      expect(isKnownRoute('GET', '/notifications/logs')).toBe(true);
      expect(isKnownRoute('POST', '/notifications/logs/nl-1/retry')).toBe(true);
      expect(isKnownRoute('POST', '/notifications/send-document')).toBe(true);
    });

    it('G-IMP-1: Bulk CSV/Excel Import Pipeline', () => {
      expect(isKnownRoute('POST', '/import/customers/validate')).toBe(true);
      expect(isKnownRoute('POST', '/import/customers/commit')).toBe(true);
    });
  });

  describe('2.3 Commercial, CRM, Catalog & Sales (M1 / F3, F4, F13)', () => {
    it('G-M1-1: Order Price Preview / Calculation Endpoint', () => {
      expect(isKnownRoute('POST', '/orders/preview')).toBe(true);
    });

    it('G-M1-2: Quotations / Estimates Module (F13)', () => {
      expect(isKnownRoute('GET', '/quotations')).toBe(true);
      expect(isKnownRoute('POST', '/quotations')).toBe(true);
      expect(isKnownRoute('POST', '/quotations/qt-1/convert-to-order')).toBe(true);
    });

    it('G-M1-3: Sales Returns & Credit Note Initiation (F13)', () => {
      expect(isKnownRoute('GET', '/sales-returns')).toBe(true);
      expect(isKnownRoute('POST', '/sales-returns')).toBe(true);
    });

    it('G-M1-4: Customer Follow-up / Activity Log (F13)', () => {
      expect(isKnownRoute('GET', '/customers/cust-1/followups')).toBe(true);
      expect(isKnownRoute('POST', '/customers/cust-1/followups')).toBe(true);
      expect(isKnownRoute('PATCH', '/customers/cust-1/followups/flw-1')).toBe(true);
    });
  });

  describe('2.4 Procurement & Accounts Payable (M2 / F5)', () => {
    it('G-AP-1 & G-AP-2: Supplier Payment Recording & AP Aging Summary', () => {
      expect(isKnownRoute('POST', '/procurement/supplier-payments')).toBe(true);
      expect(isKnownRoute('GET', '/procurement/ap/aging')).toBe(true);
    });
  });

  describe('2.5 Inventory & Warehouse (M3 / F6)', () => {
    it('G-INV-1, G-INV-2, G-INV-3: Stock Movement Ledger, Projection & Putaway', () => {
      expect(isKnownRoute('GET', '/inventory/ledger')).toBe(true);
      expect(isKnownRoute('GET', '/inventory/stock/projection')).toBe(true);
      expect(isKnownRoute('POST', '/inventory/putaway')).toBe(true);
    });
  });

  describe('2.6 Production & Factory (M4 / F7, F13)', () => {
    it('G-M4-1 & G-M4-2: BOM Cost Rollup Simulation & Factory Worker Roster CRUD', () => {
      expect(isKnownRoute('GET', '/production/boms/bom-1/cost-rollup')).toBe(true);
      expect(isKnownRoute('GET', '/production/workers')).toBe(true);
      expect(isKnownRoute('POST', '/production/workers')).toBe(true);
      expect(isKnownRoute('PATCH', '/production/workers/wrk-1')).toBe(true);
    });
  });

  describe('2.7 Logistics, Fleet & Dispatch (M5 / F8)', () => {
    it('G-FLT-1..4: Vehicle Update, Driver Roster, GPS Ping & Driver Settlement', () => {
      expect(isKnownRoute('PATCH', '/vehicles/veh-1')).toBe(true);
      expect(isKnownRoute('GET', '/drivers')).toBe(true);
      expect(isKnownRoute('POST', '/drivers')).toBe(true);
      expect(isKnownRoute('PATCH', '/drivers/drv-1')).toBe(true);
      expect(isKnownRoute('POST', '/trips/trp-1/location')).toBe(true);
      expect(isKnownRoute('GET', '/trips/trp-1/location')).toBe(true);
      expect(isKnownRoute('POST', '/trips/trp-1/settle')).toBe(true);
    });
  });

  describe('2.8 Finance, Billing & Accounts (M6 / F9)', () => {
    it('G-FIN-1..3: Finance Worklists, Credit Notes & Bank Reconciliation', () => {
      expect(isKnownRoute('GET', '/finance/worklists')).toBe(true);
      expect(isKnownRoute('GET', '/credit-notes')).toBe(true);
      expect(isKnownRoute('POST', '/credit-notes')).toBe(true);
      expect(isKnownRoute('POST', '/credit-notes/cn-1/apply')).toBe(true);
      expect(isKnownRoute('POST', '/finance/reconciliation/import')).toBe(true);
      expect(isKnownRoute('POST', '/finance/reconciliation/match')).toBe(true);
    });
  });

  describe('2.9 Dashboards, Analytics & Reports (M7b / F10, F12)', () => {
    it('G-DASH-1..3: Sales Trends, Inventory Health & Fleet Performance Analytics', () => {
      expect(isKnownRoute('GET', '/analytics/sales/trends')).toBe(true);
      expect(isKnownRoute('GET', '/analytics/inventory/health')).toBe(true);
      expect(isKnownRoute('GET', '/analytics/fleet/performance')).toBe(true);
    });

    it('G-RPT-1..5: Report Catalog, GST Reports, P&L Snapshot, Export & Schedules', () => {
      expect(isKnownRoute('GET', '/reports/catalog')).toBe(true);
      expect(isKnownRoute('POST', '/reports/sales-by-customer/run')).toBe(true);
      expect(isKnownRoute('GET', '/reports/gst/gstr1')).toBe(true);
      expect(isKnownRoute('GET', '/reports/management/pnl-snapshot')).toBe(true);
      expect(isKnownRoute('POST', '/reports/export')).toBe(true);
      expect(isKnownRoute('GET', '/reports/schedules')).toBe(true);
      expect(isKnownRoute('POST', '/reports/schedules')).toBe(true);
      expect(isKnownRoute('DELETE', '/reports/schedules/sch-1')).toBe(true);
    });
  });

  describe('2.10 Document Rendering & PDF Generation (F12)', () => {
    it('G-DOC-1..6: Unified & Convenience PDF Endpoints', () => {
      expect(isKnownRoute('GET', '/invoices/inv-1/pdf')).toBe(true);
      expect(isKnownRoute('GET', '/orders/ord-1/pdf')).toBe(true);
      expect(isKnownRoute('GET', '/trips/trp-1/manifest-pdf')).toBe(true);
      expect(isKnownRoute('GET', '/procurement/pos/po-1/pdf')).toBe(true);
      expect(isKnownRoute('GET', '/collections/col-1/pdf')).toBe(true);
      expect(isKnownRoute('GET', '/documents/invoice/inv-1/pdf')).toBe(true);
    });
  });
});
