# NeoBus Remaining Work Plan

This plan converts `docs/PROJECT_STATUS_BLUEPRINT_ALIGNMENT_REVIEW.md` into an execution sequence. It is intentionally implementation-oriented and does not change application code by itself.

## Phase P0 - Restore a trustworthy baseline

### P0.1 Test isolation and concurrency

**Objective:** `npm test` passes with the repository's normal Vitest parallelism.

Tasks:

1. Identify every suite that truncates shared tables in `beforeEach`/`beforeAll`.
2. Ensure each worker has isolated fixture identifiers and does not truncate tables while another worker transaction is active.
3. Add advisory-lock or worker-scoped cleanup coordination where shared PostgreSQL tables are unavoidable.
4. Re-run M3 acceptance/service tests with parallel workers and confirm ATP, GRN, expiry, and adjustment expectations.
5. Re-run M6 handover variance and M7a exception tests in the full suite.
6. Keep the existing test database safety guard; do not weaken it.

**Exit criteria:** 245/245 tests pass under `npm test`, with no PostgreSQL deadlocks.

### P0.2 M7a notification defect

**Objective:** Make exception creation reliably queue the expected notifications.

Tasks:

1. Compare the seeded template codes/channels with `ExceptionService.raise()` and the failing test setup.
2. Verify transaction visibility and notification enqueue ordering.
3. Preserve the intended distinction between queued notifications and provider delivery.
4. Add a focused regression test for FCM and IN_APP rows.

**Exit criteria:** The remaining serial M7a notification test passes and the full suite remains green.

### P0.3 Correctness TODOs

Resolve these before calling the backend complete:

- M1: query M6 ledger/invoice data for overdue-day credit blocking.
- M1: implement or explicitly remove the manual-only order counter/reprocessing path.
- M1: release inventory reservations when an order is rejected/cancelled.
- M4: replace the requisition inbound quantity placeholder and execute the shortage-to-M2 path.
- M6: emit `collection.logged` and `eod.closed` through the transactional outbox.
- M6: replace deposit-slip PDF placeholder with a real artifact path or document an approved deferral.
- M7a: define provider delivery behavior and failure handling rather than treating logs as production delivery.

**Exit criteria:** No business-critical TODO/placeholder remains without an owner, issue reference, explicit scope, and test.

## Phase P1 - Complete and verify backend contracts

### P1.1 M6 HTTP surface

Create the missing controller/DTO/API layer for:

- invoices and invoice retrieval
- collections and receipt allocation
- custody wallet and handover
- cheque lifecycle
- PTP follow-ups
- collection worklists
- EOD start/checklist/sign-off
- credit notes
- COD settlement
- Tally export/status
- opening-balance import

Apply the project conventions: JWT/RBAC/RLS, idempotency for offline mutations, response envelopes, OpenAPI annotations, audit coverage, and permission-boundary tests.

**Exit criteria:** All M6 blueprint API entries have implemented routes and contract tests.

### P1.2 M2/M3/M4 backend completion

- Add/verify supplier performance and stale-rate scheduled jobs.
- Complete supplier-bill lifecycle and acceptance coverage.
- Verify vehicle-location stock behavior and all cross-site RLS paths.
- Complete M4 shortage-to-procurement integration and deferred acceptance scenario.
- Confirm every port implementation is real and no production path uses a permissive stub.

**Exit criteria:** Scenarios B, C, and F run end-to-end against the real database and events.

### P1.3 M5/M6 operational artifacts

- Implement challan PDF generation and storage/download behavior.
- Implement invoice and deposit-slip PDF generation or approve a documented external-service boundary.
- Verify `trip.dispatched`, `trip.closed`, `collection.logged`, and `eod.closed` delivery and idempotent consumption.
- Run offline duplicate replay and airplane-mode stress tests.

**Exit criteria:** Scenario D and the complete dispatch-to-cash flow pass with durable artifacts and no duplicate ledger effects.

### P1.4 M7b live dashboard and notifications

- Verify scheduled materialized-view refresh intervals and event-triggered invalidation.
- Implement/verify SSE or the approved realtime alternative.
- Add reconciliation tests for pulse, status matrix, EOD, KPI, and analytics views.
- Finish production notification providers, retry/backoff, failure alerts, opt-ins, and fallback channels.
- Add audit viewer, policy/threshold API, and weekly KPI audit job.

**Exit criteria:** Dashboard data reconciles to source ledgers and the owner workflow is usable without direct database access.

## Phase P2 - Resolve decisions and update the contract

Resolve and record the open decisions that affect code or UX:

