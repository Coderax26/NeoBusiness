# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Last synced with:** `CHANGELOG.md` through **v0.5.0 (2026-11-06)** and `docs/DEVELOPMENT_GUIDE.md` **v1.0.0**.  
> Updated **2026-11-06** with M6 Part 2 completion (Accounting bridge, M5 integration).  
> When a module ships, a migration lands or a convention changes, update the matching section here in the same PR.
# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.


## Project Overview

**NeoBus** — enterprise modular-monolith ERP/CRM for multi-site food trading and processed food manufacturing. Mobile-first, exception-driven, offline-capable. Built for a single business with 6 user roles (Owner, OPS_COORD, PROD_MGR, DRIVER, COLLECTOR, STOREKEEPER).

**Before starting a task, check:**
- `CHANGELOG.md` — what is actually built and which decisions are confirmed
- `docs/IMPLEMENTATION_ROADMAP.md` — what comes next
- `docs/OPEN_DECISIONS.md` — do not re-decide items already marked CONFIRMED

---

## Setup & Commands (from `apps/api/`)

**Prerequisites:** Node.js 20 LTS, npm 9+, Docker Desktop 24+, Git 2.40+.

**First-time setup:**
```bash
docker compose up -d          # from repo root: infrastructure
cd apps/api && npm install
cp .env.example .env          # fill real dev values; never commit .env
npm run migrate
npm run seed
npm run dev
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start API in watch mode |
| `npm run build` | Compile TypeScript |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm test` or `npx vitest run` | Run all tests (auto-targets `neobus_test`) |
| `npx vitest run m3-inventory` | Run a single module / file |
| `npx vitest run --testNamePattern="Pricing"` | Run tests matching a describe/it name |
| `npm run test:e2e` | End-to-end tests (requires test DB) |
| `npm run test:cov` | Coverage report |
| `npm run migrate` | Apply pending SQL migrations |
| `npm run migrate:status` | Show which migrations have run |
| `npm run migrate:rollback` | Rollback last migration batch |
| `npm run migrate:make <name>` | Generate a new migration stub |
| `npm run seed` | Seed reference/config data (3 sites, 6 users, one per role) |

The project uses **Vitest** (not Jest). If you see `npx jest` anywhere in older docs, use the Vitest equivalent.

### Infrastructure

```bash
docker compose up -d          # PostgreSQL 16, Redis 7, MinIO, Mailhog
docker compose ps             # Check service health
docker compose logs postgres  # Debug connection issues
```

- Health check: `GET /health`
- OpenAPI docs (API running): `http://localhost:3000/api-docs`
- CI (GitHub Actions): lint → test → build → migrate → e2e

---

## Architecture & Structure

### Monorepo layout

```
NeoBusinessSolution/
├── apps/
│   ├── api/                       NestJS modular monolith (M0-M7)
│   │   └── src/
│   │       ├── modules/           One directory per business module
│   │       │   ├── m0-platform/   Auth, RBAC, audit, config, doc-seq
│   │       │   ├── m1-commercial/ Customers, items, pricing, orders
│   │       │   ├── m2-procurement/Suppliers, POs, GRN, shortfall
│   │       │   ├── m3-inventory/  Stock ledger, ATP, batches, FEFO
│   │       │   ├── m4-production/ BOM, work orders, yield, wastage
│   │       │   ├── m5-fleet/      Trips, driver app, ePOD, returns
│   │       │   ├── m6-finance/    Invoices, collections, AR, custody, EOD
│   │       │   ├── m7-control-tower/ Dashboards, analytics
│   │       │   └── m7a-exceptions/   Exception engine + notification hub
│   │       └── shared/
│   │           ├── database/      Knex instance setup
│   │           ├── events/        Domain event type definitions
│   │           ├── interceptors/  Audit interceptor
│   │           ├── middleware/    RLS context, idempotency
│   │           ├── ports/         Port interfaces + stubs
│   │           ├── seeds/         Seed scripts
│   │           └── utils/         Money, Qty, Clock, UUID, PriceMasker
│   ├── web/                       Next.js office UI (Coordinator, Owner)
│   ├── mobile/                    Flutter offline-first (Driver, Collector)
│   └── tablet/                    PWA for factory/warehouse
├── db/migrations/                 CANONICAL SQL migrations (ordered, per-module)
├── docs/                          Architecture, blueprints, plans, guides
├── scripts/                       Dev helper scripts
└── docker-compose.yml             PostgreSQL 16, Redis 7, MinIO, Mailhog
```

