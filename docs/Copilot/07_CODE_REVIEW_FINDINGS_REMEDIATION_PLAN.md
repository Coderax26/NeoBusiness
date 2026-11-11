# Code Review Findings Remediation Plan

**Review basis:** Code review completed on 2026-11-11.  
**Scope:** Five findings in supplier-bill persistence, outbox event delivery, dashboard event handling, and AR aging.  
**Purpose:** Provide an implementation-ready, priority-ordered plan. This document does not change application code.

## Executive priority

1. **P0 — Repair supplier-bill and tax-invoice database compatibility.**
2. **P0 — Restore reliable supplier-bill domain-event persistence.**
3. **P1 — Register dashboard event consumption and refresh processing.**
4. **P1 — Correct AR aging aggregation.**
5. **P1 — Add regression, integration, and migration verification before release.**

The two supplier-bill findings are blocking because normal bill creation and approval can fail at runtime even though TypeScript compilation succeeds. Event persistence is also release-blocking because financial/procurement state changes must not commit without durable downstream events.

## Finding-to-workstream map

| Finding | Severity | Primary files | Workstream |
|---|---|---|---|
| Supplier bill insert does not match schema | Critical | `apps/api/src/modules/m2-procurement/supplier-bill.service.ts`; M2 supplier-bill migrations | A |
| Tax invoice insert omits required fields | Critical | `apps/api/src/modules/m2-procurement/supplier-bill.service.ts`; tax-invoice migration | A |
| Supplier-bill events use wrong table and are not awaited | High | `supplier-bill.service.ts`; `OutboxService`; outbox migrations/relay | B |
| Dashboard handler is not connected to queue processing | High | `dashboard-event.handler.ts`; queue/relay module wiring | C |
| AR aging sums cumulative running balances | Medium | `analytics.service.ts`; dashboard SQL/tests | D |

## Workstream A — Align supplier bills and tax invoices with the database

### A1. Establish the canonical schema

Before editing the service, compare all supplier-bill and tax-invoice migrations in sequence order. Record:

- Required and nullable columns.
- Primary-key generation rules.
- Audit columns and their required values.
- Allowed status values and transition rules.
- Foreign keys and delete/update behavior.
- Monetary precision and source fields.
- Whether a later migration intentionally extends or replaces the baseline schema.

The implementation must treat the final applied schema as authoritative, not the earliest M2 migration or an older blueprint example.

### A2. Fix supplier-bill creation

Update the service insert contract so the parent and child rows provide every required field:

- Generate a UUIDv7 `id` for the supplier bill and each item row.
- Use the schema's canonical names (`bill_no`/`amount` or the final agreed names).
- Supply `created_by` and `updated_by` consistently.
- Use only a status accepted by the final database constraint.
- Insert child item rows with all required audit and foreign-key fields.
- Preserve transaction atomicity: parent, items, ledger/event records, and any derived totals must commit or roll back together.
- Keep monetary values as `Money`/decimal-backed storage strings.

If the intended domain status is `PENDING_APPROVAL`, add a new reversible migration that updates the database constraint only after confirming the state machine and API contract use that status. Do not silently change a status string in one layer.

### A3. Fix supplier-bill approval and tax-invoice generation

During approval:

- Generate the tax invoice UUID using the repository UUID utility.
- Generate `invoice_no` through the document-number service or the established invoice numbering mechanism.
- Populate all required audit, supplier, amount, tax, and reference fields.
- Ensure repeated approval is rejected or idempotently replayed according to the supplier-bill state machine.
- Ensure invoice creation and approval status transition occur in the same transaction.
- Verify that a failed invoice insert leaves the bill in its prior valid state.

### A4. Migration policy

Use a new append-only migration for any schema correction. The migration must:

- Have an explicit reversible `down` section.
- Be added under root `db/migrations/`.
- Use the next repository sequence after listing existing migrations.
- Avoid changing an already-run migration.
- Preserve existing data or include a safe backfill before adding `NOT NULL` constraints.
- Update status constraints and indexes deliberately, with no destructive data loss.

### A5. Tests for Workstream A

Add or update focused tests covering:

