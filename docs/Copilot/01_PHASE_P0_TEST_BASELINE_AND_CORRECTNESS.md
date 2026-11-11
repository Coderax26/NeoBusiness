# Phase P0 — Test Baseline and Correctness

## Objective

Restore a deterministic backend baseline before adding new product scope. The standard `npm test` command must pass with normal Vitest parallelism, and business-critical TODO/placeholder paths must either be implemented or explicitly documented as out of scope.

## Evidence from the current codebase

- Full suite: 9 failed, 236 passed of 245.
- Parallel failures include PostgreSQL deadlocks in M3 fixture cleanup and incorrect ATP/expiry/GRN observations.
- Serial reruns remove the M3/M6 failures and M7a idempotency failure, indicating shared test database isolation problems.
- M7a notification queue assertion remains failed serially.
- Known correctness TODOs:
  - `apps/api/src/modules/m1-commercial/credit.service.ts`
  - `apps/api/src/modules/m1-commercial/order.service.ts`
  - `apps/api/src/modules/m4-production/requisition.service.ts`
  - `apps/api/src/modules/m6-finance/collection.service.ts`
  - `apps/api/src/modules/m6-finance/eod.service.ts`
  - `apps/api/src/modules/m7a-exceptions/notification.service.ts`

## Workstream P0.1 — Test database isolation

### Tasks

1. Inventory every test setup that truncates shared tables.
2. Record table ownership and FK order for M0, M1, M2, M3, M4, M5, M6, M7a, and M7b fixtures.
3. Ensure cleanup cannot run concurrently against a connection holding locks.
4. Choose one supported strategy:
   - worker-scoped schemas/databases,
   - one global cleanup advisory lock,
   - isolated fixture namespaces with no broad truncation,
   - or serial execution only for suites that require shared state.
5. Keep `assertTestDatabase` intact.
6. Make fixture identifiers UUID-based and unique per test/worker.
7. Re-run M3 ATP, FEFO, GRN, expiry, adjustment, and concurrency cases.
8. Re-run M6 handover variance and M7a exception tests in the full suite.

### Affected areas

- `apps/api/src/modules/m3-inventory/tests/test-setup.ts`
- `apps/api/src/modules/m3-inventory/tests/m3-acceptance.spec.ts`
- `apps/api/src/modules/m3-inventory/tests/m3-inventory.service.spec.ts`
- `apps/api/src/modules/m6-finance/tests/test-setup.ts`
- shared Vitest setup and database helpers

### Validation

- `npm test`
- targeted M3/M6 suites with default parallelism
- repeat the full suite at least three times to detect flakiness

### Exit criteria

- 245/245 tests pass under normal parallel execution.
- No PostgreSQL deadlocks or cross-suite fixture contamination.
- A documented test isolation rule exists for future modules.

## Workstream P0.2 — M7a notification queue defect

### Tasks

1. Trace `ExceptionService.raise()` from approval policy lookup to `notification_outbox` insert.
2. Verify seeded template codes and active flags.
3. Verify approver selection, transaction boundaries, and visibility timing.
4. Distinguish notification queue creation from provider delivery.
5. Add a focused regression test for IN_APP and FCM queue rows.
6. Preserve log-only provider behavior only where explicitly approved for development.

### Affected areas

- `apps/api/src/modules/m7a-exceptions/exception.service.ts`
- `apps/api/src/modules/m7a-exceptions/notification.service.ts`
- `apps/api/src/modules/m7a-exceptions/exception.service.spec.ts`
- migration/seed data for notification templates

### Exit criteria

- Notification queue test passes serially and in the full suite.
- Queue rows contain the expected recipient, template, channel, and reference.

## Workstream P0.3 — M1 correctness

### Tasks

1. Replace the overdue-credit TODO with a read through the M6 ledger/invoice contract.
2. Define the exact overdue calculation from invoice due date and business date.
3. Add tests for:
   - no overdue invoice,
   - overdue within tolerance,
   - overdue beyond `max_overdue_days`,
   - inactive customer,
   - credit-limit breach plus overdue combination.
4. Complete order counter/reprocessing or explicitly define a supported manual workflow.
5. Release reservations on reject/cancel paths through `InventoryPort`.
6. Add idempotency and event tests for repeated exception resolution.

### Exit criteria

- BR-02 is implemented against real ledger data, not a cached-only shortcut.
- Order resolution does not leave stock reservations or stale approval state.

## Workstream P0.4 — M4 and M6 business-event correctness

### Tasks

1. Replace the M4 requisition `inboundQty: '0'` placeholder with the real procurement/inventory calculation.
2. Remove the deferred `expect(true)` acceptance placeholder and test the shortage path.
3. Emit `collection.logged` transactionally from collection posting.
4. Emit `eod.closed` transactionally from EOD sign-off.
5. Ensure event payloads match `shared/events/domain-events.ts`.
6. Add duplicate-consumption tests for each event consumer.

### Exit criteria

- No business-critical event is merely commented out.
- M4 shortage and M6 event flows are covered by database-backed tests.

## Workstream P0.5 — Definition of done

Before leaving P0:

- No unowned correctness TODO remains.
- Every remaining placeholder has an issue/owner, explicit release scope, and test.
- Build, lint, e2e, and full unit/acceptance tests are green.