**Migrations live only in the root `db/migrations/`.** Never create `apps/api/db/migrations/` — that split caused a "split-brain" bug that had to be consolidated.

### Module status

| Module | Status | Notes |
|--------|--------|-------|
| M0 — Platform Foundation | ✅ Complete | Auth (JWT), RBAC, RLS, audit, config, doc-seq, idempotency, outbox |
| M7a — Exception Engine | ✅ Complete | Exception approvals (12 types, delegation + escalation) + notification hub |
| M1 — Commercial & CRM | ✅ Complete | Customers, items, pricing (BR-01), credit (BR-02), quotes, orders. Scenario A verified |
| M6 — Finance & Collections | ✅ Complete (part 2) | Invoices (BR-03), collections + custody (BR-07), ledger, handover, PTP, EOD, worklist, credit notes, COD settlement, Tally export, cheque lifecycle. Scenario E verified |
| M2 — Procurement | ⏳ Pending | POs, GRN, shortfall |
| M3 — Inventory | ✅ Complete (backend) | Unified transactional ledger/cache posting, append-only reversals, ATP/FEFO/reservations, GRN, transfers, adjustments, expiry/drift/stale jobs, typed event adapters, DTO/API surfaces, RLS-ready HTTP fixtures, and service/acceptance/e2e/concurrency coverage are implemented and passing. M5 vehicle-location behavior and frontend screens remain deferred to their owning modules. |
| M4 — Production | ✅ Complete | BOM, work orders, yield, wastage, attendance |
| M5 — Fleet & Delivery | ✅ Complete | Full backend with event integration (trips.dispatched/closed), COD settlement, credit notes, ePOD, BR-08 closure |
| M7b — Dashboards | ⏳ Pending | Analytics |

**Next module:** M2 Procurement — per `docs/IMPLEMENTATION_ROADMAP.md`

**Known follow-up:** M1's `CreditService` BR-02 overdue check was wired to M6's ledger in v0.5.0.

### Migrations so far

| Module | Migrations |
|--------|-----------|
| M0 | 001–004 (e.g. `20261021_001_m0_platform_foundation.sql`) |
| M7a | 005 |
| M1 | 006 (11 tables) |
| M6 | 007, 008, 019, 020 (includes `cashbook_entries`, `tally_export_batches`, `tally_export_items`) |
| M3 | 009 (`20261027_008_m3_inventory_baseline.sql` — `inventory_batches`, `stock_ledger_txns`, `stock_reservations`, `stock_transfers`, `stock_transfer_lines`, `stock_adjustments`) |
| M4 | 018 |
| M5 | 014–015, 017, 019 (includes `delivery_trips`, `delivery_stops`, `delivery_stop_lines`, `delivery_command_queue`) |

Always list `db/migrations/` to find the latest sequence number before creating a new migration.

---

## Key Architectural Patterns

### Port / Stub pattern (CRITICAL)

Modules **never import each other's services directly**. Cross-module communication goes strictly through port interfaces defined in `apps/api/src/shared/ports/ports.interface.ts`, injected via NestJS DI symbols.

There are 9 ports. Stubs live in `port-stubs.ts` and return safe/permissive defaults. When a module is built, replace its stub with the real implementation in the module's `providers` array — consumers only know the token, so they keep working unchanged.

