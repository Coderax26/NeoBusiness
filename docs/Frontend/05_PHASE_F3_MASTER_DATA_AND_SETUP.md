# Phase F3 — Master Data & Business Setup

> **Duration:** 2 weeks · **Release:** R1 · **Depends on:** F2

## 1. Goal

Let the business set up and maintain its core records — **items, customers, suppliers, vehicles, sites, users** — through friendly forms, a first-time **Setup Wizard** and **Excel/CSV import**, so that day-to-day screens have clean data from day one.

---

## 2. Setup Wizard (first run, Owner only)

A guided 8-step checklist shown on Owner home until complete ("Your business is 60% set up").

| Step | What the owner does | API |
|------|---------------------|-----|
| 1. Company profile | Name, GSTIN, address, logo, financial year start, invoice footer/bank details | 🔴 G-ADM-4 company settings |
| 2. Sites & locations | Factory, depots, warehouses; storage locations (cold room, dry store) | 🔴 G-ADM-2 |
| 3. Users & roles | Invite staff by phone, assign role & sites | 🔴 G-ADM-1 |
| 4. Items | Add or import items (category, UoM, HSN, GST %, shelf life) | ✅ `POST /items` |
| 5. Customers | Add or import customers with credit limits | ✅ `POST /customers` |
| 6. Suppliers | Add or import suppliers + items they supply | ✅ `POST /procurement/suppliers` |
| 7. Vehicles | Add fleet with capacity | ✅ `POST /vehicles` |
| 8. Opening balances | Customer AR, stock — via signed-off CSV import (OD-023) | ✅ `finance/opening-balances/*` (see F9) |

Each step: short explanation, example, "Skip for now", progress saved.

---

## 3. Item master (`/sales/items` — also reachable from Stock)

### 3.1 Item list
- KPI strip: Active items · Items without today's price · Low-stock items · Items expiring soon.
- Table columns: photo/initial, SKU, name, category (`RAW_MATERIAL`, `PROCESSED_FG`, `TRADED_GOOD`), primary/secondary UoM, GST %, HSN, shelf life, stock (current), today's price (masked roles hidden), status.
- Filters: category, tax treatment, active, catch-weight, low stock.
- Bulk: activate/deactivate, export, print price list.

### 3.2 Item form (tabs)
| Tab | Fields | API |
|-----|--------|-----|
| Basics | SKU code (auto-suggest), name, category, description, photo 🔴 | ✅ `POST/PATCH /items` |
| Units | Primary UoM, secondary UoM, catch-weight toggle, standard weight per secondary (kg); **UoM conversion table** (from → to × factor) with live example "1 crate = 20.3 kg" | ✅ `POST/GET /items/:id/uom` |
| Tax | Tax treatment (`TAXABLE`, `EXEMPT`, `NIL_RATED`, `NON_GST`), GST rate %, HSN code (with HSN lookup helper 🔵) | ✅ |
| Pricing rules | Min margin % (override of category default per OD-001); explains floor formula in plain words | ✅ `minMarginPct` |
| Stock rules | Shelf life days, min stock qty (MTS trigger, OD-013), reorder hint | ✅ (`min_stock_qty` migration 021) 🟡 confirm DTO |
| Suppliers | Approved suppliers & latest rates (read) | ✅ `GET /procurement/suppliers/item/:itemId/approved` |
| Recipe | Active BOM link (processed goods) | ✅ `GET /production/boms` |
| Stock | Current stock by site/batch (read) | ✅ `GET /inventory/stock/current?itemId=` |
| History | Price history, audit trail | 🟡 / 🔴 G-AUD-1 |

UX: category choice changes visible fields (e.g. Recipe tab only for processed goods); validation explains HSN/GST in plain terms.

---

## 4. Customer master (`/sales/customers`)

### 4.1 Customer list
- KPI strip: Active customers · On credit hold · Over credit limit · Overdue > 30 days.
- Columns: code, business name, contact, phone (click-to-call / WhatsApp), area/site, credit limit, outstanding, overdue days, credit status chip, last order date.
- Filters: site, credit status (OK / Near limit / Hold), overdue bucket, price tier, active.
- Card view toggle (for owner on tablet).

