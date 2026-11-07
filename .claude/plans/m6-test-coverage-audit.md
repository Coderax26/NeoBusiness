# M6 Test Coverage Audit

**Date:** 2026-10-27
**Test Suite:** `apps/api/src/modules/m6-finance/tests/m6-acceptance.spec.ts`

## Coverage Status
- **Total Scenarios Defined:** 6 (E1001–E1006)
- **Test Execution:** All 6 scenarios **PASSED**
- **Code Coverage:** Not measured (coverage command unavailable without proper config)

## Coverage Matrix: Blueprint Requirements vs Tests

| Blueprint Requirement | Test Scenario | Status |
|---|---|---|
| Invoice G1: Generate tax invoice at dispatch (GST split) | E1001 | ✅ |
| BR-07: logCollection atomic transaction (invoicing + allocation + featured ledgers) | E1001 | ✅ |
| Custody chain (wallet + handover verification + variance) | E1002 | ✅ |
| PTP workflow (create + follow-up + BROKEN age) | E1001, E1005 | ✅ |
| EOD closure checklist (4 checks) | E1003 | ✅ |
| Offline/idempotency on mobile sync | E1004 | ✅ |
| Worklist priority scoring | E1006 | ✅ |
| **Cheque lifecycle** (RECEIVED → DEPOSITED → CLEARED/BOUNCED) | ❌ | **MISSING** |
| **Credit notes** (RETURN/DAMAGE/REBATE/WRITEOFF) | ❌ | **MISSING** |
| **Supplier AP** (ledger entries, payments) | ❌ | **MISSING** |
| **Cashbook** (receipts, handovers, deposits) | ❌ | **MISSING** |
| **Accounting export** (Tally XML nightly batch) | ❌ | **MISSING** |
| Invoice history/audit trail | ❌ | **MISSING** |

## Gaps by M6 Module Component

### ✅ Fully Covered
- **InvoiceService** — G1 invoicing (E1001)
- **LedgerService** — BR-07 collection logging (E1001, E1002)
- **HandoverService** — Custody chain (E1002)
- **PTPService** — Promise-to-Pay workflow (E1001, E1005)
- **EodService** — EOD closing sign-off (E1003)
- **WorklistService** — Daily worklist generation (E1006)

### ❌ Completely Untested (In Scope)
| Component | Missing Test | Priority |
|---|---|---|
| Cheque lifecycle | `CREATE`, `DEPOSIT`, `BANANA` flows | Medium |
| Credit notes (4 types) | Return/Damage/Rebate/Writeoff | Medium |
| Supplier ledger entries | Bill→Payment flow | High (AP bridge) |
| Supplier payments | GRN posted → AP credit | High (Sprint 2) |
| Cashbook entries | Daily site-level cash tracking | Medium |
| Bank deposits & slip generation | Bank deposit slip generation | Medium |
| Accounting export batches | Tally XML nightly export | Low (Sprint 2) |
| Invoice history/audit trail | Append-only ledger + change logic | High |
| Expected delivery stops (M5 → M6) | Trip.disconnected → worklist reason | Low (M5 integration) |
| Returns/samples from M5 | Credit note creation from ePOD | Medium |

### ⚠️ Partially Covered
| Component | Missing Test | Notes |
|---|---|---|
| **Accounting export** (Tally XML) | No backup export job tested | M6 provides tables; export logic belongs to Scheduler/M6Service |
| **Invoice status transitions** | No tests for PARTIAL→PAID transitions | Only eOD sign-off tested |
| **AR aging escalations** | No aging job integration test | E1005 tests BROKEN, not escalation thresholds |

## Recommendations

### High Priority (Sprint 1 Completion)
1. **Add Credit Note Service tests** (G4):
   - Create credit note from returns
   - Owner approval flow
   - Debit credit note response to customer ledger
   - Associated assertion: "CreditNoteService implements CreditNotePort"

2. **Add Invoice audit trail tests**:
   - Verify append-only table behavior
   - Test `immutable_audit_logs` writes on collection/receipt
   - Confirm idempotent logs stored correctly

3. **Add AR aging escalation test**:
   - Create customer with overdue > 30 days
   - Verify `credit_hold` gets flipped by daily job
   - Verify `CreditPort` reads escalated customer correctly

### Medium Priority (Sprint 2: Accounting Bridge)
4. **Add Cheque lifecycle tests**:
   - Cheque received → Cheque received (idempotent)
   - Cheque deposited (associate bank transaction)
   - Cheque bounced (reversal logic)

5. **Add Cashbook tests**:
   - Daily cash position calculation
   - Bank deposit slip generation
   - Multi-collection/agent source reconciliation

6. **Add Supplier AP test** (GRN → AP flow):
   - Supplier bill record with landed cost
   - Payment creation with mode (CASH/BANK)
   - Supplier ledger entry batch

### Low Priority (Future/M5 Integration)
7. **Accounting export (Tally XML)** — Test batch creation from `accounting_export_batches` table.

8. **M5→M6 integration**:
   - Trip.disconnected → Auto-create PTP if delivery not marked/ePOD within deadline
   - ePOD claim with variance → Credit note generation

## Infra Gaps Found During Audit
- No functional `Money` unit tests (library-level: exists `money.util.spec.ts` but 42 tests indicate shared utilities)
- No e2e tests for controller endpoints (only integration-style acceptance tests using raw knex)
- Test tracking: fixtures in `test-fixtures/` directory not yet examined

---
**Next Action:** Proceed to implementation (Task 1: Migration Reconciliation) or add critical missing tests?