| Port | Status |
|------|--------|
| `PricingPort`, `ItemPort`, `CreditPort` | Real — M1 (exported globally via `@Global() M1CommercialModule`) |
| `ExceptionPort`, `NotifyPort` | Real — M7a |
| `LedgerPort` | Real — M6 (`LedgerService`) |
| `InventoryPort`, `ProcurementPort`, `ProductionPort` | Stub — until M3, M2, M4 ship |

```typescript
// CORRECT — module uses a port token
@Inject(INVENTORY_PORT) private inventoryPort: InventoryPort

// WRONG — never do this
import { InventoryService } from '../m3-inventory/inventory.service';
```

### Domain events (Outbox pattern)

Cross-module async reactions use domain events published via the **transactional Outbox** (inside the DB transaction, not after). `OutboxRelay` polls every 5s and pushes to the BullMQ `domain-events` queue.

- Event types and payloads: `apps/api/src/shared/events/domain-events.ts`
- CHANGELOG records the signature as `OutboxService.raise(trx, eventType, aggregateId, payload, moduleSource)`. Older docs (`DEVELOPMENT_GUIDE.md`) show `outbox.publish(trx, {...})`. **Check the real `OutboxService` source before writing a call.**

```typescript
await this.db.transaction(async (trx) => {
  // ... business writes
  await this.outbox.raise(trx, 'order.confirmed', order.id, payload, moduleSource);
});
```

### Row-Level Security (RLS)

PostgreSQL RLS policies isolate data by site. The middleware (`rls-context.middleware.ts`) sets, per request:
```sql
SET LOCAL app.role = '<role>';
SET LOCAL app.user_id = '<uuid>';
SET LOCAL app.site_ids = '<uuid>,<uuid>';
```
- All site-scoped tables enforce this; the Owner role bypasses site filtering.
- `FORCE ROW LEVEL SECURITY` is on users/locations/sites. The app and dev machines connect as the non-superuser **`neobus_app`** role — a superuser connection bypasses RLS, so RLS bugs only show up as `neobus_app`.
- New M6 tables follow the same pattern: scoped to `app.site_ids`.

### Idempotency

Mobile/offline writes send an `Idempotency-Key` header. The middleware (`idempotency.middleware.ts`) checks the `idempotency_keys` table: seen keys replay the stored response; new keys execute and store. A key reused with a **mismatched payload/amount is rejected**, not replayed.

### Auth & security

- Login: phone + password/PIN. JWT HS256, 15-min access token, 7-day rotating refresh token. Login is rate-limited (5 requests / 60s).
- Use `JwtModule.registerAsync()` so `JWT_SECRET` is read after `.env` loads.
- Permissions: `@RequirePermission('permission.code')` + `RbacGuard`; 43 permissions seeded in `role_permissions`.
- `PriceMasker` strips price/margin/cost/total/credit/AR fields for PROD_MGR, DRIVER and STOREKEEPER. Use `@Sensitive()` on response DTO fields.
- Audit: `AuditInterceptor` writes every POST/PUT/PATCH/DELETE to `immutable_audit_logs` and redacts password/pin/token fields.

### Background jobs

| Job | Schedule |
|-----|----------|
| Outbox relay → BullMQ `domain-events` | every 5s |
| Notification outbox relay | every 10s |
| Exception expiry/escalation sweep | every 1 min |
| PTP aging job (`checkAndMarkBrokenPTPs`) | 00:30 daily |
| Collection worklist generation | 08:00 daily |

---

## Business Rules & Confirmed Decisions

Full traceability: `docs/BLUEPRINT_TRACEABILITY.md`. Implemented so far:

| Rule | What it does | Where |
|------|--------------|-------|
| BR-01 | Price band: price vs daily floor/target. Below floor raises a `PRICE_OVERRIDE` exception | M1 `PricingService` / `OrderService` |
| BR-02 | Credit: AR + new order ≤ credit limit, else `CREDIT_BREACH` exception | M1 `CreditService` (now integrated with M6 ledger) |
| BR-03 | Invoice generated at dispatch | M6 `InvoiceService` |
| BR-07 | Collection logged atomically across ledgers; cash custody chain (handover → verify/dispute) | M6 `CollectionService`, `HandoverService` |

