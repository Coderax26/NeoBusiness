# M7 — Executive Control Tower & Exception Engine (v2 — revised)

**What changed vs v1 (summary):**
1. Removed `AUTO_APPROVE_IF_IN_TOLERANCE` and the expiry-reject model — replaced by the OD-019 escalation chain everywhere (§3, §4, §5).
2. `approval_policies` rebuilt to the exact OD-019 column shape.
3. `SUPPLIER_SHORTFALL` approver aligned to OD-019 (owner-first, not coordinator-first).
4. Defined terminal behavior when escalation exhausts (§4).
5. Added raise-side idempotency, source-cancel auto-close, multi-exception sequencing, delegate-cap enforcement (§4) + matching acceptance tests (§10).
6. New status `CANCELLED`; `exception_events` gains `ESCALATED`/`CANCELLED` + `channel` column.
7. WhatsApp BSP onboarding pulled forward to Sprint 0–1; interim comms plan for M1/M5/M6 (§9, §13).
8. Added missing APIs (notification log, stock alerts, withdraw), outbox retry columns, opt-out handling, timezone & retention notes.

**Build order:** two slices
- **M7a — Exception engine + notification hub:** right after M0 (Sprint 0–1). M1 cannot ship price overrides without it.
- **M7b — Dashboards & analytics:** last (Sprint 3); *Pulse Header* may come earlier.

**Depends on:** M0 · reads from every module · used by every module
**Blueprint refs:** §5.1 M7, §4 Layer 2/3, §6.8, §7.2(7), §7.4, KPIs 1–6, Open Q9/Q10, G9, G13

---

## 1. Purpose & scope

The place where "management by exception" actually happens. Any module that hits a business-rule boundary **pauses its transaction** and raises an Exception Card; Mr. X (or a capped delegate) resolves it in one tap; the originating module resumes.

| Slice | Contents |
| --- | --- |
| **M7a** | Approval policy matrix · exception engine (raise/resolve/escalate/cancel) · Exception Card payloads · owner approval queue · notification hub (FCM push, in-app; WhatsApp log-only) · audit trail viewer |
| **M7b** | Live Pulse Header · Operational Status Matrix · weekly/monthly analytics · EOD dashboard view · stock alerts · KPI instrumentation · WhatsApp go-live |

---

## 2. Roles & permissions

