# Plan: M3 Inventory and Warehouse

**Source PRD**: docs/IMPLEMENTATION_ROADMAP.md, docs/DEVELOPMENT_GUIDE.md, docs/TESTING_STRATEGY.md, OPEN_DECISIONS.md  
**Selected Milestone**: Sprint 2 — M3 Inventory and Warehouse  
**Complexity**: Large

## Summary

Implement the M3 Inventory and Warehouse module to enable multi-site stock tracking, FEFO-based reservations, ATP queries, GRN handling, and inter-site transfers. This module bridges commercial orders (M1) with physical warehouse operations and enables the logistics and delivery modules (M5) to function correctly. The module implements the core inventory data model and business rules required for stock management across multiple sites.

Patterns mirrored from existing modules: port/stub pattern (M1←M3), migration conventions (M0→M1→M6), service-layer business rules (BR-01 through BR-08), and test-driven development with scenario-based acceptance tests.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| **Naming** | `apps/api/src/modules/m6-finance/m6-financials.module.ts:1` | `@Global()` module export with service tokens; `LEDGER_PORT` export pattern; all services exported for cross-module consumption |
| **Errors** | `apps/api/src/modules/m1-commercial/customer.service.ts:45` | `throw new NotFoundException(...)` or `BadRequestException(...)` with meaningful messages; error classes from NestJS |
| **Tests** | `apps/api/src/modules/m1-commercial/m1-acceptance.spec.ts:1` | Vitest with `describe/it/expect`; `knex` transaction per test; scenario-based `describe` blocks; acceptance test naming (E1001–E1006) |
| **Migrations** | `db/migrations/20261025_007_m6_collections_financials.sql:1` | `<timestamp>_<module>_<description>.sql` naming; `up`/`down` sections; append-only triggers + RLS policies in same migration; `knex` schema builder pattern |
| **Service layer** | `apps/api/src/modules/m6-finance/invoice.service.ts` | Injectable NestJS service with `@Injectable()`; database operations via `this.db` (Knex instance); transaction pattern: `await this.db.transaction(trx => ...)`; logger: `this.logger` |
| **Port/stub** | `apps/api/src/modules/m1-commercial/m1-commercial.module.ts:44-56` | Global provider tokens (`PRICING_PORT`, `ITEM_PORT`, `CREDIT_PORT`); stub replacement when owning module ships; `@Global()` module for wide accessibility |
| **Config service** | `apps/api/src/modules/m0-platform/config.service.ts` | `ConfigService.get('key')` pattern — never hard-code thresholds; reads from `business_rule_config` table; cache with TTL |
| **Domain events** | `apps/api/src/shared/events/outbox.service.ts` | Publish events inside transactions via Outbox; `OutboxService.publish(trx, event)`; `OutboxRelay` polls queue → handler execution |

## Files to Change

| File | Action | Why |
|---|---|---|
| `apps/api/src/app.module.ts` | UPDATE | Enable `M3InventoryModule` (currently commented out) |
| `apps/api/src/modules/m3-inventory/m3-inventory.module.ts` | CREATE | NestJS module definition; export `INVENTORY_PORT` token; import M0 dependencies |
| `apps/api/src/modules/m3-inventory/m3-inventory.repository.ts` | CREATE | Knex-based repository with parameterized queries; RLS-aware queries |
| `db/migrations/20261027_008_m3_inventory_baseline.sql` | CREATE | Migration 008: all M3 tables (batches, stock ledger, reservations, transfers, adjustments) + triggers |
| `apps/api/src/modules/m3-inventory/inventory.service.ts` | CREATE | Core service: ATP queries, FEFO reservations, GRN handling, transfer workflow, variance jobs |
| `apps/api/src/modules/m3-inventory/inventory.controller.ts` | CREATE | REST endpoints: GET /stock, POST /reservations, POST /transfers, POST /adjustments |
| `apps/api/src/shared/ports/ports.interface.ts` | UPDATE | Add `InventoryPort` interface with all required method signatures |
| `apps/api/src/modules/m1-commercial/m1-commercial.module.ts` | UPDATE | Add `INVENTORY_PORT` stub (returns `{available: true, qty: MAX}`) for Sprint 1 backward compatibility |
| `apps/api/src/shared/utils/quantity.util.ts` | UPDATE/ CREATE | `Qty` utility extensions for reservation operations, UoM conversion, drift detection |
| `apps/api/src/modules/m3-inventory/tests/m3-inventory.service.spec.ts` | CREATE | Unit tests for all BRs: BR-03 (price spike), BR-05 (shortfall), BR-06 (yield variance adapted for inventory) |
| `apps/api/src/modules/m3-inventory/tests/m3-inventory.e2e-spec.ts` | CREATE | E2E tests: Scenarios B, C, F (PO + shortfall, inter-site reservation, stock part) |