**Confirmed business decisions (do not re-litigate):**
- **OD-001** — 10% gross margin global default, overridable per item category via `min_margin_pct_<CATEGORY>` in `business_rule_config` (read through `ConfigService.getMinMarginPct()`). Floor = `Money.autoFloor(cost, pct)` = `cost / (1 - pct)` rounded **UP** to the next ₹0.50.
- **OD-003** — Invoice at dispatch; mixed taxable/exempt/nil-rated lines on one invoice; `tax_treatment_type` enum `TAXABLE | EXEMPT | NIL_RATED | NON_GST`.
- **OD-019** — Delegated approval with escalation; **silent auto-approval is never permitted** (`approval_policies` with delegate and escalation settings; `escalation_wait_minutes` defaults to 60).
- **OD-023** — Opening balances via signed-off cut-off date + controlled CSV import (`opening_balance_imports`: `DRAFT → SIGNED_OFF → IMPORTED → REVERSED`).
- **OD-024** — Standing negotiated prices deferred to Phase 2 (`price_tier` column on `customers` is a placeholder only).

**Architecture decisions (ADRs, proposed defaults pending owner confirmation — treat as the working architecture):** ADR-001 modular monolith; ADR-002 Knex over ORMs; ADR-003 Flutter mobile; ADR-004 RLS + `SET LOCAL` for site isolation; ADR-005 transactional Outbox; ADR-006 UUIDv7 primary keys.

---

## Coding Conventions

### Naming

| What | Convention | Example |
|------|-----------|---------|
| Files | `kebab-case.ts` | `order.service.ts` |
| Classes | `PascalCase` | `OrderService` |
| Functions / variables | `camelCase` | `evaluateLine()` |
| Constants | `SCREAMING_SNAKE_CASE` | `INVENTORY_PORT` |
| DB tables | `snake_case` | `sales_orders` |
| Enum values | `SCREAMING_SNAKE_CASE` | `BELOW_FLOOR` |

### Module file structure

Each module follows this layout (not every module has every folder):
```
m1-commercial/
  m1-commercial.module.ts       NestJS module definition
  *.controller.ts               HTTP endpoints (no business logic here)
  *.service.ts                  Business logic (all rules live here)
  *.repository.ts               Knex queries only (never business rules)
  dto/                          Request/response DTOs
  interfaces/                   Domain interfaces
  state-machines/               Status transitions (e.g. order.state-machine.ts)
  jobs/                         Scheduled jobs (e.g. quote-expiry.job.ts)
  *.spec.ts / tests/            Unit specs; m#-acceptance.spec.ts for scenario tests
```

### TypeScript rules

- **Strict mode** is enabled (`strict: true`)
- No `any` without a comment explaining why
- No `!` non-null assertions on database results — check for null explicitly
- All async functions must `await` properly or return the promise

### Money & quantities (CRITICAL)

**Never use float arithmetic for currency or inventory.** Use the `Money` and `Qty` utilities backed by `decimal.js`:

```typescript
// CORRECT
import { Money } from '../shared/utils/money.util';
const floor = Money.divide(landedCost, Money.sub(1, minMarginPct));

// WRONG — float arithmetic will cause rounding errors
const floor = landedCost / (1 - minMarginPct);
```

- Useful `Money` API: `Money.of()`, `.isLessThan()`, `.toStorageString()`, `Money.autoFloor()`, `Money.marginPct()`
- Useful `Qty` API: `Qty.of(value, uom)`, `Qty.zero(uom)`, `.add()`, `.sub()`, `.mul()`, `.div()`, `.toNumber()`, `.toStorageString()`, `.isZero()`, `.isLessThan()`, `.isGreaterThan()`, `.isGreaterThanOrEqual()`
- **`Qty` has NO `.abs()` method.** For variance %, compute with `.toNumber()` arithmetic: `Math.abs(a.toNumber() - b.toNumber()) / b.toNumber() * 100`.
- `Qty.of()` accepts `number | string | Decimal`. Service method signatures should use `string` for qty args so DB storage strings round-trip correctly.
- Currency: `numeric(14,2)` in DB — always INR
- Quantities: `numeric(14,3)` in DB — primary UoM with secondary alongside

