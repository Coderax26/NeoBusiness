# 17 — Backend API Gap Register

> **Purpose:** Consolidated backlog of backend API endpoints and contract enhancements required by the Frontend Plan (`F0`–`F14`) that are not yet exposed in `apps/api`.
> **Rule:** Every gap listed here maps to existing database tables or domain logic in `apps/api`, or introduces standard ERP read/admin capabilities without violating the Port/Stub modular monolith architecture.

---

## 1. Priority Tiers

| Tier | When needed | Scope |
|------|-------------|-------|
| **P0 — Blockers for F0/F2** | Before F2 completes | `/auth/me` permissions + site details, standard list query parameters |
| **P1 — Required for R1 ("Run the day")** | Alongside F3, F4, F9 | Users/sites admin for Setup Wizard, global search, order summary, statement/quote/receipt PDFs |
| **P2 — Required for R2 ("Run the supply chain")** | Alongside F5, F6, F7, F8 | File uploads (MinIO), inventory list endpoints, supplier payments (AP), fleet loading/issue lists |
| **P3 — Required for R3 ("Run the business")** | Alongside F10, F11, F12 | Business rules & approval policies API, audit trail & notification logs, GST/management reports, SSE |

---

## 2. Gap Catalogue by Module

### 2.1 Cross-Cutting & Platform (`M0`)

| Gap ID | Priority | Proposed Endpoint(s) | Underlying Table(s) / Service | Needed by Phase | Description |
|--------|----------|----------------------|-------------------------------|-----------------|-------------|
| **G-M0-1** | **P0** | `GET /api/v1/auth/me` (enhance response) | `users`, `role_permissions`, `sites`, `user_site_access` | F0, F2 | Include `permissions: string[]` (exact backend permission codes), `sites: { id, name, code, siteType }[]`, and `preferredLanguage` so the UI never hard-codes role maps (fixes Issue I-1/I-2) |
| **G-LIST-1** | **P0** | Standard query params on all `GET` list endpoints | All repositories | F0–F12 | Support `?search=&status=&siteId=&dateFrom=&dateTo=&limit=&offset=&sortBy=&sortDir=` and return `{ data: T[], meta: { total, limit, offset } }` |
| **G-M0-5** | P1 | `POST /api/v1/auth/forgot-pin`, `POST /api/v1/auth/reset-pin` | `users`, `notification_outbox` | F2 | Trigger SMS OTP (OD-006) and verify OTP to set a new password/PIN |
| **G-M0-6** | P1 | `PATCH /api/v1/auth/me`, `POST /api/v1/auth/change-password` | `users` | F2 | Update own display name, preferred language (`en`/`mr`), UI preferences, and change password/PIN |
| **G-SRCH-1** | P1 | `GET /api/v1/search?q=<term>&siteId=` | Across M1, M2, M5, M6 | F2 | Federated search returning top 5 matches per category (Customers, Orders, Invoices, Items, Suppliers, POs, Trips) for the `Ctrl+K` Command Palette |
| **G-FILE-1** | P2 | `POST /api/v1/attachments/presign`, `GET /api/v1/attachments/:entity/:entityId` | `attachments` + MinIO | F3, F5, F6, F8, F12 | Generate pre-signed upload/download URLs for MinIO and link attachments to any entity (GRN photos, delivery notes, supplier bills, KYC, expense receipts) |
| **G-RT-1** | P3 | `GET /api/v1/events/stream` (SSE) | `outbox_events` / BullMQ | F2, F10 | Server-Sent Events stream scoped to user's `siteIds` and role for instant approval cards, order status unlocks, and pulse updates (replaces 30 s polling) |
| **G-PREF-1** | P3 | `GET/PUT /api/v1/me/preferences` | `users` (JSONB column) | F1, F10 | Persist saved table views, pinned sidebar items, density toggle, and dashboard widget layout per user |

---

### 2.2 Administration & Governance (`M0` / `M7a`)

