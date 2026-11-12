# M6 — Collections & Financials (AR / AP / Cashbook)

**Build order:** 4th (Sprint 1, core) + accounting bridge in Sprint 2 · **Depends on:** M0, M1, M7a · **Integrates later with:** M5 (invoice trigger, COD), M3 (GRN → AP)
**Blueprint refs:** §5.1 M6, BR-07, Scenario E, §6.7, §7.2(7), §7.3(2), §7.4 accounting bridge, KPIs 2 & 3

---

## 1. Purpose & scope

Close the financial loop. Every rupee collected in the field is recorded at the moment of collection, sits in the collector's custody wallet until handed over, and is reconciled in a ten-minute EOD checklist.

In scope: automated invoicing · customer AR sub-ledger · mobile field collection · digital receipts · cash-in-hand custody wallets · cash handover verification · cheque (PDC) register · promise-to-pay follow-up · collection worklist · credit notes · supplier AP · cashbook & bank deposit slip · EOD closing · accounting export bridge.

Out of scope: full general ledger and statutory filings — NeoCore is the **operational sub-ledger** and exports to Tally Prime / Zoho Books.

---

## 2. Roles & permissions

| Role | Can | Cannot |
| --- | --- | --- |
| COLLECTOR | See assigned AR aging list; log cash/cheque/UPI; issue receipts; log PTP; settle custody daily | Edit invoice amounts; grant rebates/write-offs without owner approval |
| DRIVER | Collect COD against assigned invoices | See other customers; edit prices |
| OPS_COORD | Verify cash handover (as cashier); generate deposit slip; raise credit notes; view AR/AP | Delete posted invoices/receipts; override credit hold |
| OWNER | Final EOD sign-off; approve credit notes, rebates, write-offs, manual adjustments; view all ledgers | — |

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`invoices`** | `id` PK · `invoice_no` · `sales_order_id` FK · `customer_id` FK · `invoice_date` · `due_date` · `total_amount` · `paid_amount` · `balance_due` · `status` (`UNPAID` \| `PARTIAL` \| `PAID` \| `OVERDUE`) | BP |
| ↳ added | `trip_id` · `place_of_supply_state` · `taxable_amount` · `cgst` · `sgst` · `igst` · `eway_bill_no` · `irn` (if e-invoicing applies) · `pdf_attachment_id` · `is_cod` · `CANCELLED` status | ADD |
| **`invoice_lines`** | `invoice_id` · `item_id` · `hsn_code` · `qty` · `unit_price` · `tax_rate_pct` · `line_total` | ADD (G4) |
| **`collection_receipts`** *(append-only)* | `id` PK · `receipt_no` · `customer_id` FK · `collected_by_user_id` FK · `payment_mode` (`CASH` \| `UPI` \| `BANK_TRANSFER` \| `CHEQUE`) · `amount` · `reference_utr_or_cheque_no` · `handover_status` · `verified_by_owner_id` · `collected_at` | BP |
| ↳ added | `provisional_receipt_no` (offline) · `gps_lat_lng` · `device_id` · `idempotency_key` · `reverses_receipt_id` · `on_account_amount` | ADD |
| **`receipt_allocations`** | `receipt_id` · `invoice_id` · `allocated_amount` | ADD |
| **`customer_ledger_entries`** *(append-only)* | `id` · `customer_id` · `entry_type` (`INVOICE` \| `RECEIPT` \| `CREDIT_NOTE` \| `ADJUSTMENT` \| `OPENING`) · `debit` · `credit` · `ref_id` · `posted_at` · `running_balance` | ADD (Open Q3) |
| **`custody_ledger`** *(append-only)* | `id` · `user_id` · `entry_type` (`COLLECTION` \| `HANDOVER` \| `REVERSAL`) · `amount_delta` · `receipt_id` · `handover_id` · `posted_at` | ADD (BR-07) |
| **`cash_handovers`** | `id` · `handed_by` · `received_by` (cashier) · `cash_amount` · `cheque_count` · `upi_amount` · `counted_amount` · `variance` · `verified_at` · `verified_by` · `status` (`PENDING` \| `VERIFIED` \| `DISPUTED`) | ADD (G3) |
| **`cheque_register`** | `id` · `receipt_id` · `cheque_no` · `bank` · `cheque_date` · `amount` · `status` (`RECEIVED` \| `DEPOSITED` \| `CLEARED` \| `BOUNCED`) · `deposited_on` · `bounce_reason` | ADD (G12, A4) |
| **`ptp_followups`** | `id` · `customer_id` · `invoice_id` nullable · `promised_date` · `reason_code` · `note` · `logged_by` · `status` (`OPEN` \| `KEPT` \| `BROKEN`) | ADD (Scenario E) |
| **`collection_worklists`** | `id` · `date` · `assigned_to` · `customer_id` · `priority_score` · `overdue_amount` · `reason` (`OVERDUE` \| `DELIVERY_STOP` \| `PTP_DUE`) · `outcome` | ADD |
| **`credit_notes`** | `id` · `cn_no` · `invoice_id` · `reason` (`RETURN` \| `DAMAGE` \| `REBATE` \| `WRITEOFF`) · `amount` · `status` (`REQUESTED` \| `APPROVED` \| `POSTED` \| `REJECTED`) · `approved_by` | ADD |
| **`supplier_ledger_entries`** | `supplier_id` · `entry_type` (`BILL` \| `PAYMENT` \| `ADJUSTMENT` \| `OPENING`) · `debit` · `credit` · `ref_id` · `posted_at` | ADD (Supplier AP) |
| **`supplier_payments`** | `id` · `supplier_id` · `amount` · `mode` · `reference` · `paid_at` · `paid_by` | ADD |
| **`cashbook_entries`** | `id` · `date` · `site_id` · `entry_type` (`RECEIPT_CASH` \| `HANDOVER_IN` \| `EXPENSE` \| `BANK_DEPOSIT` \| `SUPPLIER_PAYMENT`) · `amount` · `ref_id` | ADD |
| **`bank_deposits`** | `id` · `date` · `site_id` · `cash_amount` · `cheque_total` · `slip_attachment_id` | ADD |
| **`eod_closings`** | `id` · `date` · `site_id` · `initiated_at` · `all_trips_closed` · `all_cash_handed_over` · `uninvoiced_deliveries` · `net_cash_position` · `deposit_slip_id` · `signed_off_by` · `signed_off_at` · `status` (`OPEN` \| `READY` \| `SIGNED_OFF`) | ADD (§6.7) |
| **`accounting_export_batches`** | `id` · `date` · `target` (`TALLY_XML` \| `ZOHO_API`) · `doc_count` · `status` · `file_attachment_id` · `error` | ADD (§7.4) |

