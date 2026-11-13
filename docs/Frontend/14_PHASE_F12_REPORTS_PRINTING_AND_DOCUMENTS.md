# Phase F12 — Reports, Printing & Documents

> **Duration:** 2 weeks · **Release:** R3 · **Depends on:** F4–F11

## 1. Goal

Provide a **Report Library** that non-technical staff can browse like a menu, with filters, attractive previews, print/PDF/Excel export and scheduled email/WhatsApp delivery — plus consistent printing of all business documents and a document vault for attachments.

---

## 2. Report Library (`/reports`)

Card grid grouped by area; each card: title, one-line description ("Who owes us money and since when"), favourite ⭐, last run. Search box at top.

### 2.1 Report catalogue

| Area | Report | Data source | Status |
|------|--------|-------------|--------|
| **Sales** | Sales register (by date/customer/item) | orders, invoices | 🟡 lists ✅; aggregated G-RPT-1 |
| | Sales by item / category / site | invoices lines | 🔴 G-RPT-1 |
| | Customer-wise sales & margin | `analytics/customers/profitability` | ✅ |
| | Price override report (requested/approved/rejected) | exceptions | ✅ |
| | Quote conversion report | quotes | ✅ client aggregate |
| | Daily price list history | `prices/:date` | ✅ |
| **Receivables** | AR aging summary/detail | `finance/ar/aging` | ✅ |
| | Customer statement (single/bulk) | `customers/:id/ledger` | ✅ (PDF G-DOC-3) |
| | Collections register (by mode/collector) | collections | ✅ |
| | Cheque register (PDC, bounced) | cheques | ✅ |
| | PTP kept vs broken | ptp | ✅ |
| | Credit notes register | credit-notes | ✅ |
| **Cash** | Daily cash/EOD summary | `eod/:date`, `dashboard/eod` | ✅ |
| | Custody / handover variance report | handovers | ✅ |
| | COD settlement report | cod-settlements | ✅ |
| **Purchases** | Purchase register | POs, supplier bills | ✅ |
| | Supplier scorecard | analytics | ✅ |
| | Shortfall report | shortfalls | ✅ |
| | Supplier price trend | supplier rates | ✅ |
| | AP aging | — | 🔴 G-AP-2 |
| **Inventory** | Stock summary (by site/category) with value | `stock/current` | ✅ |
| | Stock movement / ledger report | `inventory/ledger` | ✅ |
| | Expiry report | `expiry-watchlist` | ✅ |
| | Adjustments & write-offs | adjustments | 🟡 G-INV-1 |
| | Slow / non-moving items | — | 🔴 G-DASH-2 |
| **Production** | Production register (WO, output) | work-orders | ✅ |
| | Yield & wastage report | `factory/yield-trend`, wastage | ✅ |
| | Material consumption vs BOM | work-order materials | 🟡 |
| | Labour attendance summary | attendance | ✅ |
| **Logistics** | Trip register & delivery performance | trips | ✅ |
| | Failed deliveries & reasons | stops | ✅ |
| | Vehicle expenses | trip expenses | 🟡 G-FLT-4 |
| | e-Way bill reference register | challans | ✅ |
| **Tax (GST)** | GSTR-1 style outward supplies summary (B2B/B2C, HSN summary, tax rates) | invoice lines | 🔴 G-RPT-2 |
| | GSTR-3B style summary | invoices + supplier bills | 🔴 G-RPT-2 |
| | Input tax from supplier bills | supplier bills | 🔴 G-RPT-2 |
| **Management** | Daily business summary (one page) | pulse + EOD | ✅ |
| | Profit snapshot (sales − COGS − expenses) | — | 🔴 G-RPT-3 |
| | Exceptions & approval turnaround | exceptions, kpis | ✅ |
| | Audit activity report | audit logs | 🔴 G-AUD-1 |

### 2.2 Report viewer
- Filter panel (date presets, site, customer/supplier/item, status) → **Run**.
- Summary cards on top + chart + detailed table with group-by and subtotals.
- Export: **PDF** (branded, A4), **Excel** (formatted), **CSV**; Print.
- Save as favourite with filters ("My Monday AR report").
- Large reports: server-side generation with "We'll notify you when ready" 🔴 G-RPT-4.

### 2.3 Scheduled reports (`/reports/scheduled`)
Choose report + filters + frequency (daily 8 PM, weekly Monday) + recipients (email/WhatsApp) → delivered as PDF/Excel. 🔴 G-RPT-5 (backend job). Example defaults: Owner daily summary at 9 PM; AR aging every Monday.

---

## 3. Business documents & printing

| Document | Source | Status |
|----------|--------|--------|
| Tax invoice (A4) | `GET /invoices/:id/pdf` | ✅ |
| Delivery challan | `GET /trips/:tripId/stops/:stopId/challan/pdf` | ✅ |
| Deposit slip | `GET /eod/:date/deposit-slip/pdf` | ✅ |
| Sales order / proforma | — | 🔴 G-DOC-1 |
| Quotation | — | 🔴 G-DOC-2 |
| Customer statement | — | 🔴 G-DOC-3 |
| Purchase order | — | 🔴 G-DOC-4 |
| Payment receipt | — | 🔴 G-DOC-5 |
| GRN slip, transfer note, work order sheet, trip sheet | — | 🔴 G-DOC-6 (or browser print CSS) |
| Thermal 80 mm receipts | — | 🔵 decision pending |

**Interim approach:** for documents without server PDF, use a **print-optimised HTML template** (print CSS, A4, company header from settings) — acceptable for internal documents; customer-facing documents (quote, statement, receipt, PO) should get server PDFs for consistency.

Common viewer: preview modal → Print · Download · Share (WhatsApp/email via G-NOTIF-2) · Copy link (internal).

---

## 4. Document vault & attachments

| Feature | Detail | Status |
|---------|--------|--------|
| Attach files to any record | Customer KYC, supplier licences, delivery-note photos, ePOD, bills, expense receipts | 🔴 G-FILE-1 (table `attachments` + MinIO exist) |
| Upload UX | Drag-drop / camera, image compression, progress, retry, thumbnails | UI |
| Documents tab | On every detail page | UI |
| Expiry tracking | For licences, vehicle documents with reminders | 🔴 |

---

## 5. Acceptance criteria

1. Library lists all ✅ reports; each runs with filters and exports PDF/Excel/CSV.
2. Exported Excel opens with formatted money columns and totals matching on-screen totals.
3. Invoice, challan, deposit slip open in viewer and print correctly on A4.
4. Print CSS templates produce clean single-page outputs for internal documents.
5. Favourites persist per user.

## 6. Task checklist

- [x] F12-01 Report Library shell, search, favourites
- [x] F12-02 Report viewer framework (filters, cards, chart, table, group-by, exports)
- [x] F12-03 Implement all ✅ reports
- [x] F12-04 Document viewer + print CSS templates
- [x] F12-05 Attachments component + Documents tab
- [x] F12-06 Scheduled reports UI
- [x] F12-07 Backend: G-RPT-1…5, G-DOC-1…6, G-FILE-1, G-NOTIF-2

---

## 7. Implementation & Test Results

- **Screens Implemented:** `/reports` (searchable Report Library, star favourites, Report Viewer modal with CSV/Excel export, Printable Business Documents with A4 Print CSS modal) and `/reports/scheduled`.
- **Verification:** `npm run test:fe` — **16/16 test files passed (200/200 tests)** (`f11-to-f14-final-phases.spec.ts`); `npm run check:api-routes` passed.

