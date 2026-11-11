# Plan: M2 Procurement & Supplier Module Implementation

**Source Blueprint:** `docs/modules/04_M2_Procurement_Supplier.md`
**Build Order:** Sprint 3 (Weeks 10-12) — after M4 Production, before M7b Dashboards
**Complexity:** Large (multiple workflows, state machines, integrations)

---

## Summary

Implement the full Procurement & Supplier module (M2) covering supplier master data, rate tracking, purchase orders with price-spike detection (BR-03), blind GRN receiving with shortfall handling (BR-05), backup supplier ranking, back-to-back trading POs, and supplier performance analytics. The module provides `ProcurementPort` for M1 to replace manual landed cost entry.

---

## Patterns to Mirror

| Category | Source | Pattern |
|----------|--------|---------|
| **Naming** | `apps/api/src/modules/m1-commercial/` | kebab-case files, PascalCase services, DTO folder |
| **State Machine** | `apps/api/src/modules/m1-commercial/order.state-machine.ts` | Explicit transitions, guard methods, audit log |
| **Port Implementation** | `apps/api/src/modules/m6-finance/credit-port.service.ts` | Real implementation replaces stub, reads ledger |
| **Domain Events** | `apps/api/src/modules/m5-fleet/trip-listener.service.ts` | BullMQ worker on `domain-events` queue |
| **Service Structure** | `apps/api/src/modules/m4-production/work-order.service.ts` | Business logic in service, Knex in repository |
| **RLS** | `db/migrations/20261102_014_m5_fleet_delivery.sql:197-235` | `ENABLE ROW LEVEL SECURITY`, site-scoped policies |
| **Append-only** | `db/migrations/20261025_007_m6_collections_financials.sql` | `REVOKE DELETE/UPDATE` on financial tables |
| **Exception Integration** | `apps/api/src/modules/m1-commercial/order.service.ts:312` | `ExceptionPort.raise()` in transaction |
| **Idempotency** | `apps/api/src/modules/m5-fleet/fleet.service.ts` | Idempotency key from header, DB check |
| **Money/Qty** | `apps/api/src/shared/utils/money.util.ts` | `Money.of()`, `Qty.of()` for all arithmetic |

---

## Database Migrations Required

### Migration 1: Core Procurement Tables (suppliers, supplier_items, rate tracking)
```sql
-- suppliers (extended from blueprint §3)
-- supplier_items
-- supplier_rate_quotes (volatility tracker)
-- rate_contracts
-- purchase_requisitions
-- purchase_orders (with CANCELLED, linked_sales_order_id, parent_po_id)
-- purchase_order_lines (price_variance_pct, shortfall_qty derived)
-- goods_receipts (grn.posted event source)
-- goods_receipt_lines
-- po_shortfalls
-- supplier_bills (Phase 2 - placeholder)
```

### Migration 2: RLS Policies + Append-only Protection
```sql
-- RLS on all tables (site-scoped for users, global for OWNER)
-- REVOKE DELETE/UPDATE on financial/append-only tables
-- Triggers for updated_at
```

---

## Files to Create / Modify

