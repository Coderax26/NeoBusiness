# 01 — Codebase Review & Gap Analysis

> Review date: 2026-11-12 · Reviewed: `apps/api`, `apps/web`, `apps/tablet`, `packages/*`, `db/migrations`, `docs/*`

---

## 1. Executive summary

| Area | Finding | Impact on frontend |
|------|---------|--------------------|
| Backend API | **35 controllers, 219 endpoints**, prefix `/api/v1`, Swagger at `/api-docs`, JWT (15 min access / 7 day refresh), RBAC per endpoint, RLS per site | Strong base — most business screens can be built directly |
| Domain coverage | M0 Platform, M1 Commercial, M2 Procurement, M3 Inventory, M4 Production, M5 Fleet, M6 Finance, M7a Exceptions, M7b Dashboards — all marked ✅ | Every module gets a full screen set |
| Current web app | `apps/web` = logic-only TS stores (`desks/*.ts`, `control-tower.store.ts`, `session-manager.ts`) + one static `public/control-tower.html` + a hand-written `serve.mjs` proxy | **No real web app exists.** Needs a proper framework app, routing, components, forms, tables |
| Current tablet app | `apps/tablet/src/index.ts` (single file, offline outbox logic) | Logic can be reused; UI must be built (recommended as "Floor Mode" inside web — see F0) |
| Shared packages | `@neo/shared` (business-rule previews, formatters, permissions/nav), `@neo/api-client` (hand-written client), `@neo/i18n` (en + mr), `@neo/ui` (token stubs), `@neo/mocks` | Reusable, but need hardening (see §4) |
| Admin/Platform APIs | M0 exposes **only** `auth/login`, `auth/refresh`, `auth/logout`, `auth/me` | **No API** for users, roles, sites, locations, business-rule config, approval policies, audit log, notification log/templates → 🔴 gaps |
| Realtime | No SSE / WebSocket endpoint | Live dashboard/approvals must poll every 30 s (OD-021) until SSE is added |
| File upload | No upload / pre-signed URL endpoint (MinIO exists in docker-compose, `attachments` table exists) | Photos, delivery notes, documents need a backend endpoint |
| Lists | Pagination is inconsistent (`limit/offset` on only ~4 endpoints; most lists return all rows; no common `search`/`sort`) | Need a standard list contract for large tables |

---

## 2. Backend API inventory → screen mapping

### M0 — Platform (`/auth`)
| Endpoint | Screen |
|----------|--------|
| `POST /auth/login`, `/refresh`, `/logout` | Login, silent token refresh, logout |
| `GET /auth/me` | Session bootstrap: name, role, `siteIds`, language. ⚠ **does not return the permission list** |

### M1 — Commercial & CRM
| Controller | Endpoints | Screens |
|------------|-----------|---------|
| `customers` | CRUD, `PATCH :id/credit`, contacts, communication log, `price-memory` | Customer list, Customer 360, credit limit editor, contacts tab, activity timeline |
| `items` | CRUD, `sku/:skuCode`, UoM conversions | Item master, UoM setup, SKU lookup |
| `orders` | create, confirm, request-override, accept-counter, cancel, list, detail, evaluate-credit | Quick Order Entry, Order tracker, Order detail |
| `prices` | `today`, `:date`, `PUT :date`, `missing/:date` | Daily Price Sheet |
| `quotes` | create, list, detail, convert | Quotes workbench |

### M2 — Procurement (`/procurement/*`)
| Controller | Screens |
|------------|---------|
| `suppliers` (14 endpoints: CRUD, items, approved suppliers per item, rates, latest-rate, performance, reliability, missing-rate alerts) | Supplier master, supplier items, rate card, performance |
| `purchase-orders` (create, list, lines, confirm-quantities, issue, cancel, by sales order) | PO list, PO builder, PO detail |
| `requisitions` (create, list, grouped by supplier, convert-to-po, cancel, by source) | Requisition board, "convert to PO" wizard |
| `grns` (create, list, lines, blind-view, shortfalls, supplier open shortfalls) | GRN list, Blind GRN (Floor Mode) |
| `shortfalls` (by PO, coverable, all open, ranked backups, create backup PO, auto-resolve, status) | Shortfall workbench |
| `supplier-bills` (create, submit, approve, reject, list, detail) | Supplier bills / 3-way match |

### M3 — Inventory (`/inventory/*`)
`stock/atp`, `stock/current`, `ledger`, `expiry-watchlist`, reservations (create/release), transfers (create/dispatch/receive/complete/cancel), `grn`, adjustments (create/approve/reject) → Stock overview, ATP checker, Ledger explorer, Expiry watchlist, Transfers, Adjustments.

### M4 — Production (`/production/*`)
`boms` (CRUD, active, activate), `work-orders` (create, list, start, consumption, output, complete, cancel), `wastage`, `attendance`, `requisitions` (create, generate, approve, convert-to-po, cancel, delete) → BOM/recipe master, Production plan, Kanban, Work-order detail, Wastage log, Attendance, RM requests.

