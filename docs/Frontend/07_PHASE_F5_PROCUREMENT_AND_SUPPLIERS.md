# Phase F5 — Procurement & Suppliers

> **Duration:** 2 weeks · **Release:** R2 · **Depends on:** F3 · **Backend:** M2 Procurement (✅)

## 1. Goal

Give the coordinator and owner an end-to-end **Need → Requisition → Purchase Order → Goods Received → Supplier Bill → Payment** flow with supplier-price guard rails (BR-03 / `SUPPLIER_PRICE_SPIKE`), blind receiving (BR-05) and shortfall recovery — presented as a simple visual pipeline.

---

## 2. Procurement home (`/procurement`)

Visual pipeline with counts — each stage clickable:

```
 Needs (12) ──▶ Requisitions (8) ──▶ POs to issue (3) ──▶ Awaiting delivery (6) ──▶ Bills to check (4) ──▶ To pay (₹2.3 L)
                       ⚠ Shortfalls open (2)        ⚠ Price spikes waiting approval (1)
```

KPI cards: Spend this month, average supplier fill rate, on-time delivery %, open shortfalls. API: ✅ requisitions, POs, shortfalls, bills, `analytics/suppliers/scorecard`.

---

## 3. Screens

### 3.1 Requisitions (`/procurement/requisitions`)
| Feature | API |
|---------|-----|
| List with source (Sales order back-to-back, Production RM request, Min-stock, Manual), status (Open, PO created, Cancelled) | ✅ `GET /procurement/requisitions`, `source/:source/:sourceRefId` |
| Create manual requisition (item, qty, needed-by, reason) | ✅ `POST` |
| **Group by supplier** view → select → **Convert to PO** wizard (choose supplier, review rates) | ✅ `GET grouped/by-supplier`, `POST convert-to-po` |
| Cancel with reason | ✅ `POST /:id/cancel` |

### 3.2 Purchase Orders (`/procurement/purchase-orders`)
| Feature | Detail | API |
|---------|--------|-----|
| List | Status tabs: Draft · Waiting approval · Sent to supplier · Partly received · Closed · Cancelled; filters supplier/date/site | ✅ `GET` |
| PO builder | Wizard: ① Supplier (shows reliability, lead time) ② Items (latest rate auto-filled, **variance % vs last rate** coloured; spike → badge "Owner approval needed") ③ Delivery date/site/terms ④ Review | ✅ `POST`, `GET suppliers/:id/latest-rate/:itemId` |
| Confirm quantities | Supplier-confirmed quantities before issue | ✅ `POST /:id/confirm-quantities` |
| Issue PO | Generates PO; share PDF via WhatsApp/email 🔴 G-DOC-4 | ✅ `POST /:id/issue` |
| Cancel | Reason required | ✅ `POST /:id/cancel` |
| Detail | Lifecycle stepper, lines (ordered / received / short), linked GRNs, bills, sales order (back-to-back) | ✅ `GET /:id`, `/:id/lines`, `sales-order/:id` |
| Price spike | If `SUPPLIER_PRICE_SPIKE` exception raised: read-only banner "Waiting for Owner", Issue disabled | ✅ exceptions |

### 3.3 Goods Received (`/procurement/grns`)
| Feature | API |
|---------|-----|
| Office list of GRNs (date, supplier, PO, received by, lines, shortfall flag) | ✅ `GET /procurement/grns`, `/:id`, `/:id/lines` |
| **Blind GRN** capture lives in Floor Mode (F6) — shows only items, no ordered qty or price | ✅ `GET po/:poId/blind-view`, `POST` |
| Office view after receipt: compare ordered vs received (coordinator/owner only) | ✅ `po/:poId/shortfalls` |

### 3.4 Shortfall workbench (`/procurement/shortfalls`)
| Feature | API |
|---------|-----|
| All open shortfalls with impact (which sales orders affected) | ✅ `GET all/open` |
| For each: **ranked backup suppliers** (price within 2% auto-suggest, OD-010) | ✅ `GET item/:itemId/ranked-backups` |
| Actions: Create backup PO · Auto-resolve · Allocate · Write off (reason) | ✅ `POST create-backup-po`, `POST auto-resolve/:poId`, `PUT /:id/status` |
| Supplier coverable shortfalls | ✅ `GET supplier/:supplierId/coverable` |

### 3.5 Supplier bills (`/procurement/supplier-bills`)
| Feature | API |
|---------|-----|
| List with status (Received, Verified, Approved, Paid, Disputed) and **3-way match chip** (Matches / Timing differs / Amount differs / Does not match) | ✅ `GET` |
| Enter bill: pick PO/GRNs → lines auto-filled → bill no., date, amounts, attach scan 🔴 | ✅ `POST` |
| Side-by-side **PO vs GRN vs Bill** comparison table with differences highlighted | ✅ `GET /:id` |
| Submit → Approve / Reject (reason) | ✅ `POST /:id/submit|approve|reject` |
| Record payment (bank/cash/UPI, reference) and supplier ledger | 🔴 G-AP-1 |
| Supplier aging (AP) | 🔴 G-AP-2 |

### 3.6 Supplier scorecards (`/procurement/scorecards`)
Ranking table + charts: fill rate, average price variance %, PO count, GRN count, reliability; drill to supplier. API ✅ `GET /analytics/suppliers/scorecard`, `suppliers/:id/performance`.

### 3.7 Rate monitoring
- "Missing rates" alert list (items without current supplier rates) ✅ `alerts/missing-rates`.
- Price trend chart per item across suppliers ✅ `rates/:itemId`.

---

## 4. UX notes for non-tech users

- Pipeline home makes the process visible; every number is a filtered list.
- PO builder warns *before* submit about price spikes with a plain sentence: "₹54/kg is 12% higher than last time (₹48)".
- Supplier bill comparison uses ✓ / ✗ icons per line instead of numbers only.
- Shortfall cards suggest the best action first ("Order 200 kg from Sai Traders at ₹49 — within 2%").

## 5. Acceptance criteria

1. Requisitions grouped by supplier convert into one PO per supplier.
2. Price spike above threshold shows banner and disables Issue until resolved.
3. Storekeeper GRN payload & DOM contain no ordered qty or price (shared with F6 test).
4. Shortfall → backup PO created in ≤ 3 clicks.
5. Supplier bill 3-way status displayed matches backend `three_way_status`.

## 6. Task checklist

- [ ] F5-01 Procurement pipeline home
- [ ] F5-02 Requisitions list, create, group-by-supplier, convert wizard
- [ ] F5-03 PO list, builder wizard, confirm quantities, issue, cancel, detail
- [ ] F5-04 GRN office list & comparison view
- [ ] F5-05 Shortfall workbench with ranked backups
- [ ] F5-06 Supplier bills with 3-way comparison & approval
- [ ] F5-07 Scorecards & rate monitoring
- [ ] F5-08 Backend: G-AP-1 supplier payments, G-AP-2 AP aging, G-DOC-4 PO PDF, G-FILE-1