| File | Action | Reason |
|------|--------|--------|
| `db/migrations/202611xx_XX_m2_procurement_baseline.sql` | CREATE | Core schema per blueprint §3 |
| `apps/api/src/modules/m2-procurement/m2-procurement.module.ts` | CREATE | NestJS module definition |
| `apps/api/src/modules/m2-procurement/supplier.controller.ts` | CREATE | S1: Supplier master & rate card API |
| `apps/api/src/modules/m2-procurement/supplier.service.ts` | CREATE | Supplier CRUD, rate history, performance |
| `apps/api/src/modules/m2-procurement/supplier.repository.ts` | CREATE | Knex queries for suppliers |
| `apps/api/src/modules/m2-procurement/po.controller.ts` | CREATE | S2: PO builder API |
| `apps/api/src/modules/m2-procurement/po.service.ts` | CREATE | PO lifecycle, BR-03 spike detection |
| `apps/api/src/modules/m2-procurement/po.repository.ts` | CREATE | Knex queries for POs |
| `apps/api/src/modules/m2-procurement/grn.controller.ts` | CREATE | S4: Blind GRN API (no PO qty/price) |
| `apps/api/src/modules/m2-procurement/grn.service.ts` | CREATE | GRN posting, M3 integration, shortfall detection |
| `apps/api/src/modules/m2-procurement/grn.repository.ts` | CREATE | Knex queries for GRNs |
| `apps/api/src/modules/m2-procurement/shortfall.service.ts` | CREATE | S3: Shortfall workbench, backup ranking |
| `apps/api/src/modules/m2-procurement/back-to-back.service.ts` | CREATE | S2: Back-to-back PO generator |
| `apps/api/src/modules/m2-procurement/requisition.service.ts` | CREATE | S5: Requisition flow |
| `apps/api/src/modules/m2-procurement/procurement-port.service.ts` | CREATE | `ProcurementPort` implementation |
| `apps/api/src/modules/m2-procurement/jobs/supplier-score.job.ts` | CREATE | Nightly supplier performance |
| `apps/api/src/modules/m2-procurement/jobs/stale-rate-alert.job.ts` | CREATE | Rate freshness monitoring |
| `apps/api/src/modules/m2-procurement/dto/supplier.dto.ts` | CREATE | Supplier DTOs |
| `apps/api/src/modules/m2-procurement/dto/po.dto.ts` | CREATE | PO DTOs |
| `apps/api/src/modules/m2-procurement/dto/grn.dto.ts` | CREATE | Blind GRN DTOs |
| `apps/api/src/modules/m2-procurement/state-machines/po.state-machine.ts` | CREATE | PO status transitions |
| `apps/api/src/modules/m2-procurement/event-handler.ts` | CREATE | Consume `order.confirmed`, `production.requisition_created` |
| `apps/api/src/shared/ports/port-stubs.ts` | UPDATE | Add deprecation notice to `ProcurementPortStub` |
| `apps/api/src/modules/m1-commercial/m1-commercial.module.ts` | UPDATE | Remove stub, wire real `ProcurementPort` |

---

## Implementation Phases

### Phase 1: Database Migration & Module Scaffold (Day 1)
**Tasks:**
1. Create migration with all 11 tables (see blueprint §3 table)
2. Add RLS policies matching M5/M6 pattern
3. Add append-only REVOKE on `goods_receipts`, `goods_receipt_lines`, `po_shortfalls`
4. Create `M2ProcurementModule` with providers
5. Wire `ProcurementPort` provider (initially stub, later real)
6. Add to `AppModule` imports

**Validation:**
```bash
cd apps/api && npm run migrate && npm run build
```

### Phase 2: Supplier Master & Rate Tracking (Days 2-3)
**Tasks:**
1. `SupplierService` - CRUD, rate history, rate quotes
2. `SupplierRepository` - Knex queries
3. Supplier controller with `/suppliers`, `/suppliers/{id}/rates`
4. Unit tests for rate volatility tracking
5. Seed supplier data in test fixtures

**Validation:**
```bash
npx vitest run m2-procurement --testNamePattern="Supplier"
```

### Phase 3: Purchase Requisition Flow (Day 4)
**Tasks:**
1. `RequisitionService` - create from production/sales demand
2. `requisition.state-machine.ts` - OPEN → PO_CREATED → CANCELLED
3. Group requisitions by supplier for PO creation
4. Consume `production.requisition_created` event

**Validation:**
```bash
npx vitest run m2-procurement --testNamePattern="Requisition"
```

### Phase 4: Purchase Order with BR-03 Price Spike (Days 5-7)
**Tasks:**
1. `POStateMachine` - DRAFT → PENDING_APPROVAL → ISSUED → PARTIALLY_RECEIVED → CLOSED / CANCELLED
2. `POService.createPO()` - lines with `last_purchase_price_snapshot`
3. **BR-03 Implementation**: On line save, compare `unit_price` vs `last_purchase_price_snapshot`:
   - If `variance > config.supplier_price_variance_pct` (default 2%) → `PENDING_APPROVAL` + `ExceptionPort.raise(SUPPLIER_PRICE_SPIKE)`
   - Payload: supplier, item, old→new price, % change, affected open customer orders/quotes count, current vs suggested floor
