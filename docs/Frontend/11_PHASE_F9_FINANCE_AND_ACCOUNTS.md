# Phase F9 — Finance, Collections & Accounts

> **Duration:** 3 weeks (core in R1, rest in R2) · **Depends on:** F4 · **Backend:** M6 Finance (✅ 11 controllers)

## 1. Goal

Make money flows **transparent and error-proof**: invoices, money to collect, payments received, cash custody from field to bank (BR-07), cheques, credit notes, COD, promises-to-pay and a **guided End-of-Day close** — plus Tally export for the accountant (OD-018).

---

## 2. Finance home — "Money" (`/finance`)

| Widget | Content | API |
|--------|---------|-----|
| KPI cards | Invoiced today · Collected today (cash / cheque / UPI) · Total to collect · Overdue > 30 days · Cash with field staff | ✅ `dashboard/pulse`, `finance/ar/aging`, `custody/expected/:userId` |
| AR aging chart | Stacked bar 0–7 / 8–15 / 16–30 / 30+ | ✅ `finance/ar/aging` |
| Today's tasks | Handovers to verify · Cheques to deposit · PTPs due · COD to settle · EOD status | ✅ multiple |
| Cash position | Opening + collections − deposits = closing (from cashbook) | 🟡 `eod/:date`; cashbook read 🔴 G-FIN-3 |

---

## 3. Screens

### 3.1 Invoices (`/finance/invoices`)
| Feature | API |
|---------|-----|
| List with status (Not paid / Part paid / Paid / Overdue / Cancelled), due date, days overdue, customer, amount, balance | ✅ `GET /invoices` |
| Generate invoice (normally auto at dispatch, OD-003; manual generation for allowed users) | ✅ `POST /invoices/generate` |
| Detail: GST tax invoice view with mixed lines (Taxable / Exempt / Nil / Non-GST), HSN summary, payments allocated, credit notes | ✅ `GET /invoices/:id` |
| PDF viewer: print, download, share on WhatsApp/email 🔴 G-NOTIF-2 | ✅ `GET /invoices/:id/pdf` |
| Cancel / void request (reason → approval) | ✅ `POST /invoices/:id/cancel` |
| e-Invoice IRN fields shown disabled (OD-004: schema ready, off for MVP) | — |