| Role | Can | Cannot |
| --- | --- | --- |
| OWNER | Resolve any exception; see all dashboards, P&L, multi-site ledgers; edit approval policy and thresholds | — |
| Delegate (per OD-019) | Resolve only exception types with `can_delegate = true`, and only when `value_at_risk ≤ delegate_value_cap_inr` (enforced server-side at resolve time — see §4 rule 5) | Change thresholds; resolve owner-only types |
| OPS_COORD | Raise exceptions; see status of their own; see operational (non-financial) dashboard — **no margin data** (resolves former open question) | Resolve owner-level exceptions; see margins |
| Others | Receive notifications relevant to their role | See dashboards |

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`exception_approvals`** | `id` PK · `exception_type` · `reference_table` · `reference_id` · `requested_by` FK · `context_payload_json` · `counter_json` · `status` (`PENDING` \| `APPROVED` \| `REJECTED` \| `COUNTERED` \| `CANCELLED`) · `priority` · `value_at_risk` · `site_id` · `source_module` · `owner_remarks` · `resolved_by` · `resolved_at` · `resolution_channel` (`APP` \| `PUSH`) · `escalation_level` (0=owner, 1=delegate, 2=emergency) · `escalated_to` · `next_escalation_at` · `created_at` | BP + ADD |
| ↳ constraint | **Partial unique index** `uq_active_exception` on `(exception_type, reference_table, reference_id) WHERE status = 'PENDING'` — enforces one active card per rule per entity | ADD |
| ↳ `exception_type` enum (G9) | `PRICE_OVERRIDE`, `CREDIT_BREACH`, `SUPPLIER_PRICE_SPIKE`, `SUPPLIER_SHORTFALL`, `YIELD_VARIANCE` + `ALLOCATION`, `WASTAGE_WRITEOFF`, `STOCK_VARIANCE`, `CREDIT_REBATE_WRITEOFF`, `DELIVERY_DISPUTE`, `MANUAL_LEDGER_ADJUSTMENT`, `CASH_HANDOVER_VARIANCE` (12 total) | BP + ADD |
| **`approval_policies`** (OD-019 shape) | `id` · `exception_type` UNIQUE · `condition_json` (thresholds) · `approver_role` (default `OWNER`) · `can_delegate` BOOL · `delegate_user_id` nullable · `delegate_value_cap_inr` nullable · `escalation_wait_minutes` (default 60) · `second_escalation_user_id` (emergency contact) · `is_active`. **Global in MVP** (no per-site override; Phase 2) | ADD |
| **`exception_events`** | `id` · `exception_id` FK · `event` (`RAISED` \| `NOTIFIED` \| `VIEWED` \| `ESCALATED` \| `RESOLVED` \| `CANCELLED`) · `by_user` nullable (null = system) · `channel` nullable (`APP`\|`PUSH` on RESOLVED — feeds KPI 1; `FCM`\|`WHATSAPP`\|`SMS`\|`IN_APP` on NOTIFIED) · `meta_json` · `at` | ADD |
| **`notification_templates`** | `id` · `code` · `channel` · `language` · `body` · `wa_template_id` · `is_active` | ADD |
| **`notification_outbox`** | `id` · `channel` (`FCM` \| `WHATSAPP` \| `SMS` \| `IN_APP`) · `recipient_type` · `recipient_ref` · `template_code` · `payload_json` · `status` (`QUEUED` \| `SENT` \| `DELIVERED` \| `FAILED`) · `provider_msg_id` · `attempts` · `next_retry_at` · `last_error` · `created_at`. *Note: `DELIVERED` is only real for WHATSAPP/SMS; FCM stops at `SENT`.* | ADD |
| **`whatsapp_optins`** | `phone` · `party_type` · `party_id` · `opted_in_at` · `opted_out_at` nullable. Send path must check `opted_out_at IS NULL`; inbound STOP webhook sets it | ADD |
| **`immutable_audit_logs`** | owned by M0 — M7b provides the viewer | BP |
| **Read models** | `mv_pulse_today`, `mv_ops_status`, `mv_customer_profitability`, `mv_supplier_scorecard`, `mv_yield_trend`, `mv_ar_aging` | ADD |

---

## 4. Business rules

### Exception lifecycle
```
raise(type, ref, payload)
   1. Dedupe: if a PENDING card exists for (type, ref) → return it, no new notification
   2. Insert exception_approvals(PENDING, escalation_level=0,
      next_escalation_at = now + escalation_wait_minutes)
   3. Originating transaction → PENDING_* (paused)
   4. NotifyPort → FCM push + in-app to approver

resolve(id, action, remarks, counter?) ──► APPROVED | REJECTED | COUNTERED
   └─► emit exception.resolved ──► module re-validates rule, then resumes / cancels
```

