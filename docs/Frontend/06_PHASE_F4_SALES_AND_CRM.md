# Phase F4 — Sales & CRM

> **Duration:** 3 weeks · **Release:** R1 · **Depends on:** F3 · **Backend:** M1 Commercial (✅), M3 ATP (✅), M6 ledger (✅), M7a exceptions (✅)

## 1. Goal

Make taking and tracking customer orders **fast for experts and foolproof for beginners**, with live price-band (BR-01), credit (BR-02) and stock (BR-04) guidance, plus a complete Customer 360 view and lightweight CRM.

---

## 2. Screens

| # | Screen | Route | Users |
|---|--------|-------|-------|
| S1 | Today's Prices (Daily Base & Floor Price Sheet) | `/sales/prices` | OWNER (edit), OPS_COORD (view) |
| S2 | Quick Order Entry | `/sales/orders/new` | OPS_COORD, OWNER |
| S3 | Orders (tracker) | `/sales/orders` | OPS_COORD, OWNER |
| S4 | Order detail | `/sales/orders/:id` | OPS_COORD, OWNER |
| S5 | Quotes | `/sales/quotes`, `/sales/quotes/new`, `/:id` | OPS_COORD |
| S6 | Customers & Customer 360 | `/sales/customers/:id` | OPS_COORD, OWNER |
| S7 | Sales returns | `/sales/returns` | OPS_COORD |
| S8 | Sales board (Kanban of orders) | `/sales/board` | OPS_COORD, OWNER |

---

## 3. S1 — Today's Prices

**Purpose:** Owner publishes daily floor & target prices; without them orders can't be priced.

| Feature | Detail | API |
|---------|--------|-----|
| Date selector | Today default; view past dates (read-only) | ✅ `GET /prices/today`, `GET /prices/:date` |
| "Missing today" alert | Banner: "14 items have no price for today" + filter | ✅ `GET /prices/missing/:date` |
| Price grid | Item, category, yesterday's floor/target, landed cost, min margin %, **auto-floor suggestion** (`cost / (1 − pct)` rounded up to ₹0.50 — shown as hint), editable Floor & Target, change % vs yesterday (coloured) | ✅ |
| Bulk tools | "Copy yesterday's prices", "Apply +2% to selected", "Use suggested floors" | UI only (client calc labelled preview; server is authority) |
| Validation | Target ≥ Floor; warn if floor < suggested; highlight big changes (> 10%) | UI |
| Publish bar | Sticky: "23 items changed · Publish prices" → confirm dialog showing impact (open quotes affected) | ✅ `PUT /prices/:date` |
| Print / WhatsApp | Printable price list (customer-facing, target only) | UI |

---

## 4. S2 — Quick Order Entry (the most-used screen)

### 4.1 Layout

