# M7 — Executive Control Tower & Exception Engine

**Build order:** two slices
- **M7a — Exception engine + notification hub:** build right after M0 (Sprint 0–1). M1 cannot ship price overrides without it.
- **M7b — Dashboards & analytics:** build last (Sprint 3), though the *Pulse Header* can come earlier.

**Depends on:** M0 · reads from every module · used by every module
**Blueprint refs:** §5.1 M7, §4 Layer 2/3, §6.8, §7.2(7) `exception_approvals` & audit, §7.4 WhatsApp/FCM, KPIs 1–6, Open Q9/Q10, G9, G13

---

## 1. Purpose & scope

The place where "management by exception" actually happens. Any module that hits a business-rule boundary **pauses its transaction** and raises an Exception Card; Mr. X resolves it in one tap; the originating module resumes.

| Slice | Contents |
| --- | --- |
| **M7a** | Approval policy matrix · exception engine (raise/resolve/expire/escalate) · Exception Card payloads · owner approval queue · notification hub (FCM push, WhatsApp, SMS, in-app) · audit trail viewer |
| **M7b** | Live Pulse Header · Operational Status Matrix · weekly/monthly analytics · EOD dashboard view · stock alerts · KPI instrumentation |

---

## 2. Roles & permissions

| Role | Can | Cannot |
| --- | --- | --- |
| OWNER | Resolve any exception; see all dashboards, P&L, multi-site ledgers; edit approval policy and thresholds | — |
| Delegate (ADD, G13) | Resolve only the exception types the owner delegates, up to a value limit | Change thresholds |
| OPS_COORD | Raise exceptions; see status of their own; see operational (non-financial) dashboard | Resolve owner-level exceptions |
| Others | Receive notifications relevant to their role | See dashboards |

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`exception_approvals`** | `id` PK · `exception_type` · `reference_table` · `reference_id` · `requested_by` FK · `context_payload_json` · `status` (`PENDING` \| `APPROVED` \| `REJECTED`) · `owner_remarks` · `resolved_at` | BP |
| ↳ extended `exception_type` enum (G9) | BP: `PRICE_OVERRIDE`, `CREDIT_BREACH`, `SUPPLIER_PRICE_SPIKE`, `SUPPLIER_SHORTFALL`, `YIELD_VARIANCE` — **ADD:** `ALLOCATION`, `WASTAGE_WRITEOFF`, `STOCK_VARIANCE`, `CREDIT_REBATE_WRITEOFF`, `DELIVERY_DISPUTE`, `MANUAL_LEDGER_ADJUSTMENT`, `CASH_HANDOVER_VARIANCE` | ADD |
| ↳ added columns | `status` extra value `COUNTERED` / `EXPIRED` · `counter_json` (e.g. counter price) · `resolved_by` · `priority` · `value_at_risk` · `site_id` · `expires_at` · `escalated_to` · `source_module` | ADD |
| **`approval_policies`** | `id` · `exception_type` · `condition_json` (threshold/value) · `approver_role` · `delegate_user_id` nullable · `max_delegate_value` · `auto_expire_minutes` · `on_expire` (`REJECT` \| `ESCALATE` \| `AUTO_APPROVE_IF_IN_TOLERANCE`) · `is_active` | ADD (Q2, Q9, G13) |
| **`exception_events`** | `exception_id` · `event` (`RAISED` \| `NOTIFIED` \| `VIEWED` \| `RESOLVED` \| `EXPIRED`) · `by_user` · `at` | ADD |
| **`notification_templates`** | `id` · `code` · `channel` · `language` · `body` · `wa_template_id` · `is_active` | ADD |
| **`notification_outbox`** | `id` · `channel` (`FCM` \| `WHATSAPP` \| `SMS` \| `IN_APP`) · `recipient_type` · `recipient_ref` · `template_code` · `payload_json` · `status` (`QUEUED` \| `SENT` \| `DELIVERED` \| `FAILED`) · `provider_msg_id` · `attempts` · `created_at` | ADD |
| **`whatsapp_optins`** | `phone` · `party_type` · `party_id` · `opted_in_at` | ADD |
| **`immutable_audit_logs`** | owned by M0 — M7b provides the viewer | BP |
| **Read models / materialised views** | `mv_pulse_today`, `mv_ops_status`, `mv_customer_profitability`, `mv_supplier_scorecard`, `mv_yield_trend`, `mv_ar_aging` | ADD |