1. **Raise-side idempotency:** enforced by `uq_active_exception`; duplicate raises (event redelivery, double submit) return the existing card.
2. **Sequential exceptions per reference:** a module raises only the *first* breached rule (rule-check order defined per module). After resolution, re-validation raises the next breached rule if any. Cards never stack on one entity; the owner may get a second card for the same order after approving the first — this is intended.
3. **Single resolution:** first resolution wins; later attempts (double tap, second device) return the existing result with no side effects.
4. **Re-validation on resume:** the originating module re-checks its rule (e.g. M1 re-evaluates the price band) before proceeding.
5. **Delegate enforcement (server-side, at resolve time):** resolver is OWNER → allowed. Otherwise: type must have `can_delegate = true`, resolver must be the current `delegate_user_id`, and `value_at_risk ≤ delegate_value_cap_inr`. All violations → 403 + audit row.
6. **Escalation chain (replaces expiry & auto-approve — OD-019: *never silent auto-approval*):**
   - Level 0: owner notified → wait `escalation_wait_minutes` (default 60)
   - Level 1: delegate push (if policy has a delegate) → wait 60
   - Level 2: emergency contact (`second_escalation_user_id`) via push **+ SMS** → card stays `PENDING`; repeat reminders every 4 h
   - Every step writes `exception_events(ESCALATED)` + `immutable_audit_logs`. "OPEN" in OD-019 = `PENDING` with `escalation_level = 2`.
7. **Terminal behavior:** a fully-escalated card stays `PENDING` and the transaction stays paused until (a) resolved, (b) withdrawn by the requester, or (c) **force-cancelled by the owner from the card** — the module cancels the paused transaction and the card closes as `CANCELLED`. Time-critical modules (M2 shortfall/allocation) surface the force-cancel action prominently.
8. **Auto-close on cancelled source:** when the underlying entity is cancelled/voided, all its `PENDING` cards → `CANCELLED` (+ event row). Resolve attempts on a non-`PENDING` card return current state, no-op.
9. **Timezone:** all business-day logic ("today", EOD, 20:00 cutoffs, 07:00 digest) runs in **Asia/Kolkata**; timestamps stored UTC.
10. **Retention:** `notification_outbox` and `exception_events` hot for 90 days; archival job in Phase 2.

### Approval matrix (OD-019) — defaults
| Exception | Triggered by | Approver | Actions | Delegation |
| --- | --- | --- | --- | --- |
| `PRICE_OVERRIDE` | M1 BR-01 | Owner | Approve / **Counter** / Reject | Delegateable (cap) |
| `CREDIT_BREACH` | M1 BR-02 / M5 | Owner | Approve once / Convert to COD / Reject | Delegateable (cap) |
| `SUPPLIER_PRICE_SPIKE` | M2 BR-03 | Owner | Approve PO / Approve & update floor / Reject | **Owner-only** |
| `SUPPLIER_SHORTFALL` | M2 BR-05 | Owner (coordinator gets operational FYI to prep backup PO) | Issue backup PO / Partial / Escalate | Delegateable (cap) |
| `ALLOCATION` | M2 Scenario C | Owner | Allocate full/partial per customer | Delegateable (cap) |
| `YIELD_VARIANCE` | M4 BR-06 | Owner | Acknowledge / Investigate | **Owner-only** |
| `WASTAGE_WRITEOFF` | M4 (>5%) | Owner | Approve / Reject | **Owner-only** |
| `STOCK_VARIANCE` | M3 | Owner | Approve adjustment / Reject / Recount | Delegateable (cap) |
| `CREDIT_REBATE_WRITEOFF` | M6 | Owner | Approve / Reject | **Owner-only** |
| `DELIVERY_DISPUTE` | M5 | Owner | Accept return / Re-deliver / Reject claim | Delegateable (cap) |
| `MANUAL_LEDGER_ADJUSTMENT` | M0/M6 | Owner (dual-log) | Approve / Reject | **Owner-only** |
| `CASH_HANDOVER_VARIANCE` | M6 | Owner | Accept variance / Recount / Charge to agent | Delegateable (cap) |

*Change from v1: `SUPPLIER_SHORTFALL` is owner-first per OD-019; the coordinator is notified operationally (to start backup-PO prep) but holds no approval authority unless named delegate.*

### Exception Card payload standard
Every card: **title**, **one-line summary**, **key facts** (≤6 label/value pairs), **impact** line, **actions** (buttons, incl. *force-cancel* where applicable), **deep link**. (Examples unchanged from v1: PRICE_OVERRIDE counter card, SUPPLIER_PRICE_SPIKE floor card, ALLOCATION split card.)