- owner escalation value
- e-invoice and e-way-bill ownership
- OTP delivery channel
- multi-site coordinator policy
- driver/factory language set
- supplier price-spike baseline and backup tolerance
- freight/handling allocation
- make-to-order versus make-to-stock
- ePOD OTP requirement
- custody wallet scope and handover verifier
- invoice allocation override policy
- accounting target
- dashboard sales definition and refresh expectation

For each decision:

1. Record the decision and date in `docs/OPEN_DECISIONS.md`.
2. Update the affected module specification and API/event contract.
3. Add or adjust configuration seed values.
4. Add an acceptance test for the chosen behavior.

**Exit criteria:** No behavior-changing AWAITING decision remains for the MVP release scope.

## Phase P3 - Build the frontend product

Implement the frontend build pack in order:

### F0/F1 - foundation and exception handling

- shared UI/API/i18n/permissions packages
- design tokens and status map
- web app shell, login, role navigation, site switcher
- cookie-based auth, CSRF, idle timeout, PIN re-prompt
- permission helper and route guards
- exception approval queue, alerts badge, notification log
- SSE/realtime client with reconnect behavior

### F2/F3 - commercial and finance

- daily price sheet and missing-price alerts
- customers, quick order entry, quotes, order tracker
- invoices, AR, collections, custody handover, cheque lifecycle, EOD
- owner approval/counter-price interactions

### F4/F5 - inventory and fleet

- stock, ATP, expiry, transfers, adjustments, ledger
- tablet blind GRN and loading flows
- trip builder, dispatch board, issue desk, vehicle views
- driver offline manifest, ePOD, photos, command queue, sync conflict handling

### F6/F7 - production, procurement, dashboards

- tablet Kanban, BOMs, work-order completion, wastage and attendance
- supplier, rate quote, PO, GRN, shortfall, supplier scorecard
- owner pulse, status matrix, analytics, EOD reconciliation, audit viewer, settings

### Frontend quality gates

- service worker and IndexedDB outbox
- English/Marathi (or approved language) translations
- masked-role contract tests
- blind-GRN and offline-write tests
- accessibility and keyboard pass
- Playwright scenarios A-F
- performance budgets and feature flags

**Exit criteria:** Every blueprint screen has a reachable role-authorized implementation, and offline-required workflows survive restart, retry, and duplicate replay.

## Phase P4 - Production readiness

1. Security review: RBAC bypass, RLS isolation, price-floor bypass, cash-custody bypass, secrets, file upload, webhook/event trust boundaries.
2. Concurrency/load review: reservations, ledger writes, EOD sign-off, outbox relay, materialized-view refresh.
3. Performance: establish p95 targets and measure common queries/API paths.
4. Backup/restore: document and rehearse PostgreSQL backup, PITR, restore, and data-integrity verification.
5. Observability: structured logs, correlation IDs, error tracking, metrics, queue lag, failed notifications, uptime checks.
6. Production image/deployment: non-root container, health checks, resource limits, TLS, secret management, migrations, rollback, DNS/SSL.
7. Operational pilot: complete the 7-day parallel run against manual EOD and reconcile every discrepancy.

**Exit criteria:** A documented go-live checklist is signed off, recovery has been rehearsed, and the system meets security, performance, and operational acceptance targets.

## Phase P5 - Documentation and governance cleanup

- Create one authoritative project status document and link it from the README.
- Reconcile `docs/CHANGELOG.md`, `docs/PROJECT_OVERVIEW.txt`, `docs/IMPLEMENTATION_ROADMAP.md`, and `docs/BLUEPRINT_TRACEABILITY.md`.
- Mark blueprint checklist items as complete only when code, API, tests, and required UI evidence exist.
- Decide whether `m7-control-tower` remains a placeholder or should be removed in favor of M7a/M7b.
- Add issue/owner/target release references for every remaining task.
- Keep `CLAUDE.md` and repository instructions synchronized with actual commands and module status.

**Exit criteria:** A new contributor can determine the real release state, test commands, known limitations, and next milestone from one consistent set of documents.

## Recommended sequencing summary

| Priority | Workstream | Depends on | Completion signal |
|---|---|---|---|
| P0 | Test isolation and notification defect | Existing backend | Full `npm test` green |
| P0 | Business-critical TODOs | P0 test baseline | No unowned correctness placeholders |
| P1 | M6 APIs and backend contract completion | P0 | All required backend routes and scenarios pass |
| P1 | Event/PDF/offline/provider integrations | P0/P1 APIs | Durable cross-module operational flow |
| P2 | Business decisions | Owner/accountant input | No MVP behavior-changing decisions open |
| P3 | Web/mobile/tablet clients | Stable API contracts | UI scenarios A-F and offline gates pass |
| P4 | Security/performance/recovery/deployment | Complete product | Go-live checklist signed off |
| P5 | Documentation reconciliation | All preceding phases | One consistent source of truth |