### 4.2 Customer form
| Section | Fields | API |
|---------|--------|-----|
| Business | Code, business name, GSTIN (format check + state code auto-fill), state code, billing address, GPS location (map pin) | ✅ `POST/PATCH /customers` |
| Contact | Contact person, phone, WhatsApp no., WhatsApp opt-in (`whatsapp_optins`) | ✅ / 🔴 opt-in API |
| Delivery | Default site, preferred delivery window | ✅ |
| Credit | Credit limit, credit days, max overdue days, credit hold toggle (permission `customer.credit_override`, requires reason) | ✅ `PATCH /customers/:id/credit` |
| Pricing | Price tier (placeholder — OD-024 deferred; show as disabled with note) | ✅ |
| Contacts | Multiple contacts with role & primary flag | ✅ `/customers/:id/contacts` |

Customer 360 detail page is specified in F4.

---

## 5. Supplier master (`/procurement/suppliers`)

| Area | Features | API |
|------|----------|-----|
| List | Code, name, items supplied, reliability score (stars), fill rate, last PO, missing-rate alert badge | ✅ `GET /procurement/suppliers`, `alerts/missing-rates` |
| Form | Code, name, GSTIN, contact, address, payment terms, lead time, active | ✅ `POST`, `PUT /:id` |
| Items tab | Link items with supplier SKU, pack size, approved flag | ✅ `POST /:id/items/:itemId`, `GET /:id/items` |
| Rate card tab | Rates per item with valid-from, history chart; add new rate | ✅ `POST /:id/rates`, `GET /:id/rates/:itemId`, `latest-rate` |
| Performance tab | Fill rate, on-time %, price variance, shortfall count; "Recalculate reliability" | ✅ `GET /:id/performance`, `POST /:id/update-reliability` |
| Documents | Agreements, licences (FSSAI) | 🔴 G-FILE-1 |

---

## 6. Vehicles (`/logistics/vehicles`)

List & form: registration no., type, capacity (kg and crates), owner/hired, driver default, fitness/insurance/PUC expiry dates with reminders 🔴, status. API ✅ `GET/POST /vehicles`; edit/deactivate 🔴 G-FLT-1.

---

## 7. Sites, locations & users

Specified fully in F11 (Admin). Included in Setup Wizard here. All 🔴 (G-ADM-1, G-ADM-2).

---

## 8. Import / export framework (reused everywhere)

| Feature | Behaviour |
|---------|-----------|
| Download template | Excel/CSV template with header help row and sample data |
| Upload & map | Drag-drop file → auto-map columns → user confirms mapping |
| Validate preview | Table shows each row green/amber/red with plain reason ("GSTIN format wrong") |
| Import | Only valid rows; progress bar; summary "212 imported, 8 skipped (download errors)" |
| Undo window | Imported batch can be deactivated within 24 h (masters only) |
| Export | Any list → Excel/CSV with current filters |

API: 🔴 G-IMP-1 bulk import endpoints for items/customers/suppliers (interim: client-side loop over `POST` with throttling and per-row result — acceptable for < 500 rows).

---

## 9. UX notes for non-tech users

- Forms are split into short sections with plain headings and examples in placeholders ("e.g. 27ABCDE1234F1Z5").
- Duplicate detection: warn when name/phone/GSTIN already exists before saving.
- "Save & add another" for fast data entry; "Save draft" for long forms.
- Deactivate instead of delete, with explanation ("Hidden from new orders, history kept").

## 10. Acceptance criteria

1. Owner completes Setup Wizard steps 4–7 using only the UI and a CSV template.
2. Creating an item with secondary UoM shows correct conversion example and persists conversions.
3. Credit limit change requires `customer.credit_override` and a reason; appears in history.
4. Supplier rate card shows history chart and latest rate per item.
5. Import of 200 customers with 5 invalid rows reports exact failures and imports the rest.

## 11. Task checklist

- [x] F3-01 Setup Wizard framework & progress tracking
- [x] F3-02 Item list + form + UoM tab
- [x] F3-03 Customer list + form + contacts + credit editor
- [x] F3-04 Supplier list + form + items + rate card + performance
- [x] F3-05 Vehicle list + form
- [x] F3-06 Import/export framework (templates, mapping, validation preview)
- [x] F3-07 Duplicate detection helpers
- [x] F3-08 Backend parity: G-ADM-1/2/4, G-FLT-1, G-IMP-1, G-FILE-1 client fallbacks & contracts