```
┌ New Order ─────────────────────────────────────────────── Draft saved ✓ ─┐
│ Step ①Customer ──── ②Items ──── ③Review & Confirm                          │
├──────────────────────────────────────────────────────────────────────────┤
│ Customer [ABC Traders ▾]  📞 98xxxx  Site [Pune ▾]  Deliver [13 Nov ▾][10–12]│
│ Credit: ₹80,000 of ₹1,00,000 ▓▓▓▓▓▓▓▓░░  Overdue: none  ● OK               │
├──────────────────────────────────────────────────┬───────────────────────┤
│ #  Item        Qty   Unit  Price   Band       Stock  Amount │ Last prices   │
│ 1  Item Y      500   kg    ₹88   ▼ Below floor  1,200  44,000│ 05 Nov ₹91    │
│ 2  Item P      200   ctn   ₹140  ● In band      250    28,000│ 29 Oct ₹93    │
│ +  Add item (Enter)                                         │ Suggested:    │
├──────────────────────────────────────────────────┴───────────────────────┤
│ Subtotal ₹72,000  GST ₹3,600  Total ₹75,600   Margin 7.7% (owner only)   │
│ ⚠ Item Y is ₹2 below today's floor → needs Owner approval                  │
│                    [Save draft]  [Save as Quote]  [Send for Owner approval]│
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Behaviour

| Aspect | Spec | API |
|--------|------|-----|
| Two modes | **Guided** (3-step wizard, default for new users) and **Express** (single screen, keyboard-only) — user preference | UI |
| Customer select | Picker shows credit status, outstanding, last order; selecting loads credit meter | ✅ `GET /customers`, `GET /customers/:id/ar-balance`, `POST /orders/:id/evaluate-credit` |
| Item select | Picker with stock and today's price; defaults price = Target, unit = primary UoM | ✅ `GET /items`, `GET /prices/today`, `GET /inventory/stock/atp` |
| Price memory | Right panel: last 5 prices for this customer + item | ✅ `GET /customers/:id/price-memory` |
| Band chip (BR-01) | Green "In band", amber "Below floor by ₹x"; preview client-side, confirmed by server on submit | ✅ server evaluation on create |
| Stock chip (BR-04) | Available / Short by x; when short: "Will be produced" (processed goods) or "Back-to-back purchase suggested" (traded) | ✅ ATP |
| Credit (BR-02) | Meter updates with order total; if breach → banner "Over credit limit — Owner approval needed" | ✅ |
| Primary button | Switches automatically: **Confirm order** (all in band, credit OK) ↔ **Send for Owner approval** (any exception) | ✅ `POST /orders/:id/confirm` / `request-override` |
| Keyboard | Tab across cells, Enter adds line, Ctrl+Enter submit, Ctrl+S draft, Esc close picker | UI |
| Autosave | Draft persisted locally + server `DRAFT` on first save | ✅ `POST /orders` |
| Duplicate guard | Warn if same customer has an order for same date in last 30 min | 🟡 via `GET /orders?customerId=&date=` |
| After submit | Success page: order number, status, "Print order", "New order", "Go to order" | |
| Pending approval | Order page shows live "Waiting for Owner" banner; updates when resolved (poll 30 s) | ✅ |
| Counter offer | If Owner counters, coordinator sees banner "Owner suggests ₹89.50" → **Accept counter** / Cancel | ✅ `POST /orders/:id/accept-counter` |

---

## 5. S3 — Orders tracker

| Feature | Detail | API |
|---------|--------|-----|
| KPI strip | Today's orders · Waiting for Owner · Ready to dispatch · Delivered today · Value today | ✅ `GET /orders` (aggregate client-side) 🟡 summary endpoint preferable |
| Views | Table · **Kanban by status** · Calendar by delivery date | UI |
| Status tabs | All · Draft · Waiting approval · Confirmed · Being made/sourced · Ready · On the way · Delivered · Cancelled | ✅ `status` filter |
| Filters | Date range, customer, site, delivery window, created by, value range | 🟡 needs G-LIST-1 |
| Row actions | View, confirm, cancel (with reason), print, duplicate as new | ✅ |
| Bulk | Print selected, export, "Add to trip" (→ F8) | |
| Saved views | e.g. "My orders today", "Ready for Pune route" | UI |

## 6. S4 — Order detail

- Header: order no., customer (link to 360), status pill, delivery date/window, total, primary action by state.
- **Lifecycle stepper:** Draft → Approved → Confirmed → Made/Sourced → Ready → Dispatched → Delivered → Invoiced → Paid (each step with time & user).
- Tabs: **Lines** (band, stock, reservation status) · **Timeline** (`order_status_log`) · **Linked documents** (quote, POs via `GET /procurement/purchase-orders/sales-order/:id`, work orders, trip/challan, invoice, payments, credit notes) · **Approvals** (exceptions) · **Audit**.
- Actions: Confirm, Cancel (reason), Print, Duplicate, Create invoice (if allowed), Record payment.

## 7. S5 — Quotes

| Feature | API |
|---------|-----|
| List with status (Draft, Sent, Converted, Expired, Lost) and **expiry countdown** chips | ✅ `GET /quotes` |
| Create from scratch or from order draft ("Save as quote") | ✅ `POST /quotes` |
| Detail: lines, validity, print/WhatsApp PDF 🔴 G-DOC-2 | ✅ `GET /quotes/:id` |
| **Convert to order** (1 click; re-checks today's price band) | ✅ `POST /quotes/:id/convert` |
| Mark lost with reason, send reminder | 🔴 G-M1-2 |

## 8. S6 — Customer 360

```
┌ ABC Traders  ● Active  Credit OK ─────────────── [New order] [Record payment] ┐
│ 📞 98xxxxxx · WhatsApp · GSTIN 27ABC… · Pune · Window 10–12                     │
├──────────────┬──────────────┬──────────────┬──────────────┬──────────────────┤
│ Outstanding  │ Overdue      │ Credit used  │ Sales (30 d) │ Avg margin (owner)│
│ ₹80,000      │ ₹0           │ 80% ▓▓▓▓░    │ ₹4.2 L ↑12%  │ 9.4%              │
└──────────────┴──────────────┴──────────────┴──────────────┴──────────────────┘
Tabs: Overview · Orders · Invoices · Statement · Payments · Promises · Price history · Contacts · Activity · Documents
```

| Tab | Content | API |
|-----|---------|-----|
| Overview | Sales trend chart (12 months), top items, aging buckets, recent activity | 🟡 orders + `analytics/customers/profitability` |
| Orders / Invoices | Filtered lists | ✅ |
| Statement | Ledger with running balance; date range; print/share PDF statement | ✅ `GET /customers/:id/ledger`; 🔴 G-DOC-3 statement PDF |
| Payments | Receipts + allocations | ✅ `GET /collections?customerId=` 🟡 |
| Promises (PTP) | Promise-to-pay list & status | ✅ `GET /ptp` |
| Price history | Item-wise price memory chart | ✅ `price-memory` |
| Contacts | CRUD | ✅ |
| Activity | Communication log (calls, visits, WhatsApp, notes) + "Log activity" | ✅ `/customers/:id/communication` |
| Documents | KYC, agreements | 🔴 G-FILE-1 |

## 9. S7 — Sales returns

Return against delivered order/invoice → reason, qty, condition (resaleable/damaged) → creates credit note request (F9) and stock receipt. API: 🟡 credit notes ✅ (`POST /credit-notes`), delivery returns via M5; dedicated return flow 🔴 G-M1-3.

## 10. CRM extras (R3 / Phase 2)

| Feature | Status |
|---------|--------|
| Follow-up reminders on customers (call back on date) | 🔴 G-M1-4 (or reuse worklist) |
| Customer segmentation tags (Retail, Hotel, Distributor) | 🔴 |
| Leads & opportunity pipeline | 🔵 F13 |
| WhatsApp order console | 🔵 F13 |
| Customer self-service portal | 🔵 F13 |

---

## 11. UX notes for non-tech users

- Guided order mode explains each step in one sentence; Express mode for power users.
- Band and stock chips use plain sentences on hover: "Price ₹88 is ₹2 below today's minimum ₹90".
- The Confirm button **never fails silently** — if approval is needed, the button text already says so.
- Cancelling asks for a reason from a list (Customer cancelled, Wrong entry, Out of stock, Other).

## 12. Acceptance criteria

1. **Scenario A:** Floor ₹90 — price ₹92 shows "In band" and Confirm works; ₹88 shows "Below floor by ₹2", button becomes "Send for Owner approval", order shows "Waiting for Owner".
2. Credit breach shows meter in red and routes to approval; dispatch screens show the hold reason.
3. Owner counter offer appears on order within 30 s and can be accepted.
4. Order entry fully operable with keyboard only; a 5-line order can be entered in < 60 s by a trained user.
5. Price sheet publish shows changed count and persists via `PUT /prices/:date`.
6. Masked roles never see price/margin columns (verified on DOM & network).
7. Customer statement running balance matches `GET /customers/:id/ledger`.

## 13. Task checklist

- [ ] F4-01 Price sheet grid + bulk tools + publish
- [ ] F4-02 Quick Order (guided + express) with band, stock, credit, price memory
- [ ] F4-03 Approval/counter handling on orders
- [ ] F4-04 Orders tracker (table, kanban, calendar) + saved views
- [ ] F4-05 Order detail with lifecycle stepper & linked docs
- [ ] F4-06 Quotes list/create/detail/convert
- [ ] F4-07 Customer 360 with all tabs
- [ ] F4-08 Activity logging
- [ ] F4-09 Sales returns (interim via credit notes)
- [ ] F4-10 Backend: G-LIST-1 orders filters, G-M1-1 order summary, G-M1-2, G-M1-3, G-DOC-2/3

