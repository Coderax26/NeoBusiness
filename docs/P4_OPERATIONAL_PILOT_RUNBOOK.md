# Phase P4.6 — 7-Day Parallel Operational Pilot & Go-Live Runbook

**Objective:** Execute a structured 7-day parallel run alongside the legacy manual EOD process to confirm zero unexplained financial, stock, or custody discrepancies before full production cutover.

---

## 1. Daily Parallel Reconciliation Matrix (7-Day Protocol)

At `20:30 IST` each day during the 7-day pilot, the **Operations Coordinator** and **Owner** execute `PilotReconciliationService.generateDailyReport(siteId, date)` and compare against physical/manual books:

| Domain | Automated System Metric | Manual Comparison Source | Tolerance | Escalation on Mismatch |
|---|---|---|---|---|
| **1. Sales Invoices** | Sum & count of `tax_invoices` issued today (`OD-020`) | Physical GST invoice book | ₹0.00 | Inspect draft/unconfirmed orders & `doc_sequences` |
| **2. Collections & Custody** | `collection_receipts` vs `custody_ledger` (Cash & Cheques `OD-015`) | Physical cash drawer + cheque register | ₹0.00 | Trigger `HANDOVER_DISPUTE` & recount safe |
| **3. Inventory Stock** | `stock_ledger_txns` net movements (`GRN`, `PROD_CONSUME`, `DISPATCH`) | Physical warehouse evening stock count | $\pm 0.5\%$ (process shrinkage) | Submit `stock.adjust_request` for Owner approval |
| **4. Factory Yield** | `work_orders` output + scrap vs issued raw material (`OD-012`) | Production batch register | $\pm 3.0\%$ | Review wastage reason logs with `PROD_MGR` |
| **5. Fleet & Trips** | All `delivery_trips` closed (`BR-08`), ePOD photos captured | Driver physical challan copies | 0 unclosed trips | Resolve pending returns / COD stops |
| **6. Exceptions & SLAs** | Pending/resolved `exception_approvals` & escalation wait times (`OD-019`) | Owner call/WhatsApp log | 0 stale > 60m | Tune `approval_policies` delegate caps |
| **7. Dashboard Totals** | `mv_pulse_today` & `mv_ar_aging` totals vs raw ledger tables | Manual EOD Excel summary | ₹0.00 | Trigger manual MV refresh & inspect dead-letters |

---

## 2. Role-by-Role Pilot Feedback Tracker

| Role | Day 1–2 Focus | Day 3–5 Focus | Day 6–7 Sign-Off Metric |
|---|---|---|---|
| **`OWNER`** | Control Tower Pulse accuracy, Margin Simulator usability | Exception SLA latency, AR Aging WhatsApp reminders | 100% EOD Sign-off completed in < 5 mins |
| **`OPS_COORD`** | Quick Order keyboard speed (< 45s/order), Cash Handover variance | Trip Builder capacity checks, Tally Prime XML export | Zero manual calculation errors |
| **`PROD_MGR`** | Tablet Kanban touch ergonomics, offline tolerance | Batch completion & mass-balance warnings | Zero financial data leakage confirmed |
| **`STOREKEEPER`** | Blind GRN keypad workflow, delivery challan photo upload | Vehicle loading unlock speed | Zero blind-GRN mismatches > tolerance |
| **`DRIVER`** | Stop manifest & Google Maps handoff, ePOD signature | Offline COD cash logging & handover | 100% trip closures before EOD |
| **`COLLECTOR`** | Doorstep receipting & FIFO allocation | PTP reminders & cheque bounce tracking | Wallet zeroed daily |

---

## 3. Final Go-Live Sign-Off Gate

Before marking Phase P4 pilot complete and entering steady-state production:
- [ ] **7 Consecutive Days** completed with **zero unexplained financial or stock discrepancies**.
- [ ] Zero missed `outbox_events` and zero duplicate `Idempotency-Key` double-charges.
- [ ] **Owner Sign-Off**: __________________________ &nbsp;&nbsp; **Date**: _______________

