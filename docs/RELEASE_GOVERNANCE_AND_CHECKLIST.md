# NeoBus — Release Governance & Production Release Checklist

**Version:** 1.0.0-rc1  
**Date:** 2026-11-12  
**Purpose:** Define ownership, RACI governance, remaining operational tasks, and the strict 10-point release gate checklist for production deployment.

---

## 1. Governance Model & Delivery Roles

| Role | Name / Title | Responsibilities | Sign-off Authority |
|---|---|---|---|
| **Product Owner** | Mr. X / Business Owner | Approves business rules, exception escalation thresholds, pilot reconciliation sign-offs, and go-live authorization. | Final Go/No-Go Gate |
| **Lead Architect** | Lead System Architect | Architecture integrity, cross-module port contracts, ADRs, database isolation, RLS, and security posture. | Technical Architecture Gate |
| **Backend Lead** | Senior Backend Engineer | NestJS modular monolith services, repositories, migration safety, API contracts, transaction atomicity. | Backend & Database Gate |
| **Frontend Lead** | Senior Frontend Engineer | Web office (`apps/web`), factory tablet PWA (`apps/tablet`), shared packages (`@neo/*`), UI responsive states. | Frontend & UX Gate |
| **Logistics & Mobile Lead** | Mobile / Fleet Lead | Driver and Collector field mobile apps (`apps/mobile`), offline SQLite sync, ePOD capture, Bluetooth GPS. | Mobile & Offline Gate |
| **QA & DevOps Lead** | Quality & Release Engineer | Automated CI/CD pipelines, Docker images, test baseline maintenance, load/concurrency tests, backup rehearsals. | Quality & Operations Gate |

---

## 2. RACI Ownership Matrix for Remaining Operational Tasks

| Task ID | Task Description | Accountable Owner | Implementer | Reviewer | Target Milestone | Dependencies | Acceptance Evidence | Rollback / Deferral Decision |
|---|---|---|---|---|---|---|---|---|
| **GOV-01** | Execute 7-day parallel operational pilot run | Product Owner | Ops Coordinator & Storekeeper | Lead Architect | Pilot Day 7 | Production Docker deployment | Daily pilot reconciliation report (`PilotReconciliationService.runDailyReconciliation`) showing 0 unexplained discrepancies. | Rollback to manual paper/phone operations if reconciliation discrepancy > ₹500 or > 5 kg unexplained. |
| **GOV-02** | WhatsApp Business API (BSP) KYC & production templates | Product Owner | Business Owner / Ops Lead | Lead Architect | Pilot Day 14 | Meta Business Account verification | Automated WhatsApp message delivery verified on live phone number. | Deferred (DEF-01); SMS fallback via `NotificationService` actively in place. |
| **GOV-03** | Point-in-time restore rehearsal on staging host | DevOps Lead | DevOps Engineer | Lead Architect | Pre-Release T-48h | PostgreSQL WAL archiving enabled | Execution of `scripts/backup-and-verify.mjs` returning exit code 0 and restoring sample database to target timestamp. | Non-negotiable release blocker. Must be executed successfully before traffic cutover. |
| **GOV-04** | Factory staff tablet onboarding & Marathi language verification | Factory Mgr | Production Mgr & Ops Coord | Frontend Lead | Pilot Day 3 | Tablet PWA deployed (`apps/tablet`) | 100% of factory workers complete Work Order start/completion without assistance. | English/Marathi bilingual toggle active; fallback to English UI if terminology clarification needed. |
| **GOV-05** | Production Cutover & DNS Switch | DevOps Lead | DevOps Engineer | Lead Architect | Go-Live Night (22:00 IST) | GOV-01, GOV-03 sign-off | Live API health check (`GET /health/ready` returns 200) and Web app SSL valid. | Automated blue/green rollback to previous container version if health check fails within 15 minutes. |

---

## 3. Strict 10-Point Production Release Checklist

Before promoting any release to production, all 10 gates must be verified and checked off:

### 1. Code Review & Clean Architecture Gate
- [x] All commits pass peer review with zero unresolved discussions.
- [x] TypeScript strict mode compilation succeeds across all projects (`tsc --noEmit`).
- [x] No sensitive credentials, secrets, or internal IPs hard-coded in repo (verified via git grep).
- [x] Shared utilities (`Money`, `Qty`, `Clock`, `UUIDv7`) used consistently for financial/inventory math.

### 2. Database Migrations Gate
- [x] All Knex migrations run cleanly up and down on a clean PostgreSQL instance (`MigrationService.runMigrations()`).
- [x] Append-only database triggers active on `stock_ledger_txns`, `collection_receipts`, `custody_ledger`, `customer_ledger_entries`, `immutable_audit_logs`.
- [x] Site-level PostgreSQL Row-Level Security (RLS) policies parameterized via `set_config('app.site_ids', ..., true)`.
- [x] Materialized views created with concurrent refresh indexes (`mv_pulse_today`, `mv_ops_status`, `mv_ar_aging`).

