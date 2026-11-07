---
name: new-module
description: >
  Build a new NeoBus backend module (M2–M5, M7b) following the established
  patterns from existing modules.  Use when the user says "create module",
  "build the X module", "next module", "implement M*", or similar.
---

# Build a New NeoBus Module

Reference implementation: **M1 Commercial** (`apps/api/src/modules/m1-commercial/`).
Secondary reference: **M6 Finance** (`apps/api/src/modules/m6-finance/`).

## Steps

### 1 — Read the module spec

Open `docs/modules/<NN>_<ModuleName>.md` (e.g. `05_M3_Inventory_Warehouse.md`).
Extract from the spec's 13 standard sections:
- §3 Data model → tables, columns, constraints, indexes
- §4 Business rules → BRs to implement and test
- §5 Workflows & state machines → status enums, valid transitions
- §6 Screens → UI pages (for future frontend, note in plan)
- §7 API → endpoints, verbs, permissions
- §8 Events & ports → domain events to publish/consume, ports to implement
- §10 Acceptance criteria → required test scenarios

### 2 — Show the plan, wait for approval

Present a numbered build plan covering migration, services, controllers,
DTOs, port wiring, event handlers, tests, and app.module registration.
**Stop and wait for the user to approve before writing any code.**

### 3 — Create the SQL migration

File: `db/migrations/<YYYYMMDD>_<seq>_<module>_<description>.sql`

Follow the existing pattern (see `20261024_006_m1_commercial_crm.sql`):

```
-- ============================================================
-- Migration: <timestamp>_<seq>_<module>_<description>
-- Module:    M<N> — <Module Name>
-- Purpose:   <one-line summary>
-- ============================================================
```

Rules from the codebase:
- Every table gets `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- Standard columns: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `created_by UUID`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
  `updated_by UUID`
- Money columns: `NUMERIC(14,2)` — never float
- Quantity columns: `NUMERIC(14,3)`
- Status fields: `TEXT NOT NULL CHECK (status IN ('A','B','C'))`
- Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- Add `COMMENT ON TABLE` and `COMMENT ON COLUMN` for non-obvious fields
- RLS: add site-scoped RLS policies matching `current_setting('app.site_ids')`
- Append-only ledger tables: `REVOKE UPDATE, DELETE` on the app user
- Include `-- DOWN` section for rollback

### 4 — Create the module folder structure

```
apps/api/src/modules/m<N>-<name>/
  m<N>-<name>.module.ts         ← NestJS module definition
  <entity>.controller.ts        ← one per REST resource
  <entity>.service.ts           ← business logic (all BRs here)
  dto/
    <entity>.dto.ts             ← request/response DTOs
  tests/
    test-setup.ts               ← DB setup helper (see M6 pattern)
    m<N>-acceptance.spec.ts     ← acceptance tests
    m<N>-<name>.service.spec.ts ← unit tests
```

### 5 — Write the NestJS module definition

Follow the M1/M7a pattern in the `.module.ts`:

```typescript
import { Module, Global } from '@nestjs/common';
// Import DatabaseModule, AuthModule from m0-platform
// Import port symbols from shared/ports/ports.interface.js