### Timestamps & dates

- **Stored:** UTC (`timestamptz` in PostgreSQL)
- **Displayed:** `Asia/Kolkata` (IST)
- Use the `Clock` utility (`shared/utils/clock.util.ts`) for all timestamp operations — never `new Date()` directly in business logic
- Device timestamps stored as `captured_at` alongside server `received_at`; skew > 5 minutes is flagged for audit
- **Business dates** (e.g. EOD closing date) use PostgreSQL `DATE` columns read as the local date — never derive them from a UTC timestamp, or the day shifts

### Database conventions

- **Primary keys:** UUIDv7 (time-ordered, generated in app layer via `uuid.util.ts`)
- **Standard columns:** `created_at`, `created_by`, `updated_at`, `updated_by` on all mutable tables
- **Soft deletes:** `is_active` boolean or status field — no hard deletes on financial/stock data
- **Corrections:** Reversal entries only — never UPDATE/DELETE posted transactions
- **Document numbers:** `PREFIX-YYMM-NNNN` from `doc_sequences` (via `DocNumberService`)
- **Status fields:** Text enums enforced by PostgreSQL `CHECK` constraints
- **Config:** `ConfigService` reads `business_rule_config` with a **5-minute TTL cache**; scopes GLOBAL / SITE / ITEM_CATEGORY

### Database query rules

- Use parameterized Knex queries only — **never** string concatenation
- Use explicit transactions for any write touching more than one table
- Financial and stock writes **must** be in a transaction — no exceptions
- Append-only tables (`stock_ledger_txns`, `collection_receipts`, `customer_ledger_entries`, `custody_ledger`, `immutable_audit_logs`, `supplier_ledger_entries`) have UPDATE/DELETE revoked at DB level for `neobus_app`

### Business rule placement

- All business rule logic lives in the **service**, not the controller
- Configurable thresholds read from `ConfigService.get('key')` (table `business_rule_config`), never hard-coded
- Status transitions always go through the state machine class, never by directly setting the status field
- Never write business rules in the repository layer

### API design

- REST resource-based naming: `/orders`, `/orders/{id}/confirm`
- HTTP verbs: GET (read), POST (create/action), PATCH (partial update)
- Consistent response envelope: `{ data, meta?, error? }`
- Errors: NestJS built-in exceptions (`NotFoundException`, `ForbiddenException`, …)
- All endpoints decorated with `@ApiOperation` and `@ApiResponse` for OpenAPI

---

## Testing

### Test runner: Vitest

```bash
npm test                                   # All tests
npx vitest run m1-commercial               # Single module
npx vitest run --testNamePattern="Pricing" # Pattern match
npm run test:e2e                           # E2E (requires test DB)
npm run test:cov                           # Coverage
```

### Test database isolation (CRITICAL)

Automated tests use a dedicated database **`neobus_test`**, separate from `neobus_dev`. Test fixtures run `TRUNCATE ... RESTART IDENTITY CASCADE` and `del()` hooks that would wipe dev data.

- `apps/api/.env.test` sets `DATABASE_URL` for `neobus_test`; Vitest loads it automatically via `vitest.setup.ts` and sets `NODE_ENV=test`. **You do not need to pass `DATABASE_URL` manually.** Never put real credentials in `.env.test` beyond local dev values.
- **Safety rail:** `assertTestDatabase(knex)` checks that `current_database()` ends with `_test` and aborts before any truncation/deletion otherwise. Never bypass, weaken or remove it, and never point tests at `neobus_dev` or production.
- `MigrationService` resolves the migrations directory dynamically and takes a PostgreSQL advisory lock (`pg_advisory_lock`) so parallel Vitest workers don't collide while migrating.

### Test naming convention