## Dependencies on Completed Modules

| Dependency | Module | Status | Integration Pattern |
|---|---|---|---|
| **Pricing service** | M1 Commercial | ✅ Complete | M3 reads `latest_landed_cost` from M1 PO data for floor price calculations; uses `PricingPort` for band evaluation |
| **Exception port** | M7a Exceptions | ✅ Complete | M3 can raise `STOCK_OUT_OF_RANGE`, `RESERVATION_CONFLICT` exceptions via `exceptionPort.raise()` |
| **Document numbering** | M0 Platform | ✅ Complete | M3 uses `doc-number.service.ts` for generating GRN numbers, transfer order numbers |
| **Idempotency** | M0 Platform | ✅ Complete | M3 reservation and transfer commands use idempotency keys to prevent double-booking |
| **Auditing** | M0 Platform | ✅ Complete | All inventory writes logged to `immutable_audit_logs` via AuditInterceptor |
| **Database** | M0 Platform migrations | ✅ Complete | M3 tables reference `site_id`, `user_id` from M0; RLS policies from migration 001 |
| **Config service** | M0 Platform | ✅ Complete | All thresholds (backup supplier variance, price spike baseline) read from `business_rule_config` |

### M3 Build Order Relationships

```
M0 → M1 → M6 (complete)
     ↘
      M3 (Sprint 2) ←←← depends on M0 + M1 tables already existing
      
       ↓
M5 Fleet (Sprint 2) ← depends on M3 INVENTORY_PORT for stock checks
      
       ↓
M4 Production (Sprint 3) ← depends on M3 for RM availability checks
      
       ↓
M2 Procurement (Sprint 3) ← depends on M3 for GRN posting + shortfall detection
```

## Implementation Phases

### Phase 1: Database Migration (008)
- Create 6 tables: `inventory_batches`, `stock_ledger_txns`, `stock_reservations`, `stock_transfers`, `stock_transfer_lines`, `stock_adjustments`
- Add append-only triggers on `stock_ledger_txns`, `stock_reservations`, `stock_transfers`
- RLS policies on all tables (site-scoped queries)
- Indexes: `(site_id, item_id, status, expiry_date)` for ATP performance; `idempotency_key` unique constraints
- Seed data: default sites, inventory items with initial stock levels

### Phase 2: InventoryPort Interface and Stub
- Define `InventoryPort` interface in `ports.interface.ts` with methods:
  - `getAvailableQty(siteId, itemId)` → available physical qty minus committed
  - `reserveStock(siteId, itemId, qty, orderId, idempotencyKey)` → reservation with FOR UPDATE lock
  - `releaseReservation(reservationId, idempotencyKey)` → release a reservation
  - `transferStock(fromSite, toSite, itemId, qty, idempotencyKey)` → inter-site transfer
  - `receiveGRN(poId, itemId, qty, receivedQty)` → GRN posting with shortfall detection
  - `getATP(siteId, itemId, orderQty)` → Available-to-Promise query (physical - committed, FEFO-ordered)
  - `checkExpiryDrift(siteId)` → detect stale/drifted reservations
