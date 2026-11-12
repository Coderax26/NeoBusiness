# NeoBus — Authoritative Project Status Matrix

**Version:** 1.0.0-rc1  
**Date:** 2026-11-12  
**Authoritative Single Source of Truth for Project Status**  
**Master Test Baseline:** 25/25 test suites passing · 338/338 automated tests passing · 0 failures  

---

## 1. Status States Definition

Every module and phase is tracked using the standardized state enum defined in Phase P5:

| State | Definition |
|---|---|
| **Not started** | Work has not begun; specification only. |
| **In progress** | Active development underway; contracts or code in flight. |
| **Backend complete** | NestJS module, services, repositories, migrations, and unit tests implemented. |
| **Product complete** | Backend APIs, shared packages, and web/tablet/mobile UI screens fully implemented. |
| **Verified** | Cross-module contract, end-to-end acceptance tests, and concurrency/load tests verified. |
| **Blocked** | Development halted due to unresolved prerequisite or upstream dependency. |
| **Deferred** | Intentionally postponed to post-MVP/operational onboarding with documented reason and owner. |
| **Released** | Packaged, hardened, and ready for production deployment / pilot sign-off. |

---

## 2. Authoritative Module & Phase Status Table

| Module / Phase | Backend Status | API Status | Frontend Status | Test Status | Integration Status | Production-Readiness Status | Accountable Owner | Target Release | Blocking Dependencies | Evidence Links |
|---|---|---|---|---|---|---|---|---|---|---|
| **M0 Platform Foundation** | Verified | Verified | Product complete | Verified (11/11 tests) | Verified | Released | Lead Architect | v1.0.0-rc1 | None | [auth.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m0-platform/auth.service.ts), [p4-production-readiness.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m0-platform/tests/p4-production-readiness.spec.ts) |
| **M1 Commercial & CRM** | Verified | Verified | Product complete | Verified (10/10 tests) | Verified | Released | Commercial Lead | v1.0.0-rc1 | None | [order.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m1-commercial/order.service.ts), [pricing.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m1-commercial/pricing.service.ts), [credit.service.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m1-commercial/tests/credit.service.spec.ts) |
| **M2 Procurement & Supplier** | Verified | Verified | Product complete | Verified (26/26 tests) | Verified | Released | Procurement Lead | v1.0.0-rc1 | None | [po.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m2-procurement/po.service.ts), [grn.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m2-procurement/grn.service.ts), [m2-acceptance.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m2-procurement/tests/m2-acceptance.spec.ts) |
| **M3 Inventory & Warehouse** | Verified | Verified | Product complete | Verified (24/24 tests) | Verified | Released | Inventory Lead | v1.0.0-rc1 | None | [stock-ledger.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m3-inventory/stock-ledger.service.ts), [fefo-reservation.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m3-inventory/fefo-reservation.service.ts), [m3-acceptance.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m3-inventory/tests/m3-acceptance.spec.ts) |
| **M4 Factory Production** | Verified | Verified | Product complete | Verified (24/24 tests) | Verified | Released | Factory Mgr / Lead | v1.0.0-rc1 | None | [work-order.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m4-production/work-order.service.ts), [bom.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m4-production/bom.service.ts), [m4-acceptance.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m4-production/tests/m4-acceptance.spec.ts) |
| **M5 Fleet & Delivery** | Verified | Verified | Product complete | Verified (28/28 tests) | Verified | Released | Logistics Lead | v1.0.0-rc1 | None | [trip.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m5-fleet/trip.service.ts), [epod.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m5-fleet/epod.service.ts), [m5-acceptance.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m5-fleet/tests/m5-acceptance.spec.ts) |
| **M6 Collections & Financials** | Verified | Verified | Product complete | Verified (32/32 tests) | Verified | Released | Finance Lead | v1.0.0-rc1 | None | [collection.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m6-finance/collection.service.ts), [invoice.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m6-finance/invoice.service.ts), [m6-acceptance.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m6-finance/tests/m6-acceptance.spec.ts) |
| **M7a Exception Engine** | Verified | Verified | Product complete | Verified (18/18 tests) | Verified | Released | Architecture Lead | v1.0.0-rc1 | None | [exception.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m7a-exceptions/exception.service.ts), [notification.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m7a-exceptions/notification.service.ts), [notification.service.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m7a-exceptions/notification.service.spec.ts) |
| **M7b Dashboards & Metrics** | Verified | Verified | Product complete | Verified (22/22 tests) | Verified | Released | Data / Lead | v1.0.0-rc1 | None | [pulse.service.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m7b-dashboards/pulse.service.ts), [ar-aging.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m7b-dashboards/tests/ar-aging.spec.ts), [dashboard-event-handler.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/api/src/modules/m7b-dashboards/tests/dashboard-event-handler.spec.ts) |
| **Web Office App (`apps/web`)** | N/A (FE) | Verified | Product complete | Verified (21/21 tests) | Verified | Released | Frontend Lead | v1.0.0-rc1 | None | [ControlTowerPage.tsx](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/web/src/pages/ControlTowerPage.tsx), [p3-frontend-delivery.spec.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/web/src/tests/p3-frontend-delivery.spec.ts) |
| **Tablet Factory App (`apps/tablet`)** | N/A (FE) | Verified | Product complete | Verified (component tests) | Verified | Released | Frontend Lead | v1.0.0-rc1 | None | [KanbanPage.tsx](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/tablet/src/pages/KanbanPage.tsx), [OfflineStorage.ts](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/tablet/src/offline/OfflineStorage.ts) |
| **Mobile Field App (`apps/mobile`)** | N/A (FE) | Verified | Product complete | Verified (offline queue tests) | Verified | Released | Mobile Lead | v1.0.0-rc1 | None | [DriverManifestPage.tsx](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/mobile/src/pages/DriverManifestPage.tsx), [CollectorWorklistPage.tsx](file:///c:/CodeStuff/Projects/NeoBusinessSolution/apps/mobile/src/pages/CollectorWorklistPage.tsx) |
| **Shared Packages (`packages/*`)** | N/A | N/A | Product complete | Verified | Verified | Released | Frontend Lead | v1.0.0-rc1 | None | `packages/ui`, `packages/api-client`, `packages/permissions`, `packages/i18n`, `packages/mocks` |

---

## 3. Engineering Phase Execution Status

| Phase | Title | Scope & Objectives | Status | Exit Date | Verification Artifact |
|---|---|---|---|---|---|
| **Phase P0** | Test Baseline & Correctness | Make test baseline deterministic, eliminate flaky tests and DB isolation blockers. | ✅ Complete | 2026-11-11 | `01_PHASE_P0_TEST_BASELINE_AND_CORRECTNESS.md` |
| **Phase P1** | Backend Contract Completion | Complete cross-module backend integrations, events, and port bindings. | ✅ Complete | 2026-11-11 | `02_PHASE_P1_BACKEND_CONTRACT_COMPLETION.md` |
| **Phase P2** | Business Decisions & Requirements | Close open business decisions (OD-001–OD-025) and lock business rules. | ✅ Complete | 2026-11-12 | `03_PHASE_P2_BUSINESS_DECISIONS_AND_REQUIREMENTS.md` |
| **Phase P3** | Frontend Product Delivery | Deliver Web, Tablet, Mobile apps, shared packages, and Control Tower. | ✅ Complete | 2026-11-12 | `04_PHASE_P3_FRONTEND_PRODUCT_DELIVERY.md`, `p3-frontend-delivery.spec.ts` (21/21 passed) |
| **Phase P4** | Production Readiness | Security hardening (SEC-01–05), load verification, PITR backup, metrics & runbooks. | ✅ Complete | 2026-11-12 | `05_PHASE_P4_PRODUCTION_READINESS.md`, `p4-production-readiness.spec.ts` (11/11 passed) |
| **Phase P5** | Documentation & Governance | Single source of truth, master blueprint traceability, release governance. | ✅ Complete | 2026-11-12 | `06_PHASE_P5_DOCUMENTATION_AND_GOVERNANCE.md`, `docs/PROJECT_STATUS_MATRIX.md` |

---

## 4. Deferred Items Register

The following items are officially documented as **Deferred** for operational deployment or post-MVP enhancement. None block v1.0.0 core business operations:

| Item ID | Description | Impact Area | Reason for Deferral | Target Milestone | Accountable Owner | Fallback / Interim Solution |
|---|---|---|---|---|---|---|
| **DEF-01** | Production WhatsApp Business API account activation | Notifications | Requires business SIM verification and Meta KYC sign-off by Owner. | Pilot Week 2 (Day 14) | Business Owner / Ops Lead | SMS fallback via `NotificationService` and in-app exception cards are fully functional. |
| **DEF-02** | External e-Invoicing (IRN) Portal Direct API integration | Finance | Client GST turnover currently under mandatory direct API threshold. Schema supports nullable IRN. | Post-Go-Live FY27 | Finance Lead / External CPA | Tally XML nightly export includes all GST compliant invoice data. |
| **DEF-03** | Biometric Hardware Attendance Terminal integration | Production | Factory uses tablet PIN/attendance log UI in `apps/tablet`. Hardware API binding deferred. | Post-Go-Live Phase 2 | Factory Mgr | Daily digital labour attendance log in `apps/tablet` with supervisor sign-off. |
| **DEF-04** | Formal Marathi native-speaker linguistic sign-off pass | Localization | Marathi translation dictionary implemented in `@neo/i18n`; native staff verification scheduled during Pilot. | Operational Pilot (Day 3) | Ops Coordinator | Bilingual fallback (English/Marathi toggle available on all screens). |

---

## 5. Entry Point Reference

- **Run Guide:** [`docs/APPLICATION_RUN_GUIDE.md`](file:///c:/CodeStuff/Projects/NeoBusinessSolution/docs/APPLICATION_RUN_GUIDE.md)
- **Deployment & Observability Runbook:** [`docs/P4_DEPLOYMENT_AND_OBSERVABILITY_RUNBOOK.md`](file:///c:/CodeStuff/Projects/NeoBusinessSolution/docs/P4_DEPLOYMENT_AND_OBSERVABILITY_RUNBOOK.md)
- **Backup & Recovery Runbook:** [`docs/P4_BACKUP_AND_RECOVERY_RUNBOOK.md`](file:///c:/CodeStuff/Projects/NeoBusinessSolution/docs/P4_BACKUP_AND_RECOVERY_RUNBOOK.md)
- **Operational Pilot Runbook:** [`docs/P4_OPERATIONAL_PILOT_RUNBOOK.md`](file:///c:/CodeStuff/Projects/NeoBusinessSolution/docs/P4_OPERATIONAL_PILOT_RUNBOOK.md)
- **Release Governance & Checklist:** [`docs/RELEASE_GOVERNANCE_AND_CHECKLIST.md`](file:///c:/CodeStuff/Projects/NeoBusinessSolution/docs/RELEASE_GOVERNANCE_AND_CHECKLIST.md)
- **Blueprint Traceability Matrix:** [`docs/BLUEPRINT_TRACEABILITY_MATRIX.md`](file:///c:/CodeStuff/Projects/NeoBusinessSolution/docs/BLUEPRINT_TRACEABILITY_MATRIX.md)

