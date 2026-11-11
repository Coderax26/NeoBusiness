# NeoBus Project Status and Blueprint Alignment Review

**Review date:** 2026-11-11  
**Scope:** All module specifications in `docs/claude/` (`M0` through `M7`, including `10_FE_Web_Frontend.md`), current repository contents, migrations, backend tests, build, lint, and e2e tests.  
**Change policy followed:** No application source code was changed. This review document is the requested deliverable.

## Executive assessment

The backend has progressed substantially beyond the original build-pack checklists. M0, M1, M2, M3, M4, M5, M6, M7a, and M7b all have meaningful implementation in `apps/api`, and the repository contains migrations and acceptance coverage for the principal business rules. However, the project is **not yet blueprint-complete or production-ready**.

The largest gap is that the blueprint defines a complete multi-client product, while the repository currently contains only the backend implementation. `apps/web`, `apps/mobile`, and `apps/tablet` contain only placeholder-level content. Several backend integrations remain partial, some APIs are missing, the documentation status is contradictory, and the full unit/acceptance suite is currently red under normal parallel execution.

## Validation performed

| Check | Result | Evidence |
|---|---|---|
| Full backend unit/acceptance suite | **Failed**: 4 files failed, 9 tests failed, 236 passed of 245 | `npm test` from `apps/api`; failures in M7a, M3, and M6 |
| Serial rerun of failed module files | **Failed**: 1 test failed, 61 passed of 62 | M3/M6 failures and M7a idempotency failure disappear serially; M7a notification assertion remains |
| Backend e2e suite | **Passed**: 2 files, 7 tests | `npm run test:e2e` |
| Backend build | **Passed** | `npm run build` |
| Backend lint | **Passed with warnings**: 0 errors, 233 warnings | `npm run lint`; mostly unused imports/variables and type-aware warnings |
| Database migration state | Appears current during tests | Test logs reported “All migrations up to date” |

### Current failing tests

1. `src/modules/m7a-exceptions/exception.service.spec.ts`
   - Notification queue assertion expects FCM/in-app rows but finds none in the tested setup.
2. `src/modules/m3-inventory/tests/m3-acceptance.spec.ts`
   - GRN stock increase test and expiry drift test fail in the parallel run.
   - One failure is a PostgreSQL deadlock during fixture truncation.
3. `src/modules/m3-inventory/tests/m3-inventory.service.spec.ts`
   - GRN tolerance and stock adjustment fail in the parallel run because fixture cleanup deadlocks.
   - ATP tests return incorrect quantities (`0` and `300` instead of `1500` and `1800`) in the parallel run.
4. `src/modules/m6-finance/tests/m6-acceptance.spec.ts`
   - Cash-handover variance test does not find the expected exception in the parallel run.

The serial rerun is important: it passed the M3 and M6 files and passed the M7a idempotency case. This points to test database isolation, shared fixture cleanup, and worker concurrency as a release blocker, not proof that all runtime behavior is correct.

## Module-by-module alignment