### 3.2 Money to collect — AR (`/finance/receivables`)
| Feature | API |
|---------|-----|
| Aging table by customer with buckets, credit limit, last payment, PTP status | ✅ `finance/ar/aging` |
| Open invoices list with filter by customer/bucket/collector | ✅ `finance/ar/open-invoices` |
| Customer statement drill-down (ledger with running balance) | ✅ `customers/:id/ledger`, `ar-balance` |
| Actions: Record payment, Add promise-to-pay, Send reminder (WhatsApp/SMS 🔴), Put on credit hold | ✅ / 🔴 |
| Collector worklists (today's assigned customers) — view for coordinator | ✅ `me/worklist` (own); 🔴 G-FIN-1 worklist by collector |

### 3.3 Payments received — Collections (`/finance/collections`)
| Feature | API |
|---------|-----|
| Register of receipts: date, customer, mode (cash/cheque/UPI/bank), amount, collected by, allocation status | ✅ `GET /collections` |
| **Record payment** form: customer → amount & mode → **allocation** (FIFO default, OD-017, with manual override showing open invoices & checkboxes) → receipt PDF 🔴 | ✅ `POST /collections`, `POST /collections/allocate` |
| Receipt detail with allocations, reversal (reason, append-only) | ✅ `GET /collections/:id`; reversal 🟡 confirm endpoint |

### 3.4 Cash handover desk (BR-07) (`/finance/handover`)
```
┌ Cash Handover ────────────────────────────────────────────────────────┐
│ Staff: [Raju (Driver) ▾]                                                │
│ Expected in wallet:  Cash ₹42,500   Cheques 3 (₹18,000)                 │
│ Counted cash:        [ ₹ 42,000 ]   (denomination helper ▸)             │
│ Cheques received:    ☑ 001234 ₹8,000  ☑ 001240 ₹5,000  ☐ 556677 ₹5,000  │
│ Difference:          −₹500  ⚠  → will be marked Disputed & Owner notified│
│                                        [ Verify cash handover ]         │
└────────────────────────────────────────────────────────────────────────┘
```
| Feature | API |
|---------|-----|
| Pick staff → expected wallet (cash + cheques, OD-015: UPI goes direct) | ✅ `GET /custody/expected/:userId` |
| Denomination counter (₹500 × n …) to help count | UI |
| Verify button disabled until counted amount entered; variance live in red | ✅ `POST /handovers/:id/verify` |
| Variance → `CASH_HANDOVER_VARIANCE` exception → Owner resolves | ✅ `POST /handovers/:id/resolve` |
| History list with status (Pending, Verified, Disputed, Resolved) | ✅ `GET /handovers`, `/:id` |
| Handover initiated by field app appears in "Pending" | ✅ `POST /handovers` (mobile) |

### 3.5 Cheques (`/finance/cheques`)
Lifecycle board: Received → Deposited → Cleared / Bounced → Returned. Actions with date & bank; bounce raises follow-up and reverses allocation. Calendar of PDC (post-dated) due dates. ✅ `GET /cheques`, `/:id/deposit|clear|bounce|return`.

### 3.6 Credit notes (`/finance/credit-notes`)
Request (against invoice: reason, lines/amount) → approval (Owner) → applied to customer ledger; cancel. ✅ `POST /credit-notes`, `GET`, `/:id/approve|reject|cancel`. Write-offs route via `CREDIT_REBATE_WRITEOFF` exceptions.

### 3.7 COD settlement (`/finance/cod`)
Pending COD stops by trip/driver → confirm received amount → settle. ✅ `GET /cod-settlements/pending`, `POST /:stopId/settle`, `GET /:id`.

### 3.8 Promises to pay (`/finance/ptp`)
List by due date (Today · Overdue · Upcoming · Broken · Kept); create/update; broken PTPs auto-marked nightly. ✅ `GET /ptp`, `/ptp/due`, `POST`, `PATCH /:id`.

### 3.9 Day closing — EOD (`/finance/eod`)
| Feature | API |
|---------|-----|
| Date picker (default today; yesterday if not closed — banner) | ✅ `GET /eod/:date` |
| **Start EOD** | ✅ `POST /eod/start` |
| Checklist (green/red with fix links): Trips closed · Field wallets zero · Deliveries invoiced · Handovers verified · Cheques deposited · Net cash & deposit slip | ✅ `GET /eod/:date/checklist` |
| Deposit slip preview & PDF | ✅ `GET /eod/:date/deposit-slip`, `/pdf` |
| **Owner sign-off** (visible only when all green; step-up password) | ✅ `POST /eod/:date/signoff` |
| EOD history with time-to-close KPI | ✅ `dashboard/eod`, `dashboard/kpis` |

### 3.10 Supplier side — Bills & payments (`/finance/payables`)
Supplier bills (from F5) approved → **record payment** → supplier ledger & AP aging. Bills ✅; payments & aging 🔴 G-AP-1, G-AP-2.

### 3.11 Tally export (`/finance/tally`)
Choose date range & voucher types → export → batch list with status, download XML, re-export. ✅ `POST /tally/export`, `GET /tally/batches`, `/:id`.

### 3.12 Opening balances (`/admin/opening-balances`)
Wizard (OD-023): download template → upload CSV → validation preview → **Draft** → owner **sign-off** with cut-off date → **Import** → (Reverse if needed). Status chips DRAFT → SIGNED_OFF → IMPORTED → REVERSED. ✅ `GET template`, `POST draft|import|reverse` (sign-off step 🟡 confirm endpoint).

### 3.13 Standard ERP finance additions
| Feature | Status |
|---------|--------|
| Expense entry (office rent, utilities, salaries) with categories | 🔴 G-FIN-2 |
| Cashbook / bank book view | 🔴 G-FIN-3 (table `cashbook_entries` exists) |
| Bank reconciliation | 🔵 F13 |
| GST reports (GSTR-1 summary, HSN summary, 3B summary) | 🔴 G-RPT-2 (see F12) |
| Profit & Loss (management view from sales/cost/expenses) | 🔴 G-RPT-3 |
| Full GL / balance sheet | Via Tally (OD-018) |

---

## 4. UX notes for non-tech users

- Every amount entry uses `MoneyInput` with Indian grouping and words ("₹42,000 — Forty-two thousand").
- Allocation shows invoices oldest first with checkboxes pre-ticked (FIFO); changing is optional.
- Handover and EOD screens look like checklists; red items explain *why* and *where to fix*.
- No edit/delete on posted money rows — only "Reverse" with reason and a clear explanation.
- Shareable PDFs (invoice, statement, receipt) in one click.

## 5. Acceptance criteria

1. Record payment with FIFO allocation updates invoice balances & customer statement.
2. Handover with variance ≠ 0 becomes Disputed and appears in Owner approvals; zero variance verifies.
3. EOD sign-off hidden until all checks green; non-zero wallet shows red with link to handover desk.
4. Cheque bounce updates status and customer balance.
5. Tally export batch downloads valid XML for the selected range.
6. Opening balance import follows DRAFT → SIGNED_OFF → IMPORTED and can be reversed.
7. All amounts render `₹1,00,000.00`; no float artefacts.

## 6. Task checklist

- [x] F9-01 Finance home
- [x] F9-02 Invoices list/detail/PDF/cancel
- [x] F9-03 AR aging, open invoices, statements
- [x] F9-04 Record payment + allocation + receipts register
- [x] F9-05 Cash handover desk + disputes
- [x] F9-06 Cheques lifecycle board
- [x] F9-07 Credit notes
- [x] F9-08 COD settlement
- [x] F9-09 Promises to pay
- [x] F9-10 EOD closing wizard + deposit slip
- [x] F9-11 Tally export
- [x] F9-12 Opening balance wizard
- [x] F9-13 Backend: G-AP-1/2, G-FIN-1/2/3, G-NOTIF-2, receipt PDF G-DOC-5

---

## 7. Implementation & Test Results

- **Shared Rules (`packages/shared/src/finance-rules.ts` & `business-rules.ts`):**
  - `allocateReceiptFifo`, `evaluateHandoverVariance`, `formatINR`, `processChequeTransition`, `evaluateEodChecklist`, `generateTallyXmlBatch`, `transitionOpeningBalanceBatch`.
- **Store / Seed (`apps/web/src/lib/finance-data.ts`):**
  - Seed data for GST/Exempt/Nil/Non-GST invoices, AR aging buckets, receipts, BR-07 cash handovers, cheques/PDCs, credit notes, COD stops, PTPs, supplier payables, Tally vouchers, and opening balance batches.
- **Screens Implemented:**
  - `/finance` — Finance Home (KPI cards, stacked AR aging bar, cashbook position, today's tasks)
  - `/finance/invoices` — Tax Invoices (status filter, manual invoice generation, GST detail modal with disabled IRN fields, PDF/WhatsApp actions, void request)
  - `/finance/receivables` — AR Aging, collector worklists, credit hold toggle, customer statement drill-down
  - `/finance/collections` — Record Payment with oldest-first FIFO allocation preview, receipts register, append-only reversal
  - `/finance/handovers` — Cash Handover Desk (BR-07) with denomination counter, live variance warning, Owner dispute escalation
  - `/finance/cheques` — Cheques & PDC Lifecycle Board (`RECEIVED -> DEPOSITED -> CLEARED | BOUNCED -> RETURNED`)
  - `/finance/credit-notes` — Credit Notes request & Owner approval/rejection
  - `/finance/cod` — COD Settlement for pending trip stops
  - `/finance/ptp` — Promises to Pay by due-date bucket (`TODAY`, `OVERDUE`, `UPCOMING`, `BROKEN`, `KEPT`)
  - `/finance/payables` — Supplier Bills & Payables (AP)
  - `/finance/eod` — Guided End-of-Day (EOD) Close checklist with fix links, deposit slip preview, and gated Owner sign-off
  - `/finance/tally` — Tally Prime XML Export with date range & voucher-type filters and downloadable XML batches
  - `/admin/opening-balances` — Opening Balances Wizard (`DRAFT -> SIGNED_OFF -> IMPORTED -> REVERSED`)
- **Verification:**
  - `npm run test:fe`: **14/14 test files passed (188/188 tests)**, including `f9-finance-accounts.spec.ts` (8/8 tests covering AC1–AC7, pages, and sidebar registration).
  - `npm run check:api-routes`: **Passed** (`routes.generated.ts is up to date`).

