# Plan: M3 Inventory and Warehouse — Remaining Implementation

**Source PRD**: N/A (free-form planning based on code review findings)
**Selected Milestone**: Complete M3 module for production readiness
**Complexity**: Medium

## Summary

The M3 Inventory and Warehouse service layer is functionally complete with 15/15 unit tests passing. However, the controller layer has 17 TypeScript compilation errors preventing build, the `InventoryPort` is not wired for cross-module consumption (M1/M5 still use stubs), no E2E acceptance test exists, and no background job for expiry sweep is implemented. This plan addresses all four remaining workstreams to make M3 production-ready.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| Controller structure | `m1-commercial/order.controller.ts:1-15` | `@Controller`, `@UseGuards(JwtAuthGuard)`, `@RequirePermission`, inject service only (no direct Knex) |
| Port wiring | `m1-commercial/m1-commercial.module.ts` | Export port token via `provide: PORT_TOKEN, useExisting: RealService` in providers, re-export in `exports` |
| E2E acceptance test | `m1-commercial/m1-acceptance.spec.ts:17-60` | `describe('M# Acceptance — Scenario X')`, `beforeAll` with migrations + seed, test full business flow |
| Background job | `shared/events/outbox-relay.service.ts:18-35` | `@Injectable()`, `implements OnModuleInit`, `setInterval` polling, `onModuleDestroy` cleanup |
| Error handling | `m1-commercial/order.controller.ts:15-29` | Throw `BadRequestException`, `NotFoundException`, `ConflictException` from service; controller only delegates |

## Files to Change

| File | Action | Why |
|---|---|---|
| `apps/api/src/modules/m3-inventory/inventory.controller.ts` | **REWRITE** | 17 TS errors; imports wrong, direct Knex access, type mismatches, void returns |
| `apps/api/src/modules/m3-inventory/m3-inventory.module.ts` | **UPDATE** | Add `INVENTORY_PORT` provider binding; export port token for M1/M5 |
| `apps/api/src/shared/ports/port-stubs.ts` | **UPDATE** | Fix `InventoryPortStub.checkATP()` to return `canFulfil: boolean` |
| `apps/api/src/modules/m3-inventory/tests/m3-acceptance.spec.ts` | **CREATE** | End-to-end scenario test (GRN → reservation → transfer → adjustment) |
| `apps/api/src/modules/m3-inventory/inventory-expiry.job.ts` | **CREATE** | Scheduled job to scan expired batches and transition status |
| `apps/api/src/modules/m3-inventory/m3-inventory.module.ts` | **UPDATE** | Register the new job provider |

## Tasks

### Task 1: Fix inventory.controller.ts — Complete Rewrite
- **Action**: Rewrite controller following M1 order.controller.ts pattern:
  - Import only from `@nestjs/common`, `@nestjs/swagger`, local service, shared ports
  - Use `@Inject(INVENTORY_PORT)` with token from `ports.interface.ts`
  - Remove all direct `this.knex` queries; delegate to `this.inventoryService`
  - Add `@RequirePermission` on each endpoint (`inventory.read`, `inventory.reserve`, `inventory.transfer`, `inventory.grn`, `inventory.adjust`)
  - Fix parameter types (string quantities, proper DTOs)
  - Return service results directly (no manual transformation)
  - Fix HTTP status codes (GET = 200, POST = 201)
- **Mirror**: `apps/api/src/modules/m1-commercial/order.controller.ts:1-88`
- **Validate**: `cd apps/api && npx tsc --noEmit -p tsconfig.json` (controller file only)

### Task 2: Wire InventoryPort in M3 Module
- **Action**: Update `m3-inventory.module.ts`:
  ```typescript
  import { INVENTORY_PORT } from '../../shared/ports/ports.interface.js';
  // in providers:
  { provide: INVENTORY_PORT, useExisting: InventoryService },
  // in exports: [InventoryService, INVENTORY_PORT]
  ```
- **Mirror**: `apps/api/src/modules/m1-commercial/m1-commercial.module.ts` (exports `PRICING_PORT`, `ITEM_PORT`, `CREDIT_PORT`)
- **Validate**: `cd apps/api && npx vitest run m1-commercial` (M1 should still work; M1 uses `PRICING_PORT`/`CREDIT_PORT` which are already wired)

