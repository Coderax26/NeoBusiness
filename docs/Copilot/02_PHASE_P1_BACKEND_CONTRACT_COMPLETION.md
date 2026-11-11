# Phase P1 — Backend Contract Completion

## Objective

Complete the backend product surface defined by the module blueprints, especially missing HTTP APIs, operational artifacts, integrations, and cross-module scenarios.

## Workstream P1.1 — M6 HTTP API layer

The M6 directory currently contains services but no controller files. Add a complete API layer following the repository conventions.

### Required resource groups

1. Invoices: list, retrieve, PDF/download status.
2. Collections: record receipt, allocate, retrieve, idempotency replay.
3. Customer ledger and AR: balance, aging, open invoices, worklist.
4. Custody: wallet, expected handover, initiate, verify, dispute, resolve.
5. Cheques: receive, deposit, clear, bounce, replace, follow-up.
6. PTP: create, update, list due/broken promises.
7. EOD: start, checklist, sign-off, retrieve reconciliation.
8. Credit notes: request, approve/reject, post, retrieve.
9. COD settlement: list pending, settle, retrieve.
10. Tally export: create batch, inspect status, download/export.
11. Opening balances: CSV template, draft import, sign-off, import, reverse.

### Required controls

- JWT and permission decorators.
- RLS-scoped site access.
- Idempotency for mobile mutations.
- `{ data, meta?, error? }` response envelope.
- Swagger `@ApiOperation` and `@ApiResponse`.
- Audit logging for all mutations.
- Sensitive-field masking.

### Exit criteria

- Every M6 blueprint API entry maps to a route, DTO, permission, test, and OpenAPI response.

## Workstream P1.2 — M2 procurement completion

### Tasks

- Complete supplier bill lifecycle and API exposure.
- Add supplier performance and stale-rate scheduled jobs.
- Verify price-spike baseline and configurable tolerance.
- Verify backup supplier ranking and back-to-back spread calculations.
- Add scenarios B and C against real M2/M3/M4 events.
- Verify `ProcurementPort` is real in every consumer.

### Exit criteria

- Supplier, PO, GRN, shortfall, bill, and backup workflows are covered by service, acceptance, and integration tests.

## Workstream P1.3 — M3 inventory completion

### Tasks

- Revalidate ATP/FEFO and reservations after P0 isolation fixes.
- Verify vehicle locations and in-transit stock.
- Verify transfer variance and reversal entries.
- Verify stock adjustment approval and append-only behavior.
- Verify expiry, drift, and stale-reservation jobs.
- Verify RLS for multi-site inventory and non-superuser access.

### Exit criteria

- No stock oversell under concurrent reservation.
- All ledger corrections use reversal entries.
- Scenario C/F stock paths pass.

## Workstream P1.4 — M4 production completion

### Tasks

- Complete shortage-to-procurement integration.
- Verify BOM versioning and effective-date selection.
- Verify work-order start/complete/cancel state transitions.
- Verify raw-material consumption and finished-goods output postings.
- Verify yield and wastage approval thresholds from configuration.
- Add late-work-order handling and masking tests.

### Exit criteria

- Scenario F passes end-to-end with production, inventory, procurement, and order readiness.

## Workstream P1.5 — M5 operational artifacts

### Tasks

- Implement challan PDF generation, persistence, retrieval, and permission checks.
- Add e-way-bill reference handling according to the final decision.
- Complete driver command queue delivery and acknowledgement.
- Add airplane-mode, retry, duplicate replay, and photo-upload stress tests.
- Verify `trip.dispatched`, `trip.closed`, ePOD, returns, COD, and credit-note integration.

### Exit criteria

- Scenario D passes with durable challan/ePOD artifacts and no duplicate financial or stock effects.

## Workstream P1.6 — M6 artifacts and event integration

### Tasks

- Complete invoice PDF generation.
- Complete EOD deposit-slip PDF generation.
- Verify `trip.dispatched` invoice generation and `trip.closed` COD settlement.
- Verify collection and EOD events update dashboards and accounting export.
- Verify Tally batch idempotency and retry behavior.

### Exit criteria

- Dispatch-to-invoice-to-collection-to-EOD flow is durable and replay-safe.

## Workstream P1.7 — M7b dashboards, realtime, and provider integrations

### Tasks

- Verify materialized-view refresh schedules and indexes.
- Implement the approved realtime mechanism, including SSE if retained.
- Add source-to-view reconciliation tests.
- Complete audit viewer and policy/threshold settings endpoints.
- Complete KPI query and weekly audit job.
- Implement notification provider adapters, retries, backoff, failure events, and fallback channels.

### Exit criteria

- Pulse, status matrix, analytics, EOD, and alerts reconcile to source data.
- Provider failures are visible and retryable.

## P1 completion gate

- Backend API contract inventory is complete.
- Scenarios A-F pass against real services and events.
- No production path depends on permissive stubs.
- All generated artifacts have retrieval and authorization tests.

