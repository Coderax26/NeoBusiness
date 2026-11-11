# NeoBus Phase-by-Phase Completion Plan

**Review basis:** `docs/claude/`, `docs/PROJECT_STATUS_BLUEPRINT_ALIGNMENT_REVIEW.md`, `docs/REMAINING_WORK_PRIORITY_PLAN.md`, current `apps/api` module structure, migrations, tests, and identified TODO/placeholder paths.

These documents are implementation plans only. They do not change application code.

## Plan sequence

| Phase | Document | Purpose | Status |
|---|---|---|---|
| P0 | `01_PHASE_P0_TEST_BASELINE_AND_CORRECTNESS.md` | Make the backend test baseline deterministic and remove correctness blockers | ✅ Complete |
| P1 | `02_PHASE_P1_BACKEND_CONTRACT_COMPLETION.md` | Complete backend APIs, integrations, events, and cross-module behavior | ✅ Complete |
| P2 | `03_PHASE_P2_BUSINESS_DECISIONS_AND_REQUIREMENTS.md` | Close behavior-changing decisions and update the delivery contract | ✅ Complete |
| P3 | `04_PHASE_P3_FRONTEND_PRODUCT_DELIVERY.md` | Build web, mobile, and tablet products from the frontend blueprint | 🟡 Current |
| P4 | `05_PHASE_P4_PRODUCTION_READINESS.md` | Security, performance, recovery, observability, deployment, and pilot readiness | ⏳ Planned |
| P5 | `06_PHASE_P5_DOCUMENTATION_AND_GOVERNANCE.md` | Reconcile project status, traceability, ownership, and release governance | ⏳ Planned |

## Current starting point

- Backend modules M0, M1, M2, M3, M4, M5, M6, M7a, and M7b are fully implemented and verified.
- All 9 inter-module ports (`PricingPort`, `ItemPort`, `CreditPort`, `ExceptionPort`, `NotifyPort`, `LedgerPort`, `InventoryPort`, `ProcurementPort`, `ProductionPort`) are backed by real implementations.
- Complete M6 Financials HTTP API layer (11 controllers, DTOs, response envelope, opening balances, PDFs).
- `apps/api` test suite is 100% passing: 22/22 test files, 279/279 tests passing.
- `apps/web`, `apps/mobile`, and `apps/tablet` are queued for Phase P3 once Phase P2 decisions close.

## Dependency rule

Do not begin P3 frontend implementation against unstable or undocumented APIs. P0 must establish a trustworthy test baseline, P1 must stabilize backend contracts, and P2 must resolve decisions that affect screens, permissions, workflows, or integrations.