---

## 5. Workflows & state machines

```
Exception:  PENDING ─► APPROVED | REJECTED | COUNTERED ─► (module re-validates & acts) ─► closed
            PENDING ──(60 min)──► PENDING (level 1: delegate)
                       ──(60 min)──► PENDING (level 2: emergency contact)
                       ──(reminders every 4 h)──► stays PENDING until resolved / withdrawn / force-cancelled
            PENDING ─► CANCELLED (source cancelled · requester withdraw · owner force-cancel)
Notification: QUEUED ─► SENT ─► DELIVERED | FAILED (retry ≤3 w/ backoff at next_retry_at, then fallback channel)
```

**Owner's day (Layer 3 of TOM):** morning ~15 min price sheet + capacity glance · daytime push → card → one tap · evening ~15 min EOD + sign-off.

---

## 6. Screens

| # | Screen | User | Notes |
| --- | --- | --- | --- |
| S1 | **Approval queue** | Owner (mobile) | Cards by priority/value; one-tap actions; counter-price keypad; voice/text remarks; force-cancel where applicable |
| S2 | **Live Pulse Header** | Owner (mobile top bar) | Today's Sales (₹) · Gross Margin (%) · Cash Collected Today (₹) · Pending Exceptions (count) |
| S3 | **Operational Status Matrix** | Owner / Coordinator | Orders Pending Dispatch · Batches Running · Trucks on Road · Supplier Shortfalls (no margin for coordinators) |
| S4 | **Strategic analytics** | Owner (web) | Customer profitability · supplier fill-rate & inflation · yield & wastage · AR aging |
| S5 | **EOD reconciliation view** | Owner | M6 checklist; wallets, handovers, deposit slip, sign-off |
| S6 | **Stock alerts** | Owner / Coordinator | Low stock, expiring batches, committed vs available |
| S7 | **Audit trail viewer** | Owner | Filter by user/entity/date; before/after JSON |
| S8 | **Policy & threshold settings** | Owner (web) | `approval_policies` (OD-019 fields incl. delegate caps, escalation minutes, emergency contact) + `business_rule_config` |
| S9 | **Notification log** | Coordinator / Owner | Delivery status of WhatsApp/push/SMS |

---

## 7. API (proposed)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/exceptions?status=pending` | OWNER, delegate | Inbox |
| GET | `/exceptions/{id}` | OWNER, requester | Full payload |
| POST | `/exceptions/{id}/resolve` | OWNER, delegate | `{action, remarks, counter?}`; idempotent; delegate cap enforced |
| POST | `/exceptions/{id}/withdraw` | requester, OWNER | Cancels card (`CANCELLED`) + source per module rules |
| GET | `/dashboard/pulse` | OWNER | Cached ≤30 s |
| GET | `/dashboard/status-matrix` | OWNER, OPS | |
| GET | `/dashboard/stock-alerts` | OWNER, OPS | Backs S6 |
| GET | `/analytics/customers` · `/suppliers` · `/yield` · `/ar-aging` | OWNER | Date range params |
| GET | `/audit?user=&entity=&from=&to=` | OWNER | |
| GET/PUT | `/policies` · `/config` | OWNER | Writes audited |
| GET | `/notifications/log?channel=&status=&from=&to=` | OWNER, OPS | Backs S9 |
| POST | `/devices/register` | any | FCM token |
| internal | `ExceptionPort.raise/onResolved`, `NotifyPort.send` | modules | |

Realtime: WebSocket/SSE for new/resolved/escalated exceptions and pulse updates.

---

## 8. Events & ports

