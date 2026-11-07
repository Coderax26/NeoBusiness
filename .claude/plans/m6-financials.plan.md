# Plan: M6 Collections & Financials

**Source PRD**: docs/claude/08_M6_Collections_Financials.md
**Selected Milestone**: Sprint 1 Core (M6)
**Complexity**: Large

## Summary
Implement core financial and collection modules (M6), enabling invoice generation, PTP workflows, and ledger-based collection logging. This module bridges the M1 commercial data with real financial state.

## Patterns to Mirror
| Category | Source | Pattern |
|---|---|---|
| Naming | `apps/api/src/modules/m6-finance/` | Domain-driven services for specific business logic (`InvoiceService`, `LedgerService`). |
| Errors | `apps/api/src/modules/m1-commercial/customer.service.ts` | `throw new NotFoundException(...)` or `BadRequestException(...)`. |
| Tests | `apps/api/src/modules/m1-commercial/m1-acceptance.spec.ts` | Acceptance testing with `knex` transaction per test; scenario-based `describe` blocks. |

## Files to Change
| File | Action | Why |
|---|---|---|
| `apps/api/src/app.module.ts` | UPDATE | Enable `M6FinancialsModule` (already in working tree). |
| `apps/api/src/modules/m6-finance/m6-financials.module.ts` | UPDATE | Export `LEDGER_PORT` and implement M7a exception handler. |
| `apps/api/src/shared/ports/ports.interface.ts` | VALIDATE | Confirm existing `LedgerPort` contract matches implementation. |
| `db/migrations/20261025_007_m6_collections_financials.sql` | UPDATE | Ensure canonical production schema; reconcile with 008. |
| `db/migrations/20261026_008_m6_add_simple_missing_tables.sql` | REVIEW | Merge worklist tables into 007 or decide canonical location. |
| `apps/api/src/modules/m6-finance/tests/m6-acceptance.spec.ts` | UPDATE | Refactor setup to avoid M5 dependency; execute scenarios. |

## Tasks
### Task 1: Reconcile M6 Migrations (007 + 008)
- **Action**: Determine canonical home for `worklist_worklists`/`worklist_items`. Either merge into 007 or keep 008 as test-only with clear documentation. Update migration runner to include both in order.
- **Mirror**: M0 migration patterns (001 + 002 run sequentially).
- **Validate**: Run migrations on fresh test DB without errors.

### Task 2: Implement LedgerPort + M6 Module Exports
- **Action**: Fully implement `LedgerPort` in `LedgerService` and export `LEDGER_PORT` token from `M6FinancialsModule`.
- **Mirror**: M1 `PricingService` implements `PricingPort`; exported via `@Global()` module.
- **Validate**: `M6FinancialsModule` exports `LEDGER_PORT`; M1 `CreditService` can consume it.

### Task 3: Refactor Acceptance Test Harness
- **Action**: Decouple `m6-acceptance.spec.ts` from M5 `vehicles`/`delivery_trips`/`delivery_stops` inline schema creation. Use minimal stub tables or mocks if M5 not yet ready.
- **Mirror**: M1 acceptance specs create only M0 + M1 tables in setup.
- **Validate**: `vitest run` on `m6-acceptance.spec.ts` passes all Scenario E tests.

### Task 4: Complete Exception Handler for Credit Rebate
- **Action**: Implement `onResolved` logic for `CREDIT_REBATE_WRITEOFF` in `M6FinancialsModule.onModuleInit()`.
- **Mirror**: M7a `ExceptionService` patterns; handler calls `CollectionService` / `CreditNoteService` when ready.
- **Validate**: Integration test for credit rebate approval flow.

### Task 5: Verify Invoice Generation End-to-End
- **Action**: Ensure `InvoiceService.generateFromOrder` works with M1 `sales_orders` and produces correct GST split per OD-003.
- **Mirror**: M1 `OrderService` state machine patterns.
- **Validate**: Acceptance test E1001 (invoicing at dispatch).

### Task 6: Verify Collection Logging (BR-07)
- **Action**: Confirm `LedgerService.logCollection` atomically posts to all three ledgers with idempotency.
- **Mirror**: Existing `logCollection` implementation; use `Money` for all amounts.
- **Validate**: Acceptance test E1002 (cash handover variance).

## Validation Commands
```bash
# After migration reconciliation
cd apps/api && npm run migrate

# Run M6 acceptance tests
npm run test -- apps/api/src/modules/m6-finance/tests/m6-acceptance.spec.ts

# Run all unit tests to catch regressions
npm run test
```

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| Schema duplication (007 vs 008) | HIGH | Consolidate migrations 007/008. |
| Test dependency on M5 tables | HIGH | Mock/stub M5 tables in M6 test setup; document as temporary. |
| Idempotency logic gaps | MEDIUM | Leverage existing `collection_receipts.idempotency_key` unique constraint; add integration test. |
| Cross-module port wiring incomplete | MEDIUM | Verify `LEDGER_PORT` export in Task 2; add integration test with M1 `CreditService`. |

## Open Decisions (from OPEN_DECISIONS.md)
- **OD-004** e-Invoicing IRN applicability — AWAITING (accountant). Invoice schema has nullable `irn` field; leave as-is until confirmed.
- **OD-005** e-Way bill generation — AWAITING. Not in M6 scope; defer to M5 integration.
- **OD-020** Today's sales definition — AWAITING. Impacts EOD pulse; default to "orders invoiced today" in M6.
- **OD-014** ePOD OTP in MVP — PROPOSED (sig/photo only). Not in M6 scope.
- **OD-015** Custody wallet scope — PROPOSED (cash+cheque). Current impl includes cheque register; align.

## Assumptions
- M0 platform (auth, RBAC, RLS, doc numbers, idempotency) is fully working.
- M1 commercial (orders, items, pricing, credit) is complete and its tables exist.
- M7a exceptions (raise/resolve/escalate, notifications) are working.
- PostgreSQL 16 + Redis 7 available via Docker Compose.
- `Money` utility is the single source of truth for all INR arithmetic.

## Acceptance Criteria
- [ ] M6 migrations (007 + 008) run cleanly on fresh DB.
- [ ] All Scenario E acceptance tests pass (E1001–E1005).
- [ ] `M6FinancialsModule` exports `LEDGER_PORT`; M1 `CreditService` can use it for real AR reads.
- [ ] No direct cross-module service imports (ports only).
- [ ] All financial arithmetic uses `Money` class.
- [ ] EOD closing checklist (E1003) passes with all 4 checks.
- [ ] PTP workflow (E1005) integrates with aging job.

## Remaining Test Gaps (Post-Implementation)
- [ ] Integration with M2 (Procurement/GRN) for invoice-PO link.
- [ ] Nightly Tally XML accounting export (accounting bridge).
- [ ] CREDIT_REBATE_WRITEOFF exception handler logic and integration test.
- [ ] Full M5/M6 integration tests (post-M5 development).