1. Supplier bill creation persists a valid parent row and all item rows.
2. Required audit fields and UUIDs are present.
3. Invalid status transitions are rejected.
4. Approval creates a valid tax invoice with ID and document number.
5. Approval is atomic when invoice creation fails.
6. Duplicate approval does not create a second invoice.
7. Monetary totals and tax values match the persisted schema precision.
8. RLS and permission boundaries remain enforced.

## Workstream B — Repair supplier-bill outbox event delivery

### B1. Use the shared outbox abstraction

Replace direct writes to the incorrect `outbox` table with the repository's current `OutboxService.raise(...)` contract and the canonical `outbox_events` storage path. Confirm the exact method signature from the current source before implementation.

Events must be raised inside the same transaction as the supplier-bill write. Do not publish directly to BullMQ from the service transaction.

### B2. Remove fire-and-forget event writes

Replace `void` event persistence calls with awaited operations. A supplier-bill transaction must fail explicitly if its required outbox write fails. Do not use a broad catch or success-shaped fallback.

Expected behavior:

- Business write succeeds and outbox write succeeds: commit.
- Business write succeeds but outbox write fails: roll back.
- Transaction rolls back: no relay-visible event remains.
- Relay retries a transient delivery failure without creating duplicate business effects.

### B3. Define event payload and idempotency behavior

For create, submit, approve, reject, and invoice-generation events, document and test:

- Event type.
- Aggregate ID.
- Supplier-bill ID and supplier ID.
- Site ID and actor ID.
- Amount and currency.
- Correlation/idempotency key.
- Event version if the repository uses versioned payloads.

Consumers must tolerate replay. Event handlers must not create duplicate ledger, invoice, notification, or dashboard effects.

### B4. Tests for Workstream B

Add integration tests that:

1. Confirm each supplier-bill mutation creates exactly one `outbox_events` row.
2. Confirm the row is visible to the relay after commit.
3. Confirm rollback removes the business row and event.
4. Force an outbox failure and verify the service reports the error.
5. Replay the same event and verify idempotent consumer behavior.
6. Verify the existing `OutboxRelay` processes the event successfully.

## Workstream C — Connect dashboard event handling to the queue

### C1. Trace current queue topology

Document how `domain-events` jobs are produced, claimed, routed, acknowledged, retried, and dead-lettered. Identify whether the repository expects:

- One dispatcher that routes all domain events, or
- Dedicated workers per module/consumer.

Do not add a competing consumer that can steal jobs from existing handlers without dispatch/routing guarantees.

### C2. Register `DashboardEventHandler`

Wire `handleDomainEvent()` into the established queue processing path. The selected design must ensure:

- Dashboard-relevant events are delivered to the handler.
- Non-dashboard events are ignored or routed elsewhere without loss.
- Handler failures are retried according to queue policy.
- Successful handling acknowledges the job.
- Duplicate deliveries are safe.
- Materialized-view refreshes do not run concurrently in an unsafe way.

Use NestJS dependency injection and existing queue/module conventions rather than instantiating the handler manually.

### C3. Refresh correctness and operational safeguards

Define which events trigger which refreshes. Add:

- Event-to-view mapping.
- Refresh coalescing or throttling if bursts are expected.
- Logging with event ID, aggregate ID, refresh target, duration, and result.
- Failure visibility and retry/dead-letter behavior.
- A reconciliation or scheduled refresh fallback for missed events.

### C4. Tests for Workstream C

Add tests that:

1. Boot the queue module and confirm the handler is registered.
2. Publish a dashboard-relevant domain event and observe the expected refresh.
3. Confirm unrelated events do not trigger the wrong refresh.
4. Confirm transient handler failure retries.
5. Confirm duplicate event delivery does not corrupt or multiply dashboard data.
6. Confirm materialized views reconcile with source records after processing.

## Workstream D — Correct AR aging aggregation

### D1. Confirm the ledger model

Read the exact M6 ledger schema and service behavior to determine whether `running_balance` is:

- A customer-level cumulative snapshot,
- An invoice-level cumulative snapshot, or
- A balance after each ledger entry.