> **G3:** receipts are immutable. "Handed over / verified" is **not** a field edit on the receipt; it is a `cash_handovers` row plus `custody_ledger` entries. The receipt's handover status shown in the UI is *derived*.
> **Caches:** `customers.current_ar_balance` and `users.cash_custody_balance` are written in the same transaction as their ledger entry and re-verified nightly.

---

## 4. Business rules

### BR-07 — Mobile Custody Chain for Cash (zero missed entries)
When a driver/collector logs a collection of ₹10,000, **one database transaction** performs:
1. `collection_receipts` insert (immutable).
2. `receipt_allocations` (auto-FIFO to oldest invoices unless specified) + invoice `paid_amount/balance_due/status`.
3. `customer_ledger_entries` **credit** ₹10,000 → customer AR decreases.
4. `custody_ledger` **COLLECTION +₹10,000** → agent's virtual wallet increases.
5. Emit `collection.logged` → WhatsApp/SMS receipt to the customer.

The wallet is cleared **only** when the cashier/owner taps **Verify Cash Handover**: `custody_ledger` **HANDOVER −amount**, `cashbook_entries` **HANDOVER_IN**. If counted ≠ expected, handover is `DISPUTED` with variance, owner notified. Any non-zero wallet at EOD blocks EOD sign-off.