```typescript
describe('PricingService.evaluateLine()', () => {
  it('returns IN_BAND when price >= floor', () => { ... });
  it('returns BELOW_FLOOR when price < floor and raises PRICE_OVERRIDE', () => { ... });
  it('throws if floor price is not published for today', () => { ... });
});
```

### What must be tested

- All business rules (BR-01 through BR-08): 100% branch coverage
- State machine transitions (valid and invalid)
- Permission boundary tests ("can OPS_COORD confirm below-floor via a direct API call?" → No)
- Concurrent operations on shared state
- Idempotency: "submit same offline command twice → one record"
- E2E scenarios A through F: full cross-module flows. **Implemented so far:** Scenario A (M1 pricing/exception flow) and Scenario E (M6 collections/custody). Acceptance specs are named `m#-acceptance.spec.ts`

### Test fixture rules

- Use **UUIDs** for test record IDs — millisecond-based IDs collide when workers run in parallel
- Clean up in **FK-safe order** (children before parents)

---

## Migration Conventions

### File naming

`<timestamp>_<sequence>_<module>_<description>.sql`

Example: `20261021_001_m0_platform_foundation.sql`

### Rules

- Location: root `db/migrations/` only
- Every migration must have both `up` and `down` sections
- **Never** modify an existing migration that has been run — schema fixes are a new migration file
- Append-only triggers and REVOKE statements go in the migration that creates the table
- RLS policy creation must be **idempotent** (`IF NOT EXISTS`) — parallel test workers run migrations concurrently
- Seed data goes in seed scripts, not migrations

## Ponytail Code Rules
Before proposing or writing code, follow the Ponytail Decision Ladder:
1. YAGNI: Reject unnecessary features and abstractions.
2. Reuse: Check existing project helpers and modules first.
3. Standard Library: Prefer native language APIs over external libraries.
4. Existing Dependencies: Do not add new packages if an existing dependency can do the job.
5. Simplicity: Write the absolute minimum code required to meet requirements safely.



---

## Git Conventions

- Branches: `feature/<module>-<description>`, `fix/<module>-<description>`, `hotfix/<description>`
- Commits: Conventional Commits, e.g. `feat(m1): implement BR-01 dynamic pricing band evaluation`, `fix(m3): prevent double-allocation on concurrent reservation`, `test(m1): add Scenario A end-to-end acceptance test`
- `main` = production-ready; `develop` = integration branch

### Before you call a task done

- [ ] Unit tests added; tests for every BR touched pass (`npm test`)
- [ ] `npm run lint` passes
- [ ] No `any` without a justification comment; no hard-coded thresholds; no credentials in code
- [ ] New endpoints have OpenAPI annotations
- [ ] Migration has a `down` section and does not edit an already-run migration
- [ ] `CHANGELOG.md` and the **Module status** table above are updated

---

## Common Gotchas