### M5 — Fleet (root)
`vehicles` (list/create), `trips` (list/create/detail/dispatch/close), challan generate + PDF, `me/trip`, `stops/:id/deliver|fail`, trip issues + resolve, trip expenses → Vehicle register, Trip builder, Dispatch board, Trip detail, Issue desk, Expenses. (`me/trip`, deliver, fail are driver-app endpoints; web shows read-only.)

### M6 — Finance
| Controller | Screens |
|------------|---------|
| `invoices` (generate, list, detail, PDF, cancel) | Invoice register, invoice viewer |
| `collections` (log, allocate, list, detail, `me/collections`) | Collections register, allocation |
| customer ledger (`customers/:id/ledger`, `ar-balance`, `finance/ar/aging`, `open-invoices`, `me/worklist`) | Customer statement, AR aging, open invoices |
| handovers (`me/wallet`, `custody/expected/:userId`, create, verify, resolve, list, detail) | Cash handover desk |
| `cheques` (list, detail, deposit, clear, bounce, return) | Cheque register |
| `credit-notes` (create, list, detail, approve, reject, cancel) | Credit notes |
| `cod-settlements` (pending, settle, detail) | COD settlement |
| `ptp` (create, update, due, list, detail) | Promise-to-pay follow-ups |
| `eod` (start, by date, checklist, signoff, deposit slip, PDF) | End-of-Day closing |
| `tally` (export, batches) | Tally export |
| `finance/opening-balances` (template, draft, import, reverse) | Opening balance import wizard |

### M7a — Exceptions & notifications
`exceptions` (list, detail, resolve), `devices/register` → Approvals centre, exception detail, resolution dialog. 12 exception types: `PRICE_OVERRIDE`, `CREDIT_BREACH`, `SUPPLIER_PRICE_SPIKE`, `SUPPLIER_SHORTFALL`, `YIELD_VARIANCE`, `WASTAGE_WRITEOFF`, `STOCK_VARIANCE`, `CASH_HANDOVER_VARIANCE`, `DELIVERY_DISPUTE`, `CREDIT_REBATE_WRITEOFF`, `MANUAL_LEDGER_ADJUSTMENT`, `COD_ONLY`.

### M7b — Dashboards
`dashboard/pulse|status-matrix|eod|kpis`, `analytics/customers/profitability|suppliers/scorecard|factory/yield-trend|ar/aging`, `stock-alerts` (list, counts, by-type) → Control Tower, Analytics, Stock alerts.

---

## 3. Data model highlights relevant to UI

- **Sites & locations** (`sites`, `locations`, `user_site_access`) → site switcher; Owner sees "All sites".
- **Statuses** enforced in DB (examples):
  - Order: `DRAFT → PENDING_APPROVAL → CONFIRMED → IN_PRODUCTION_SOURCING → READY → DISPATCHED → DELIVERED_FULL/PARTIAL → CLOSED` (+ `CANCELLED`, `REJECTED`)
  - Quote: `DRAFT, SENT, CONVERTED, EXPIRED, LOST`
  - PO: `DRAFT, PENDING_APPROVAL, ISSUED, PARTIALLY_RECEIVED, CLOSED, CANCELLED`
  - Shortfall: `OPEN, COVERED_BY_BACKUP, ALLOCATED, WRITTEN_OFF`
  - Supplier bill: `RECEIVED, VERIFIED, APPROVED, PAID, DISPUTED` + 3-way status `MATCHED, TIMING_MISMATCH, AMOUNT_MISMATCH, FULL_MISMATCH`
- **Append-only** ledgers (stock, customer, custody, supplier, receipts, audit) → UI never offers edit/delete, only "Reverse with reason".
- **Masked roles:** PROD_MGR, DRIVER, STOREKEEPER never receive price/cost/margin/AR fields (`PriceMasker`). Blind GRN hides ordered qty and price (BR-05).
- **Money** `numeric(14,2)` returned as strings — UI must not use float maths; format only.
- **Doc numbers** `PREFIX-YYMM-NNNN` → show prominently and make searchable.

---

## 4. Issues found in existing frontend assets

