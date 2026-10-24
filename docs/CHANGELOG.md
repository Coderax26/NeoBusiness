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