4. `POST /pos/{id}/issue` - blocked while `PENDING_APPROVAL`
5. `POST /pos/{id}/confirm-quantities` - creates shortfall rows
6. Back-to-back PO: `POST /orders/{lineId}/back-to-back-po` → draft PO with `linked_sales_order_id`, show spread

**Validation:**
```bash
npx vitest run m2-procurement --testNamePattern="Price Spike|BR-03"
```

### Phase 5: Blind GRN & Shortfall Detection (BR-05) (Days 8-9)
**Tasks:**
1. `GRNService` - storekeeper posts GRN (no PO qty/price in payload)
2. `GRNController` - `POST /grns` - request/response omits `ordered_qty`, `confirmed_qty`, price
3. On GRN save: if linked PO line and `received_qty < confirmed_qty - supplier_shortfall_exception_pct`:
   - Create `po_shortfalls` row with `status = OPEN`
   - Raise `ExceptionPort.raise(SUPPLIER_SHORTFALL)`
   - Emit `grn.posted` event (M3 listens for stock post)
4. `POST /grns` blind receiving serializer test

**Validation:**
```bash
npx vitest run m2-procurement --testNamePattern="Blind GRN|Shortfall|BR-05"
```

### Phase 6: Shortfall Workbench & Backup Ranking (Days 10-11)
**Tasks:**
1. `ShortfallService` - `GET /shortfalls/{id}/backups`
2. Backup ranking algorithm (Scenario C):
   - Approved suppliers for item with current quote
   - Order by: (a) price within tolerance of primary, (b) `reliability_score_pct` desc, (c) `lead_time_days_avg` asc
   - `supplier_price_variance_pct` (2%) tolerance for auto-suggest
3. `POST /shortfalls/{id}/create-backup-po` - draft secondary PO(s)
4. If backups cannot cover → `ExceptionPort.raise(ALLOCATION)` with affected orders

**Validation:**
```bash
npx vitest run m2-procurement --testNamePattern="Backup|Shortfall Workbench"
```

### Phase 7: ProcurementPort & M1 Integration (Day 12)
**Tasks:**
1. `ProcurementPortService` implements `ProcurementPort`:
   - `latestLandedCost(itemId)` - last GRN/PO unit price + freight (Phase 2)
   - `createBackToBackPO(orderLineId)` - calls back-to-back service
   - `suggestBackups(itemId, deficitQty)` - calls shortfall service
2. Wire real `ProcurementPort` in `M2ProcurementModule` (replace stub)
3. Update `port-stubs.ts` with deprecation notice
4. Update `M1CommercialModule` to import `M2ProcurementModule` (or receive port via global)

**Validation:**
```bash
npx vitest run m1-commercial --testNamePattern="ProcurementPort"
```

### Phase 8: Supplier Performance & Jobs (Days 13-14)
**Tasks:**
1. Nightly job: recompute `fill_rate = Σ received_qty / Σ confirmed_qty` (90-day rolling)
2. Nightly job: `avg_lead_time`, `price_inflation` (30/90 day Δ)
3. Update `reliability_score_pct` on suppliers
4. `GET /suppliers/{id}/performance` endpoint
5. Stale rate alert job: rates older than N days flagged

**Validation:**
```bash
npx vitest run m2-procurement --testNamePattern="Performance|Supplier Score"
```

### Phase 9: Acceptance Tests & E2E Scenarios (Days 15-17)
**Tasks:**
1. **Scenario B (Price Spike)**: last price ₹50, PO line ₹56 (+12%) → `PENDING_APPROVAL`; card shows +12%, affected orders, floor update
2. **Scenario C (Shortfall)**: PO 1000kg, confirmed 600 → 400 deficit; backups ranked; backup PO closes as `COVERED_BY_BACKUP`
3. **Contract Test**: Storekeeper GRN payload has NO `ordered_qty`, `confirmed_qty`, price
4. **Threshold Test**: 580kg vs 600kg confirmed → `SUPPLIER_SHORTFALL` raised
5. **Back-to-Back Test**: One-click PO shows correct spread ₹ and %
6. **Fill Rate Test**: GRN post updates supplier scorecard

**Validation:**
```bash
npx vitest run m2-procurement --testNamePattern="Scenario B|Scenario C"
npm run test:e2e
```

---

## Test Strategy