---

## 4. Business rules

### Exception lifecycle
```
raise(type, ref, payload) ──► insert exception_approvals(PENDING)
        │                       ├─ originating transaction set to PENDING_* (paused)
        │                       ├─ resolve approver via approval_policies
        │                       └─ NotifyPort → FCM push to approver (+ in-app)
        ▼
resolve(id, action, remarks, counter?) ──► APPROVED | REJECTED | COUNTERED
        └─► emit exception.resolved ──► originating module resumes / cancels
```
- **Idempotent & single-resolution:** first resolution wins; later attempts return the existing result.
- **Re-validation on resume:** the originating module re-checks its rule (e.g. M1 re-evaluates price band) before proceeding.
- **Auto-expire / escalate (ADD):** per policy, a card unresolved after `auto_expire_minutes` is rejected, escalated to a delegate, or (for in-tolerance cases) auto-approved. Resolves G13.

### Approval matrix (Open Q2, Q9) — defaults
| Exception | Triggered by | Approver | Actions |
| --- | --- | --- | --- |
| `PRICE_OVERRIDE` | M1 BR-01 | Owner | Approve / **Counter** / Reject |
| `CREDIT_BREACH` | M1 BR-02 / M5 | Owner | Approve once / Convert to COD / Reject |
| `SUPPLIER_PRICE_SPIKE` | M2 BR-03 | Owner | Approve PO / Approve & update floor / Reject |
| `SUPPLIER_SHORTFALL` | M2 BR-05 | Coordinator → Owner if unresolved | Issue backup PO / Partial / Escalate |
| `ALLOCATION` | M2 Scenario C | Owner | Allocate full/partial per customer |
| `YIELD_VARIANCE` | M4 BR-06 | Owner | Acknowledge / Investigate (FG already in stock) |
| `WASTAGE_WRITEOFF` | M4 (>5%) | Owner | Approve / Reject |
| `STOCK_VARIANCE` | M3 | Owner | Approve adjustment / Reject / Recount |
| `CREDIT_REBATE_WRITEOFF` | M6 | Owner | Approve / Reject |
| `DELIVERY_DISPUTE` | M5 (value ≥ threshold or full rejection) | Owner | Accept return / Re-deliver / Reject claim |
| `MANUAL_LEDGER_ADJUSTMENT` | M0/M6 | Owner (dual-log) | Approve / Reject |
| `CASH_HANDOVER_VARIANCE` | M6 | Owner | Accept variance / Recount / Charge to agent |

### Exception Card payload standard
Every card has: **title**, **one-line summary**, **key facts** (≤6 label/value pairs), **impact** line, **actions** (buttons), **deep link**. Examples from the blueprint:
- *PRICE_OVERRIDE:* "Customer ABC wants 500 kg Item Y @ ₹88 (Margin 7.3%, Floor ₹90) — [Approve ₹88] [Counter ₹89.50] [Reject]".
- *SUPPLIER_PRICE_SPIKE:* "Supplier X raised Material Z +12% (₹50→₹56). 3 open customer orders will drop below 5% margin; Floor for Item Z needs ₹58→₹64 — [Approve PO & update floor] …".
- *ALLOCATION:* "Supplier A short 400 kg. Backup B @ ₹51 covers 250. Choose who gets full delivery."

---

## 5. Workflows & state machines

```
Exception: PENDING ─► APPROVED | REJECTED | COUNTERED ─► (module acts) ─► closed
           PENDING ─► EXPIRED ─► (policy: reject | escalate | auto-approve)
Notification: QUEUED ─► SENT ─► DELIVERED | FAILED (retry ≤3, then fallback channel)
```

**Owner's day (Layer 3 of TOM)**
- **Morning (~15 min):** price sheet (M1 S2) → capacity glance (Status Matrix).
- **Daytime:** push notification → card → one tap.
- **Evening (~15 min):** EOD dashboard (from M6) → sign-off.

---

## 6. Screens

