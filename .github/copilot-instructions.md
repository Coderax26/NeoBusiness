# NeoBus Copilot Instructions

## Repository orientation

NeoBus is a multi-site food-trading and manufacturing ERP/CRM implemented as a NestJS modular monolith. The active backend is in `apps/api`; client applications are in `apps/web` (office web), `apps/tablet` (factory PWA), and `apps/mobile` (offline driver/collector app), with shared components in `packages/*`. Read `docs/CHANGELOG.md`, `docs/PROJECT_STATUS_MATRIX.md`, `docs/IMPLEMENTATION_ROADMAP.md`, and `docs/OPEN_DECISIONS.md` before changing behavior. Treat decisions marked **CONFIRMED** as fixed; do not re-litigate them.

The backend is organized by business module (`m0-platform`, `m1-commercial`, `m2-procurement`, `m3-inventory`, `m4-production`, `m5-fleet`, `m6-finance`, `m7a-exceptions`, and `m7b-dashboards`) plus `src/shared`. Controllers handle HTTP concerns, services contain business rules, and repositories contain Knex queries only. All business modules M0 through M7b, frontend apps, and production hardening are complete with a deterministic test baseline (25 test suites, 338 tests passing). Check `docs/PROJECT_STATUS_MATRIX.md` for authoritative module status.

## Commands

Run backend commands from `apps/api`:

```bash
npm install
npm run build                 # Nest/TypeScript build
npm run dev                   # watch-mode API
npm run start:prod            # run dist/main
npm run lint                  # oxlint with type-aware checks
npm run format                # Prettier for src and test TypeScript
npm test                      # all Vitest tests
npx vitest run m3-inventory   # target a module/path expression
npx vitest run --testNamePattern="Pricing"  # target matching test names
npm run test:e2e              # e2e config
npm run test:cov              # coverage
npm run migrate               # apply migrations; build first if dist is stale
npm run migrate:rollback      # rollback the last batch
npm run seed                  # seed reference/config data
```

For local infrastructure, run `docker compose up -d` from the repository root. It provides PostgreSQL 16, Redis 7, and MailHog. The API health endpoint is `GET /health`; Swagger is served at `/api-docs`.

Tests use Vitest, not Jest. `.env.test` and `vitest.setup.ts` target the dedicated `neobus_test` database, and `assertTestDatabase` is a safety rail before destructive fixture cleanup. Never point automated tests at `neobus_dev` or production and never bypass that guard. E2E tests require the test PostgreSQL/Redis services.

## Architecture boundaries

- This is a modular monolith, not a collection of freely coupled Nest services.
- Modules must not import another module's service or repository directly. Use the DI port tokens and interfaces in `src/shared/ports/ports.interface.ts`; stubs are in `port-stubs.ts` until the owning module is implemented.
- Use domain events for asynchronous cross-module reactions. Events go through the transactional Outbox and then BullMQ via `OutboxRelay`; they must be raised inside the same database transaction as the business write. Check `OutboxService` for the current method signature (`raise(trx, eventType, aggregateId, payload, moduleSource)`).
- Each module owns its tables. Do not read another module's tables directly as a shortcut; expose or consume a port/event instead.
- The canonical SQL migration directory is the repository root `db/migrations/`. Never create `apps/api/db/migrations/`. Migrations are append-only once run, must be reversible, and must use the repository's timestamp/sequence naming convention. List the directory before choosing the next sequence.

The request path is generally JWT authentication → RBAC → RLS context → idempotency handling → controller validation → service transaction/ports → Knex/PostgreSQL → audit/outbox → DTO serialization. Preserve this order when adding endpoints or middleware.

## Data integrity and business rules

- PostgreSQL RLS isolates site-scoped data. `rls-context.middleware.ts` sets `app.role`, `app.user_id`, and `app.site_ids`; test RLS behavior using the non-superuser application role because superusers bypass RLS.
- Financial and stock writes, and any write spanning multiple tables, must use an explicit transaction.
- Use parameterized Knex queries only. Do not concatenate SQL values.
- Money is INR `numeric(14,2)` and quantities are `numeric(14,3)`. Use `Money` and `Qty` from `src/shared/utils`, backed by `decimal.js`; never use float arithmetic for currency or inventory. `Qty` has no `.abs()` method.
- Use `Clock` for timestamps and `uuid.util.ts` for UUIDv7 IDs. Business dates stored as PostgreSQL `DATE` must not be derived from UTC timestamps.
- Configurable thresholds come from `business_rule_config` through `ConfigService`; do not hard-code business limits. Put business rules in services, not controllers or repositories.
- Status changes must go through the relevant state machine. Financial and stock ledgers are append-only; corrections are reversal entries, not updates/deletes.
- Offline writes use an `Idempotency-Key`. A repeated key replays the stored response, while a reused key with a different payload/amount must be rejected.
- Use `@RequirePermission(...)` and `RbacGuard` for authorization. Mark sensitive response fields with `@Sensitive()` so `PriceMasker` can remove price, margin, cost, total, credit, or AR data for restricted roles. Mutating requests are audited by `AuditInterceptor`, which must continue to redact credentials and tokens.
- New REST endpoints use resource-oriented paths, NestJS exceptions, the `{ data, meta?, error? }` response envelope, and `@ApiOperation`/`@ApiResponse` annotations.

## Code and test conventions

Use the established naming conventions: `kebab-case.ts` files, PascalCase classes, camelCase functions/variables, SCREAMING_SNAKE_CASE constants, snake_case database identifiers, and SCREAMING_SNAKE_CASE enum values. TypeScript strict mode is enabled; avoid `any` and database-result non-null assertions.

Keep module structure consistent with existing code: module definition, controllers, services, DTOs/interfaces, state machines, jobs, and colocated specs/tests as applicable. Test service rules and state transitions directly, and add integration/e2e coverage for transactions, RLS, concurrency, idempotency, and permission boundaries when those behaviors are changed. Use UUIDs in fixtures and clean child records before parents. M3 tests must reseed baseline batches in `beforeEach` when tests depend on stock.

When adding or changing a module, update the corresponding migration, tests, `CHANGELOG.md`, and the module-status documentation in the same change. Before writing queries, read the exact migration schema; several inventory columns and relationships intentionally differ from older blueprint examples.

## Source-of-truth notes

Some older documents still describe Jest, ESLint, or an earlier Outbox API. The current source of truth for executable commands is `apps/api/package.json`; the current test runner is Vitest, linting is oxlint, and the current Outbox implementation takes precedence over examples in older docs. `CLAUDE.md` contains the maintained repository-specific gotchas and should be kept synchronized when modules, migrations, or conventions change.