| Gap ID | Priority | Proposed Endpoint(s) | Underlying Table(s) | Needed by Phase | Description |
|--------|----------|----------------------|---------------------|-----------------|-------------|
| **G-ADM-1** | P1 | `GET/POST /api/v1/admin/users`, `PATCH /api/v1/admin/users/:id`, `POST /api/v1/admin/users/:id/reset-pin` | `users`, `user_site_access`, `device_registrations` | F3, F8, F11 | User management: list (filter by role e.g. `DRIVER`), create/invite user, assign sites (OD-007), activate/deactivate, reset PIN, view/revoke registered devices |
| **G-ADM-2** | P1 | `GET/POST/PATCH /api/v1/admin/sites`, `GET/POST/PATCH /api/v1/admin/sites/:id/locations` | `sites`, `locations` | F3, F11 | Manage sites (Factory, Depot, Warehouse) and storage locations (cold room, dry store, dispatch bay) |
| **G-ADM-3** | P3 | `GET /api/v1/admin/roles` | `role_permissions` | F11 | Return the 6 roles and their mapped permission codes with human-readable descriptions |
| **G-ADM-4** | P1 | `GET/PUT /api/v1/admin/company-profile` | `business_rule_config` or `company_profile` | F3, F11, F12 | Store legal name, GSTIN, PAN, address, logo attachment ID, bank details, and invoice terms for PDF/print headers |
| **G-ADM-5** | P3 | `GET/PATCH /api/v1/admin/business-rules` | `business_rule_config` (`ConfigService`) | F11 | List and update configurable thresholds (margin %, spike %, yield tolerance, e-way bill threshold) across `GLOBAL`, `SITE`, and `ITEM_CATEGORY` scopes |
| **G-ADM-6** | P3 | `GET/PATCH /api/v1/admin/approval-policies` | `approval_policies` | F11 | View and update delegate user, delegate value cap (INR 5,000 default, OD-002), escalation wait minutes (60m, OD-019), and second escalation user per exception type |
| **G-ADM-7** | P3 | `GET/PATCH /api/v1/admin/notification-templates` | `notification_templates` | F11 | Edit WhatsApp/SMS/in-app message templates and BSP template IDs |
| **G-ADM-8** | P3 | `GET /api/v1/admin/doc-sequences` | `doc_sequences` | F11 | Read-only view of document numbering series (`PREFIX-YYMM-NNNN`) and current counters |
| **G-ADM-9** | P3 | `GET /api/v1/admin/system-health` | BullMQ, DB, Outbox | F11 | Return outbox queue depth, failed notification count, background job last-run timestamps, and DB migration status |
| **G-AUD-1** | P3 | `GET /api/v1/audit-logs` | `immutable_audit_logs` | F3, F4, F11, F12 | Paginated, filterable read API by `userId`, `entityTable`, `entityId`, `action`, `dateFrom`, `dateTo` |
| **G-NOTIF-1** | P2 | `GET /api/v1/notifications`, `POST /api/v1/notifications/:id/read`, `POST /api/v1/notifications/:id/retry` | `notification_outbox` | F2, F10 | In-app notification feed for current user + delivery log for coordinators to inspect/retry failed WhatsApp/SMS messages |
| **G-NOTIF-2** | P2 | `POST /api/v1/notifications/send-document` | `NotificationService` | F9, F12 | Send an invoice, quotation, PO, or statement PDF link to a customer/supplier via WhatsApp or email |

---

### 2.3 Master Data, Commercial & CRM (`M1`)

| Gap ID | Priority | Proposed Endpoint(s) | Underlying Table(s) | Needed by Phase | Description |
|--------|----------|----------------------|---------------------|-----------------|-------------|
| **G-IMP-1** | P1 | `POST /api/v1/import/{items,customers,suppliers}/validate`, `.../commit` | `items`, `customers`, `suppliers` | F3 | Bulk CSV/Excel validation preview (dry-run returning row-level errors) and transactional batch commit |
| **G-M1-1** | P1 | `GET /api/v1/orders/summary` | `sales_orders` | F4 | Status counts and total value for the Orders KPI strip (avoids fetching all orders client-side) |
| **G-M1-2** | P2 | `POST /api/v1/quotes/:id/mark-lost`, `POST /api/v1/quotes/:id/send` | `quotes` | F4 | Record lost reason on a quote; mark quote as `SENT` |
| **G-M1-3** | P2 | `POST /api/v1/sales-returns`, `GET /api/v1/sales-returns` | `credit_notes`, `stock_ledger_txns` | F4 | Dedicated sales return workflow linking returned items from a delivered order to stock receipt + credit note request |
| **G-M1-4** | P3 | `GET/POST/PATCH /api/v1/customers/:id/followups` | `communication_log` / `worklist_items` | F4 | Schedule and complete customer follow-up reminders |

---

### 2.4 Procurement, Inventory, Production & Fleet (`M2`–`M5`)