@Global()
@Module({
  imports: [ConfigModule, DatabaseModule, AuthModule],
  providers: [
    // Services...
    // Wire port token → real service:
    { provide: SOME_PORT, useExisting: SomeService },
  ],
  controllers: [/* ... */],
  exports: [/* services + port tokens */],
})
export class M<N><Name>Module {}
```

Key rules from existing modules:
- Use `@Global()` if the module provides a port consumed by others
- Import `DatabaseModule` and `AuthModule` from `m0-platform`
- Wire port tokens via `{ provide: TOKEN, useExisting: Service }`
- If the module consumes `ExceptionPort.onResolved()`, register the
  handler in `onModuleInit()` (see M6 pattern)

### 6 — Write services

Follow `m1-commercial/order.service.ts` as the reference:

- Inject `@InjectKnex() private readonly knex: Knex`
- Inject ports via `@Inject(PORT_TOKEN)` — never import another module's service
- All business logic lives in the service, not the controller
- Use `Money` / `Qty` utilities for arithmetic (never raw floats)
- Use `Clock` utility for timestamps (never raw `new Date()` in logic)
- Wrap multi-table writes in `this.knex.transaction(async (trx) => { ... })`
- Publish domain events inside the transaction via `OutboxService`
- Status transitions go through explicit checks (state machine pattern)
- Read config thresholds from `ConfigService.get('key')`, never hard-code

### 7 — Write controllers

Follow `m1-commercial/order.controller.ts` as the reference:

```typescript
@Controller('<resource>')
@UseGuards(JwtAuthGuard)
export class EntityController {
  constructor(private readonly svc: EntityService) {}

  @Post()
  @RequirePermission('<module>.<action>')
  async create(@Body() dto: CreateDto, @Req() req: any) {
    return this.svc.create(dto, req.user.id);
  }
}
```

Rules:
- `@UseGuards(JwtAuthGuard)` on every controller class
- `@RequirePermission('...')` on every endpoint
- Controllers are thin — delegate to the service immediately
- Return the service result directly (consistent `{ data, meta?, error? }` envelope)

### 8 — Write DTOs

Follow `m1-commercial/dto/order.dto.ts`:

- Use `class-validator` decorators: `@IsUUID()`, `@IsString()`, `@IsNumber()`, etc.
- Use `@Type(() => Number)` from `class-transformer` for numeric coercion
- One DTO class per action (Create, Update, action-specific like Confirm)
- Money/qty inputs: accept as `number` in DTO, convert to string with
  `Money` / `Qty` in the service

### 9 — Replace the port stub

In `apps/api/src/shared/ports/port-stubs.ts`:
- The stub for this module already exists — do NOT delete it
- The real implementation now lives in the new module's service
- The module wires the real service to the port token (step 5)

Update `apps/api/src/shared/events/domain-events.ts`:
- Add any new `EventType` values and payload interfaces

### 10 — Write tests

**Unit tests** (`m<N>-<name>.service.spec.ts`):
Follow the Vitest pattern from `m7a-exceptions/exception.service.spec.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
// Set up real Knex + MigrationService, seed test data in beforeAll
// Test each business rule branch, state machine transition, permission boundary
```

**Acceptance tests** (`m<N>-acceptance.spec.ts`):
Follow the pattern from `m1-acceptance.spec.ts` and `m6-acceptance.spec.ts`:
- Name the describe block: `M<N> Acceptance — Scenario X: <title>`
- Document scenarios covered in a block comment above
- `beforeAll`: `createKnex()` → run migrations → seed approval policies + test data
- `afterAll`: `knex.destroy()`
- `beforeEach`: truncate module-specific tables only (not shared tables)
- Test every scenario from the module spec §10

**Test setup** (`tests/test-setup.ts`):
Follow the M6 pattern — `setupTestDB()` that runs migrations, ensures
schema columns, truncates module tables with CASCADE, seeds test users.

Run tests: `cd apps/api && npx vitest run m<N>-<name>`

### 11 — Register in app.module.ts

In `apps/api/src/app.module.ts`:
- Import the new module class
- Add it to the `imports` array at the correct position (follow the
  sprint order comments already in the file)
- If the module was previously commented out, uncomment it

### 12 — Run and verify

```bash
cd apps/api
npm run migrate            # apply the new migration
npx vitest run m<N>        # run module tests
npm run lint               # check for lint errors
npm run build              # verify TypeScript compiles
```

Fix any failures before proceeding.

### 13 — Summary

After all steps pass, post a short summary:
- Tables created (count)
- Services / controllers created
- Port stubs replaced
- Domain events added
- Tests written and pass count
- Any open items or decisions deferred