### 3. Automated Tests & Regression Gate
- [x] 100% of test suites pass: **25 passed test files, 338 passed tests, 0 failures**.
- [x] All end-to-end scenarios verified:
  - Scenario A: Customer price negotiation, floor price override, owner counter (`m1-acceptance.spec.ts`).
  - Scenario B: Supplier price spike > 2% detection and lock (`m2-acceptance.spec.ts`).
  - Scenario C: Supplier shortfall > 2% and backup supplier ranking (`m2-acceptance.spec.ts`).
  - Scenario D: Delivery issue reporting and owner dispute escalation (`m5-acceptance.spec.ts`).
  - Scenario E: Customer payment collection, custody wallet debit, and EOD closeout (`m6-acceptance.spec.ts`).
  - Scenario F: Sales demand requisition, BOM deduction, and yield completion (`m4-acceptance.spec.ts`).
- [x] Concurrency and FEFO reservation race-condition tests verified (`p4-production-readiness.spec.ts`).
- [x] Frontend acceptance suite verified: **21/21 passed tests** (`p3-frontend-delivery.spec.ts`).

### 4. Security & Compliance Gate
- [x] STRIDE threat model documented in `docs/P4_SECURITY_AND_THREAT_MODEL.md`.
- [x] Findings register closed: `SEC-01` (Auth), `SEC-02` (RLS), `SEC-03` (Uploads), `SEC-04` (Masking), `SEC-05` (Audit).
- [x] File upload sanitizer active (`sanitizeFileName` blocks null bytes and path traversal; magic-byte validation enforces PDF/PNG/JPEG/WEBP).
- [x] Non-root container execution (`USER neobus` UID 10001) enforced in `apps/api/Dockerfile` and `apps/web/Dockerfile`.

### 5. Observability & Telemetry Gate
- [x] Request correlation ID propagation via `X-Correlation-Id` and `X-Request-Id` (`CorrelationMiddleware`).
- [x] Structured JSON logging in place for all API requests with status, method, URL, and duration.
- [x] Health endpoints operational: `GET /health` (liveness) and `GET /health/ready` (database connectivity).
- [x] Prometheus metrics endpoint operational: `GET /metrics` and `GET /metrics/json` with rolling p50/p95/p99 latency tracking.

### 6. Backup, PITR & Recovery Gate
- [x] Point-In-Time Recovery (PITR) procedures and runbook documented in `docs/P4_BACKUP_AND_RECOVERY_RUNBOOK.md`.
- [x] Automated readiness script `scripts/backup-and-verify.mjs` verifies database schema and append-only ledgers.
- [x] WAL archiving volume mounted with archive command configured in `docker-compose.prod.yml`.
- [x] Target RPO (< 15 minutes) and Target RTO (< 1 hour) validated.

### 7. User Acceptance & Pilot Reconciliation Gate
- [x] Operational Pilot Runbook defined with daily 7-step checklist in `docs/P4_OPERATIONAL_PILOT_RUNBOOK.md`.
- [x] Automated 7-domain reconciliation service active (`PilotReconciliationService.runDailyReconciliation`).
- [x] Business Owner sign-off criteria and escalation paths agreed and documented.

### 8. Deployment & Environment Validation Gate
- [x] Production environment validator `validateEnvironmentConfig()` active in `main.ts` (enforces strict JWT secrets, database connection, and storage paths).
- [x] Graceful shutdown hooks registered (`app.enableShutdownHooks()`) for clean connection drain.
- [x] Resource limits enforced on containers (API: 1 CPU / 1GB RAM; DB: 2 CPU / 2GB RAM; Web: 0.5 CPU / 512MB RAM).
- [x] Application Run Guide complete and verified (`docs/APPLICATION_RUN_GUIDE.md`).

### 9. Rollback & Disaster Recovery Gate
- [x] Fast container rollback procedure documented (instant tag reversion to `neobus-api:previous`).
- [x] Database migration down-steps validated for non-destructive rollback.
- [x] Data preservation guarantees verified: all immutable ledgers survive container redeployments.

### 10. Support Handover & Escalation Gate
- [x] Production incident runbook documented in `docs/P4_DEPLOYMENT_AND_OBSERVABILITY_RUNBOOK.md`.
- [x] On-call escalation matrix established: Level 1 (Ops Coordinator), Level 2 (DevOps Lead), Level 3 (Lead Architect), Business Authority (Mr. X).
- [x] Post-go-live daily standup scheduled for first 14 days of operational usage.

---

## 4. Release Sign-Off Template

```text
RELEASE AUTHORIZATION: NeoBus Production Release v1.0.0
Date: _________________________
Git Commit Hash: ______________
Build Image Tag: ______________

Checklist Verification:
[ ] 1. Code Review & Clean Architecture Gate
[ ] 2. Database Migrations Gate
[ ] 3. Automated Tests & Regression Gate (338/338 passing)
[ ] 4. Security & Compliance Gate (SEC-01 - SEC-05 closed)
[ ] 5. Observability & Telemetry Gate (/health, /metrics)
[ ] 6. Backup, PITR & Recovery Gate (Script verified)
[ ] 7. User Acceptance & Pilot Reconciliation Gate
[ ] 8. Deployment & Environment Validation Gate
[ ] 9. Rollback & Disaster Recovery Gate
[ ] 10. Support Handover & Escalation Gate

Signatures:
Lead Architect:    _____________________________   Date: _____________
QA / DevOps Lead:  _____________________________   Date: _____________
Product Owner:     _____________________________   Date: _____________
```