---

## 12. Implementation & Test Verification Log

### 12.1 Deliverables Implemented
1. **Setup Wizard (`/admin/setup-wizard` & Owner Home Banner, F3-01):**
   - 8-step guided sequence: Company profile, Sites & locations, Users & roles, Items master, Customers & credit, Suppliers & rates, Vehicles & fleet, Opening balances.
   - Progress bar, completion percentage calculation, step skipping, and state persistence in `localStorage`.
   - Setup progress banner integrated on Owner Home page (`apps/web/app/(office)/home/page.tsx`).
   - Pure shared configuration in `@neo/shared` (`SETUP_STEPS_CONFIG`, `calculateSetupProgress`).

2. **Item Master Catalog (`/sales/items`, F3-02):**
   - KPI strip: Active items, Missing today's price, Low stock (MTS trigger), Expiring soon (<3d).
   - Data table with category filtering, catch-weight flags, and status badges.
   - Comprehensive multi-tab item form (Basics, Units & UoM Conversion, Tax & HSN, Pricing Rules, Stock & Shelf Life, Recipe BOM).
   - Live UoM conversion preview ("1 crate = 24 pcs / 10 crates = 240 pcs").
   - Floor price calculation with min margin % override per OD-001.

3. **Customer Master Directory (`/sales/customers`, F3-03):**
   - KPI strip: Active customers, Credit hold, Over credit limit, Overdue > 30 days.
   - Dual view modes: Data table & Card view for tablet users.
   - Multi-tab form: Business & GSTIN (auto-extracts state e.g. 27 -> Maharashtra), Contact & Delivery, Credit & Payment Terms, Key Contacts.
   - Mandatory audit reason and `customer.credit_override` validation on credit limit changes.
   - Click-to-call and WhatsApp direct links.

4. **Supplier Master Directory (`/procurement/suppliers`, F3-04):**
   - KPI strip: Active suppliers, Missing rate alerts, High reliability (>=4.5★), Avg lead time.
   - Tabbed workspace: General Info, Supplied Items, Rate Cards & History, Performance & Reliability.
   - Rate card management with valid-from dates, history tracking, and latest-rate highlights.
   - Weighted composite reliability score recalculation based on PO fill rate and on-time delivery %.

5. **Vehicles & Fleet Master (`/logistics/vehicles`, F3-05):**
   - KPI strip: Total fleet, Active on trip, Maintenance, Total fleet payload capacity (MT & Crates).
   - Table and form with payload capacities in kg and crates, ownership types (`OWNED` vs `HIRED`), default driver assignments.
   - Document expiry tracking for Fitness, Insurance, and PUC with 30-day early warning badges.

6. **Reusable Import/Export Framework (`packages/ui`, F3-06):**
   - `CsvImportModal` with sample template generator, drag-and-drop file upload, row-by-row validation preview (green ready / red error flags with plain reasons), progress bar, and summary metrics.
   - `exportToCsv` utility for instant table exports with active filters.
   - `parseAndValidateCsv` pure headless parser for robust testability and client validation.

7. **Duplicate Detection & GSTIN Validation (`packages/shared`, F3-07):**
   - `validateGSTIN`: 15-character Indian GSTIN pattern verification and state code lookup table (`GSTIN_STATE_CODES`).
   - `checkDuplicateRecord`: In-memory duplicate detector for phone numbers, GSTINs, and SKU codes with self-exclusion during updates.

### 12.2 Test Results (Vitest)
- Test Suite: `apps/web/src/tests/f3-master-data-setup.spec.ts`
- Result: **22 / 22 tests passing** (110ms)
- Overall Frontend Baseline: **139 / 139 tests passing across 8 spec files**
  - `p3-frontend-delivery.spec.ts`: 21 passed
  - `f0-auth-permissions.spec.ts`: 13 passed
  - `f0-foundation-tech-stack.spec.ts`: 20 passed
  - `f1-contract-and-money.spec.ts`: 23 passed
  - `f1-design-system-usability.spec.ts`: 14 passed
  - `f2-enablement-and-web.spec.ts`: 15 passed
  - `f2-app-shell-login-home.spec.ts`: 11 passed
  - `f3-master-data-setup.spec.ts`: 22 passed
- Zero API route drift (`npm run check:api-routes`: `routes.generated.ts is up to date`).