```
logCollection(cmd):   # idempotent on cmd.idempotency_key
    tx:
      receipt = insert collection_receipt(...)
      allocate(receipt, invoices)               # FIFO default
      post customer_ledger CREDIT
      post custody_ledger  COLLECTION(+amount)   # non-cash modes: tracked but no physical cash
      if mode == CHEQUE: insert cheque_register(RECEIVED)
    after-commit: NotifyPort.send(WHATSAPP, 'payment_receipt', customer)
```
UPI/bank transfer: recorded with UTR; custody wallet only holds **cash and cheques** (physical instruments). `[DECISION]` confirm.

### Invoicing (G1)
- Generate the **tax invoice at dispatch** (`trip.dispatched`; in Sprint 1, on the coordinator's *Mark Dispatched*).
- Lines copy price/tax/HSN from the order; GST split by `state_code` vs site state (CGST+SGST or IGST).
- Delivered-vs-invoiced differences found at ePOD → `credit_notes` (`RETURN`/`DAMAGE`).
- `due_date = invoice_date + customer.credit_days`; COD invoices due immediately.
- Invoices are never edited; cancellation requires owner approval and posts a reversal.

### AR aging & overdue
Daily job sets `OVERDUE` when `due_date < today` and balance > 0. Buckets from config: **0–7, 8–15, 16–30, 30+** days. Overdue beyond `max_overdue_days` flips customer `credit_hold` (M1 reads via `CreditPort`).

### Collection worklist (Scenario E)
Daily at `collection_worklist_time` (08:00): rank customers by `overdue_amount × days_overdue`, add today's delivery-stop customers and PTPs due. Assign to collectors/drivers by route/area.

### Promise-to-Pay
If the customer doesn't pay, the agent **must** log `promised_date` + `reason_code`. System schedules a follow-up alert on that date; a missed PTP is marked `BROKEN` and raises the customer's priority.

### Cheque lifecycle
`RECEIVED` (in custody) → handed over → `DEPOSITED` (bank slip) → `CLEARED` or `BOUNCED`. Bounce reverses the receipt allocation (reversal entries, not deletes) and restores invoice balances.

### Credit notes, rebates, write-offs
Return/damage credit notes auto-requested from M5 returns and approved by coordinator; **REBATE and WRITEOFF** need owner approval (`CREDIT_REBATE_WRITEOFF` exception). Collectors cannot grant them.

### Supplier AP
`grn.posted` + supplier bill → `supplier_ledger_entries` BILL; payments post PAYMENT. AP aging mirrors AR. 3-way match is Phase 2.

---

## 5. Workflows & state machines

```
Invoice:     UNPAID ─► PARTIAL ─► PAID        (OVERDUE overlay by due date; CANCELLED by approved reversal)
Handover:    PENDING ─► VERIFIED   |  PENDING ─► DISPUTED (variance) ─► VERIFIED after owner resolves
Cheque:      RECEIVED ─► DEPOSITED ─► CLEARED | BOUNCED
Credit note: REQUESTED ─► APPROVED ─► POSTED  | REJECTED
EOD:         OPEN ─► READY (all four checks green) ─► SIGNED_OFF
```

### 10-minute EOD closing checklist (§6.7)
| # | Check | Source |
| --- | --- | --- |
| 1 | All trips closed? | M5 `delivery_trips` |
| 2 | All field cash handed over & counted? | `custody_ledger` wallet balances all zero |
| 3 | Any uninvoiced deliveries? | Dispatched/delivered orders without an invoice |
| 4 | Daily net cash position & **bank deposit slip** generated | `cashbook_entries`, `bank_deposits` |

When all green → owner taps **Sign-off** (`eod.closed` → accounting export, day frozen).

---

## 6. Screens

| # | Screen | User | Notes |
| --- | --- | --- | --- |
| S1 | **My Collections** (mobile, offline) | Collector/Driver | Today's worklist, customer ledger, one-tap *Log Collection*, PTP form |
| S2 | **Log Collection** | Collector/Driver | Customer → amount keypad → mode → reference/cheque details → confirm; shows provisional receipt no. |
| S3 | **My Wallet** | Collector/Driver | Cash/cheque in hand, items to hand over |
| S4 | **Cash handover desk** | Coordinator/Cashier | Pick agent → expected amount → enter counted → **Verify Cash Handover** |
| S5 | **AR dashboard** | Coordinator/Owner | Total outstanding, overdue, unsettled field collections, aging buckets, per-customer drilldown |
| S6 | **Invoice list & PDF** | Coordinator | Search, reprint, request cancel |
| S7 | **Cheque register** | Coordinator | Deposit, clear, bounce |
| S8 | **Credit note queue** | Coordinator / Owner | Return/damage/rebate |
| S9 | **EOD closing** | Coordinator + Owner (mobile) | Four-check screen, deposit slip, sign-off |
| S10 | **AP & supplier payments** | Coordinator/Owner | Bills, due list, payments |

---

## 7. API (proposed)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| POST | `/invoices/generate` | internal / OPS | From `trip.dispatched` or manual dispatch |
| GET | `/customers/{id}/ledger` | OPS, OWNER, COLLECTOR (assigned) | |
| GET | `/me/worklist` | COLLECTOR, DRIVER | Cached offline |
| POST | `/collections` | COLLECTOR, DRIVER | **Idempotent**; includes GPS, device time |
| POST | `/ptp` | COLLECTOR, DRIVER | |
| GET | `/me/wallet` | COLLECTOR, DRIVER | |
| POST | `/handovers` · `/handovers/{id}/verify` | OPS(cashier), OWNER | Posts custody + cashbook |
| POST | `/cheques/{id}/deposit` · `/clear` · `/bounce` | OPS | |
| POST | `/credit-notes` · `/{id}/approve` | OPS / OWNER | |
| GET | `/eod/{date}` · POST `/eod/{date}/signoff` | OPS / OWNER | |
| POST | `/suppliers/{id}/payments` | OWNER, OPS | |
| POST | `/accounting/export` | system | Nightly |

---

## 8. Events & ports

| Direction | Name | Detail |
| --- | --- | --- |
| Provides | `LedgerPort` | `postInvoice`, `postReceipt`, `postCreditNote` |
| Provides | AR read model | For `CreditPort` (balance, overdue days) |
| Consumes | `trip.dispatched` | Create invoices |
| Consumes | `delivery.partial` / `delivery.failed` | Credit-note requests |
| Consumes | `trip.closed` | Settle COD stops into driver wallet |
| Consumes | `grn.posted` | Supplier AP entries |
| Consumes | `exception.resolved` (CREDIT_REBATE_WRITEOFF, MANUAL_LEDGER_ADJUSTMENT) | Post or reject |
| Publishes | `collection.logged`, `handover.verified`, `invoice.issued`, `eod.closed` | → M1, M7, M5 |

---

## 9. Integrations, jobs & instrumentation

| Item | Detail |
| --- | --- |
| WhatsApp / SMS receipt | Template `payment_receipt` fired after-commit (via M7); receipts without WhatsApp opt-in fall back to SMS |
| Accounting bridge (Sprint 2) | Nightly export of verified sales invoices, purchase bills and reconciled collection vouchers as Tally XML or Zoho/QuickBooks API; idempotent batches; retry |
| Job 08:00 | Build collection worklists |
| Job 00:30 | Mark overdue invoices; recompute credit holds; age PTPs |
| Job nightly | Verify cached balances vs ledgers (AR, custody) |
| KPI 2 | `eod_closings.initiated_at` → `signed_off_at` |
| KPI 3 | Reconcile: receipts vs wallet vs handovers; weekly dispute report |
| Phase 2 | UPI dynamic QR on driver app; OCR of cheques & deposit slips; automated dunning messages |

---

## 10. Acceptance criteria

1. **BR-07:** logging ₹10,000 cash reduces customer AR by ₹10,000 **and** raises the agent's wallet by ₹10,000, or neither (forced failure mid-transaction → nothing posted).
2. The same offline collection submitted twice creates one receipt and one ledger pair.
3. The agent's wallet clears only after **Verify Cash Handover**; wallet ≠ 0 blocks EOD sign-off.
4. Counted ₹9,800 against expected ₹10,000 → handover `DISPUTED`, variance ₹200, owner notified.
5. `UPDATE`/`DELETE` on `collection_receipts` and ledgers fails; a bounced cheque posts reversal entries and restores invoice balances.
6. **Scenario E:** at 08:00 the worklist contains overdue customers and today's delivery-stop customers; declining to pay forces a PTP date + reason; a missed PTP date marks it `BROKEN`.
7. Collector cannot create a rebate or write-off; owner approval is required.
8. Invoice generated at dispatch with correct GST split; partial delivery produces a credit note, not an invoice edit.
9. EOD screen shows the four checks and refuses sign-off until all are green; KPI 2 timestamps recorded.
10. Nightly drift job shows zero difference between `current_ar_balance` / `cash_custody_balance` and their ledgers.
11. Nightly export produces a batch that re-runs without duplicating vouchers.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| Automated invoicing from delivery/dispatch; mobile field collection logging; **Agent Cash Custody Wallet** & EOD handover reconciliation; automated WhatsApp payment receipts | UPI dynamic QR on driver app; OCR scanning of cheques and bank deposit slips; automated dunning/payment-reminder messages |

---

## 12. Open questions

- `[DECISION]` Invoice at dispatch vs at delivery (G1) — confirm with the accountant.
- `[DECISION]` Does e-invoicing (IRN) apply at Neo's turnover? Affects invoice generation.
- `[DECISION]` Does the custody wallet hold only cash + cheques, or also UPI collected on the agent's behalf?
- `[DECISION]` Who is "cashier": a coordinator, or only the owner?
- `[DECISION]` Rounding and part-payment policy for allocations (FIFO vs customer-specified).
- Opening balances: cut-off date and format for customer AR / supplier AP cleansing (Sprint 0).
- Which accounting tool is the target: Tally Prime, Zoho Books or QuickBooks?

---

## 13. Build checklist

> **Traceability & Evidence:** See [`docs/BLUEPRINT_TRACEABILITY_MATRIX.md`](../BLUEPRINT_TRACEABILITY_MATRIX.md#8-m6-collections--financials-traceability).

**Sprint 1 (core)**
- [x] `[M6-CHK-01]` Migrations: `invoices`, `invoice_lines`, `collection_receipts`, `receipt_allocations`, `customer_ledger_entries`, `custody_ledger`, `cash_handovers`, `cheque_register`, `ptp_followups`, `collection_worklists`, `eod_closings`
- [x] `[M6-CHK-02]` Append-only triggers/revokes on receipts and ledgers
- [x] `[M6-CHK-03]` Invoice generation (manual *Mark Dispatched* trigger) with GST split + PDF
- [x] `[M6-CHK-04]` `logCollection` transaction (BR-07) with idempotency
- [x] `[M6-CHK-05]` Custody wallet + handover verification
- [x] `[M6-CHK-06]` AR aging job · overdue/credit-hold job · `CreditPort` read model
- [x] `[M6-CHK-07]` Worklist job · PTP workflow
- [x] `[M6-CHK-08]` WhatsApp receipt via `NotifyPort`
- [x] `[M6-CHK-09]` EOD checklist + deposit slip + sign-off
- [x] `[M6-CHK-10]` Mobile collection screens (offline) · coordinator desk screens
- [x] `[M6-CHK-11]` Opening-balance import tool

**Sprint 2–3**
- [x] `[M6-CHK-12]` Credit notes (return/damage from M5, rebate/write-off via owner)
- [x] `[M6-CHK-13]` Cheque lifecycle screens
- [x] `[M6-CHK-14]` Supplier AP + payments · `grn.posted` handler
- [x] `[M6-CHK-15]` Accounting export bridge (nightly, idempotent)
- [x] `[M6-CHK-16]` Switch invoice trigger to `trip.dispatched`; COD settlement on `trip.closed`
- [x] `[M6-CHK-17]` 7-day parallel run with Mr. X's manual EOD · acceptance tests §10 (+ Scenario E verified in `m6-acceptance.spec.ts`)
