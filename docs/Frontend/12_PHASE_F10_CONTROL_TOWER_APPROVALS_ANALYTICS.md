# Phase F10 — Control Tower, Approvals & Analytics

> **Duration:** 2 weeks (pulse + approvals in R1; analytics in R3) · **Backend:** M7a (✅), M7b (✅)

## 1. Goal

Give the Owner an **exception-first command centre**: decide approvals in seconds, see the business pulse live, and explore trends with attractive, drill-down analytics.

---

## 2. Control Tower (`/control/dashboard`)

```
┌ Pulse ───────────────────────────────────────────────────────────── updated 12 s ago ┐
│ Today's Sales ₹4.82 L ↑8%  │ Gross Margin 11.2% ●  │ Cash Collected ₹2.1 L │ Decisions 5 │
└────────────────────────────────────────────────────────────────────────────────────────┘
┌ Operations ─────────────────────────────┐ ┌ Needs your decision ──────────────────────┐
│ Orders to dispatch  ▓▓▓▓▓░░ 18          │ │ PRICE OVERRIDE · ABC Traders · ₹88 vs ₹90 │
│ Batches running     ▓▓░░░░░ 3           │ │ [Approve] [Counter ₹89.5] [Reject]        │
│ Trucks on road      Stop 4/9 · 6/7 · …  │ │ CASH VARIANCE · Raju · −₹500              │
│ Supplier shortfalls ▓░░░░░░ 2           │ │ ...                                       │
└─────────────────────────────────────────┘ └───────────────────────────────────────────┘
┌ Money to collect (aging) ┐ ┌ Sales trend 30 days ┐ ┌ Stock alerts ┐ ┌ Yesterday's EOD ┐
```

| Widget | API | Notes |
|--------|-----|-------|
| Pulse header | ✅ `GET /dashboard/pulse?siteId=` | Today's sales = tax invoices issued today (OD-020); 30 s refresh (OD-021); stale indicator after 2 missed refreshes |
| Status matrix | ✅ `GET /dashboard/status-matrix` | Each tile clickable to filtered list |
| Decisions panel | ✅ `GET /exceptions?status=PENDING` | Inline actions |
| AR aging | ✅ `GET /analytics/ar/aging` | Click bucket → customers |
| Sales trend | 🟡 needs time-series endpoint G-DASH-1 (interim from invoices list) | |
| Stock alerts | ✅ `GET /stock-alerts/counts` | |
| EOD | ✅ `GET /dashboard/eod` | |
| KPIs | ✅ `GET /dashboard/kpis` | Owner call volume, EOD time, missed entries, margin erosion, ePOD %, order confirmation time |
| Site comparison | ✅ per-site calls | Owner "All sites" view shows per-site columns |
| TV / wall mode | UI | Full-screen auto-rotating dashboard for office display |

Customisation (R3): owner can rearrange/hide widgets; saved per user 🔴 G-PREF-1.

---

## 3. Approvals centre (`/control/approvals`)