### Task 3: Fix InventoryPortStub Contract Compliance
- **Action**: In `port-stubs.ts:46-54`, add missing `canFulfil: boolean` to returned `AtpResult`
- **Mirror**: `port-stubs.ts:26-40` (CreditPortStub returns all required fields)
- **Validate**: `cd apps/api && npx tsc --noEmit`

### Task 4: Create E2E Acceptance Test (m3-acceptance.spec.ts)
- **Action**: Create test file covering Scenario C (Inventory Flow):
  - `beforeAll`: run migrations, seed sites/users/items/batches
  - Test 1: GRN receipt for PO → stock increases, shortfall exception if >2%
  - Test 2: Order confirmation (via M1) triggers FEFO reservation via `InventoryPort`
  - Test 3: Inter-site transfer from Site B → Site A
  - Test 4: Stock adjustment write-off >5% → PENDING; shrinkage <5% → APPROVED
  - Test 5: Expiry drift detection returns expired batches
  - Use `neobus_test` DB, truncate M3 tables in `beforeEach`
- **Mirror**: `apps/api/src/modules/m1-commercial/m1-acceptance.spec.ts:34-120`
- **Validate**: `cd apps/api && npx vitest run m3-inventory` (includes acceptance test)

### Task 5: Create Inventory Expiry Sweep Job
- **Action**: Create `inventory-expiry.job.ts`:
  - `@Injectable()`, implements `OnModuleInit`
  - Poll every 60s (configurable via `ConfigService.get('inventory.expiry_sweep_interval_ms')`)
  - Query: `inventory_batches WHERE status='AVAILABLE' AND expiry_date < CURRENT_DATE`
  - For each expired batch: update status to `EXPIRED`, create `stock_adjustments` (type `EXPIRY_REMOVAL`), log `stock_ledger_txns`
  - Use transaction; log count processed
  - `onModuleDestroy`: clear interval
- **Mirror**: `apps/api/src/shared/events/outbox-relay.service.ts:18-35`
- **Validate**: `cd apps/api && npm run build && npm run lint`

### Task 6: Register Job in Module
- **Action**: Add `InventoryExpiryJob` to `providers` in `m3-inventory.module.ts`
- **Mirror**: `apps/api/src/modules/m0-platform/m0-platform.module.ts` (registers `OutboxRelay`)
- **Validate**: `cd apps/api && npm run dev` (starts without error, job logs "Inventory expiry sweep started")

### Task 7: Full Validation
- **Action**: Run complete validation suite
- **Validate**:
  ```bash
  cd apps/api
  npm run build
  npm run lint
  npm test
  npx vitest run m3-inventory
  npx vitest run m3-acceptance
  ```

## Validation

```bash
# From apps/api directory
npm run build          # Must pass with 0 errors
npm run lint           # Must pass with 0 warnings
npm test               # All 102+ tests pass
npx vitest run m3-inventory    # 15 service tests pass
npx vitest run m3-acceptance   # E2E scenario passes
```

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Controller rewrite introduces logic bugs | Medium | Keep service layer unchanged; controller is thin delegation only |
| Port wiring breaks M1/M5 if interface mismatch | Low | `InventoryPort` interface already matches service; verify with type check |
| E2E test flakiness due to parallel workers | Medium | Use deterministic UUIDs, truncate in `beforeEach`, isolate test data |
| Expiry job performance on large batch tables | Low | Migration has index on `expiry_date WHERE expiry_date IS NOT NULL`; sweep every 60s is fine |

## Acceptance

- [ ] `inventory.controller.ts` compiles with 0 TS errors
- [ ] `INVENTORY_PORT` exported and usable by M1/M5
- [ ] `InventoryPortStub` satisfies `InventoryPort` interface
- [ ] `m3-acceptance.spec.ts` created and passes
- [ ] `inventory-expiry.job.ts` created, registered, runs without error
- [ ] `npm run build && npm run lint && npm test` all pass
- [ ] No regressions in M0, M1, M6, M7a test suites