- Add `InventoryPortStub` in M1 commercial module (returns `{available: true, qty: MAX}`) for backward compatibility

### Phase 3: Inventory Service Implementation
- `InventoryService` with business logic:
  - **ATP query**: `physical_qty - committed_qty`, ordered by FEFO (expiry_date ASC), with row-level FOR UPDATE locking
  - **FEFO reservation**: Algorithm that reserves stock in expiry order; uses `SELECT ... FOR UPDATE` with retry on serialization failure
  - **GRN posting**: Handler that posts good receipt note, updates `received_qty`, detects shortfall > OD-010 tolerance (2%), raises `SUPPLIER_PRICE_SPIKE` or `SUPPLIER_SHORTFALL` exceptions
  - **Transfer workflow**: Multi-step: create transfer request → reserve at destination → consume at source → confirm completion; variance handling if received qty ≠ requested qty
  - **Adjustment service**: Write-off, shrinkage, expiry removal; variance > 5% triggers owner approval (per OD-012 proposed default)
  - **Drift detection job**: Daily job checking for stale reservations, expired batches, quantity mismatches

### Phase 4: Inventory Controllers and API
- REST endpoints under `/inventory`:
  - `GET /stock/current` — current stock levels per item per site
  - `GET /stock/atp` — Available-to-Promise with order qty filter
  - `POST /reservations` — create a new reservation (idempotent)
  - `POST /reservations/:id/release` — release a reservation
  - `POST /transfers` — create inter-site transfer
  - `POST /transfers/:id/confirm` — confirm transfer completion
  - `POST /grn` — post good receipt note for a PO
  - `POST /adjustments` — create stock adjustment (write-off, expiry, shrinkage)
  - `GET /expiry/drift` — report stale/drifted inventory

### Phase 5: Acceptance Tests and Scenario Coverage
- Scenario B: PO +12% → owner card → Approve & update floor (M2 + M7a)
- Scenario C: Shortfall 400 kg → ranked backups → covered (M2)
- Scenario F: SO 200 cartons, stock 50 → reserve 50, requisition 150; WO completes → READY (M3 + M4)
- Concurrency test: two concurrent reservations for the last 100 kg → exactly one succeeds; total reserved never > available
- Idempotency test: same reservation submitted twice → exactly one record created
- RLS test: Storekeeper at Site A cannot read stock at Site B

## Tasks Breakdown

### Task 1: Create Migration 008 — M3 Baseline Tables
- **Action**: Write `db/migrations/20261027_008_m3_inventory_baseline.sql` with `up` and `down` sections
- **Mirror**: Migration 007 pattern (M6); migration 001/002 patterns (M0)
- **Validate**: `npm run migrate` runs clean on fresh test DB; `npm run migrate:rollback` reverses without errors

### Task 2: Define InventoryPort Interface and M1 Stub
- **Action**: Update `apps/api/src/shared/ports/ports.interface.ts` with `InventoryPort` methods; add `InventoryPortStub` to M1 commercial module
- **Mirror**: `PricingPort`/`ItemPort`/`CreditPort` pattern from M1 module
- **Validate**: TypeScript compilation passes (`npm run build`); M1 module still loads with stub

### Task 3: Implement InventoryService Core Logic
- **Action**: Create `apps/api/src/modules/m3-inventory/inventory.service.ts` with ATP, FEFO reservation, GRN, transfer, adjustment methods
- **Mirror**: `LedgerService` patterns from M6 (transactional, Money arithmetic, idempotency); `PricingService` band evaluation
- **Validate**: All unit tests pass (`npm run test -- ...m3-inventory.service.spec.ts`); reservation concurrency test passes

### Task 4: Implement Inventory Controllers
- **Action**: Create `apps/api/src/modules/m3-inventory/inventory.controller.ts` with REST endpoints
- **Mirror**: NestJS controller patterns from M1, M6 (decorators, DTOs, OpenAPI annotations)
- **Validate**: E2E tests can hit endpoints; API docs at http://localhost:3000/api-docs show new routes