1. **Float arithmetic for money** — Always use `Money` / `Qty`. Float math introduces rounding errors that compound in ledgers.
2. **Publishing events outside transactions** — Events must go through the Outbox *inside* the DB transaction. Publishing after commit can lose events on crash.
3. **Cross-module imports** — Never import another module's service directly; always use a Port token. The linter won't catch this — code review must.
4. **Forgetting RLS context** — Every request must set `app.role`, `app.user_id` and `app.site_ids` via the middleware. Missing context means empty result sets or data leaks.
5. **Hard-coded thresholds** — Floor margin %, credit limit days etc. come from `business_rule_config`. Remember `ConfigService` caches for 5 minutes.
6. **Direct status field mutation** — Status transitions must go through the state machine. A direct `UPDATE ... SET status = 'X'` bypasses validation and audit logging.
7. **Non-null assertions on DB results** — Use explicit null checks. `!` hides bugs when rows don't exist.
8. **Testing as a superuser** — Superusers bypass RLS. Use the `neobus_app` role, otherwise RLS bugs go unnoticed.
9. **Running tests against the dev DB** — Tests must run on `neobus_test`. If `assertTestDatabase` aborts, fix the environment; do not bypass the guard.
10. **Migrations in the wrong place** — Only root `db/migrations/`. A second migrations folder previously split the schema history.
11. **Parallel-worker collisions** — Non-idempotent RLS policies, millisecond-based test IDs and wrong FK cleanup order all cause flaky parallel test runs.
12. **Service columns must match the migration exactly** — Before writing service queries, read the SQL migration and note every column name. Common traps seen in M3: `from_site` vs `from_site_id`, `allocated_qty` vs `qty`, `po_id`/`status` vs `reference_no`/`txn_type`. One wrong column name = a runtime error that unit tests will catch only if they run against the real DB schema.
13. **uuid columns reject plain strings** — `item_id`, `site_id`, `batch_id` etc. are `uuid` typed in PostgreSQL. Passing a non-UUID string (e.g. `'NONEXISTENT_ITEM'`) throws `invalid input syntax for type uuid`. Guard with a UUID regex before querying, or use a real UUID from the fixture.
14. **`Qty` has no `.abs()` method** — Using `qty.abs()` throws `TypeError: variance.abs is not a function` at runtime. Compute absolute variance with plain number arithmetic: `Math.abs(a.toNumber() - b.toNumber()) / b.toNumber() * 100`.
15. **Spec variables must be declared AND assigned from `setupTestDB()`** — If `siteBId`, `itemSugarId`, etc. are used in tests but not declared in the outer scope and assigned in `beforeAll`, they are `undefined` at runtime causing silent wrong-data bugs or FK errors. Always assign every return value of `setupTestDB()` that is used anywhere in the spec file.
16. **`beforeEach` must re-seed, not just delete** — Deleting M3 tables in `beforeEach` without re-seeding baseline batches leaves an empty state. Every test that assumes stock exists will fail. Delete and re-insert batch fixtures in the same `beforeEach` hook.
17. **`stock_reservation_lines` does not exist in M3 schema** — The migration creates a single `stock_reservations` table with a `batch_id` FK. There is no `stock_reservation_lines` join table. Aggregate reserved qty directly from `stock_reservations.qty` grouped by `batch_id`.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `apps/api/src/shared/ports/ports.interface.ts` | All port interface contracts |
| `apps/api/src/shared/ports/port-stubs.ts` | Stub implementations for unbuilt modules |
| `apps/api/src/shared/events/domain-events.ts` | Domain event type definitions and payloads |
| `apps/api/src/shared/utils/money.util.ts` | Precise currency arithmetic (decimal.js) |
| `apps/api/src/shared/utils/qty.util.ts` | Precise quantity arithmetic (decimal.js) |
| `apps/api/src/shared/utils/clock.util.ts` | UTC/IST timestamp utilities |
| `apps/api/src/shared/utils/uuid.util.ts` | UUIDv7 generation |
| `apps/api/src/shared/middleware/rls-context.middleware.ts` | Sets PostgreSQL RLS session variables |
| `apps/api/src/shared/middleware/idempotency.middleware.ts` | Idempotency key check for offline sync |
| `apps/api/src/shared/interceptors/audit.interceptor.ts` | Automatic audit trail on mutations |
| `apps/api/.env.test` | Test DB config (`neobus_test`), loaded by Vitest |
| `db/migrations/` | Canonical SQL migrations |
| `CHANGELOG.md` | Release history, confirmed decisions, current status |
| `docs/ARCHITECTURE.md` | Full architecture doc with ADRs |
| `docs/DEVELOPMENT_GUIDE.md` | Coding conventions, PR checklist, port/stub pattern |
| `docs/TESTING_STRATEGY.md` | Test levels, required scenarios, coverage targets |
| `docs/BLUEPRINT_TRACEABILITY.md` | Business rule traceability matrix |
| `docs/IMPLEMENTATION_ROADMAP.md` | Phased plan, milestones, risks |
| `docs/OPEN_DECISIONS.md` | Open and confirmed business decisions (OD-xxx) |
| `docs/SECURITY.md` | Authentication, RBAC, RLS, masking, audit, compliance |