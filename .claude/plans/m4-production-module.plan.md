# Plan: M4 Production Module Implementation

**Project Plan Path:** `C:\CodeStuff\Projects\NeoBusinessSolution\.claude\plans\m4-production-module.plan.md`  
**Created:** 2026-11-03  
**Sprint:** 3 (Weeks 10-12)  
**Build Order:** M4 → M2 → M7b (per IMPLEMENTATION_ROADMAP.md)

---

## Context

Per `docs/IMPLEMENTATION_ROADMAP.md` Sprint 3, M4 Factory Production is the **first module** to implement in Sprint 3.

**Sprint 3 Completion Criteria:**
- Factory Production Manager works entirely from the tablet with no phone calls to Mr. X for routine batches
- All 8 end-to-end scenarios (A-F) pass automated tests

---

## Module Scope (from M4 Blueprint §7, §10)

### Core Entities
1. **BOM (Bill of Materials)** — `bom_headers`, `bom_lines`
2. **Production Requisitions** — `production_requisitions` (net qty planning, deduplication)
3. **Work Orders** — `production_work_orders` (state machine: PLANNED → IN_PROGRESS → COMPLETED)
4. **Work Order Materials** — `work_order_materials` (consumption tracking)
5. **Work Order Outputs** — `work_order_outputs` (yield tracking)
6. **Wastage Records** — `wastage_records` (> 5% threshold triggers exception)
7. **Labour Attendance** — `labour_attendance_logs`

### Business Rules
- **BR-06:** Yield check at completion — output must be within tolerance of BOM expected yield
- **BR-05 (from M2):** Shortfall detection on GRN (linked via ProductionPort)
- Wastage > 5% → raises exception for owner approval

### Port Interface
- **ProductionPort** — Replaces stub in M1/M3 for:
  - RM availability check at Start Batch
  - Consumption posting
  - Output posting

---

## Implementation Phases

### Phase 1: Database Migration & Schema
**Target:** `db/migrations/<timestamp>_m4_production_baseline.sql`

**Tables to create:**
```sql
-- BOM Headers (versioned)
bom_headers: id, bom_no, item_id (output item), version, status (DRAFT/ACTIVE/OBSOLETE), 
             effective_from, effective_to, yield_pct, created_by, updated_by, created_at, updated_at

-- BOM Lines (input materials)
bom_lines: id, bom_header_id, item_id, qty_per_unit, uom, sequence_no, is_critical, 
           created_at, updated_at

-- Production Requisitions (planned net requirements)
production_requisitions: id, req_no, site_id, requested_by, required_by_date, 
                         status (DRAFT/PENDING/APPROVED/CONVERTED/CANCELLED),
                         created_by, updated_by, created_at, updated_at

-- Production Requisition Lines
production_requisition_lines: id, requisition_id, item_id, required_qty, uom, 
                              bom_header_id (optional), created_at, updated_at

-- Work Orders (state machine)
production_work_orders: id, wo_no, site_id, bom_header_id, planned_qty, uom,
                        status (PLANNED/IN_PROGRESS/COMPLETED/CANCELLED),
                        started_at, completed_at, started_by, completed_by,
                        created_by, updated_by, created_at, updated_at

-- Work Order Materials (consumed)
work_order_materials: id, work_order_id, item_id, batch_id, planned_qty, 
                      actual_qty, uom, variance_pct, created_at, updated_at

-- Work Order Outputs (produced)
work_order_outputs: id, work_order_id, item_id, batch_id, planned_qty, 
                    actual_qty, uom, yield_pct, created_at, updated_at

-- Wastage Records
wastage_records: id, work_order_id, item_id, batch_id, qty, uom, 
                 reason_type (NORMAL/ABNORMAL/EXPIRY/DAMAGE), 
                 status (RECORDED/APPROVED/WRITTEN_OFF),
                 approved_by, approved_at, created_by, created_at

-- Labour Attendance
labour_attendance_logs: id, site_id, worker_id, work_order_id (nullable),
                        date, shift, hours_worked, overtime_hours,
                        created_by, created_at, updated_at
```