### Task 5: Implement Quantity Utility Extensions
- **Action**: Update `apps/api/src/shared/utils/qty.util.ts` with reservation operations, UoM conversion, drift detection
- **Mirror**: Existing `Money` utility patterns; `Qty` class from M0 foundation
- **Validate**: Unit tests for Qty operations; integration with InventoryService

### Task 6: Create Acceptance Tests
- **Action**: Create `m3-inventory.service.spec.ts` and `m3-inventory.e2e-spec.ts`
- **Mirror**: M1 acceptance test structure (knex transaction, scenario-based describes); M6 acceptance test patterns
- **Validate**: All scenario tests pass; concurrency tests pass; idempotency tests pass

### Task 7: RLS Policy Configuration
- **Action**: Define RLS policies in migration 008 and/or migration service; ensure site-scoped queries
- **Mirror**: RLS policies from M0 migration 001
- **Validate**: Cross-site queries return expected results (storekeeper sees only their site)

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Schema duplication with M6** | MEDIUM | HIGH | Consolidate: `worklist_worklists`/items could share table; document canonical home. Migration 007 already has `collection_worklists`; ensure M3 doesn't duplicate. |
| **Concurrency bugs in reservation** | HIGH | HIGH | Mandatory concurrency test: two concurrent requests for last 100 kg → exactly one succeeds; total reserved never > available. Use `SELECT ... FOR UPDATE` with retry on serialization failure. |
| **Offline sync creates duplicate reservations** | HIGH | HIGH | Idempotency keys on every reservation command; unique constraint on `(idempotency_key)`; integration test with simulated replay. |
| **FEFO algorithm incorrectness** | MEDIUM | MEDIUM | Edge case: multiple batches with same expiry date. Tie-breaker: first-created batch reserved first. Integration test with mixed expiry batches. |
| **Inter-site reservation complexity** | MEDIUM | HIGH | OD-025 (single vs. multi-site per order) not yet decided. Build for single fulfillment site per order in MVP; multi-site as Phase 2 flag. |
| **GRN shortfall tolerance miscalculation** | MEDIUM | MEDIUM | OD-010 (backup supplier within 2%) not yet confirmed. Build with configurable `supplier_price_variance_pct` from `business_rule_config`; default 2% per proposed default. |
| **RLS policies break legitimate cross-site queries** | LOW | HIGH | Thorough RLS test: storekeeper at Site A reads stock at Site B → returns 0 rows. Owner/coord can override via explicit site parameter. |
| **Performance degrades with many sites/items** | LOW | MEDIUM | Index on `(site_id, item_id, status, expiry_date)`; materialised ATP view if needed for > 1000 items. |

## Assumptions (from Confirmed OD Decisions)

- ✅ **OD-001 CONFIRMED**: 10% gross margin — affects pricing but not inventory directly
- ✅ **OD-003 CONFIRMED**: Invoice at dispatch with mixed taxable/exempt — M3 stock affects invoice lines
- ✅ **OD-019 CONFIRMED**: Owner delegate with escalation, no auto-approve — exception flow for inventory disputes
- ✅ **OD-023 CONFIRMED**: Signed-off CSV template for opening balances — initial stock levels imported via controlled template
- ✅ **OD-002 PROPOSED**: INR 5,000 owner escalation value — affects when exceptions raised for delivery disputes (M5/M7)
- ✅ **OD-012 PROPOSED**: Yield variance against issued raw material — adapted for inventory as "adjustment variance"
- ✅ **OD-013 PROPOSED**: Make-to-order only in MVP — all inventory reservations linked to confirmed orders/requisitions
- ✅ **OD-025 PROPOSED**: Single fulfillment site per order in MVP — M3 reservation ties to one site; multi-site in Phase 2

## Open Decisions Affecting M3 Design