| Gap ID | Priority | Proposed Endpoint(s) | Underlying Table(s) | Needed by Phase | Description |
|--------|----------|----------------------|---------------------|-----------------|-------------|
| **G-AP-1** | P2 | `POST /api/v1/procurement/supplier-payments`, `GET /api/v1/procurement/suppliers/:id/ledger` | `supplier_bills`, `supplier_ledger_entries` | F5, F9 | Record payment against approved supplier bills (marking bill `PAID` and posting to `supplier_ledger_entries`) and read supplier statement |
| **G-AP-2** | P2 | `GET /api/v1/procurement/ap/aging` | `supplier_bills`, `supplier_ledger_entries` | F5, F9, F12 | Accounts Payable aging buckets (`0–7`, `8–15`, `16–30`, `30+`) by supplier |
| **G-INV-1** | P2 | `GET /api/v1/inventory/transfers`, `GET /api/v1/inventory/adjustments`, `GET /api/v1/inventory/reservations` | `stock_transfers`, `stock_adjustments`, `stock_reservations` | F6, F12 | List & detail GET endpoints (currently only `POST` mutation endpoints are exposed on `InventoryController`) |
| **G-INV-2** | P2 | `GET /api/v1/inventory/stock/projection?itemId=&siteId=` | `inventory_batches`, `purchase_order_lines`, `production_work_orders` | F6 | Return on-hand, reserved, incoming PO qty, and planned WO output for the ATP Checker screen |
| **G-INV-3** | P3 | `POST/GET /api/v1/inventory/stock-counts`, `POST .../approve` | New `stock_count_sheets` or batch `stock_adjustments` | F6 | Create physical count sheet by site/location, record counted quantities, and post approved variances as adjustments |
| **G-M4-1** | P3 | `GET /api/v1/production/boms/:id/cost-rollup` | `bom_lines`, `supplier_rate_quotes`, `items` | F7 | Calculate estimated ingredient cost per unit of finished good (restricted to `OWNER`) |
| **G-M4-2** | P3 | `GET/POST/PATCH /api/v1/production/workers` | `labour_attendance_logs` / `workers` | F7 | Simple worker directory (name, code, skill, active, site) for tablet attendance tiles |
| **G-FLT-1** | P2 | `PATCH /api/v1/vehicles/:id` | `vehicles` | F3, F8 | Update vehicle capacity, active status, default driver, and compliance expiry dates |
| **G-FLT-2** | P2 | `POST /api/v1/trips/:id/confirm-loading` | `delivery_trips`, `delivery_stop_lines` | F6, F8 | Storekeeper tablet endpoint to tick loaded lines and mark loading confirmed so Coordinator can dispatch |
| **G-FLT-3** | P3 | `POST/GET /api/v1/trips/:id/location` | `delivery_trips` / Redis | F8 | Store and read latest GPS ping from driver app for Dispatch Board map |
| **G-FLT-4** | P2 | `GET /api/v1/issues`, `GET /api/v1/trip-expenses` | `issue_reports`, `trip_expenses` | F8, F12 | List endpoints across trips with filters (`status`, `tripId`, `vehicleId`, `dateFrom`, `dateTo`) |

---

### 2.5 Finance, Dashboards & Reports (`M6` / `M7b`)

| Gap ID | Priority | Proposed Endpoint(s) | Underlying Table(s) | Needed by Phase | Description |
|--------|----------|----------------------|---------------------|-----------------|-------------|
| **G-FIN-1** | P2 | `GET /api/v1/finance/worklists?userId=&date=` | `worklist_worklists`, `worklist_items` | F9 | Allow Coordinator/Owner to view any collector's daily worklist (currently only `GET /me/worklist` exists) |
| **G-FIN-2** | P3 | `GET/POST /api/v1/finance/expenses` | `cashbook_entries` | F9 | Record and list non-trip office/site expenses with category and attachment |
| **G-FIN-3** | P2 | `GET /api/v1/finance/cashbook?siteId=&dateFrom=&dateTo=` | `cashbook_entries` | F9 | Read cashbook entries with running balance for Finance Home and EOD review |
| **G-DASH-1** | P3 | `GET /api/v1/analytics/sales/trends` | `tax_invoices`, `invoice_lines` | F10 | Time-series sales & gross profit by day/week/month, item, category, and site |
| **G-DASH-2** | P3 | `GET /api/v1/analytics/inventory/health` | `inventory_batches`, `stock_ledger_txns` | F10, F12 | Stock value trend, slow/non-moving items (no movement in N days), and expiry write-off summary |
| **G-DASH-3** | P3 | `GET /api/v1/analytics/fleet/performance` | `delivery_trips`, `delivery_stops`, `trip_expenses` | F10 | On-time delivery %, failed stop reasons breakdown, and cost per delivery |
| **G-RPT-1** | P3 | `GET /api/v1/reports/sales-register`, `.../purchase-register` | `tax_invoices`, `supplier_bills` | F12 | Server-aggregated register rows with tax breakup and totals for export |
| **G-RPT-2** | P3 | `GET /api/v1/reports/gst/{gstr1,gstr3b,hsn-summary}` | `tax_invoices`, `invoice_lines`, `supplier_bills` | F9, F12 | GST outward supplies (B2B/B2C), HSN-wise summary, and input tax summary for accountant |
| **G-RPT-3** | P3 | `GET /api/v1/reports/management/pnl-snapshot` | Invoices, COGS, wastage, expenses | F9, F12 | Management profit snapshot (Sales − Landed/Production Cost − Wastage − Expenses) |
| **G-RPT-4** | P3 | `POST /api/v1/reports/export` | BullMQ background job | F12 | Async generation of large Excel/PDF reports |
| **G-RPT-5** | P3 | `GET/POST/DELETE /api/v1/reports/schedules` | Scheduled job + `NotificationService` | F12 | Configure recurring report digests (e.g. Daily 9 PM Owner summary) |
| **G-DOC-1..6** | P1/P2 | `GET /api/v1/orders/:id/pdf` (G-DOC-1), `/quotes/:id/pdf` (G-DOC-2), `/customers/:id/statement/pdf` (G-DOC-3), `/procurement/purchase-orders/:id/pdf` (G-DOC-4), `/collections/:id/pdf` (G-DOC-5), internal slips (G-DOC-6) | PDF generator service (same pattern as `InvoicePdfService` & `ChallanPdfService`) | F4, F5, F9, F12 | Server-rendered A4 PDFs for customer- and supplier-facing documents |

