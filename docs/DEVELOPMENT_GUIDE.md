# NeoBus — Development Guide

**Version:** 1.0.0

---

## Prerequisites

- Node.js 20 LTS
- npm 9+
- Docker Desktop 24+
- Git 2.40+
- VS Code (recommended) with extensions: ESLint, Prettier, GitLens

---

## Getting Started

```bash
# 1. Start infrastructure
docker compose up -d

# 2. Install dependencies
cd apps/api && npm install

# 3. Set up environment
cp .env.example .env
# Edit .env with real values for your development machine

# 4. Run migrations and seed
npm run migrate
npm run seed

# 5. Start API in watch mode
npm run dev
```

---

## Coding Conventions

### TypeScript
- Strict mode: `strict: true` in `tsconfig.json`
- No `any` without a comment explaining why
- No `!` non-null assertions on database results — check for null explicitly
- All async functions must `await` properly or return the promise

### File naming
- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions and variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- DB tables: `snake_case`
- Enum values: `SCREAMING_SNAKE_CASE`

### Module structure (each M# module)
```
m1-commercial/
  m1-commercial.module.ts    NestJS module definition
  m1-commercial.controller.ts  HTTP endpoints
  m1-commercial.service.ts     Business logic
  m1-commercial.repository.ts  DB queries (Knex)
  dto/
    create-order.dto.ts
    order-response.dto.ts
  interfaces/
    order.interface.ts
  state-machines/
    order.state-machine.ts
  jobs/
    quote-expiry.job.ts
  tests/
    m1-commercial.service.spec.ts
    m1-commercial.e2e-spec.ts
```

### Business rules
- All business rule logic lives in the service, not the controller
- Configurable thresholds always read from `ConfigService.get('key')`, never hard-coded
- Status transitions always go through the state machine class, never by directly setting the status field
- Never write a business rule in the repository layer

### Money and quantities
```typescript
// CORRECT
import { Money } from '../shared/utils/money.util';
const floor = Money.divide(landedCost, Money.sub(1, minMarginPct));

// WRONG
const floor = landedCost / (1 - minMarginPct);  // float arithmetic is wrong for money
```

### Database queries
- Use parameterized Knex queries only; never string concatenation
- Use explicit transactions for any write that touches more than one table
- Financial and stock writes must be in a transaction — no exceptions

```typescript
// CORRECT
await this.db.transaction(async (trx) => {
  await trx('collection_receipts').insert(receipt);
  await trx('customer_ledger_entries').insert(ledgerEntry);
  await trx('custody_ledger').insert(custodyEntry);
});

// WRONG: three separate inserts outside a transaction
await this.db('collection_receipts').insert(receipt);
await this.db('customer_ledger_entries').insert(ledgerEntry); // this could fail after the receipt was written
```

### Domain events
Publish events **inside the transaction** via the Outbox, not after:
```typescript
await this.db.transaction(async (trx) => {
  // ... business writes
  await this.outbox.publish(trx, {
    type: 'order.confirmed',
    aggregateId: order.id,
    payload: { orderId: order.id, customerId: order.customerId },
  });
});
```

---

## API Design Rules

- REST endpoints follow resource-based naming: `/orders`, `/orders/{id}/confirm`
- Use HTTP verbs correctly: GET (read), POST (create/action), PATCH (partial update)
- All responses return a consistent envelope: `{ data, meta?, error? }`
- Errors: use NestJS built-in exceptions (`NotFoundException`, `ForbiddenException`, etc.)
- Every endpoint must be decorated with `@ApiOperation` and `@ApiResponse` for OpenAPI
- Field masking in response DTOs using `@Sensitive()` decorator

---

## Testing Rules

### What must be tested
- All business rules (BR-01 through BR-08): unit tests on the service
- All state machine transitions: unit tests
- All permission boundary tests: "can OPS_COORD confirm below-floor via direct API call?" → No
- All concurrent operations that touch shared state: concurrency tests
- All idempotency scenarios: "submit same offline command twice → one record created"
- Scenario A through F: e2e tests covering the full cross-module flow

### Test naming convention
```typescript
describe('PricingService.evaluateLine()', () => {
  it('returns IN_BAND when price >= floor', () => { ... });
  it('returns BELOW_FLOOR when price < floor and raises PRICE_OVERRIDE', () => { ... });
  it('throws if floor price is not published for today', () => { ... });
});
```

### Test Database & Environment Separation