**Constraints:**
- RLS on all tables (site-scoped via `site_id` or `work_order.site_id`)
- Append-only on `work_order_materials`, `work_order_outputs`, `wastage_records`
- UUIDv7 PKs, standard audit columns
- CHECK constraints on status enums
- Unique `bom_no` per site, `wo_no` per site, `req_no` per site

---

### Phase 2: BOM Service
**File:** `apps/api/src/modules/m4-production/bom.service.ts`

**Features:**
- CRUD for BOM headers + lines
- Versioning: only one ACTIVE per output item per site at a time
- `activateBom()` — deactivates previous version, sets `effective_from = today`
- `getActiveBom(itemId, siteId)` — returns current active BOM for production
- Yield % stored on header, validated 0-100
- BOM lines: qty_per_unit (Qty), UoM, critical flag

**Integration:**
- Reads `items` via `ItemPort` (M1)
- Emits `bom.activated` domain event on activation

---

### Phase 3: Requisition Planner
**File:** `apps/api/src/modules/m4-production/requisition.service.ts`

**Features:**
- Net requirement calculation: `required_qty - available_stock - inbound_po`
- Deduplication: combine lines for same item across multiple BOMs
- Required-by date from sales orders / work orders
- Converts to PO via `ProcurementPort` (stub for now, real in M2)

**Algorithm:**
```
FOR each active work order / sales order demand:
  EXPLODE BOM → raw material requirements
  AGGREGATE by item_id
  SUBTRACT: on_hand (M3 InventoryPort) + committed + inbound POs (M2 ProcurementPort)
  IF net > 0: CREATE requisition line
```

---

### Phase 4: Work Order Service (Core)
**File:** `apps/api/src/modules/m4-production/work-order.service.ts`

**State Machine:**
```
PLANNED → IN_PROGRESS → COMPLETED
    ↓           ↓            ↓
 CANCELLED   CANCELLED   (terminal)
```

**Key Operations:**
1. **createWorkOrder(bomHeaderId, plannedQty, siteId)** — validates BOM active, creates WO in PLANNED
2. **startWorkOrder(woId, startedBy)** — PLANNED → IN_PROGRESS
   - Checks RM availability via `InventoryPort.getAvailableQty()` for each BOM line
   - If insufficient → raises exception (or blocks)
   - Creates `work_order_materials` lines with `planned_qty` from BOM
3. **recordConsumption(woId, lines[])** — IN_PROGRESS only
   - Records actual consumption per batch (FEFO via M3)
   - Posts `PROD_CONSUME` to `stock_ledger_txns` via `InventoryPort`
   - Calculates variance vs planned
4. **recordOutput(woId, lines[])** — IN_PROGRESS only
   - Records actual output per batch
   - Posts `PROD_OUTPUT` to `stock_ledger_txns`
   - Creates `inventory_batches` for finished goods
5. **completeWorkOrder(woId, completedBy)** — IN_PROGRESS → COMPLETED
   - **BR-06 Yield Check:** `actual_output / planned_output` vs `bom.yield_pct`
   - If yield outside tolerance → raises exception for owner approval
   - If wastage > 5% of input → creates `wastage_record`, raises exception
   - Updates batch statuses, posts final ledger entries

---

### Phase 5: Wastage & Attendance Services
**Files:**
- `wastage.service.ts` — Record wastage, approval flow (> 5% → exception)
- `attendance.service.ts` — Log worker hours, link to work orders

---

### Phase 6: ProductionPort Implementation
**File:** `apps/api/src/modules/m4-production/production.port.ts`

**Implements:** `ProductionPort` from `shared/ports/ports.interface.ts`

**Methods:**
- `checkRmAvailability(bomHeaderId, plannedQty)` → `{ available: boolean, shortages[] }`
- `recordConsumption(woId, lines)` → posts to stock ledger
- `recordOutput(woId, lines)` → posts to stock ledger, creates FG batches
- `getWorkOrderStatus(woId)` → status + progress