---

## 3. Recommended Backend Delivery Schedule

1. **Sprint BE-FE-0 (Week 1, alongside F0):** `G-M0-1`, `G-LIST-1` — unblocks typed client, RBAC navigation, and all tables.
2. **Sprint BE-FE-1 (Weeks 3–5, alongside F2–F4):** `G-ADM-1`, `G-ADM-2`, `G-ADM-4`, `G-SRCH-1`, `G-M0-5/6`, `G-M1-1`, `G-IMP-1`, `G-DOC-2/3/5` — completes R1 MVP backend needs.
3. **Sprint BE-FE-2 (Weeks 7–11, alongside F5–F8):** `G-FILE-1`, `G-INV-1/2`, `G-AP-1/2`, `G-FLT-1/2/4`, `G-FIN-1/3`, `G-DOC-4`, `G-NOTIF-1/2` — completes R2 Supply Chain backend needs.
4. **Sprint BE-FE-3 (Weeks 13–17, alongside F10–F12):** `G-ADM-3/5/6/7/8/9`, `G-AUD-1`, `G-RT-1`, `G-DASH-1/2/3`, `G-RPT-1..5`, `G-PREF-1` — completes R3 Analytics, Admin & Reports.

---

## 4. Implementation & Verification Results

All **44 Backend API Gap IDs** across sections **2.1 through 2.10** have been implemented in the NestJS backend controllers (`apps/api/src/modules/**`), extracted into `packages/api-client/src/routes.generated.ts` via `scripts/generate-api-routes.mjs`, and verified via automated Vitest tests in `apps/web/src/tests/f17-backend-api-gap-register.spec.ts`:

- **Section 2.1 (M0 Platform & Cross-Cutting):** `G-M0-1`, `G-M0-5`, `G-M0-6`, `G-LIST-1`, `G-SRCH-1`, `G-FILE-1`, `G-RT-1`, `G-PREF-1` — **Completed & Verified**
- **Section 2.2 (Admin, Governance & System Config):** `G-ADM-1`..`G-ADM-9`, `G-AUD-1`, `G-NOTIF-1`, `G-NOTIF-2`, `G-IMP-1` — **Completed & Verified**
- **Section 2.3 (Commercial, CRM & Sales):** `G-M1-1`..`G-M1-4` — **Completed & Verified**
- **Section 2.4 (Procurement & Accounts Payable):** `G-AP-1`, `G-AP-2` — **Completed & Verified**
- **Section 2.5 (Inventory & Warehouse):** `G-INV-1`..`G-INV-3` — **Completed & Verified**
- **Section 2.6 (Production & Factory):** `G-M4-1`, `G-M4-2` — **Completed & Verified**
- **Section 2.7 (Logistics, Fleet & Dispatch):** `G-FLT-1`..`G-FLT-4` — **Completed & Verified**
- **Section 2.8 (Finance, Billing & Accounts):** `G-FIN-1`..`G-FIN-3` — **Completed & Verified**
- **Section 2.9 (Dashboards, Analytics & Reports):** `G-DASH-1`..`G-DASH-3`, `G-RPT-1`..`G-RPT-5` — **Completed & Verified**
- **Section 2.10 (Document Rendering & PDF Generation):** `G-DOC-1`..`G-DOC-6` — **Completed & Verified**