| # | Issue | Evidence | Recommendation |
|---|-------|----------|----------------|
| I-1 | **Permission codes mismatch** between frontend and backend | `packages/shared/src/permissions.ts` uses `customer.read`, `customer.write`, `trip.create`, `cheque.manage`; backend uses `customer.view`, `customer.modify`, `fleet.manage`, `receipt.verify_handover` | Generate the permission list from the backend (`role_permissions`) and return it from `/auth/me`. Delete the hard-coded `ROLE_PERMISSIONS` map |
| I-2 | `/auth/me` returns no permissions | `auth.controller.ts → getUserWithSites` returns `users` row + `siteIds` | Add `permissions[]`, `sites[]` (id, name, type), `preferredLanguage` to `/auth/me` |
| I-3 | Hand-written API client | `packages/api-client/src/index.ts` (~10 KB) | Generate typed client from Swagger (`/api-docs-json`) so types never drift |
| I-4 | Float maths in UI models | `commercial-desk.ts` uses `number` for `unitPrice`, `floorPrice` | Keep amounts as strings; use `decimal.js` (already a backend dependency) only for previews |
| I-5 | Deep relative imports | `'../../../../packages/shared/src/index.js'` | Use workspace package names (`@neo/shared`) via npm workspaces |
| I-6 | Static HTML prototype | `public/control-tower.html` (26 KB, Tailwind CDN) | Treat as a visual reference only; rebuild as components |
| I-7 | Tests validate logic, not UI | `p3-frontend-delivery.spec.ts` | Keep as unit tests for business-preview helpers; add component + E2E tests |
| I-8 | Separate tablet package duplicates shell/auth | `apps/tablet` | Recommend a single web app with a touch "Floor Mode" route group + PWA (decision D-1 in F0) |

---

## 5. Gap analysis vs. typical ERP systems

Legend: ✅ backend ready · 🟡 partial · 🔴 needs backend · 🔵 Phase 2+

| ERP capability | NeoBus status | Notes |
|----------------|---------------|-------|
| Sales orders, quotes, pricing | ✅ | Daily floor/target pricing is a NeoBus strength |
| Customer master + credit control | ✅ | Credit meter, BR-02 |
| CRM leads / opportunities pipeline | 🔵 | Only contacts + communication log exist |
| Sales returns | 🟡 | Credit notes + delivery returns exist; no dedicated return order |
| Purchase requisition → PO → GRN → bill | ✅ | Including 3-way match status |
| Supplier payments (AP) | 🔴 | Supplier bills reach `APPROVED/PAID`, but no payment recording endpoint |
| Inventory, batches, FEFO, expiry, transfers | ✅ | |
| Physical stock count / cycle count | 🔴 | Only adjustments; no count sheet workflow |
| Barcode / label printing | 🔵 | |
| BOM, work orders, wastage, yield | ✅ | |
| Production planning / MRP | 🟡 | `requisitions/generate` exists; no capacity planning |
| Quality control (QC checks) | 🔵 | |
| Fleet, trips, ePOD, challan, e-way ref | ✅ | |
| Invoicing (GST mixed lines), PDF | ✅ | e-Invoice disabled for MVP (OD-004) |
| Collections, custody, cheques, PTP, COD | ✅ | Very complete |
| General ledger / chart of accounts / P&L / balance sheet | 🔴 / via Tally | OD-018: accounting target is Tally Prime XML export |
| Bank reconciliation | 🔵 | |
| Expense management (non-trip) | 🔴 | Only trip expenses |
| GST returns reports (GSTR-1/3B summaries) | 🔴 | Data exists in invoice lines; needs report endpoints |
| HR, attendance, payroll | 🟡 / 🔵 | Factory labour attendance only |
| Approvals / workflow | ✅ | 12 exception types, delegation, escalation |
| Dashboards & analytics | ✅ | Pulse, status, KPIs, 4 analytics views |
| Report builder / exports | 🔴 | No generic export; CSV can be done client-side for loaded lists |
| Users, roles, sites admin | 🔴 | Seeds only |
| Settings (business rules, approval policies) | 🔴 | Tables exist (`business_rule_config`, `approval_policies`) but no API |
| Audit trail viewer | 🔴 | `immutable_audit_logs` exists, no read API |
| Notifications centre | 🔴 | `notification_outbox` exists, no read API |
| Document attachments | 🔴 | `attachments` table + MinIO exist, no upload API |
| Global search | 🔴 | Needs `/search?q=` |
| Realtime updates | 🔴 | Poll every 30 s until SSE exists |
| Multi-language | 🟡 | OD-008: English MVP, i18n-ready (Marathi dictionary exists) |
| Customer self-service portal | 🔵 | |
| Mobile driver / collector | Out of scope | Flutter `apps/mobile` |

All 🔴 items are consolidated with proposed endpoint shapes in [`17_BACKEND_API_GAP_REGISTER.md`](./17_BACKEND_API_GAP_REGISTER.md).

---

## 6. Recommendation

1. **Build a new Next.js application in `apps/web`** (keeping existing logic files as reference/migrating pure helpers into `@neo/shared`).
2. **Fix I-1/I-2 first** (permissions from backend) — every screen depends on it.
3. **Run a short backend "Frontend Enablement" sprint in parallel with F0–F2** to deliver: admin APIs, audit/notification read APIs, upload API, standard list contract, global search, SSE.
4. Build module screens in the order of business value: Sales → Finance → Approvals/Pulse (R1) → Supply chain (R2) → Analytics/Admin/Reports (R3).