| OD ID | Decision | Current Proposed Default | M3 Impact |
|---|---|---|---|
| **OD-007** | Multi-site coordinator access | One primary site per coordinator; owner can grant multi-site via `user_site_access` | Affects RLS policy design and `site_id` assignment logic in all M3 queries |
| **OD-009** | Price spike baseline: same supplier or item-wide | Last issued/closed PO price from same supplier+item; if none, item-wide last purchase price | Determines BR-03 query in GRN posting handler; affects shortfall detection logic |
| **OD-010** | Backup supplier tolerance | Within 2% above primary → auto-suggest; beyond 2% → flag for coordinator/owner | M3 GRN handler: auto-suggest backup PO if received_qty < requested_qty and variance within 2% |
| **OD-013** | Production mode: make-to-order only | Make-to-order in MVP; make-to-stock as work order type in Phase 2 | M3: all reservations tied to orders/requisitions; no speculative stock building in MVP |
| **OD-025** | Inter-site reservation: one fulfillment site per order | Single fulfillment site per order in MVP; multi-site in Phase 2 | M3 reservation algorithm: ties reservation to one `site_id`; transfer workflow handles inter-site movement |

## Verification and Completion Criteria

### Must Pass Before "Done":

**Database & Migration:**
- [ ] Migration 008 runs clean on fresh test DB
- [ ] `npm run migrate:rollback` reverses migration without data loss
- [ ] All RLS policies functional; cross-site queries return expected results
- [ ] Unique constraints on `idempotency_key` columns enforced at DB level

**Core Business Logic:**
- [ ] ATP query: `physical - committed`, FEFO-ordered, with `FOR UPDATE` locking
- [ ] FEFO reservation: one reservation per stock unit; concurrent requests resolve correctly
- [ ] GRN posting: updates stock, detects shortfall, raises correct exceptions
- [ ] Transfer workflow: reserve → consume → confirm sequence is atomic
- [ ] Adjustment: write-off > 5% triggers approval; variance detection works

**Test Coverage:**
- [ ] Unit tests: all service methods covered (> 80% line coverage)
- [ ] Unit tests: all business rule branches covered (BR-03, BR-05, BR-06 adapted)
- [ ] Concurrency test: two concurrent reservations for last 100 kg — exactly one succeeds
- [ ] Idempotency test: same reservation key submitted twice → exactly one record created
- [ ] RLS test: Storekeeper at Site A cannot read Stock at Site B
- [ ] E2E tests: Scenarios B, C, F pass end-to-end

**API & Integration:**
- [ ] All REST endpoints documented in OpenAPI (http://localhost:3000/api-docs)
- [ ] M1 `INVENTORY_PORT` stub loads without errors
- [ ] M5 Fleet can consume `INVENTORY_PORT` for stock checks (mocked initially)
- [ ] Domain events emitted for reservation/transfer completion published to outbox

### "Done" Definition:

M3 Inventory and Warehouse module is complete when:
1. All migration and schema changes are verified
2. Core inventory business logic (ATP, reservation, GRN, transfer, adjustment) works correctly
3. Test coverage meets targets (80%+ line, 100% business rule branches)
4. RLS policies are correct and don't leak cross-site data
5. API endpoints are functional and documented
6. M1 stub is in place for backward compatibility
7. Open decisions OD-007, OD-009, OD-010, OD-013, OD-025 are documented as assumptions with proposed defaults
8. No critical or high-severity risks remain unmitigated

## Next Steps (After Approval)

1. **Resolve open decisions**: OD-007, OD-009, OD-010, OD-013, OD-025 — preferably with business owner input before implementation begins
2. **Create migration 008** and run `npm run migrate` on dev DB
3. **Implement InventoryPort interface** and M1 stub
4. **Build InventoryService** with ATP and FEFO reservation
5. **Create controllers and API endpoints**
6. **Write and run acceptance tests**
7. **Run full test suite** to verify no regressions
8. **Verify M5 Fleet integration** can consume INVENTORY_PORT