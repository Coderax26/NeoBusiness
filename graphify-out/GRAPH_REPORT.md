# Graph Report - NeoBusinessSolution  (2026-11-07)

## Corpus Check
- 211 files · ~202,615 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 11 file(s) not represented in the graph (top: (none) 6, .zip 3, .example 1)

## Summary
- 2454 nodes · 5349 edges · 129 communities (98 shown, 31 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 558 edges (avg confidence: 0.9)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c3c7020d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- class-validator
- RequirePermission
- PricingController
- CustomerService
- ItemService
- OrderService
- devDependencies
- lint-test-build
- postgres
- AuthService
- dependencies
- LedgerPort
- Qty
- compilerOptions
- ports.interface.ts
- M6FinancialsModule
- scripts
- seed.ts
- wastage.service.ts
- LedgerService
- domain-events.ts
- inventory.service.ts
- CollectionService
- ExceptionPort
- knex
- MigrationService
- RbacGuard
- EodService
- WorkOrderRepository
- NeoBus — Architecture Document
- AppService
- NeoBus — Security Policy
- Enterprise Blueprint & Target Operating Model
- InventoryPortStub
- AuditInterceptor
- NeoCore Module-by-Module Build Pack
- Modules README Build Guide
- OutboxRelay
- RequisitionResponseDto
- m4-production.module.ts
- InventoryService
- HealthController
- WorklistService
- NeoBus — Open Decisions Register
- ProductionPort
- ProcurementPort
- Data integrity and business rules
- .oxlintrc.json
- work-order.service.ts
- RlsContextMiddleware
- InventoryPort
- tsconfig.build.json
- nest-cli.json
- FleetService
- IdempotencyMiddleware
- Money
- CLAUDE.md
- NeoBus — Development Guide
- Mr. X (Business Owner)
- BomService
- InventoryExpiryJob
- NeoBus — Implementation Roadmap
- Coding Conventions
- Plan: Complete M5 Fleet Backend Remaining Work
- NeoBus — Changelog
- NeoBus Project Handover
- M7a — Exception Engine + Notification Hub — Implementation Plan
- Plan: M3 Inventory and Warehouse
- M6 Test Coverage Audit
- 2. End-to-End Scenarios (Cross-Module Acceptance Tests)
- api/README.md
- InventoryEventHandler
- NeoBus — Project Overview
- PricingService
- .of
- Testing Levels
- NeoBus — Enterprise Business Operations Platform
- 3. Module-Level Requirements Traceability
- Tasks
- Tasks Breakdown
- Code Review: M6 Collections & Financials - FIXES COMPLETED
- Test Infrastructure
- Quick Start
- m1-commercial.module.ts
- Implementation Phases
- OutboxService
- Testing
- m4-production.module.ts
- WorkOrderController
- @nestjs/common
- Steps
- CreditNoteService
- TripRepository
- TripListenerService
- ConfigService
- CreditPortService
- Plan: M4 Production Module Implementation
- Implementation Phases
- TripAlertJob
- Coding Conventions
- 2. Authorization (RBAC)
- CollectionService
- wastage.service.ts
- AppModule
- QuoteService
- QuoteController
- Clock
- CreditService
- TallyExportService
- M7a — Exception Engine + Notification Hub — Completion Report
- Plan: M6 Part 2 — Accounting Bridge and M5 Integration Completion
- CodSettlementService
- Plan: M2 Procurement & Supplier Module Implementation
- Implementation Overview
- Implementation Phases
- NeoBus Copilot Instructions
- 1. Authentication
- M0PlatformModule
- DeviceController
- PdfGeneratorService
- Test Strategy
- File Changes Summary
- Migration Conventions
- 6. Audit Trail
- Database Migrations Required
- @types/node@^24.0.0

## God Nodes (most connected - your core abstractions)
1. `RequirePermission()` - 113 edges
2. `@nestjs/common` - 82 edges
3. `knex` - 66 edges
4. `Money` - 62 edges
5. `nestjs-knex` - 50 edges
6. `ConfigService` - 50 edges
7. `InventoryService` - 46 edges
8. `DocNumberService` - 44 edges
9. `ExceptionPort` - 40 edges
10. `Qty` - 40 edges

## Surprising Connections (you probably didn't know these)
- `Test database isolation (CRITICAL)` --references--> `MigrationService`  [INFERRED]
  CLAUDE.md → apps/api/src/modules/m0-platform/migration.service.ts
- `Test Database & Environment Separation` --references--> `MigrationService`  [INFERRED]
  docs/DEVELOPMENT_GUIDE.md → apps/api/src/modules/m0-platform/migration.service.ts
- `Enforcement` --references--> `RbacGuard`  [INFERRED]
  docs/SECURITY.md → apps/api/src/modules/m0-platform/rbac.service.ts
- `Phase 3: Inventory Service Implementation` --references--> `InventoryService`  [INFERRED]
  .claude/plans/m3-inventory-warehouse.plan.md → apps/api/src/modules/m3-inventory/inventory.service.ts
- `3. M3 completion` --references--> `LedgerPostingService`  [INFERRED]
  docs/HANDOVER_20261102.md → apps/api/src/modules/m3-inventory/ledger-posting.service.ts

## Import Cycles
- None detected.

## Communities (129 total, 31 thin omitted)

### Community 0 - "class-validator"
Cohesion: 0.18
Nodes (5): class-transformer@^0.5.1, GetPricesQueryDto, PublishPricesDto, UpsertDailyPriceItemDto, class-transformer

### Community 1 - "RequirePermission"
Cohesion: 0.07
Nodes (17): RequirePermission(), AdjustmentType, SHRINKAGE, WRITEOFF, AtpQueryDto, CreateAdjustmentDto, CreateReservationDto, CreateTransferDto (+9 more)

### Community 3 - "CustomerService"
Cohesion: 0.09
Nodes (7): CustomerController, CustomerService, CreateCommunicationLogDto, CreateCustomerContactDto, CreateCustomerDto, CreditOverrideDto, UpdateCustomerDto

### Community 4 - "ItemService"
Cohesion: 0.09
Nodes (5): CreateItemDto, CreateUomConversionDto, UpdateItemDto, ItemController, ItemService

### Community 5 - "OrderService"
Cohesion: 0.08
Nodes (10): class-validator@^0.15.1, AcceptCounterDto, CancelOrderDto, ConfirmOrderDto, CreateOrderDto, OrderLineDto, RequestOverrideDto, OrderController (+2 more)

### Community 6 - "devDependencies"
Cohesion: 0.06
Nodes (47): author, pg@^8.23.1, description, devDependencies, @nestjs/cli@^12.0.0, @nestjs/mau@^0.2.6, @nestjs/schematics@^12.0.0, @nestjs/testing@^12.0.1 (+39 more)

### Community 7 - "lint-test-build"
Cohesion: 0.05
Nodes (40): run, DATABASE_URL, JWT_REFRESH_SECRET, JWT_SECRET, NODE_ENV, POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER (+32 more)

### Community 8 - "postgres"
Cohesion: 0.07
Nodes (33): POSTGRES_DB, POSTGRES_PASSWORD, POSTGRES_USER, interval, retries, test, timeout, container_name (+25 more)

### Community 10 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, bullmq@^6.4.0, decimal.js@^10.6.0, helmet@^8.3.0, ioredis@^6.0.0, knex@^3.3.0, luxon@^3.7.2, @nestjs/common@^12.0.1 (+23 more)

### Community 11 - "LedgerPort"
Cohesion: 0.07
Nodes (8): LedgerPortStub, ItemPort, LedgerPort, PricingPort, ProductionPort, Dependencies (Port Consumers), Task 2: Implement LedgerPort + M6 Module Exports, Port / Stub pattern (CRITICAL)

### Community 13 - "compilerOptions"
Cohesion: 0.10
Nodes (20): compilerOptions, allowSyntheticDefaultImports, declaration, emitDecoratorMetadata, esModuleInterop, experimentalDecorators, incremental, isolatedModules (+12 more)

### Community 14 - "ports.interface.ts"
Cohesion: 0.13
Nodes (14): DeliveryLine, DispatchLine, FINAL_STOP_STATUSES, CreditPortProvider, CREDIT_PORT, CreditEvaluation, CreditPort, CreditStatus (+6 more)

### Community 15 - "M6FinancialsModule"
Cohesion: 0.13
Nodes (10): M6FinancialsModule, Acceptance Criteria, Assumptions, Files to Change, Open Decisions (from OPEN_DECISIONS.md), Patterns to Mirror, Plan: M6 Collections & Financials, Remaining Test Gaps (Post-Implementation) (+2 more)

### Community 16 - "scripts"
Cohesion: 0.12
Nodes (16): scripts, build, deploy, format, lint, migrate, seed, start (+8 more)

### Community 17 - "seed.ts"
Cohesion: 0.19
Nodes (9): bcrypt@^6.0.0, main(), SITE_ACCESS, SITES, upsertSite(), upsertSiteAccess(), upsertUser(), USERS (+1 more)

### Community 18 - "wastage.service.ts"
Cohesion: 0.07
Nodes (6): CreateWastageDto, UpdateWastageDto, WastageResponseDto, WastageRepository, WastageController, WastageService

### Community 19 - "LedgerService"
Cohesion: 0.15
Nodes (3): HandoverService, InvoiceService, Added

### Community 20 - "domain-events.ts"
Cohesion: 0.09
Nodes (22): CollectionLoggedPayload, DeliveryCompletedPayload, DeliveryFailedPayload, DomainEvent, DomainEventPayloads, EodClosedPayload, ExceptionResolvedPayload, GrnPostedPayload (+14 more)

### Community 21 - "inventory.service.ts"
Cohesion: 0.11
Nodes (8): setupTestDB(), setupTestDB(), createKnex(), assertTestDatabase(), AUTH_TOKENS, Common Gotchas, uuid, vitest

### Community 23 - "ExceptionPort"
Cohesion: 0.10
Nodes (9): OutboxService, ExceptionPort, [0.3.0] — 2026-10-24 — M1 Commercial & CRM Complete, Added, Fixed, 1. Summary, 8. Notes, 2. Remaining work (M0 build checklist §13) (+1 more)

### Community 24 - "knex"
Cohesion: 0.12
Nodes (17): DocNumberService, DomainJob, ChequeProvider, CodSettlementProvider, CodStopData, DomainJob, CreditNoteData, DomainJob (+9 more)

### Community 26 - "RbacGuard"
Cohesion: 0.11
Nodes (11): splitSql(), PermissionService, [0.1.0] — 2026-10-24 — M0 Platform Foundation Complete, Added, Decisions Confirmed, Fixed, 1. Current state, 3. Build order (+3 more)

### Community 28 - "WorkOrderRepository"
Cohesion: 0.11
Nodes (3): WorkOrderResponseDto, WorkOrderRepository, WorkOrderService

### Community 29 - "NeoBus — Architecture Document"
Cohesion: 0.06
Nodes (32): 1.1 User populations and interfaces, 1. System Context, 2.1 Backend (confirmed), 2.2 Frontend (confirmed), 2.3 Infrastructure (development), 2. Technology Stack, 3.1 Modular monolith, 3.2 Request lifecycle (+24 more)

### Community 31 - "NeoBus — Security Policy"
Cohesion: 0.11
Nodes (18): 10. Known Risks and Mitigations, 11. Vulnerability Reporting, 12. Compliance Notes (India), 3. Site-Level Data Isolation, 4. Sensitive Field Masking, 5. Append-Only Financial Records, 7. Input Validation and API Security, 8. Secrets Management (+10 more)

### Community 32 - "Enterprise Blueprint & Target Operating Model"
Cohesion: 0.18
Nodes (11): Enterprise Blueprint & Target Operating Model, M0 Platform Foundation, M1 Commercial & CRM, M2 Procurement & Supplier, M3 Multi-Site Inventory & Warehouse, M4 Factory Production, M5 Fleet, Dispatch & Delivery, M6 Collections & Financials (+3 more)

### Community 35 - "NeoCore Module-by-Module Build Pack"
Cohesion: 0.20
Nodes (10): CreditPort, ExceptionPort, InventoryPort, ItemPort, LedgerPort, NeoCore Module-by-Module Build Pack, NotifyPort, PricingPort (+2 more)

### Community 36 - "Modules README Build Guide"
Cohesion: 0.20
Nodes (10): Modules README Build Guide, Modules Enterprise Blueprint Reconstructed, Modules M0 Platform Foundation, Modules M1 Commercial & CRM, Modules M2 Procurement & Supplier, Modules M3 Multi-Site Inventory & Warehouse, Modules M4 Factory Production, Modules M5 Fleet, Dispatch & Delivery (+2 more)

### Community 37 - "OutboxRelay"
Cohesion: 0.18
Nodes (6): OutboxRelay, Background jobs, Domain events (Outbox pattern), Idempotency, Key Architectural Patterns, Row-Level Security (RLS)

### Community 38 - "RequisitionResponseDto"
Cohesion: 0.05
Nodes (20): CreateRequisitionDto, RequisitionLineDto, RequisitionLineResponseDto, RequisitionResponseDto, RequisitionStatus, APPROVED, CANCELLED, CONVERTED (+12 more)

### Community 39 - "m4-production.module.ts"
Cohesion: 0.06
Nodes (12): AttendanceController, AttendanceService, AttendanceResponseDto, AttendanceShift, AFTERNOON, GENERAL, MORNING, NIGHT (+4 more)

### Community 40 - "InventoryService"
Cohesion: 0.12
Nodes (3): InventoryService, AtpResult, ReserveResult

### Community 43 - "NeoBus — Open Decisions Register"
Cohesion: 0.07
Nodes (27): NeoBus — Open Decisions Register, OD-001 — Minimum margin percentage (BR-01 floor calculation), OD-002 — Owner escalation value threshold for delivery disputes (M5, M7), OD-003 — Invoice timing and GST tax treatment, OD-004 — e-Invoicing (IRN / GST e-invoice) applicability, OD-005 — e-Way bill generation: NeoCore or Tally bridge?, OD-006 — OTP delivery channel for field staff authentication, OD-007 — Multi-site coordinator access (+19 more)

### Community 44 - "ProductionPort"
Cohesion: 0.05
Nodes (40): ProductionPortStub, 5.1: Wastage Service, 5.2: Attendance Service, 7.1: Test Cases to Add, 7.2: Permission Boundary Tests (ADD), 7.3: RLS Site Isolation Tests (ADD), 7.4: Integration Tests (ADD), 7.5: Test Implementation Guidelines (+32 more)

### Community 45 - "ProcurementPort"
Cohesion: 0.20
Nodes (5): ProcurementPortStub, ProcurementPort, Files to Create / Modify, Summary, Phase 3: Requisition Planner

### Community 46 - "Data integrity and business rules"
Cohesion: 0.22
Nodes (7): deepStrip(), PriceMasker, RESTRICTED_ROLES, SENSITIVE_FIELDS, sensitiveSet, Auth & security, Data integrity and business rules

### Community 47 - ".oxlintrc.json"
Cohesion: 0.29
Nodes (6): env, node, rules, typescript/no-explicit-any, typescript/no-floating-promises, $schema

### Community 48 - "work-order.service.ts"
Cohesion: 0.12
Nodes (19): CompleteWorkOrderDto, CreateWorkOrderDto, RecordConsumptionDto, RecordOutputDto, StartWorkOrderDto, WorkOrderMaterialDto, WorkOrderMaterialResponseDto, WorkOrderOutputDto (+11 more)

### Community 50 - "InventoryPort"
Cohesion: 0.13
Nodes (7): InventoryPort, Acceptance, Patterns to Mirror, Plan: M3 Inventory and Warehouse — Remaining Implementation, Risks, Summary, Validation

### Community 51 - "tsconfig.build.json"
Cohesion: 0.29
Nodes (6): compilerOptions, rootDir, exclude, extends, include, ./tsconfig.json

### Community 52 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 53 - "FleetService"
Cohesion: 0.05
Nodes (18): EnqueuedCommand, EnqueuedCommandRepository, PollingConsumerService, CreateExpenseDto, CreateIssueDto, CreateTripDto, CreateTripStopDto, CreateTripStopLineDto (+10 more)

### Community 54 - "IdempotencyMiddleware"
Cohesion: 0.14
Nodes (10): IdempotencyMiddleware, 2. Acceptance Criteria Verification, 3. Files Created / Modified (M0), 4. Build & Test Status, 5. Definition of Done ✅, 6. Next Steps (M1 Sprint), M0 Platform Foundation — Completion Report, Modified Files (+2 more)

### Community 55 - "Money"
Cohesion: 0.13
Nodes (5): Money, Money & quantities (CRITICAL), Added, Milestone 2.2 — Shared utilities and infrastructure, In Scope

### Community 57 - "CLAUDE.md"
Cohesion: 0.17
Nodes (11): Before you call a task done, File naming, Git Conventions, graphify, Infrastructure, Key Files Reference, Migration Conventions, Ponytail Code Rules (+3 more)

### Community 58 - "NeoBus — Development Guide"
Cohesion: 0.14
Nodes (14): API Design Rules, Branch naming, Commit messages (Conventional Commits), Getting Started, Git Branching Strategy, NeoBus — Development Guide, Port and Stub Pattern, PR checklist (+6 more)

### Community 60 - "BomService"
Cohesion: 0.05
Nodes (15): BomController, BomService, ActivateBomDto, BomHeaderResponseDto, BomLineDto, BomLineResponseDto, BomStatus, ACTIVE (+7 more)

### Community 62 - "NeoBus — Implementation Roadmap"
Cohesion: 0.07
Nodes (27): Build order: M0 → M7a → M1 → M6, Build order: M3 → M5 → M6 Part 2, Build order: M4 → M2 → M7b, KPI Baseline and Day-90 Targets, M0 Platform Foundation, M1 Commercial and CRM, M2 Procurement and Supplier, M3 Inventory and Warehouse (+19 more)

### Community 63 - "Coding Conventions"
Cohesion: 0.29
Nodes (7): API design, Business rule placement, Coding Conventions, Database query rules, Module file structure, Timestamps & dates, TypeScript rules

### Community 64 - "Plan: Complete M5 Fleet Backend Remaining Work"
Cohesion: 0.12
Nodes (15): StopsReturnedPayload, Approach & Scope, Context, File Target, Integration Test Cases (`apps/api/src/modules/m6-finance/tests/m5-m6-integration.spec.ts`), Phase 1: M5 Acceptance Coverage, Phase 1: M5 Acceptance Coverage — ✅ COMPLETED, Phase 2: M5/M6 Cross-Module Integration Wiring (+7 more)

### Community 65 - "NeoBus — Changelog"
Cohesion: 0.09
Nodes (21): [0.2.0] — 2026-10-24 — M7a Exception Engine + Notification Hub Complete, [0.4.0] — 2026-10-25 — M6 Collections & Financials Complete (Sprint 1 Core), 0.4.1 — 2026-11-02, 0.4.2 — 2026-11-02, 0.4.3 — 2026-11-06 — M4 Production Sprint 3 Complete, Added, Confirmed Business Decisions (2026-10-22), Decisions Confirmed (+13 more)

### Community 66 - "NeoBus Project Handover"
Cohesion: 0.14
Nodes (13): 1. Executive status, 2. Completed modules, 3. M3 completion, 4. M5 work included in commit `911b43e`, 5. Verification completed, 6. Remaining M5 work, 7. Current worktree warning, 8. Recommended next sequence (+5 more)

### Community 67 - "M7a — Exception Engine + Notification Hub — Implementation Plan"
Cohesion: 0.14
Nodes (13): 2. Files to create, 3. Schema (migration 005), 4. Architecture, 5. Acceptance Criteria (M7 §10, items 1–4 for M7a), 6. Definition of Done, Additional M7a-specific checks, DB, Docs (+5 more)

### Community 68 - "Plan: M3 Inventory and Warehouse"
Cohesion: 0.15
Nodes (12): Assumptions (from Confirmed OD Decisions), Dependencies on Completed Modules, "Done" Definition:, M3 Build Order Relationships, Must Pass Before "Done":, Next Steps (After Approval), Open Decisions Affecting M3 Design, Patterns to Mirror (+4 more)

### Community 69 - "M6 Test Coverage Audit"
Cohesion: 0.15
Nodes (12): ❌ Completely Untested (In Scope), Coverage Matrix: Blueprint Requirements vs Tests, Coverage Status, ✅ Fully Covered, Gaps by M6 Module Component, High Priority (Sprint 1 Completion), Infra Gaps Found During Audit, Low Priority (Future/M5 Integration) (+4 more)

### Community 70 - "2. End-to-End Scenarios (Cross-Module Acceptance Tests)"
Cohesion: 0.17
Nodes (11): 1. Business Rules, 2. End-to-End Scenarios (Cross-Module Acceptance Tests), 4. Gap Resolutions Traceability (G1–G14), 5. Non-Negotiable Engineering Requirements Traceability, NeoBus — Blueprint Traceability Matrix, Scenario A — Customer negotiates a price (M1, M7), Scenario B — Supplier changes price (M2, M1, M7), Scenario C — Supplier can't fulfil quantity (M2, M3, M7) (+3 more)

### Community 71 - "api/README.md"
Cohesion: 0.20
Nodes (9): Compile and run the project, Deployment, Description, License, Project setup, Resources, Run tests, Stay in touch (+1 more)

### Community 73 - "NeoBus — Project Overview"
Cohesion: 0.18
Nodes (11): Business Context, Core Problem Solved, Day-90 Success Criteria, Module Summary, NeoBus — Project Overview, Related Documents, Sites, Value streams (+3 more)

### Community 75 - ".of"
Cohesion: 0.12
Nodes (5): createPurchaseOrder(), createTestSalesOrder(), ChequeService, createSalesOrder(), Phase 4: Cheque Lifecycle State Machine

### Community 76 - "Testing Levels"
Cohesion: 0.20
Nodes (10): 1. Unit Tests, 2. Integration Tests, 3. End-to-End (E2E) Tests, 4. Authorization Tests, 5. Concurrency Tests, 6. Offline / Sync Tests, 7. Security / Penetration Tests (Pre-Production), 8. Conference Room Pilot (CRP) (+2 more)

### Community 77 - "NeoBus — Enterprise Business Operations Platform"
Cohesion: 0.20
Nodes (10): Available Commands (from `apps/api/`), Contributing, Docker Compose Services, Environment Variables (`apps/api/.env`), Licence, Modules at a Glance, NeoBus — Enterprise Business Operations Platform, Project Structure (+2 more)

### Community 78 - "3. Module-Level Requirements Traceability"
Cohesion: 0.22
Nodes (9): 3. Module-Level Requirements Traceability, M0 Platform Foundation, M1 Commercial and CRM, M2 Procurement and Supplier, M3 Inventory and Warehouse, M4 Factory Production, M5 Fleet Dispatch and Delivery, M6 Collections and Financials (+1 more)

### Community 79 - "Tasks"
Cohesion: 0.25
Nodes (8): Task 1: Fix inventory.controller.ts — Complete Rewrite, Task 2: Wire InventoryPort in M3 Module, Task 3: Fix InventoryPortStub Contract Compliance, Task 4: Create E2E Acceptance Test (m3-acceptance.spec.ts), Task 5: Create Inventory Expiry Sweep Job, Task 6: Register Job in Module, Task 7: Full Validation, Tasks

### Community 80 - "Tasks Breakdown"
Cohesion: 0.25
Nodes (8): Task 1: Create Migration 008 — M3 Baseline Tables, Task 2: Define InventoryPort Interface and M1 Stub, Task 3: Implement InventoryService Core Logic, Task 4: Implement Inventory Controllers, Task 5: Implement Quantity Utility Extensions, Task 6: Create Acceptance Tests, Task 7: RLS Policy Configuration, Tasks Breakdown

### Community 81 - "Code Review: M6 Collections & Financials - FIXES COMPLETED"
Cohesion: 0.29
Nodes (6): Applied Fixes, Code Review: M6 Collections & Financials - FIXES COMPLETED, Fix 1: eod.service.ts - Logger Conversion, Fix 2: handover.service.ts - Comment Simplification, Remaining Items (Tracked for Sprint 2), Validation

### Community 82 - "Test Infrastructure"
Cohesion: 0.29
Nodes (6): Coverage targets, Environment variables for tests, NeoBus — Testing Strategy, Running all tests, Test database, Test Infrastructure

### Community 83 - "Quick Start"
Cohesion: 0.29
Nodes (7): 1. Clone and enter the repository, 2. Configure environment variables, 3. Start the development stack, 4. Verify the API is alive, 5. Run tests, Prerequisites, Quick Start

### Community 84 - "m1-commercial.module.ts"
Cohesion: 0.13
Nodes (10): AuthModule, DatabaseModule, M1CommercialModule, M3InventoryModule, M5FleetModule, M7aExceptionsModule, Phase 7: ProcurementPort & M1 Integration (Day 12), Files to Change (+2 more)

### Community 85 - "Implementation Phases"
Cohesion: 0.33
Nodes (6): Implementation Phases, Phase 1: Database Migration (008), Phase 2: InventoryPort Interface and Stub, Phase 3: Inventory Service Implementation, Phase 4: Inventory Controllers and API, Phase 5: Acceptance Tests and Scenario Coverage

### Community 86 - "OutboxService"
Cohesion: 0.09
Nodes (18): ExceptionService, RaiseOptions, ResolutionAction, NotificationService, ExceptionPortStub, NotifyPortStub, ExceptionPayload, ExceptionType (+10 more)

### Community 87 - "Testing"
Cohesion: 0.33
Nodes (6): Test database isolation (CRITICAL), Test fixture rules, Test naming convention, Test runner: Vitest, Testing, What must be tested

### Community 88 - "m4-production.module.ts"
Cohesion: 0.20
Nodes (8): JwtAuthGuard, PERMISSIONS_METADATA, RbacGuard, RegisterDeviceDto, ListExceptionsQuery, ResolveExceptionDto, createTestApp(), @nestjs/swagger

### Community 90 - "@nestjs/common"
Cohesion: 0.15
Nodes (9): @nestjs/jwt@^12.0.3, JwtPayload, RefreshPayload, DriverManifest, DriverManifestStop, ChallanData, @nestjs/common, @nestjs/jwt (+1 more)

### Community 92 - "Steps"
Cohesion: 0.12
Nodes (15): EventType, 10 — Write tests, 11 — Register in app.module.ts, 12 — Run and verify, 13 — Summary, 1 — Read the module spec, 2 — Show the plan, wait for approval, 3 — Create the SQL migration (+7 more)

### Community 94 - "TripRepository"
Cohesion: 0.23
Nodes (4): TripRepository, Operational Test Cases (`apps/api/src/modules/m5-fleet/tests/m5-operational.spec.ts`), Phase 3: M5 Remaining Operational Features, Tasks & Test Cases

### Community 97 - "CreditPortService"
Cohesion: 0.11
Nodes (11): CreditPortService, CreditPortStub, [0.5.0] — 2026-11-06 — M6 Part 2 Accounting Bridge & M5 Integration Complete, Added, Decisions Confirmed, Module Status Updated, Phase 1: M5→M6 Event Integration, Phase 2: Credit Notes & Returns (+3 more)

### Community 98 - "Plan: M4 Production Module Implementation"
Cohesion: 0.18
Nodes (10): Business Rules, Context, Core Entities, Migration Sequence, Module Scope (from M4 Blueprint §7, §10), Notes, Plan: M4 Production Module Implementation, Plan Status (+2 more)

### Community 99 - "Implementation Phases"
Cohesion: 0.20
Nodes (8): M4ProductionModule, Implementation Phases, Phase 1: Database Migration & Schema, Phase 2: BOM Service, Phase 4: Work Order Service (Core), Phase 5: Wastage & Attendance Services, Phase 6: ProductionPort Implementation, Phase 7: Acceptance Tests

### Community 102 - "Coding Conventions"
Cohesion: 0.25
Nodes (8): Business rules, Coding Conventions, Database queries, Domain events, File naming, Module structure (each M# module), Money and quantities, TypeScript

### Community 103 - "2. Authorization (RBAC)"
Cohesion: 0.50
Nodes (4): 2. Authorization (RBAC), Enforcement, Permission codes, Roles

### Community 104 - "CollectionService"
Cohesion: 0.11
Nodes (9): CollectionService, Business Rules & Confirmed Decisions, Task 1: Reconcile M6 Migrations (007 + 008), Task 3: Refactor Acceptance Test Harness, Task 4: Complete Exception Handler for Credit Rebate, Task 5: Verify Invoice Generation End-to-End, Task 6: Verify Collection Logging (BR-07), Tasks (+1 more)

### Community 105 - "wastage.service.ts"
Cohesion: 0.17
Nodes (12): WastageReasonType, ABNORMAL, DAMAGE, EXPIRY, NORMAL, WastageStatus, APPROVED, RECORDED (+4 more)

### Community 106 - "AppModule"
Cohesion: 0.15
Nodes (9): Observability, AppModule, Phase 1: Database Migration & Module Scaffold (Day 1), 1. Overview & Scope, 2. Implementation Tasks (Build Order), 3. Database Schema (Migration 006), 4. Verification & Acceptance Criteria, NeoBus — M1 Commercial & CRM Implementation Plan (+1 more)

### Community 107 - "QuoteService"
Cohesion: 0.19
Nodes (4): QuoteService, [0.3.2] — 2026-10-25 — M1 Acceptance Tests Complete (Scenario A), Added, Fixed

### Community 109 - "Clock"
Cohesion: 0.15
Nodes (5): DomainJob, LedgerPostEntry, LedgerPostingService, PRODUCTION_PORT, Clock

### Community 110 - "CreditService"
Cohesion: 0.18
Nodes (6): CreditService, Architecture & Structure, Migrations so far, Module status, Monorepo layout, Risks

### Community 112 - "M7a — Exception Engine + Notification Hub — Completion Report"
Cohesion: 0.17
Nodes (10): 2. Files Created, 4. Database Schema (Migration 005), 5. Architecture, 6. Acceptance Criteria Verification (M7 §10, items 1–4 for M7a), 7. Definition of Done Checklist, Additional M7a-Specific Checks, Background Jobs, ExceptionService Flow (+2 more)

### Community 113 - "Plan: M6 Part 2 — Accounting Bridge and M5 Integration Completion"
Cohesion: 0.17
Nodes (11): Acceptance Criteria (from roadmap), Context, Next Steps, Phase 1 Completion Checklist, Plan: M6 Part 2 — Accounting Bridge and M5 Integration Completion, References, Risk Mitigation, Test File: `apps/api/src/modules/m6-finance/tests/m6-part2-integration.spec.ts` (+3 more)

### Community 115 - "Plan: M2 Procurement & Supplier Module Implementation"
Cohesion: 0.22
Nodes (8): Acceptance Criteria (from Blueprint §10), Dependencies & Risks, Next Steps, Open Decisions (from `OPEN_DECISIONS.md`), Patterns to Mirror, Plan: M2 Procurement & Supplier Module Implementation, Risks, Verification Commands

### Community 116 - "Implementation Overview"
Cohesion: 0.20
Nodes (10): 1.1: Trip Dispatched → Invoice Generation, 1.2: Trip Closed → COD Settlement, 2.1: Database Migration, 2.2: Credit Note Service, Implementation Overview, Phase 1: M5→M6 Event Integration (Core - 2-3 days), Phase 2: Credit Notes for Returns (2 days), Phase 3: CreditPort Real Implementation (1 day) (+2 more)

### Community 117 - "Implementation Phases"
Cohesion: 0.25
Nodes (8): Implementation Phases, Phase 2: Supplier Master & Rate Tracking (Days 2-3), Phase 3: Purchase Requisition Flow (Day 4), Phase 4: Purchase Order with BR-03 Price Spike (Days 5-7), Phase 5: Blind GRN & Shortfall Detection (BR-05) (Days 8-9), Phase 6: Shortfall Workbench & Backup Ranking (Days 10-11), Phase 8: Supplier Performance & Jobs (Days 13-14), Phase 9: Acceptance Tests & E2E Scenarios (Days 15-17)

### Community 118 - "NeoBus Copilot Instructions"
Cohesion: 0.29
Nodes (6): Architecture boundaries, Code and test conventions, Commands, NeoBus Copilot Instructions, Repository orientation, Source-of-truth notes

### Community 119 - "1. Authentication"
Cohesion: 0.33
Nodes (6): 1. Authentication, Field staff login, Office staff login, Owner, Rate limiting, Token design

### Community 123 - "Test Strategy"
Cohesion: 0.50
Nodes (4): Contract Tests, Integration Tests, Test Strategy, Unit Tests

### Community 124 - "File Changes Summary"
Cohesion: 0.50
Nodes (4): File Changes Summary, MIGRATIONS, MODIFY EXISTING, NEW FILES

### Community 125 - "Migration Conventions"
Cohesion: 0.50
Nodes (4): Each migration must have, File naming, Migration Conventions, Rules

### Community 126 - "6. Audit Trail"
Cohesion: 0.50
Nodes (4): 6. Audit Trail, How it is enforced, Special case: manual ledger adjustments, What is logged

### Community 127 - "Database Migrations Required"
Cohesion: 0.67
Nodes (3): Database Migrations Required, Migration 1: Core Procurement Tables (suppliers, supplier_items, rate tracking), Migration 2: RLS Policies + Append-only Protection

## Knowledge Gaps
- **55 isolated node(s):** `WRITEOFF`, `SHRINKAGE`, `MORNING`, `AFTERNOON`, `NIGHT` (+50 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1026 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RequirePermission()` connect `RequirePermission` to `PricingController`, `CustomerService`, `ItemService`, `OrderService`, `RequisitionResponseDto`, `m4-production.module.ts`, `PricingService`, `QuoteController`, `wastage.service.ts`, `FleetService`, `m4-production.module.ts`, `WorkOrderController`, `BomService`?**
  _High betweenness centrality (0.135) - this node is a cross-community bridge._
- **Are the 15 inferred relationships involving `Money` (e.g. with `Common Gotchas` and `Money & quantities (CRITICAL)`) actually correct?**
  _`Money` has 15 INFERRED edges - model-reasoned connections that need verification._
- **What connects `WRITEOFF`, `SHRINKAGE`, `MORNING` to the rest of the system?**
  _55 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `RequirePermission` be split into smaller, more focused modules?**
  _Cohesion score 0.07229832572298325 - nodes in this community are weakly interconnected._
- **Why does `@nestjs/common` connect `@nestjs/common` to `RequirePermission`, `CustomerService`, `ItemService`, `devDependencies`, `dependencies`, `ports.interface.ts`, `inventory.service.ts`, `knex`, `AppService`, `RequisitionResponseDto`, `m4-production.module.ts`, `HealthController`, `work-order.service.ts`, `FleetService`, `BomService`, `m1-commercial.module.ts`, `OutboxService`, `m4-production.module.ts`, `wastage.service.ts`, `AppModule`, `Clock`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Should `CustomerService` be split into smaller, more focused modules?**
  _Cohesion score 0.08853410740203194 - nodes in this community are weakly interconnected._
- **Why does `NeoBus — Changelog` connect `NeoBus — Changelog` to `CreditPortService`, `RbacGuard`, `QuoteService`, `ExceptionPort`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._