The aging query must not sum cumulative snapshots across rows. Select the latest valid balance per required grouping or calculate outstanding balances from debit/credit movements.

### D2. Define aging semantics

Document:

- Which entries contribute to receivables.
- How invoices, payments, credit notes, reversals, and unapplied receipts affect balance.
- Which date drives aging.
- How overdue buckets are calculated.
- How partially paid invoices are represented.
- How site and customer filters apply.

Use PostgreSQL numeric arithmetic and preserve existing money precision.

### D3. Implement and verify the query

Prefer a query shape that:

- Selects the latest balance per customer/invoice where snapshots are authoritative, or
- Aggregates signed ledger movements when snapshots are not authoritative.

Avoid application-side floating-point aggregation and avoid reading another module's tables outside the established port/view boundary.

### D4. Tests for Workstream D

Cover:

1. One invoice with one ledger row.
2. One invoice with multiple cumulative balance rows.
3. Multiple invoices for one customer.
4. Payments and credit notes reducing outstanding balance.
5. Reversals not double-counting receivables.
6. Correct current/1–30/31–60/61–90/90+ bucket placement.
7. Site/RLS isolation.
8. Empty and fully paid customers.

## Execution sequence

### Phase R0 — Schema and contract confirmation

- Inspect final migration state and current service/relay contracts.
- Create a field/status/event mapping table before coding.
- Confirm whether the findings are from current uncommitted changes or already-landed code.
- Decide the canonical supplier-bill status lifecycle and invoice numbering path.

**Gate:** No implementation begins until the final schema and queue contract are unambiguous.

### Phase R1 — Supplier-bill runtime repair

- Implement Workstream A.
- Add the required migration only if schema correction is necessary.
- Implement Workstream B in the same change set where supplier-bill events are affected.
- Run focused M2 tests, migration checks, and transaction tests.

**Gate:** Create, submit, approve, reject, invoice generation, rollback, and outbox persistence all pass against PostgreSQL.

### Phase R2 — Dashboard queue integration

- Implement Workstream C.
- Run queue/relay integration tests and dashboard reconciliation tests.
- Verify no existing consumer loses jobs or changes behavior.

**Gate:** A committed domain event causes the expected dashboard refresh and failures are retryable/observable.

### Phase R3 — AR analytics correction

- Implement Workstream D.
- Add query-level and acceptance tests using realistic ledger histories.
- Compare results against a manually calculated fixture baseline.

**Gate:** Aging totals and buckets match the ledger truth for single-row, cumulative, payment, credit-note, reversal, and multi-site cases.

### Phase R4 — Release validation

Run from `apps/api`:

```bash
npm run build
npm run lint
npx vitest run m2-procurement
npx vitest run m7b-dashboards
npm test
npm run test:e2e
```

Also verify:

- Migration up/down on a disposable test database.
- No direct writes remain to a non-canonical outbox table.
- No fire-and-forget supplier-bill event writes remain.
- API and event documentation reflect final statuses and payloads.
- Changelog/module-status documentation is updated with the completed fixes.

## Definition of done

- Supplier-bill creation succeeds against the current PostgreSQL schema.
- Supplier-bill item rows and audit fields satisfy all constraints.
- Approval creates a valid tax invoice with UUID and invoice number.
- Supplier-bill events are durably stored in `outbox_events` through the shared outbox abstraction.
- Event writes are awaited and transactionally coupled to the business write.
- Dashboard domain events reach the registered handler and refresh the correct views.
- AR aging no longer sums cumulative balances repeatedly.
- Focused, integration, full-suite, build, lint, migration, and e2e validation pass.
- No application behavior is considered fixed based on compilation alone.

## Risk controls

- Do not loosen `NOT NULL` or status constraints merely to make tests pass.
- Do not modify an already-run migration; add a reversible migration.
- Do not bypass the outbox for synchronous convenience.
- Do not add a second queue consumer without proving job routing and acknowledgement semantics.
- Do not “fix” AR aging by changing a query without ledger-fixture tests.
- Keep all changes surgical and update existing module conventions, ports, state machines, audit, and idempotency behavior.