| Direction | Name | Detail |
| --- | --- | --- |
| Provides | `ExceptionPort` | `raise(type, ref, payload)` (deduped), `onResolved(type, handler)` |
| Provides | `NotifyPort` | `send(channel, template, recipient, payload)`; checks `whatsapp_optins.opted_out_at` |
| Consumes | `exception.requested` (all), `order.pending_approval`, `po.price_spike_detected`, `po.shortfall_detected`, `issue.escalated`, `handover.verified` … | Create cards |
| Consumes | `*.cancelled` / `*.voided` on any referenced entity | Auto-close pending cards (§4 rule 8) |
| Consumes | Any domain event | Update read models |
| Publishes | `exception.resolved` | → originating module |
| Publishes | `notification.failed` | → coordinator desk |

---

## 9. Integrations, jobs & instrumentation

### Integrations (§7.4)
| Integration | Use | Notes |
| --- | --- | --- |
| **Firebase Cloud Messaging** | Instant push of Exception Cards to Mr. X | Deep link; PIN/biometric to approve (pending open decision) |
| **WhatsApp Business API** | Customer: Order Confirmation PDF, Dispatch Alert, Tax Invoice, Payment Receipt. Supplier: PO PDF | **BSP onboarding + template submission starts Sprint 0–1** (1–3 wk lead time — do not wait for M7b). Opt-in capture + STOP/opt-out webhook. SMS fallback |
| **SMS gateway** | OTPs (M0/M5), WhatsApp fallback, level-2 escalation alerts | |

**Interim comms plan (M1/M5/M6 ship before WhatsApp is live):** order confirmations, dispatch alerts, receipts go via in-app PDF share + SMS until M7b flips the channel. Template codes: `order_confirmation`, `dispatch_alert`, `tax_invoice`, `payment_receipt`, `po_to_supplier`, `ptp_reminder`, `otp`.

### Jobs
| Job | Schedule |
| --- | --- |
| Outbox relay (retry w/ backoff via `next_retry_at`, fallback channel, `last_error`) | continuous |
| **Escalation sweep** (advance `escalation_level`, set `next_escalation_at`, send level notifications; replaces v1 expiry sweep) | every minute |
| Materialised-view refresh (pulse 30–60 s; analytics nightly) | |
| Stock alert digest | 07:00 IST |

### KPI instrumentation (§9.4)
| KPI | Capture |
| --- | --- |
| 1 Owner call volume (<10/day) | Manual call-log sample + exceptions/day resolved by tap (`exception_events`, split by `channel` APP vs PUSH) |
| 2 EOD time (<10 min) | `eod_closings.initiated_at` → `signed_off_at` |
| 3 Missed entries (0%) | Weekly audit job: receipts vs wallet vs handovers vs AR disputes |
| 4 Routine order confirmation (<2 min) | `sales_orders.created_at` → `confirmed_at` (in-band orders) |
| 5 Margin erosion visibility (100%) | Orders below target margin without owner override = count |
| 6 ePOD visibility (100% before 20:00 IST) | % trips with `completion_time ≤ 20:00` and valid ePOD on all stops |

---

## 10. Acceptance criteria

1. Raising `PRICE_OVERRIDE` pauses the order; push reaches the owner; **Counter ₹89.50** resolves in one tap and M1 resumes with the counter (Scenario A).
2. Resolving the same card twice (double tap / two devices) → one resolution, no duplicate side effects.
3. **Escalation chain:** an untouched card escalates owner → delegate at 60 min → emergency contact (push + SMS) at 120 min → stays `PENDING`; each step writes exactly one `exception_events(ESCALATED)` row and one audit row; **no auto-approval ever occurs**.
4. **Scenario B:** spike card shows old→new price, % change, affected open orders, suggested floor; "Approve PO & update floor" triggers M2 and M1 updates.
5. **Scenario C:** `ALLOCATION` card lists affected customers and supply; owner's split reflected in M1 orders.
6. Pulse Header values match source data (reconciliation test).
7. Failed WhatsApp send retries with backoff, falls back to SMS, and appears in the notification log.
8. Every resolution, escalation, and cancellation writes an audit row **and** an `exception_events` row.
9. **Authorization:** non-owner cannot resolve owner-level exceptions; a delegate above `delegate_value_cap_inr` is rejected (403 + audit); a delegate cannot resolve owner-only types, even under cap.
10. **Raise idempotency:** a duplicate raise for the same `(type, reference)` while `PENDING` returns the existing card and sends no duplicate notification.
11. **Source cancellation:** cancelling the underlying order auto-closes its card (`CANCELLED` + event row); resolving a `CANCELLED` card returns current state with no side effects.
12. KPI queries in §9 return values for a seeded test day.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| One-tap owner mobile approvals (PIN/biometric); push + in-app notifications; escalation chain; Pulse Header; Status Matrix; EOD view; audit trail; interim SMS/in-app customer comms | AI anomaly detection & forecasting; scheduled PDF/email digests; approve-by-WhatsApp-reply; richer BI exports; **auto-approve-in-tolerance** (only with explicit owner sign-off — disabled per OD-019); retention archival automation; per-site approval policies |