| Area | Current implementation | Alignment | Remaining work |
|---|---|---|---|
| **M0 Platform Foundation** | Auth, JWT, refresh/logout, RBAC, RLS middleware, audit interceptor, config, idempotency, doc numbering, outbox, migrations, seed and API health infrastructure exist. | **Backend mostly aligned** | Blueprint still calls for OTP delivery, pre-signed upload service, complete offline client support, and acceptance proof. `auth.controller.ts` exposes login/refresh/logout/me but no OTP endpoint. |
| **M7a Exceptions and notifications** | Exception lifecycle, delegation/escalation, exception API, device registration, outbox notification relay, and tests exist. | **Backend mostly aligned** | FCM/SMS/WhatsApp are log-only or development stubs; approval mobile UI and deep-link workflow are absent. One notification queue test still fails. |
| **M1 Commercial and CRM** | Customer/item/pricing/quote/order controllers and services, BR-01, price memory, order state machine, M1 acceptance coverage, and port wiring exist. | **Backend largely aligned** | BR-02 overdue-invoice evaluation is still explicitly TODO in `credit.service.ts`; order counter/reprocessing and reservation release contain TODO paths. All M1 screens are absent. |
| **M2 Procurement and Supplier** | Supplier, rate quote, requisition, PO, GRN, shortfall, back-to-back, supplier bill schema/service additions, controllers, and acceptance tests exist. | **Backend substantially aligned** | Scheduled supplier performance/stale-rate jobs, complete supplier-bill lifecycle/API coverage, UI screens, and end-to-end Scenarios B/C still need verification. The blueprint checklist itself is stale and still unchecked. |
| **M3 Inventory and Warehouse** | Inventory batches, stock ledger, ATP/FEFO, reservations, transfers, adjustments, GRN/dispatch/return handlers, drift/stale jobs, controller, and acceptance/e2e tests exist. | **Backend functionally close, but not stable** | Parallel test cleanup deadlocks and causes false/real fixture failures. Revalidate vehicle-location handling, all RLS/concurrency cases, and the complete warehouse UI. |
| **M4 Factory Production** | BOM, requisitions, work orders, consumption/output, yield and wastage handling, attendance, ProductionPort, controller surfaces, and acceptance tests exist. | **Backend mostly aligned** | A production acceptance scenario is explicitly deferred with `expect(true)`. RM shortage-to-procurement integration still has placeholder behavior (`inboundQty: '0'`). Tablet Kanban/offline UX and masking tests are missing. |
| **M5 Fleet, Dispatch and Delivery** | Trips, capacity/credit-gated dispatch, ePOD, GPS/device timestamps, returns, BR-08 closure, issues, expenses, command queue, and event integration exist. | **Backend largely aligned** | Challan PDF generation, driver mobile app, coordinator/storekeeper screens, offline airplane-mode stress testing, and complete API acceptance coverage remain. |
| **M6 Finance and Collections** | Invoice, collection, ledger, custody, handover, PTP, worklist, EOD, credit notes, COD settlement, cheque lifecycle, Tally export, and M5 event integration services exist. | **Backend services mostly aligned, API incomplete** | There is no M6 controller in `apps/api/src/modules/m6-finance`; the blueprint's REST surfaces therefore are not exposed as normal module endpoints. `collection.service.ts` has a TODO for outbox emission, `eod.service.ts` has a TODO for `eod.closed`, and deposit-slip PDF generation is a placeholder. Opening-balance import and AP/payment UI are missing. |
| **M7b Dashboards and analytics** | Materialized views, refresh job, pulse/status/EOD/KPI/analytics/stock-alert controllers, dashboard event handler, and acceptance tests exist. | **Backend substantially implemented** | The project overview incorrectly marks M7b pending. The blueprint's SSE/live channel, audit viewer, policy/threshold settings UI, WhatsApp integration, KPI audit job, and frontend are not complete. |
| **M7 control tower as a whole** | M7a and M7b backend pieces exist; `m7-control-tower` directory has no implementation files. | **Partial, split implementation** | Reconcile naming/status between M7a, M7b, and the empty `m7-control-tower` placeholder. |
| **Web/mobile/tablet frontend** | `apps/web`, `apps/mobile`, and `apps/tablet` exist but contain only placeholder-level content. | **Not aligned** | All FE sprints F0-F7 remain: app shell, auth, role navigation, design system, module screens, offline outbox, service worker, SSE, i18n, accessibility, Playwright flows, feature flags, and release checklist. |

## Missing or incomplete blueprint requirements

### Product and client gaps

- No implemented office web application.
- No implemented owner/driver/collector mobile application.
- No implemented factory/warehouse tablet PWA.
- No IndexedDB/mobile offline client, sync conflict UI, photo upload path, or client-side command queue integration.
- No UI implementation for exception approval, price sheet, orders, collections, EOD, procurement, inventory, production, dispatch, dashboards, audit viewer, or settings.
- No Playwright UI scenarios A-F, accessibility pass, Lighthouse/performance budgets, or frontend contract tests.

### Backend/API gaps