### Unit Tests
| Test File | Coverage |
|-----------|----------|
| `supplier.service.spec.ts` | CRUD, rate history, rate quotes |
| `po.service.spec.ts` | State transitions, BR-03 spike detection |
| `grn.service.spec.ts` | Blind receiving, shortfall creation |
| `shortfall.service.spec.ts` | Backup ranking algorithm |
| `back-to-back.service.spec.ts` | Spread calculation, PO creation |
| `procurement-port.service.spec.ts` | Port contract compliance |
| `supplier-score.job.spec.ts` | Fill rate, lead time, reliability |

### Integration Tests
| Test File | Coverage |
|-----------|----------|
| `m2-acceptance.spec.ts` | Scenarios B, C end-to-end |
| `m2-m3-integration.spec.ts` | GRN → M3 stock posting |
| `m2-m6-integration.spec.ts` | Supplier bills → AP (Phase 2) |

### Contract Tests
| Test | Requirement |
|------|-------------|
| `grn-blind-contract.spec.ts` | Storekeeper API omits PO qty/price |
| `exception-payload.spec.ts` | SUPPLIER_PRICE_SPIKE payload structure |

---

## Dependencies & Risks

| Dependency | Status | Risk |
|------------|--------|------|
| M0 (Platform) | ✅ Complete | None |
| M7a (Exceptions) | ✅ Complete | `ExceptionPort.raise()` available |
| M3 (Inventory) | ✅ Complete | `grn.posted` consumed by M3 for stock post |
| M1 (Commercial) | ✅ Complete | `PricingPort` for affected orders in spike payload |
| M6 (Finance) | ✅ Complete | `LedgerPort` for supplier bills (Phase 2) |
| M4 (Production) | ✅ Complete | `production.requisition_created` event consumed |

### Open Decisions (from `OPEN_DECISIONS.md`)
| Decision | Impact | Proposed Default |
|----------|--------|------------------|
| **OD-009**: Price spike baseline (same supplier vs item-wide) | BR-03 query | Same supplier; fallback to item-wide |
| **OD-010**: Backup supplier tolerance | Shortfall ranking | Within 2% (config key `supplier_price_variance_pct`) |
| **OD-011**: Freight allocation into landed cost | `latestLandedCost` accuracy | Not tracked in MVP; PO unit price only |

### Risks
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Backup ranking algorithm complexity | MEDIUM | HIGH | Implement in phases: basic rank first, add tolerance later |
| GRN-PO linkage race condition | LOW | HIGH | FK constraint `po_id` on `goods_receipts`; transactional |
| Supplier performance job perf | LOW | MEDIUM | Materialised view if needed; index on `(supplier_id, received_at)` |

---

## Verification Commands

```bash
# Phase 1: Migration & Scaffold
cd apps/api && npm run migrate && npm run build

# Phase 2-8: Unit & Integration
npx vitest run m2-procurement

# Phase 9: Acceptance
npx vitest run m2-procurement --testNamePattern="Scenario B|Scenario C"

# Full Suite
npm run lint && npm run build && npx vitest run && npm run test:e2e
```

---

## Acceptance Criteria (from Blueprint §10)

- [ ] **AC1**: Scenario B - 12% spike → `PENDING_APPROVAL` with correct card payload
- [ ] **AC2**: 1.5% change → issues without exception
- [ ] **AC3**: Scenario C - 400kg deficit → ranked backups B (₹51) before C (₹52); backup PO closes as `COVERED_BY_BACKUP`
- [ ] **AC4**: No backup coverage → `ALLOCATION` card with affected orders
- [ ] **AC5**: Storekeeper GRN payload omits PO qty/price (contract test)
- [ ] **AC6**: 580kg vs 600kg → `SUPPLIER_SHORTFALL` raised
- [ ] **AC7**: Back-to-back PO shows correct spread
- [ ] **AC8**: Fill rate/lead time update after GRN post

---

## Next Steps

1. **Approve this plan** → Proceed to Phase 1 (migration + module scaffold)
2. **Resolve OD-009, OD-010, OD-011** with business owner before Phase 4/6
3. **Create detailed migration SQL** for Phase 1

---

*Plan created: 2026-11-07*
*Ready for approval to begin implementation*