| # | Screen | User | Notes |
| --- | --- | --- | --- |
| S1 | **Approval queue** | Owner (mobile) | Cards sorted by priority/value; one-tap actions; counter-price keypad; remarks voice/text |
| S2 | **Live Pulse Header** | Owner (mobile top bar) | `Today's Sales (₹)` · `Gross Margin (%)` · `Cash Collected Today (₹)` · `Pending Exceptions (count)` |
| S3 | **Operational Status Matrix** | Owner / Coordinator | Progress bars: Orders Pending Dispatch · Factory Batches Running · Trucks on Road (Stop X of Y) · Supplier Shortfalls |
| S4 | **Strategic analytics** | Owner (web) | Customer profitability ranking · Supplier fill-rate & price inflation · Factory yield & wastage trend · AR aging (0–7, 8–15, 16–30, 30+) |
| S5 | **EOD reconciliation view** | Owner | Reads M6 checklist; wallets, handovers, deposit slip, sign-off |
| S6 | **Stock alerts** | Owner / Coordinator | Low stock, expiring batches, committed vs available |
| S7 | **Audit trail viewer** | Owner | Filter by user/entity/date; before/after JSON |
| S8 | **Policy & threshold settings** | Owner (web) | `approval_policies`, `business_rule_config` (README §6) |
| S9 | **Notification log** | Coordinator / Owner | Delivery status of WhatsApp/push |

---

## 7. API (proposed)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/exceptions?status=pending` | OWNER, delegate | Inbox |
| GET | `/exceptions/{id}` | OWNER, requester | Full payload |
| POST | `/exceptions/{id}/resolve` | OWNER, delegate | `{action, remarks, counter?}`; idempotent |
| GET | `/dashboard/pulse` | OWNER | Cached ≤30 s |
| GET | `/dashboard/status-matrix` | OWNER, OPS | |
| GET | `/analytics/customers` · `/suppliers` · `/yield` · `/ar-aging` | OWNER | Date range params |
| GET | `/audit?user=&entity=&from=&to=` | OWNER | |
| GET/PUT | `/policies` · `/config` | OWNER | Writes audited |
| POST | `/devices/register` | any | FCM token |
| internal | `ExceptionPort.raise/onResolved`, `NotifyPort.send` | modules | |

Realtime: WebSocket/SSE channel for new/resolved exceptions and pulse updates.

---

## 8. Events & ports

| Direction | Name | Detail |
| --- | --- | --- |
| Provides | `ExceptionPort` | `raise(type, ref, payload)`, `onResolved(type, handler)` |
| Provides | `NotifyPort` | `send(channel, template, recipient, payload)` |
| Consumes | `exception.requested` (all), `order.pending_approval`, `po.price_spike_detected`, `po.shortfall_detected`, `issue.escalated`, `handover.verified` … | Create cards |
| Consumes | Any domain event | Update read models (pulse, matrix, analytics) |
| Publishes | `exception.resolved` | → originating module |
| Publishes | `notification.failed` | → coordinator desk |

---

## 9. Integrations, jobs & instrumentation

### Integrations (§7.4)
| Integration | Use | Notes |
| --- | --- | --- |
| **Firebase Cloud Messaging** | Instant push of Exception Cards to Mr. X | Deep link into app; require PIN/biometric to approve |
| **WhatsApp Business API** | Customer: Order Confirmation PDF, Dispatch Alert (with driver contact), Tax Invoice, Payment Receipt. Supplier: PO PDF | Needs pre-approved templates, customer opt-in and a BSP account; SMS fallback |
| **SMS gateway** | OTPs (M0/M5), fallback for failed WhatsApp | |

Template codes (ADD): `order_confirmation`, `dispatch_alert`, `tax_invoice`, `payment_receipt`, `po_to_supplier`, `ptp_reminder`, `otp`.

### Jobs
| Job | Schedule |
| --- | --- |
| Outbox relay for notifications (retry, backoff, fallback channel) | continuous |
| Exception expiry/escalation sweep | every minute |
| Materialised-view refresh (pulse every 30–60 s; analytics nightly) | |
| Stock alert digest | 07:00 |

### KPI instrumentation (blueprint §9.4)
| KPI | Capture |
| --- | --- |
| 1 Owner call volume (<10/day) | Manual call-log sample *plus* count of exceptions/day resolved by tap (`exception_events`) |
| 2 EOD time (<10 min) | `eod_closings.initiated_at` → `signed_off_at` |
| 3 Missed entries (0%) | Weekly audit job: receipts vs wallet vs handovers vs AR disputes |
| 4 Routine order confirmation (<2 min) | `sales_orders.created_at` → `confirmed_at` for in-band orders |
| 5 Margin erosion visibility (100%) | Orders with `margin_pct` below target without owner override = count |
| 6 ePOD visibility (100% before 20:00) | % of trips with `completion_time ≤ 20:00` and all stops with valid ePOD |