---

## 12. Open questions

- `[CONFIRMED 2026-10-22 — OD-019]` Delegated approval with escalation, **never silent auto-approval** — now fully reflected in §3 (`approval_policies` shape), §4 (rules 5–7), §5, §10.
- `[DECISION]` Approvals directly from the push notification, or only after opening the app with PIN/biometric?
- `[DECISION]` Definition of "Today's Sales": confirmed orders, dispatched orders, or invoices issued? (OD-020 — AWAITING)
- `[DECISION]` Which WhatsApp BSP/provider, and who completes template approvals and opt-ins? (OD-022 — AWAITING; **note:** start BSP onboarding in Sprint 0–1 regardless, due to 1–3 week lead time)
- `[DECISION]` Dashboard refresh expectations (real-time vs ~1 min). (OD-021 — AWAITING)
- ~~Coordinator margin visibility~~ — **RESOLVED:** coordinators get operational dashboards only, no margin (§2).

---

## 13. Build checklist

**M7a (early — Sprint 0–1)**
- [ ] Migrations: `exception_approvals` (12-type enum, escalation columns, `resolution_channel`, **`uq_active_exception` partial unique index**), `approval_policies` (OD-019 shape), `exception_events` (incl. `channel`), `notification_templates`, `notification_outbox` (`next_retry_at`, `last_error`), `whatsapp_optins` (`opted_out_at`)
- [ ] Exception service: raise (with dedupe) · resolve (idempotent + delegate-cap enforcement) · escalation sweep · auto-close on source cancel · `ExceptionPort`
- [ ] Card payload builders (start `PRICE_OVERRIDE`, `CREDIT_BREACH`)
- [ ] Notification hub: FCM + in-app (WhatsApp log-only), outbox relay with retry/backoff/fallback, opt-out check, `NotifyPort`
- [ ] Owner approval queue UI (mobile) with counter-price keypad and force-cancel
- [ ] Device registration, push deep links, PIN/biometric gate
- [ ] **Parallel track: WhatsApp BSP onboarding + template submission kickoff (needed by M7b)**
- [ ] Interim customer comms for M1/M5/M6: in-app PDF share + SMS fallback
- [ ] Remaining exception types as M2/M3/M4/M5/M6 land

**M7b (late — Sprint 3)**
- [ ] Read models / materialised views + refresh jobs
- [ ] Pulse Header, Status Matrix, EOD view, Stock alerts (S6 + API)
- [ ] Analytics: customer profitability, supplier fill-rate & inflation, yield & wastage, AR aging
- [ ] WhatsApp go-live: approved templates, opt-in capture, STOP/opt-out webhook, SMS fallback
- [ ] Audit viewer · policy/threshold settings UI (OD-019 fields) · notification log (S9 + API)
- [ ] KPI queries + weekly audit job
- [ ] Acceptance tests §10 (1–12, incl. Scenarios A, B, C end-to-end)
