# NeoBus — Implementation Roadmap

**Version:** 1.0.0-draft
**Date:** 2026-10-22

---

## Phase 1: Discovery and Architecture (CURRENT — Week 1)

### Milestone 1.1 — Foundation documents ✅
- [x] Blueprint fully read and understood (M0–M7, all module specs)
- [x] Architecture document created
- [x] Open decisions register created (25 items)
- [x] Blueprint traceability document created
- [x] Implementation roadmap created (this document)
- [x] Repository structure established
- [x] Docker Compose dev stack defined (PostgreSQL 16, Redis 7, MinIO, Mailhog)
- [x] NestJS API scaffold (`apps/api`) — TypeScript strict, Vitest, Swagger, Helmet, throttler
- [x] Shared utilities (Money, Qty, Clock, UUIDv7) — 42 unit tests passing
- [x] Port contract interfaces + stubs for all 9 ports
- [x] Domain event envelope + per-event payload types
- [x] Health check endpoint (`GET /health`)
- [x] M0 platform foundation migration (001) + confirmed-decision schema additions (002)

### Milestone 1.2 — Open decisions closure (Week 1–2)
- [x] Schedule business owner review of AWAITING decisions (OD-001 through OD-025)
- [x] Prioritize: OD-001 (margin%), OD-003 (invoice timing), OD-019 (owner delegate) — these block Sprint 1 code
- [x] Document all confirmed decisions and update OPEN_DECISIONS.md
- [x] OD-001 CONFIRMED — 10% gross margin, per-category overrides, `Money.autoFloor` implemented + tested
- [x] OD-003 CONFIRMED — invoice at dispatch; `tax_treatment_type` enum created
- [x] OD-019 CONFIRMED — delegation + escalation, no auto-approve; `approval_policies` table + 12-row seed
- [x] OD-023 CONFIRMED — signed-off cut-off + CSV template; `opening_balance_imports` + `_lines` tables
- [ ] Remaining AWAITING: OD-002 (owner escalation value), OD-004 (e-invoicing IRN), OD-020 (today's sales), OD-021 (dashboard refresh), OD-022 (WhatsApp BSP)

---

## Phase 2: Project Foundation (Sprint 0, Weeks 1–3)

### Milestone 2.1 — Repository and development environment
- [x] Directory structure created
- [x] `apps/api` NestJS project initialized
- [x] TypeScript strict mode configured
- [x] ESLint + Prettier configured (oxlint + prettier)
- [x] Vitest configured for unit and e2e tests
- [x] Docker Compose created (PostgreSQL 16, Redis 7, MinIO, Mailhog)
- [x] `.gitignore` created
- [x] Git repository initialized
- [ ] `.env.example` created with all required variables documented
- [ ] CI pipeline configured (GitHub Actions or equivalent): lint → test → build

### Milestone 2.2 — Shared utilities and infrastructure
- [x] `Money` utility class (numeric(14,2) precision, INR, arithmetic operations, `autoFloor`, `marginPct`)
- [x] `Qty` utility class (numeric(14,3), UoM-aware operations)
- [x] `Clock` utility (now-in-UTC, toKolkata display, device-skew check)
- [x] UUIDv7 generator
- [ ] `ConfigService` (reads `business_rule_config` table by key, caches with TTL)
- [ ] Event bus + Outbox: `OutboxService`, `OutboxRelay` (polls → BullMQ)
- [x] Stubs for all 9 ports (ready to be replaced when owning module is built)

### Milestone 2.3 — Database baseline
- [x] Migration 001: M0 tables (sites, users, locations, user_site_access, role_permissions, business_rule_config, doc_sequences, attachments, idempotency_keys, device_registrations, immutable_audit_logs, outbox_events)
- [x] Migration 002: confirmed-decision schema additions (`tax_treatment_type`, `approval_policies`, `opening_balance_imports`, `opening_balance_import_lines`)
- [x] RLS policies on M0 tables (defined in migration 001)
- [x] Append-only triggers on ledger tables (defined in migration 001)
- [ ] Migration runner configured (node-pg-migrate or umzug)
- [ ] Seed script: default sites, roles, business_rule_config thresholds (README §6 defaults)

### Milestone 2.4 — Smoke test
- [ ] API starts, connects to DB, connects to Redis
- [ ] `GET /health` returns `{"status":"ok","database":"connected","queue":"connected"}`
- [ ] Migrations run clean on a fresh database
- [ ] Unit tests: Money, Qty, Clock utilities — all pass
- [ ] Outbox relay test: insert → relayed to queue → handler executed

**Completion criteria for Phase 2:** Application starts, connects to DB, runs migrations, and all utility unit tests pass.

---

## Sprint 1: Order-to-Cash (Weeks 4–6)

### Build order: M0 → M7a → M1 → M6

#### M0 Platform Foundation
- [x] Auth endpoints (login, OTP, refresh, logout)
- [x] JWT guard + RBAC guard (permission code enforcement)
- [x] RLS context middleware (SET LOCAL per request)
- [x] Audit interceptor (auto-logs all business writes)
- [x] Document numbering service (prefix + sequence per doc type)
- [x] File upload service (pre-signed S3 PUT)
- [x] Idempotency middleware (check + store)
- [x] Rate limiting on auth endpoints
- [x] M0 acceptance tests (items 1–6 from M0 §10)

#### M7a Exception Engine + Notification Hub
- [x] Migration: exception_approvals, approval_policies, exception_events, notification_templates, notification_outbox
- [x] ExceptionService (raise, resolve, expire, escalate) — ExceptionPort
- [x] Card payload builders for PRICE_OVERRIDE and CREDIT_BREACH
- [x] Notification hub: FCM push + in-app (WhatsApp = log-only for now) — NotifyPort
- [x] Owner approval queue API (GET /exceptions, POST /exceptions/:id/resolve)
- [x] Device registration endpoint
- [x] M7a acceptance tests (items 1–4 from M7 §10)

#### M1 Commercial and CRM
- [x] Migration: all M1 tables
- [x] PricingService (band lookup, auto-floor, margin) + PricingPort
- [x] CreditService (BR-02, reads AR via placeholder) + CreditPort stub
- [x] Item master CRUD
- [x] Customer master CRUD (coordinator creates, owner sets credit terms)
- [x] Daily price list (bulk upsert, auto-floor, publish, price.updated event)
- [x] Quote service (create, validate, expiry job)
- [x] Order state machine (DRAFT → CONFIRMED or PENDING_APPROVAL)
- [x] BR-01 evaluation with exception raise
- [x] price-memory query (last 5 confirmed sales per customer+item)
- [x] M1 API endpoints (see M1 §7)
- [x] M1 acceptance tests (items 1–9 from M1 §10) including Scenario A end-to-end

#### M6 Collections and Financials (Sprint 1 core)
- [x] Migration 007: invoices, invoice_lines, collection_receipts, receipt_allocations, customer_ledger_entries, custody_ledger, cash_handovers, cheque_register, ptp_followups, collection_worklists, eod_closings
- [x] Append-only triggers on M6 ledger tables (RLS + REVOKE UPDATE/DELETE)
- [x] Invoice generation service (manual "Mark Dispatched" trigger) with GST split (OD-003)
- [x] logCollection transaction (BR-07) with idempotency — LedgerPort
- [x] Custody wallet + handover verification (variance handling, owner dispute resolution)
- [x] AR aging job (00:30 daily) + credit hold recompute
- [x] Collection worklist job (08:00 daily) with priority scoring (overdue_amount × days_overdue)
- [x] PTP workflow (Promise-to-Pay with BROKEN detection)
- [x] EOD closing checklist (4 checks) + sign-off
- [x] Core services: InvoiceService, CollectionService, LedgerService, HandoverService, PTPService, EodService, WorklistService
- [ ] Mobile collection screens (offline capable) — Sprint 2
- [ ] M6 acceptance tests (items 1–9 from M6 §10) including Scenario E end-to-end — Sprint 2
- [ ] 7-day parallel run with Mr. X's manual EOD (Sprint 1 end) — Sprint 2

**Sprint 1 completion criteria:**
- Owner can set daily floor prices on mobile
- Coordinator can confirm within-band orders without involving owner
- Below-floor orders route to owner for approval in < 30 seconds
- Collections are logged offline and sync without duplicates
- EOD closes in < 10 minutes

---

## Sprint 2: Logistics and Multi-Site (Weeks 7–9)

### Build order: M3 → M5 → M6 Part 2

#### M3 Inventory and Warehouse
- [ ] Migration: inventory_batches, stock_ledger_txns, stock_reservations, stock_transfers, stock_transfer_lines, stock_adjustments
- [ ] Append-only trigger on stock_ledger_txns
- [ ] Ledger posting service (single entry point, updates cached qty in-transaction)
- [ ] ATP query (physical - committed, FEFO-ordered)
- [ ] FEFO reservation algorithm with row locking (FOR UPDATE)
- [ ] InventoryPort (replaces stub in M1)
- [ ] GRN posting handler (before PO link)
- [ ] Transfer workflow and variance handling
- [ ] Expiry/drift/stale-reservation jobs
- [ ] M3 acceptance tests (items 1–9 from M3 §10) including Scenario F stock part
- [ ] Concurrency test: two concurrent reservations for the last 100 kg

#### M5 Fleet, Dispatch and Delivery
- [ ] Migration: vehicles, delivery_trips, delivery_stops, delivery_stop_lines, delivery_challans, issue_reports, trip_expenses
- [ ] Trip builder service (capacity check, sequencing)
- [ ] Loading + dispatch (credit check via CreditPort, trip.dispatched event)
- [ ] Challan PDF generation
- [ ] ePOD capture API with idempotency + GPS storage
- [ ] BR-08 trip close guard
- [ ] Issue reporting + routing rules (Ops Coordinator first; owner if high value/full rejection)
- [ ] Driver mobile app (offline manifest, command queue, photo upload, English)
- [ ] M5 acceptance tests (items 1–10 from M5 §10) including Scenario D end-to-end
- [ ] Offline stress test (airplane mode, duplicate replay)

#### M6 Part 2 — Accounting bridge and M5 integration
- [ ] Credit notes (from M5 returns)
- [ ] Cheque lifecycle screens and state machine
- [ ] Supplier AP initial (grn.posted handler)
- [ ] Switch invoice trigger from "Mark Dispatched" to trip.dispatched
- [ ] COD settlement on trip.closed
- [ ] Accounting export bridge: Tally XML nightly (idempotent batches)
- [ ] CreditPort updated to read from real AR ledger

**Sprint 2 completion criteria:**
- Multi-site stock accurately tracks available vs. committed
- Two concurrent orders for the same stock do not oversell
- Driver completes a full delivery day offline; all ePODs and collections sync without duplicates
- Invoice moves to trip.dispatched trigger
- Nightly Tally export runs without errors

---

## Sprint 3: Production, Procurement, and Analytics (Weeks 10–12)

### Build order: M4 → M2 → M7b

#### M4 Factory Production
- [ ] Migration: bom_headers, bom_lines, production_requisitions, production_work_orders, work_order_materials, work_order_outputs, wastage_records, labour_attendance_logs
- [ ] BOM service with versioning
- [ ] Requisition planner (net qty, required-by, dedup) + ProductionPort (replaces stub)
- [ ] RM availability check at Start Batch
- [ ] Work Order state machine (PLANNED → IN_PROGRESS → COMPLETED)
- [ ] Completion transaction (PROD_CONSUME + PROD_OUTPUT + yield check, BR-06)
- [ ] Wastage write-off approval flow (> 5% threshold)
- [ ] Attendance log
- [ ] Tablet Kanban board (large buttons, offline-tolerant PWA)
- [ ] M4 acceptance tests (items 1–9 from M4 §10) including Scenario F end-to-end

#### M2 Procurement and Supplier
- [ ] Migration: all M2 tables
- [ ] PO service with BR-03 (price spike detection)
- [ ] Link GRN to PO; update received_qty; shortfall detection (BR-05)
- [ ] Backup supplier ranking service
- [ ] Back-to-back PO generator with trading spread
- [ ] Supplier performance job (fill rate, lead time, reliability score)
- [ ] ProcurementPort (replaces manual landed cost in M1)
- [ ] M2 acceptance tests (items 1–8 from M2 §10) including Scenarios B and C end-to-end

#### M7b Dashboards and Analytics
- [ ] Materialised views: mv_pulse_today, mv_ops_status, mv_customer_profitability, mv_supplier_scorecard, mv_yield_trend, mv_ar_aging
- [ ] Refresh jobs (pulse every 30-60s via SSE; analytics nightly)
- [ ] Live Pulse Header API + SSE channel
- [ ] Operational Status Matrix API
- [ ] Strategic analytics endpoints (customer profitability, supplier fill-rate, yield trend, AR aging)
- [ ] EOD reconciliation view for owner
- [ ] WhatsApp BSP integration (templates, opt-ins, SMS fallback)
- [ ] Audit trail viewer
- [ ] Policy and threshold settings UI
- [ ] KPI query endpoints + weekly audit job
- [ ] M7b acceptance tests (items 5–10 from M7 §10) including Scenarios A, B, C end-to-end

**Sprint 3 completion criteria:**
- Factory Production Manager works entirely from the tablet with no phone calls to Mr. X for routine batches
- Supplier price spikes and shortfalls surface as exception cards within 60 seconds
- Owner dashboard shows accurate real-time pulse
- All 8 end-to-end scenarios (A-F) pass automated tests

---

## Phase 6: Production Readiness (Post-Sprint 3)

- [ ] Security review: penetration test of RBAC bypasses, Floor Price bypass, Cash Custody bypass
- [ ] Concurrency review: load test stock reservation and EOD sign-off
- [ ] Performance: p95 API response < 300ms for common queries
- [ ] Backup and restore: document and test PITR recovery
- [ ] Observability: structured logging, Sentry error tracking, uptime monitor
- [ ] Production Docker image hardening (non-root user, health check, resource limits)
- [ ] Deployment documentation (cloud provider, DNS, SSL, env secrets)
- [ ] Operational runbook (common incidents, escalation contacts)
- [ ] User training materials for each role

---

## Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|-----------|
| R1 | Open decisions not resolved before Sprint 1 code starts | MEDIUM | HIGH | OD-001/003/019/023 CONFIRMED 2026-10-22; schema seeded. Residual: OD-002, OD-004, OD-020, OD-021, OD-022 still AWAITING |
| R2 | FEFO reservation concurrency bug causes negative stock | MEDIUM | HIGH | Mandatory concurrency test (two concurrent requests for last 100 kg) before M3 ships |
| R3 | Offline sync creates duplicate financial records | HIGH | HIGH | Idempotency keys on every mobile write; integration test with simulated replay |
| R4 | Field staff digital literacy barrier (drivers, factory) | HIGH | MEDIUM | Large buttons, no free-text typing, local language in Phase 2; Conference Room Pilot before go-live |
| R5 | WhatsApp template approvals delayed | MEDIUM | MEDIUM | Start WhatsApp BSP signup and template submission in Sprint 0; SMS fallback always available |
| R6 | Opening AR/AP balance data unavailable or messy | MEDIUM | HIGH | Schema (`opening_balance_imports`) and CSV template defined per OD-023; accountant still must confirm cut-off date and supply data |
| R7 | e-Invoicing IRN applicability unknown | MEDIUM | HIGH | Confirm Neo's turnover with accountant in Sprint 0; IRN field left nullable in the invoice schema until confirmed |
| R8 | Multi-site stock check performance degrades with volume | LOW | MEDIUM | Index on (site_id, item_id, status, expiry_date); materialised ATP view if needed |
| R9 | Owner continues bypassing system via phone calls | MEDIUM | HIGH | Call-redirection SOP; Exception Cards must be faster than a phone call (< 30 second receipt) |
| R10 | BullMQ job failures cause silent data loss | MEDIUM | HIGH | Dead-letter queues; job failure alerts; idempotent job handlers |

---

## KPI Baseline and Day-90 Targets

| KPI | Baseline | Day-90 Target | Measured by |
|-----|---------|---------------|------------|
| Owner operational call volume | ~40-70+ calls/day | < 10/day | Exception queue count + call log sample |
| EOD reconciliation time | 60-90 min | < 10 min | eod_closings.initiated_at to signed_off_at |
| Missed financial entries | Frequent risk | 0% | Weekly audit: AR disputes vs. cash register |
| Routine order confirmation speed | Waits on Mr. X | < 2 min within floor | created_at to confirmed_at on in-band orders |
| Margin-erosion visibility | Unmeasured | 100% before lock | Orders below target without owner override |
| Delivery ePOD completion | Reconstructed via calls | 100% by 20:00 | % trips with valid ePOD before trip_close_deadline |