---

## 10. Acceptance criteria

1. Raising `PRICE_OVERRIDE` pauses the order; a push reaches the owner's device; **Counter ₹89.50** resolves it in one tap and M1 resumes with the counter (Scenario A).
2. Resolving the same card twice (double tap / two devices) results in one resolution and no duplicate side effects.
3. A card with an expiry policy follows it (reject / escalate / auto-approve) exactly once.
4. **Scenario B:** the spike card shows old→new price, % change, count of affected open orders and suggested floor; "Approve PO & update floor" triggers M2 and M1 updates.
5. **Scenario C:** `ALLOCATION` card lists affected customers and supply; the owner's split is reflected in M1 orders.
6. Pulse Header values match source data: sales, gross margin, cash collected, pending exceptions (verified by reconciliation test).
7. A failed WhatsApp send retries, then falls back to SMS, and appears in the notification log.
8. Every resolution writes an audit log row and an `exception_events` row.
9. A non-owner cannot resolve owner-level exceptions via the API.
10. KPI queries in §9 return values for a seeded test day.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| One-tap owner mobile approvals; push + WhatsApp notifications; Pulse Header; Operational Status Matrix; EOD view; audit trail | AI anomaly detection and forecasting; scheduled PDF/email digests; delegate/approval-by-WhatsApp-reply; richer BI exports |

---

## 12. Open questions

- `[DECISION]` When Mr. X is unavailable, who approves, and which exception types may be auto-expired or delegated? (G13)
- `[DECISION]` Should approvals be possible directly from the push notification, or only after opening the app with PIN/biometric?
- `[DECISION]` Definition of "Today's Sales": confirmed orders, dispatched orders, or invoices issued?
- `[DECISION]` Which WhatsApp BSP/provider, and who completes template approvals and customer opt-ins?
- `[DECISION]` Dashboard refresh expectations (real-time vs ~1 min).
- Do coordinators see margin in dashboards, or only the owner?

---

## 13. Build checklist

> **Traceability & Evidence:** See [`docs/BLUEPRINT_TRACEABILITY_MATRIX.md`](../BLUEPRINT_TRACEABILITY_MATRIX.md#9-m7-control-tower--exceptions-traceability).

**M7a (early)**
- [x] `[M7-CHK-01]` Migrations: `exception_approvals` (+ extended enum/columns), `approval_policies`, `exception_events`, `notification_templates`, `notification_outbox`, `whatsapp_optins`
- [x] `[M7-CHK-02]` Exception service (raise, resolve, idempotency, expire/escalate) + `ExceptionPort`
- [x] `[M7-CHK-03]` Card payload builders per exception type (start with `PRICE_OVERRIDE`, `CREDIT_BREACH`)
- [x] `[M7-CHK-04]` Notification hub: FCM + in-app first (log-only for WhatsApp), `NotifyPort`
- [x] `[M7-CHK-05]` Owner approval queue UI (mobile) with counter-price keypad
- [x] `[M7-CHK-06]` Device registration and push deep links
- [x] `[M7-CHK-07]` Add remaining exception types as M2/M3/M4/M5/M6 land

**M7b (late)**
- [x] `[M7-CHK-08]` Read models / materialised views and refresh jobs
- [x] `[M7-CHK-09]` Pulse Header, Status Matrix, EOD view
- [x] `[M7-CHK-10]` Analytics: customer profitability, supplier fill-rate & price inflation, yield & wastage trend, AR aging
- [ ] `[M7-CHK-11]` WhatsApp BSP integration + templates + opt-ins + SMS fallback *(Deferred DEF-01: live BSP credentials pending Owner Meta KYC; SMS fallback verified)*
- [x] `[M7-CHK-12]` Audit viewer · policy/threshold settings UI
- [x] `[M7-CHK-13]` KPI queries and weekly audit job
- [x] `[M7-CHK-14]` Acceptance tests §10 (+ Scenarios A, B, C end-to-end verified in test suites)