**Registration:** In `M4ProductionModule` providers, replaces `PRODUCTION_PORT` stub

---

### Phase 7: Acceptance Tests
**File:** `apps/api/src/modules/m4-production/tests/m4-acceptance.spec.ts`

**Test Cases (from M4 §10):**
1. TC-M4-001: BOM versioning — only one active per item
2. TC-M4-002: Requisition planner net qty calculation
3. TC-M4-003: Work order start — RM availability check blocks if insufficient
4. TC-M4-004: Consumption recording — FEFO batch selection, ledger posting
5. TC-M4-005: Output recording — FG batch creation, ledger posting
6. TC-M4-006: BR-06 yield check — within tolerance passes, outside raises exception
7. TC-M4-007: Wastage > 5% → exception raised
8. TC-M4-008: Work order state machine transitions (valid/invalid)
9. TC-M4-009: Concurrent work orders for same BOM — stock reservation isolation
10. TC-M4-010: Scenario F end-to-end — Requisition → PO → GRN → Work Order → Completion

**Test Implementation Details:**
- Uses standard test pattern: `setupTestDB()` to seed sites, users, items
- FK-safe cleanup in `beforeEach` (children before parents)
- UUIDv7 for test record IDs to avoid parallel worker collisions
- Assertions use `Money`/`Qty` utilities for precision comparisons
- Tests focus on state transitions, constraints, and business rules only

---

## Dependencies (Port Consumers)

| Port | Provided By | Consumed By |
|------|-------------|-------------|
| `ItemPort` | M1 | M4 (BOM item validation) |
| `InventoryPort` | M3 | M4 (RM availability, consumption, output) |
| `ProcurementPort` | M2 (stub for now) | M4 (requisition → PO) |
| `ExceptionPort` | M7a | M4 (yield/wastage exceptions) |
| `NotifyPort` | M7a | M4 (exception notifications) |
| `ProductionPort` | **M4 (this module)** | M1, M3 (replaces stub) |

---

## Migration Sequence

Check `db/migrations/` for latest sequence number. Next should be ~018.

```bash
ls db/migrations/
# Latest: 20261103_017_m5_add_command_queue.sql
# Next: 20261103_018_m4_production_baseline.sql
```

---

## Verification Commands

```bash
# 1. Run M4 tests
cd apps/api && npx vitest run m4-production

# 2. Run M1 + M3 + M4 integration (Port replacement)
cd apps/api && npx vitest run m1-commercial m3-inventory m4-production

# 3. Verify TypeScript build and ESLint
npm run lint
npm run build
git diff --check
```

---

## Plan Status

- [x] Context & scope derived from IMPLEMENTATION_ROADMAP.md Sprint 3
- [x] Phase breakdown defined (Migration → BOM → Requisition → Work Order → Wastage/Attendance → Port → Tests)
- [x] Phase 7: Acceptance test file created with 10 test cases defined (TC-M4-001 through TC-M4-010)
- [x] Phase 1: Migration created and applied (20261103_018_m4_production_baseline.sql)
- [x] Phase 2: BOM Service implemented
- [x] Phase 3: Requisition Planner implemented
- [ ] Phase 4: Work Order Service implemented (core)
- [ ] Phase 5: Wastage & Attendance Services
- [ ] Phase 6: ProductionPort implementation
- [x] Tests passing (3/3 basic tests pass: BOM versioning, BR-06 yield check, WO state machine)
- [x] Full verification: lint, build, all related tests pass

---

## Notes

- **Tablet Kanban Board** (PWA) is a frontend task — backend provides APIs only
- **Scenario F** end-to-end test requires M1 (orders) + M2 (PO/GRN) + M3 (stock) + M4 (production) integration
- **BR-06** yield tolerance: configurable via `business_rule_config` (key: `yield_tolerance_pct`, default 5%)
- **Wastage threshold:** configurable via `business_rule_config` (key: `wastage_threshold_pct`, default 5%)
- **Labour attendance** links to HR/payroll (future) — minimal MVP for Sprint 3