- M6 has service implementations but no controller/API layer.
- OTP authentication is not exposed.
- M6 collection and EOD domain-event emission remains incomplete.
- M1 overdue AR credit blocking is still a TODO despite the project overview claiming BR-02 is complete.
- M1 order counter/reprocessing and reservation release contain TODO paths.
- M4 shortage-to-M2 integration contains a placeholder inbound quantity and a deferred acceptance scenario.
- M5 challan PDF generation is not complete.
- M6 deposit-slip PDF generation is a placeholder.
- Notification providers are not production integrations; FCM, SMS, and WhatsApp behavior is log-only or stubbed.
- M7b live SSE behavior and the complete refresh/reconciliation contract need verification.
- Opening-balance import workflow is documented but no complete UI/import execution proof was found.

### Operational and release gaps

- The normal test command is red and has database deadlocks under parallel workers.
- Lint has 233 warnings even though it exits successfully.
- No complete evidence of production backup/PITR restore rehearsal, load testing, security penetration testing, observability/Sentry, hardened production image, deployment runbook, or uptime monitoring.
- Required business decisions remain open in `docs/OPEN_DECISIONS.md`, including escalation thresholds, e-invoicing, e-way bill ownership, OTP channel, multi-site coordinator policy, languages, supplier price baseline/tolerance, freight allocation, production mode, ePOD OTP, custody scope, handover verifier, allocation policy, accounting target, dashboard sales definition, and dashboard refresh expectation.

## Documentation and status consistency problems

- `docs/claude/*` is a blueprint/build pack and keeps implementation checklists unchecked even for modules that are already implemented. It should remain a requirements source, but completion status should be tracked separately and linked.
- `docs/PROJECT_OVERVIEW.txt` says M2 is complete and M7b is pending. The current backend contains M7b implementation and tests, so this status is stale.
- `docs/CHANGELOG.md` contains historical claims that are ahead of the current test state and still describes some older pending work. The root `CHANGELOG.md` path referenced by repository instructions is absent; the authoritative changelog is currently under `docs/`.
- `docs/IMPLEMENTATION_ROADMAP.md` still presents earlier M2/M7b work as pending even though migrations and services are present.
- The empty `m7-control-tower` directory conflicts with the implemented `m7a-exceptions` and `m7b-dashboards` split.
- The repository is already dirty with substantial pre-existing source, migration, docs, graph, and plan changes. Those changes were not reverted or normalized by this review.

## What is required to complete the project

Completion requires more than adding remaining backend services:

1. Make the backend deterministic and green under the standard parallel test command.
2. Close or explicitly defer every TODO/placeholder that affects a business rule, event, ledger, approval, or integration.
3. Expose and document all required REST APIs, especially M6.
4. Finish production-grade integrations: notifications, PDFs, event propagation, accounting, and configured external providers.
5. Build and validate the web, mobile, and tablet clients against the role and offline requirements.
6. Resolve the open business decisions that change behavior or UI.
7. Execute full cross-module scenarios A-F, offline stress, RLS/permission/concurrency/idempotency tests, and UI Playwright coverage.
8. Complete production readiness: security, performance, backup/restore, observability, deployment hardening, monitoring, and operating documentation.
9. Reconcile all project status documents so they describe the same release state and remaining work.

## Priority / next course of action

**P0 - do first**

1. Stabilize test database isolation and eliminate parallel-worker deadlocks; then fix the remaining M7a notification failure.
2. Reconcile the runtime TODOs that affect correctness: M1 overdue credit, order counter/reprocessing, reservation release, M4 procurement shortage integration, M6 outbox events, EOD event, and PDF placeholders.
3. Add/verify missing M6 API controllers and contract tests.

**P1 - complete the backend product**

4. Finish M5 challan/PDF and offline stress coverage, M7b live refresh/SSE, notification providers, opening-balance import, supplier performance jobs, and all deferred acceptance scenarios.
5. Resolve required business decisions and encode approved thresholds/configuration.

**P2 - build the product clients**

6. Deliver frontend sprints F0-F7 across web, mobile, and tablet, including offline sync, permissions, masking, accessibility, i18n, and UI scenarios A-F.

**P3 - release readiness**

7. Run security, concurrency, performance, backup/restore, observability, deployment, and 7-day operational parallel-run validation.
8. Update the roadmap, changelog, project overview, module status, blueprint traceability, and release checklist to one consistent source of truth.