Automated tests (unit, integration, and e2e specs) use a dedicated test database (`neobus_test`) separate from the development database (`neobus_dev`).

- **Why separate databases?**
  - **Isolation from Destructive Operations:** Test fixtures run `TRUNCATE TABLE ... RESTART IDENTITY CASCADE` and `del()` hooks. Running these against `neobus_dev` destroys manual testing data, seed catalogs, and active orders.
  - **Concurrency & Flakiness:** Vitest workers run tests in parallel. Running tests against a dirty or shared dev database causes unique key collisions, foreign key violations, and deadlocks.
  - **Clean Schema Validation:** The test database verifies that all migrations apply cleanly without schema drift.

- **Automatic Environment Configuration (`.env.test`)**:
  - `apps/api/.env.test` configures `DATABASE_URL` pointing to `postgresql://neobus:neobus_dev_secret@localhost:5432/neobus_test`.
  - Vitest automatically loads `.env.test` via `vitest.setup.ts` and sets `NODE_ENV=test`.
  - **Safety Rail Guard:** `assertTestDatabase(knex)` verifies `current_database()` ends with `_test`. If tests are pointed to `neobus_dev` or production, execution immediately aborts before any table truncation or deletion can happen.

- **Migrations Single Source of Truth**:
  - All SQL migrations reside in the canonical monorepo root directory `db/migrations/`.
  - `MigrationService` uses dynamic path resolution and PostgreSQL advisory locks (`pg_advisory_lock`) to coordinate parallel migration runs across workers.

```bash
# Run tests (automatically targets neobus_test via .env.test)
cd apps/api && npm test

# Run e2e tests
npm run test:e2e
```

---

## Git Branching Strategy

```
main              production-ready code only
  └── develop     integration branch; all features merge here
        ├── feature/m0-auth
        ├── feature/m1-order-state-machine
        └── fix/br01-floor-calculation
```

### Branch naming
- Features: `feature/<module>-<short-description>` e.g. `feature/m1-order-state-machine`
- Bug fixes: `fix/<module>-<short-description>` e.g. `fix/m3-fefo-reservation-lock`
- Hotfixes on main: `hotfix/<short-description>`

### Commit messages (Conventional Commits)
```
feat(m1): implement BR-01 dynamic pricing band evaluation
fix(m3): prevent double-allocation on concurrent reservation
test(m1): add Scenario A end-to-end acceptance test
docs(architecture): document ADR-006 UUIDv7 primary keys
chore: update knex to 3.1.0
```

### PR checklist
- [ ] All new code has unit tests
- [ ] Business rule tests pass (the specific BRs touched by this PR)
- [ ] No `any` type without justification comment
- [ ] No hard-coded thresholds (all in `business_rule_config`)
- [ ] No credentials or secrets in code
- [ ] API endpoints documented in OpenAPI annotations
- [ ] Migration is reversible (has a `down` function)
- [ ] `npm run lint` passes
- [ ] `npm run test` passes

---

## Migration Conventions

### File naming
`<timestamp>_<module>_<description>.sql`
Example: `20261021_001_m0_initial_platform_tables.sql`

### Each migration must have
- An `up` section (apply the change)
- A `down` section (reverse the change)

### Rules
- Never modify an existing migration that has been run in any environment
- Schema changes needed to fix a migration must be a new migration
- Append-only table triggers and REVOKE statements belong in the migration that creates the table
- Seed data goes in the seed script, not migrations

---

## Port and Stub Pattern

When building a module that depends on a port not yet implemented, use the stub:

```typescript
// In m1-commercial.module.ts (Sprint 1, before M3 exists)
providers: [
  {
    provide: INVENTORY_PORT,
    useClass: InventoryPortStub,  // always returns {available: true, qty: MAX}
  },
],
```

When M3 ships, replace `InventoryPortStub` with `InventoryPortImpl`. All M1 code continues to work unchanged because it only knows about the `INVENTORY_PORT` token.

---

## Useful Commands

```bash
# Generate a new NestJS module
npx nest generate module modules/m1-commercial

# Generate a new migration
npm run migrate:make m1_add_order_status_log

# Check which migrations have run
npm run migrate:status

# View the OpenAPI docs
# (with API running) open http://localhost:3000/api-docs

# Run a specific test file
npx jest src/modules/m1-commercial/m1-commercial.service.spec.ts

# Run tests matching a describe block
npx jest --testNamePattern="PricingService"
```
