# NeoBus — Changelog

All notable changes to the NeoBus project will be documented in this file.
Format: [Semantic Versioning](https://semver.org/). Types: Added, Changed, Fixed, Removed, Security.

---

## [Unreleased] — 0.1.0

### Added
- Repository structure established (apps/api, apps/web, apps/mobile, apps/tablet, db/migrations, docs, scripts)
- Blueprint fully read and documented (M0–M7, all 9 module specification files)
- ARCHITECTURE.md — technology stack, module boundaries, security controls, ADRs
- PROJECT_OVERVIEW.md — business context, module summary, success criteria
- BLUEPRINT_TRACEABILITY.md — all business rules, scenarios, gaps traced to implementation
- IMPLEMENTATION_ROADMAP.md — phased plan with milestones, risks, KPI targets
- OPEN_DECISIONS.md — 25 open decisions, each labeled CONFIRMED/PROPOSED/AWAITING
- SECURITY.md — authentication, RBAC, RLS, masking, audit, compliance
- DEVELOPMENT_GUIDE.md — conventions, git strategy, PR checklist, port/stub pattern
- TESTING_STRATEGY.md — all test levels including CRP and 7-day parallel run
- CHANGELOG.md — this file
- README.md — setup instructions, environment variables, project structure
- Docker Compose dev stack (PostgreSQL 16, Redis 7, MinIO, Mailhog)
- NestJS API scaffold (`apps/api`): TypeScript strict, Vitest, Swagger, Helmet, throttler, global validation pipe
- Shared utilities: `Money` (Decimal.js, `autoFloor`, `marginPct`), `Qty`, `Clock`, UUIDv7 — 42 unit tests passing
- Port contract interfaces + stubs for all 9 ports (`shared/ports`)
- Domain event envelope + per-event payload types (`shared/events`)
- Health check endpoint (`GET /health`)
- M0 platform foundation migration (`db/migrations/20261021_001_m0_platform_foundation.sql`)

### Decisions Made (Proposed defaults — pending business owner confirmation)
- Modular monolith architecture; no microservices (ADR-001)
- Knex over TypeORM/Prisma for financial precision (ADR-002)
- Flutter for mobile apps (ADR-003)
- PostgreSQL RLS + application SET LOCAL for site isolation (ADR-004)
- Transactional Outbox for domain events (ADR-005)
- UUIDv7 primary keys (ADR-006)

### Confirmed Business Decisions (2026-10-22)
- **OD-001** — 10% gross margin global default, overridable per item category; `Money.autoFloor` = `cost / (1 - pct)` rounded UP to ₹0.50
- **OD-003** — Invoice at dispatch; mixed taxable/exempt/nil-rated lines on one invoice; `tax_treatment_type` enum (`TAXABLE | EXEMPT | NIL_RATED | NON_GST`)
- **OD-019** — Delegated approval with escalation; silent auto-approval never permitted; `approval_policies` with `delegate_user_id`, `delegate_value_cap_inr`, `escalation_wait_minutes`
- **OD-023** — Signed-off cut-off date + controlled CSV import template; `opening_balance_imports` with `DRAFT → SIGNED_OFF → IMPORTED → REVERSED` lifecycle

### Pending (Sprint 0 — next steps)
- M0 platform module code: DB pool + migration runner + seed script (migrations 001 and 002 exist as SQL only)
- Auth endpoints (login, OTP, refresh, logout) + rate limiting
- RBAC guard + permission seed + masking serializer
- RLS policies + request-scoped `SET LOCAL`
- Audit service/hook writing to `immutable_audit_logs`
- ConfigService reading `business_rule_config`
- CI pipeline

---

## [0.3.0] — 2026-10-24 — M1 Commercial & CRM Complete

### Added
- **Pricing Engine**: `PricingService` with daily band lookup, `Money.autoFloor` (landed cost / (1 - min_margin_pct) rounded UP to ₹0.50), price memory (last 5 confirmed sales per customer+item), and BR-01 evaluation logic.
- **Item Master**: `ItemService` implementing `ItemPort` with full item metadata (SKU, category, UoM, tax treatment `TAXABLE | EXEMPT | NIL_RATED | NON_GST` per OD-003, HSN, catch-weight, margin overrides).
- **Credit Control**: `CreditService` implementing `CreditPort` + BR-02 evaluation (AR + new order ≤ credit limit, overdue check stubbed pending M6 integration).
- **Order Lifecycle**: `OrderService` with state machine (`DRAFT → PENDING_APPROVAL → CONFIRMED...`), BR-01 price band evaluation, BR-02 credit evaluation, exception integration (`PRICE_OVERRIDE`, `CREDIT_BREACH` via `ExceptionPort`), and `exception.resolved` handler registration.
- **Port Wiring**: Real `PRICING_PORT`, `ITEM_PORT`, `CREDIT_PORT` implementations replace M0 stubs, exported globally via `@Global() M1CommercialModule`.
- **Migration 006**: 11 tables (`customers`, `customer_contacts`, `communication_log`, `items`, `uom_conversions`, `daily_price_lists`, `quotes`, `quote_lines`, `sales_orders`, `sales_order_lines`, `order_status_log`) with indexes, constraints, and seeded `role_permissions` for M1 entities.
- **Scenario A Path 1 Verified**: Cost ₹82, floor ₹90, target ₹95 → in-band price confirms without exception.
- **Scenario A Path 2 Verified**: Below-floor price raises `PRICE_OVERRIDE` exception; owner counter triggers handler flow.

### Fixed
- TypeScript build: `Money` class usage patterns fixed (`.of()`, `.isLessThan()`, `.toStorageString()`); `ExceptionPort` imported as type.

### Decisions Confirmed
- **OD-001**: 10% gross margin global default, overridable per item category via `min_margin_pct_<CATEGORY>` in `business_rule_config` (implemented in `ConfigService.getMinMarginPct()`).
- **OD-003**: Invoice at dispatch; `tax_treatment` enum seeded in `items` table (`TAXABLE | EXEMPT | NIL_RATED | NON_GST`).
- **OD-024**: Standing negotiated prices deferred to Phase 2; `price_tier` column added to `customers` table as placeholder.

---
 
## [0.3.2] — 2026-10-25 — M1 Acceptance Tests Complete (Scenario A)

### Added
- **Scenario A Path 1 (In-band confirm)**: Verified order at ₹92 (floor ₹90, target ₹95) confirms without exception.
- **Scenario A Path 2 (Below-floor → owner counter → accept)**: Verified order at ₹88 raises `PRICE_OVERRIDE` exception; owner counters at ₹89.50; coordinator accepts counter → order confirmed.
- **Quote conversion with price re-validation**: `convertToOrder()` re-validates each line against current day's band; flags below-floor prices from stale quotes.
- **Price memory**: `PricingService.lastPrices()` returns last 5 confirmed sales per customer+item combination.
- **Credit evaluation integration**: `CREDIT_BREACH` exception raised when order exceeds credit limit; orders within limit confirm normally.
- **Auto-floor calculation tests**: Verified `Money.autoFloor(cost, margin)` rounds UP to nearest ₹0.50 (e.g., cost ₹82 + 10% → ₹91.50).
- **Daily price list operations**: Bulk upsert with auto-floor/target calculation; missing price alerts for owner dashboard.
- **End-to-end flow coverage**: All M1 core workflows tested against real database with exception engine integration.

### Fixed
- `ItemService.getItem()` implemented for ItemPort compatibility.
- `OrderService` sum query fixed (manual calculation instead of Knex expression).
- `OutboxService` column names corrected (`source_module` → `module_source`, `created_at` → `published_at`).
- `PricingService.lastPrices()` column reference fixed (`sold_item_id` → `item_id`).
- `QuoteService.convertToOrder()` accepts optional validation date for testing stale quotes.

---

## [0.4.0] — 2026-10-25 — M6 Collections & Financials Complete (Sprint 1 Core)

### Added
- **Invoice Service**: `InvoiceService` with `generateAtDispatch()` (BR-03 wrapper) and `generateFromOrder()`; COD flag support; `getInvoice()` with camelCase output; due date = `invoice_date + credit_days`.
- **Collection Service**: `CollectionService.logCollection()` implementing BR-07 atomic transaction — inserts `collection_receipts`, allocates to invoices (FIFO default), posts `customer_ledger_entries CREDIT`, posts `custody_ledger COLLECTION` (+amount), inserts `cheque_register RECEIVED` for CHEQUE mode.
- **Ledger Service**: `LedgerService` implementing `LedgerPort` — core financial operations with `getOpenInvoicesForAllocation()` (FIFO), `getCustomerBalance()`, `getCustodyBalance()`, `getCustodyLedger()`; idempotency validation rejects mismatched amounts on same key.
- **Handover Service**: `HandoverService` — cash custody chain (BR-07): `getExpectedHandover()`, `initiateHandover()`, `verifyHandover()` (VERIFIED/DISPUTED), `resolveDispute()` (ACCEPT_COUNTED/ADJUST_TO_EXPECTED/PARTIAL); wallet cleared on VERIFIED.
- **PTP Service**: `PTPService` — Promise-to-Pay workflow: `createPTP()`, `updatePTPStatus()` (KEPT/BROKEN/DISPUTED), `checkAndMarkBrokenPTPs()` aging job (00:30).
- **EOD Service**: `EodService` — End of Day closing checklist (4 checks): trips closed, wallets zero, uninvoiced deliveries, net cash position; owner sign-off with `< 10 min` KPI target.
- **Worklist Service**: `WorklistService` — daily collection worklist at 08:00; priority scoring `overdue_amount × days_overdue`; reasons: OVERDUE, DELIVERY_STOP, PTP_DUE; round-robin collector assignment.
- **Migration 007**: 9 tables (`invoices`, `invoice_lines`, `collection_receipts`, `receipt_allocations`, `customer_ledger_entries`, `custody_ledger`, `cash_handovers`, `cheque_register`, `ptp_followups`, `eod_closings`) with RLS, REVOKE UPDATE/DELETE on append-only tables for `neobus_app` role.
- **Migration 008**: `worklist_worklists`, `worklist_items` with RLS.
- **Module wiring**: `M6FinancialsModule` with real `InvoiceService`, `CollectionService`, `LedgerService`, `HandoverService`, `PTPService`, `EodService`, `WorklistService`; enabled in `AppModule` after M7a, M1.
- **Acceptance tests**: 11 Scenario E tests covering all BR-07 flows — E1001 (collection + PTP), E1002 (handover variance + owner resolution), E1003 (EOD 4-checks + sign-off), E1004 (idempotency + duplicate prevention + mismatch rejection), E1005 (PTP aging job), E1006 (worklist priority scoring + PTP_DUE).

### Fixed
- Handover expected amount calculation: correctly subtracts HANDOVER entries (negative amount_delta) from collections.
- EOD date handling: uses local date from PostgreSQL DATE column to avoid timezone shift.
- Idempotency: now rejects mismatched amounts on same key (previously returned same receipt).
- Worklist table names: unified to `worklist_worklists` / `worklist_items` (was `collection_worklists`).
- Test isolation: proper FK cleanup order for all M6 tables.

### Decisions Confirmed
- **BR-07**: Atomic collection logging across 3 ledgers in single transaction (customer_ledger CREDIT, custody_ledger COLLECTION, cashbook RECEIPT_CASH).
- **Money precision**: `numeric(14,2)` storage; `Decimal.js` arithmetic; `autoFloor` rounds UP to ₹0.50.
- **Append-only enforcement**: REVOKE UPDATE/DELETE on `collection_receipts`, `customer_ledger_entries`, `custody_ledger` for `neobus_app` role.
- **RLS policies**: All M6 tables scoped to `app.site_ids` via existing M0 middleware pattern.

---

## [0.2.0] — 2026-10-24 — M7a Exception Engine + Notification Hub Complete

### Added
- **Exception Engine**: Full management-by-exception lifecycle via `ExceptionService` (raise, resolve, expire, escalate)
- **Approval policies**: Delegation + escalation rules per exception type (seeded for all 12 types in migration 002)
- **Exception Card API**: `GET /exceptions`, `GET /exceptions/{id}`, `POST /exceptions/{id}/resolve` (APPROVED/REJECTED/COUNTERED)
- **Transactional outbox integration**: `exception.requested` / `exception.resolved` domain events emitted atomically
- **Notification Hub**: `NotificationService` implementing `NotifyPort` with FCM (log), SMS/WhatsApp (log), IN_APP (queue)
- **Device registration**: `POST /devices/register` for FCM token storage in `device_registrations`
- **Background jobs**: Exception expiry/escalation sweep (every 1 min), notification outbox relay (every 10s)
- **Idempotency**: Single-resolution guarantee on exception cards; unique pending constraint at DB level
- **RLS integration**: Exception queries automatically scoped to caller's sites via M0 middleware
- **Migration 005**: `exception_approvals`, `exception_events`, `notification_outbox`, `notification_templates`, `whatsapp_optins` + 3 seeded templates
- **Port wiring**: Real `ExceptionService` as `EXCEPTION_PORT`, real `NotificationService` as `NOTIFY_PORT` — replacing M0 stubs
- **Unit tests**: 22 new tests (14 ExceptionService + 8 NotificationService) — total 64 passing

### Fixed
- Test environment: `vitest.config.ts` now loads `.env` via `setupFiles` for DB connectivity

### Decisions Confirmed
- **OD-019**: Delegated approval with escalation, never silent auto-approval; `escalation_wait_minutes` defaults to 60 per type
- **ADR-005**: Transactional Outbox pattern extended to exception lifecycle events

---

## [0.1.0] — 2026-10-24 — M0 Platform Foundation Complete

### Added
- **Database foundation**: PostgreSQL 16 with Knex.js, UUIDv7 keys, `numeric(14,2)` money, append-only triggers
- **Migrations 001–004**: sites, users, locations, user_site_access, role_permissions (43 rows), business_rule_config (15 rows), doc_sequences, attachments, idempotency_keys, device_registrations, immutable_audit_logs, outbox_events, refresh_tokens
- **ConfigService**: reads `business_rule_config` with 5-min TTL cache, supports GLOBAL/SITE/ITEM_CATEGORY scope
- **Auth module**: login (phone + password/PIN), refresh tokens (7-day rotation), logout, `/me` endpoint, bcrypt hashing
- **JWT**: HS256, 15-min access / 7-day refresh via `JwtModule.registerAsync()` (secret loaded after ConfigModule)
- **RBAC**: `PermissionService` + `RbacGuard` + `@RequirePermission(...)` decorator; 6 roles, 43 permissions seeded
- **RLS middleware**: `SET LOCAL app.role` / `app.user_id` / `app.site_ids` per request; `FORCE ROW LEVEL SECURITY` on users/locations/sites; non-superuser `neobus_app` role for dev machines
- **Audit interceptor**: writes to `immutable_audit_logs` on every POST/PUT/PATCH/DELETE; redacts password/pin/token fields
- **Idempotency middleware**: `Idempotency-Key` header prevents duplicate offline writes; stores request hash + response; replays on duplicate
- **Rate limiting**: `@Throttle({ default: { limit: 5, ttl: 60000 } })` on login endpoint
- **DocNumberService**: generates `PREFIX-YYMM-NNNN` via `doc_sequences` table with upsert concurrency safety
- **Transactional outbox**: `OutboxService.raise(trx, eventType, aggregateId, payload, moduleSource)` + `OutboxRelay` polling every 5s → BullMQ `domain-events` queue
- **PriceMasker**: strips price/margin/cost/total/credit/ar fields for `PROD_MGR`, `DRIVER`, `STOREKEEPER` roles
- **Seed script**: 3 sites (factory, warehouse, office), 6 users (all roles, bcrypt PINs), 1 multi-site access row
- **Migrate script**: standalone migration runner for dev/CI
- **Dev DB init**: creates `neobus_app` non-superuser role so RLS is actually enforced on dev machines
- **CI pipeline**: GitHub Actions workflow (lint → test → build → migrate → e2e)
- **Swagger/OpenAPI**: full API docs at `/api-docs`

### Fixed
- `doc_sequences` PRIMARY KEY expression → split into `CREATE UNIQUE INDEX uq_doc_sequences`
- `idempotency_keys.user_id` nullable for unauthenticated routes (login/OTP)
- `JwtModule.registerAsync()` so `JWT_SECRET` is read after `.env` is loaded
- Nest `MiddlewareConsumer` wiring (was `app.use()` with middleware class)
- `splitSql()` handles `$$` empty dollar-quote tags in migrations

### Decisions Confirmed
- **OD-001**: 10% gross margin global default, overridable per item category; `Money.autoFloor` = `cost / (1 - pct)` rounded UP to ₹0.50
- **ADR-004**: PostgreSQL RLS + application `SET LOCAL` for site isolation
- **ADR-005**: Transactional Outbox for domain events

---

*Previous versions: none (new project)*