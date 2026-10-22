# NeoBus — Implementation Roadmap

**Version:** 1.0.0-draft
**Date:** 2026-10-21

---

## Phase 1: Discovery and Architecture (CURRENT — Week 1)

### Milestone 1.1 — Foundation documents ✅
- [x] Blueprint fully read and understood (M0–M7, all module specs)
- [x] Architecture document created
- [x] Open decisions register created (25 items)
- [x] Blueprint traceability document created
- [x] Implementation roadmap created (this document)
- [x] Repository structure established

### Milestone 1.2 — Open decisions closure (Week 1–2)
- [ ] Schedule business owner review of AWAITING decisions (OD-001 through OD-025)
- [ ] Prioritize: OD-001 (margin%), OD-003 (invoice timing), OD-019 (owner delegate) — these block Sprint 1 code
- [ ] Document all confirmed decisions and update OPEN_DECISIONS.md

---

## Phase 2: Project Foundation (Sprint 0, Weeks 1–3)

### Milestone 2.1 — Repository and development environment
- [x] Directory structure created
- [ ] `apps/api` NestJS project initialized (`@nestjs/cli new`)
- [ ] TypeScript strict mode configured
- [ ] ESLint + Prettier configured
- [ ] Jest configured for unit and e2e tests
- [ ] Docker Compose created (PostgreSQL 16, Redis 7, MinIO, Mailhog)
- [ ] `.env.example` created with all required variables documented
- [ ] `.gitignore` created
- [ ] Git repository initialized
- [ ] CI pipeline configured (GitHub Actions or equivalent): lint → test → build

### Milestone 2.2 — Shared utilities and infrastructure
- [ ] `Money` utility class (numeric(14,2) precision, INR, arithmetic operations)
- [ ] `Qty` utility class (numeric(14,3), UoM-aware operations)
- [ ] `Clock` utility (now-in-UTC, toKolkata display, device-skew check)
- [ ] UUIDv7 generator
- [ ] `ConfigService` (reads `business_rule_config` table by key, caches with TTL)
- [ ] Event bus + Outbox: `OutboxService`, `OutboxRelay` (polls → BullMQ)
- [ ] Stubs for all 9 ports (ready to be replaced when owning module is built)

### Milestone 2.3 — Database baseline
- [ ] Migration runner configured (using `node-pg-migrate` or `umzug`)
- [ ] Migration 001: M0 tables (sites, users, locations, user_site_access, role_permissions, business_rule_config, doc_sequences, attachments, idempotency_keys, device_registrations, immutable_audit_logs, outbox_events)
- [ ] RLS policies on all M0 tables
- [ ] Append-only triggers on ledger tables (already defined in M0)
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
- [ ] Auth endpoints (login, OTP, refresh, logout)
- [ ] JWT guard + RBAC guard (permission code enforcement)
- [ ] RLS context middleware (SET LOCAL per request)
- [ ] Audit interceptor (auto-logs all business writes)
- [ ] Document numbering service (prefix + sequence per doc type)
- [ ] File upload service (pre-signed S3 PUT)
- [ ] Idempotency middleware (check + store)
- [ ] Rate limiting on auth endpoints
- [ ] M0 acceptance tests (items 1–6 from M0 §10)

#### M7a Exception Engine + Notification Hub
- [ ] Migration: exception_approvals, approval_policies, exception_events, notification_templates, notification_outbox
- [ ] ExceptionService (raise, resolve, expire, escalate) — ExceptionPort
- [ ] Card payload builders for PRICE_OVERRIDE and CREDIT_BREACH
- [ ] Notification hub: FCM push + in-app (WhatsApp = log-only for now) — NotifyPort
- [ ] Owner approval queue API (GET /exceptions, POST /exceptions/:id/resolve)
- [ ] Device registration endpoint
- [ ] M7a acceptance tests (items 1–4 from M7 §10)

#### M1 Commercial and CRM
- [ ] Migration: all M1 tables
- [ ] PricingService (band lookup, auto-floor, margin) + PricingPort
- [ ] CreditService (BR-02, reads AR via placeholder) + CreditPort stub
- [ ] Item master CRUD
- [ ] Customer master CRUD (coordinator creates, owner sets credit terms)
- [ ] Daily price list (bulk upsert, auto-floor, publish, price.updated event)
- [ ] Quote service (create, validate, expiry job)
- [ ] Order state machine (DRAFT → CONFIRMED or PENDING_APPROVAL)
- [ ] BR-01 evaluation with exception raise
- [ ] price-memory query (last 5 confirmed sales per customer+item)
- [ ] M1 API endpoints (see M1 §7)
- [ ] M1 acceptance tests (items 1–9 from M1 §10) including Scenario A end-to-end

#### M6 Collections and Financials (Sprint 1 core)
- [ ] Migration: invoices, invoice_lines, collection_receipts, receipt_allocations, customer_ledger_entries, custody_ledger, cash_handovers, cheque_register, ptp_followups, collection_worklists, eod_closings
- [ ] Append-only triggers on M6 ledger tables
- [ ] Invoice generation service (manual "Mark Dispatched" trigger in Sprint 1)
- [ ] logCollection transaction (BR-07) with idempotency — LedgerPort
- [ ] Custody wallet + handover verification
- [ ] AR aging job (00:30 daily)
- [ ] Collection worklist job (08:00 daily)
- [ ] PTP workflow
- [ ] EOD closing checklist + sign-off
- [ ] Mobile collection screens (offline capable)
- [ ] M6 acceptance tests (items 1–9 from M6 §10) including Scenario E end-to-end
- [ ] 7-day parallel run with Mr. X's manual EOD (Sprint 1 end)

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
| R1 | Open decisions not resolved before Sprint 1 code starts | HIGH | HIGH | Schedule business owner meeting within Week 1; prioritize OD-001, OD-003, OD-019 |
| R2 | FEFO reservation concurrency bug causes negative stock | MEDIUM | HIGH | Mandatory concurrency test (two concurrent requests for last 100 kg) before M3 ships |
| R3 | Offline sync creates duplicate financial records | HIGH | HIGH | Idempotency keys on every mobile write; integration test with simulated replay |
| R4 | Field staff digital literacy barrier (drivers, factory) | HIGH | MEDIUM | Large buttons, no free-text typing, local language in Phase 2; Conference Room Pilot before go-live |
| R5 | WhatsApp template approvals delayed | MEDIUM | MEDIUM | Start WhatsApp BSP signup and template submission in Sprint 0; SMS fallback always available |
| R6 | Opening AR/AP balance data unavailable or messy | MEDIUM | HIGH | Sprint 0 task: define cut-off date, get data from accountant; do not go live without verified opening balances |
| R7 | e-Invoicing IRN applicability unknown | MEDIUM | HIGH | Confirm Neo's turnover with accountant in Sprint 0; leave IRN field nullable until confirmed |
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