### 3.1 Exception Card anatomy
```
┌ PRICE OVERRIDE ─────────────────────────────── waiting 4 min · ⏳ escalates in 56 min ┐
│ ABC Traders wants 500 kg Item Y at ₹88                                               │
│ Floor ₹90 · Target ₹95 · Last price ₹91 · Margin 6.8% · Requested by Priya            │
│ Impact: Order SO-2611-0042 paused (₹72,000)                         [Open order ↗]    │
│ [ ✓ Approve ₹88 ]  [ ↔ Counter ₹[89.50] ]  [ ✕ Reject ]   Remarks: [__________]       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

| Feature | Detail | API |
|---------|--------|-----|
| Queue | Sorted by priority/value/age; filters by type, site, requester, value | ✅ `GET /exceptions` |
| Types (12) | Price override, Credit breach, Supplier price spike, Supplier shortfall, Yield variance, Wastage write-off, Stock variance, Cash handover variance, Delivery dispute, Credit/rebate write-off, Manual ledger adjustment, COD-only | ✅ |
| Per-type facts & actions | Template per type (e.g. Counter only for price override; Credit breach shows AR, limit, overdue) | ✅ `GET /exceptions/:id` (`context_payload_json`) |
| Resolve | Approve / Reject / Counter with remarks; step-up password for high value (≥ ₹5,000 owner escalation, OD-002) | ✅ `POST /exceptions/:id/resolve` |
| Delegation & escalation | Show "Delegated to …", "Escalates in …" (OD-019, no silent auto-approve) | ✅ data in `approval_policies` |
| Concurrency | If resolved elsewhere → card turns "Resolved by … at …" (no error) | ✅ |
| Keyboard | `A` approve, `C` counter, `R` reject, `J/K` next/prev | UI |
| History tab | Resolved exceptions with outcome, time-to-decide | ✅ `GET /exceptions?status=` |
| Mobile-friendly | Cards stack on phone browser | UI |

---

## 4. Analytics (`/control/analytics`) — R3

| Tab | Visuals | API |
|-----|---------|-----|
| **Customers** | Profitability table (revenue, gross profit, margin %, orders), top/bottom 10 bar chart, margin scatter | ✅ `GET /analytics/customers/profitability` |
| **Suppliers** | Scorecard: fill rate, price variance %, PO/GRN counts; ranking | ✅ `GET /analytics/suppliers/scorecard` |
| **Factory** | Weekly planned vs output, yield %, wastage % trend lines | ✅ `GET /analytics/factory/yield-trend` |
| **Receivables** | Aging waterfall, by customer, trend | ✅ `GET /analytics/ar/aging` |
| **Sales** (standard ERP) | Sales by day/week/month, by item, by category, by site, by customer; YoY | 🔴 G-DASH-1 |
| **Inventory** | Stock value trend, turnover, slow/non-moving items, expiry losses | 🔴 G-DASH-2 |
| **Delivery** | On-time %, failed stops reasons, trips per vehicle, cost per delivery | 🔴 G-DASH-3 |
| **Purchases** | Spend by supplier/category, price inflation per item | 🟡 scorecard + rates |

Common: date range presets, site filter, compare to previous period, chart ⇄ table toggle, export CSV/PNG, drill-down click. Margin shown only to roles allowed (masked otherwise).

---

## 5. Stock alerts (`/control/stock-alerts`)
Tabs by type (Low, Expiring, Expired, Negative, Stale/Drift) with counts; action buttons (Create requisition, Transfer, Adjust). ✅ `GET /stock-alerts`, `/counts`, `/by-type`.

## 6. Notifications log (`/control/notifications`)
Delivery status of WhatsApp/SMS/push/in-app messages (sent, failed, retried) with retry action. 🔴 G-NOTIF-1 (table `notification_outbox` exists).

---

## 7. UX notes for non-tech users

- Each KPI card has an "i" explaining the formula in one sentence.
- Approvals use full sentences, not codes; buttons state the result ("Approve ₹88").
- Charts have plain titles ("Who owes us money and for how long") and highlight the most important number.
- "What changed since yesterday" summary line at the top of the dashboard.

## 8. Acceptance criteria

1. Pulse values equal `GET /dashboard/pulse`; widgets refresh every 30 s and show stale state if API fails.
2. Owner approves a price override; originating order unlocks within one refresh cycle without page reload.
3. Double-resolve from two tabs results in one resolution and a friendly "already resolved" card.
4. Analytics tabs render with date filters and export CSV.
5. Masked roles cannot reach analytics routes; API also rejects.

## 9. Task checklist

- [x] F10-01 Pulse header component (shared with Owner home)
- [x] F10-02 Status matrix tiles with drill-down
- [x] F10-03 Approvals centre with per-type card templates, resolve, history
- [x] F10-04 Step-up auth for high-value approvals
- [x] F10-05 Control Tower layout + TV mode
- [x] F10-06 Analytics tabs (4 ready + 4 pending backend)
- [x] F10-07 Stock alerts page
- [x] F10-08 Notifications log
- [x] F10-09 Backend: G-DASH-1/2/3, G-NOTIF-1, G-RT-1 (SSE), G-PREF-1

---

## 10. Implementation & Test Results

- **Shared Rules (`packages/shared/src/control-tower-rules.ts`):**
  - `evaluatePulseStaleness`, `requiresStepUpAuth`, `resolveExceptionWithConcurrency`, `canAccessAnalytics`, and `toCsvExport`.
- **Components & Store:**
  - `apps/web/src/components/PulseHeader.tsx` (shared Business Pulse header with 30 s auto-refresh, stale state after 2 missed refreshes, formula tooltips, and yesterday comparison)
  - `apps/web/src/lib/control-tower-data.ts` (multi-site pulse snapshots, Owner KPIs, 30-day sales trend, exception cards, analytics datasets, and notification outbox logs)
- **Screens Implemented:**
  - `/control/dashboard` — Owner Control Tower (PulseHeader, clickable status matrix tiles, inline approvals unlocking originating orders, 30-day sales trend, stock alerts, yesterday's EOD, Owner KPIs, site comparison table, TV / Wall Mode)
  - `/control/approvals` — Approvals Centre (Pending & History tabs, type filters, keyboard shortcuts `J/K/A/C/R`, concurrency-safe resolution, Owner step-up password modal for high-value exceptions ≥ ₹5,000)
  - `/control/analytics` — Executive Analytics (8 tabs: Customers, Suppliers, Factory, Receivables, Sales, Inventory, Delivery, Purchases; date/site filters, chart ⇄ table toggle, CSV export, masked-role guard)
  - `/control/stock-alerts` — Stock Alerts (from Phase F6, linked in Control Tower & Inventory)
  - `/control/notifications` — Notifications Outbox Log (WhatsApp/SMS/Push/In-app status filter & one-click retry)
- **Verification:**
  - `npm run test:fe`: **15/15 test files passed (194/194 tests)**, including `f10-control-tower.spec.ts` (6/6 tests covering AC1–AC5, page existence, and sidebar registration).
  - `npm run check:api-routes`: **Passed** (`routes.generated.ts is up to date`).

