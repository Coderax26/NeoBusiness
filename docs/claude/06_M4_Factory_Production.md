# M4 — Factory Production (Light MES / MRP)

**Build order:** 8th (Sprint 3) · **Depends on:** M0, M1 (demand), M3 (stock posting), M7a · **Stubs until built:** `ProductionPort` logs requirements only
**Blueprint refs:** §5.1 M4, BR-04 (requisition trigger), BR-06, Scenario F, §6.5, §7.2(2, 5), Open Q6/Q7

---

## 1. Purpose & scope

Replace "Mr. X phones the Production Manager" with a prioritised digital queue tied to confirmed sales demand, and capture what the factory actually produced and wasted.

In scope: Recipe/BOM master · demand-to-production planner (net requirement) · Work Orders · raw-material check and issue · yield & wastage logging · labour attendance/allocation log · Kanban board · packaging lot numbers.

Out of scope: stock quantities (M3 posts them on M4's instruction), procurement (M2 receives raw-material shortage requisitions), pricing.

> **Progressive enrichment (§9.3):** launch with **single-level BOMs**. `bom_lines.raw_material_item_id` may point at an intermediate `PROCESSED_FG` item later, giving multi-level recipes with no schema change.

---

## 2. Roles & permissions

| Role | Can | Cannot |
| --- | --- | --- |
| PROD_MGR | View demand queue; start/complete Work Orders; log RM consumption, output, wastage, headcount; request raw-material replenishment | See customer prices/ledgers; write off wastage >5% of standard BOM without owner approval |
| OWNER | Approve abnormal wastage write-offs; edit BOMs | — |
| OPS_COORD | View production status for promising delivery dates | Start/complete Work Orders |
| STOREKEEPER (factory store) | Issue raw materials against a Work Order | — |

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`bom_headers`** | `id` PK · `finished_item_id` FK · `standard_batch_output_qty` · `expected_wastage_pct` · `is_active` | BP |
| ↳ added | `version_no` · `standard_batch_input_weight_kg` (for yield maths) · `std_labour_hours` · `effective_from` | ADD |
| **`bom_lines`** | `id` PK · `bom_id` FK · `raw_material_item_id` FK · `required_qty_per_batch` | BP |
| ↳ added | `line_type` (`RAW` \| `PACKAGING`) · `uom` | ADD |
| **`production_requisitions`** | `id` · `req_no` · `source_order_line_id` · `finished_item_id` · `net_qty` · `required_by` · `status` (`OPEN` \| `PLANNED` \| `CANCELLED`) | ADD (BR-04) |
| **`production_work_orders`** | `id` PK · `wo_no` · `site_id` FK · `bom_id` FK · `finished_item_id` FK · `linked_sales_order_id` FK nullable · `planned_qty` · `actual_output_qty` · `wastage_qty` · `wo_status` (`PLANNED` \| `IN_PROGRESS` \| `COMPLETED`) · `assigned_manager_id` FK · `worker_headcount` · `scheduled_date` | BP |
| ↳ added | `CANCELLED` status · `stage` (`COOKING` \| `PROCESSING` \| `PACKING`) · `priority` · `required_by` · `batches_planned` · `started_at` · `completed_at` · `yield_variance_pct` · `variance_flag` | ADD |
| **`work_order_materials`** | `id` · `wo_id` · `item_id` · `planned_qty` · `issued_qty` · `returned_qty` · `batch_id` | ADD (G4) |
| **`work_order_outputs`** | `id` · `wo_id` · `item_id` · `qty` · `qty_secondary` · `output_batch_lot_no` · `packaging_lot_no` · `mfg_date` · `expiry_date` | ADD (Q7) |
| **`wastage_records`** | `id` · `wo_id` · `qty_kg` · `reason_code` · `note` · `photo_attachment_id` | ADD |
| **`labour_attendance_logs`** | `id` · `date` · `site_id` · `worker_name` · `present` · `wo_id` nullable · `hours` · `units_output` | ADD (§6.5) |

---

## 4. Business rules

### BR-04 (production side) — Requisition from demand
```
on stock.insufficient for PROCESSED_FG line:
    net_qty     = requires_production_qty − already_planned_qty   # avoids duplicates
    required_by = delivery_datetime − config.dispatch_buffer_hours  # 2 PM → 11 AM
    create production_requisition ; add to queue sorted by required_by, priority
```
Scenario F: order 200, stock 50 → net requirement **150**, required by 11:00.

### Batch planning
`batches = ceil(net_qty / bom.standard_batch_output_qty)`. Planner may round up and push surplus to FG stock (owner/PM choice).

### Raw-material availability check (at *Start Batch*)
For each BOM line: `required = required_qty_per_batch × batches`. Compare to RM-store ATP (via `InventoryPort`) across the factory site (and other sites if allowed).
- Enough → allow start.
- Short → block start, create `purchase_requisition` in M2 for the gap, show the PM which material and how much.

### BR-06 — Production Yield Tolerance
```
std_input   = Σ issued_qty (RM, converted to kg)     # mass balance basis
actual      = actual_output_qty + wastage_qty        # converted to kg
variance_pct = (actual − std_input) / std_input
if abs(variance_pct) > config.yield_variance_tolerance_pct:   # default ±3%
    raise YIELD_VARIANCE (Abnormal Yield alert) ; finished goods STILL post to stock
```
> Mass balance needs everything in a **common weight unit**. Output in cartons must be converted via standard carton weight. `[DECISION]` confirm the basis (issued RM vs BOM standard).

### Wastage write-off limit
Recorded wastage is allowed, but if `wastage_qty > wastage_writeoff_owner_approval_pct` (5%) of the BOM standard, an owner-approved `WASTAGE_WRITEOFF` exception is required before the stock write-off posts.

### Completion posting (atomic)
On **Complete Batch**, in one transaction: `PROD_CONSUME` for issued RM, `PROD_OUTPUT` for FG (with new batch/lot and expiry from `shelf_life_days`), wastage record, status `COMPLETED`; then emit `workorder.completed`.

---

## 5. Workflows & state machines

```
production_requisition OPEN ──(PM plans / auto-plan)──► Work Order PLANNED (= Kanban "Queued")
 PLANNED ──Start Batch (RM check ok)──► IN_PROGRESS [COOKING → PROCESSING → PACKING]
 IN_PROGRESS ──Complete Batch (output, wastage, lots)──► COMPLETED
 PLANNED|IN_PROGRESS ──cancel──► CANCELLED (RM reservations released)
```

**Scenario F — full flow**
1. Confirmed SO: 200 cartons Item P, tomorrow 2 PM. FG stock 50 (M3 reserves 50).
2. Requisition 150 appears at the top of the PM tablet queue: *Required By: Tomorrow 11:00 AM*.
3. PM opens it: RM availability shown green/red across sites.
4. **Start Batch** → picks headcount → stage moves as the PM taps.
5. **Complete Batch** → enters actual output, wastage kg, packaging lot no. → stock posts.
6. `workorder.completed` → M1 order `READY` → Dispatch notified "200 cartons ready to load".

---

## 6. Screens (factory tablet, large buttons, no prices)

| # | Screen | Notes |
| --- | --- | --- |
| S1 | **Daily Production Board (Kanban)** | Columns: *Queued · In-Progress (Cooking/Processing/Packing) · Completed*; cards show item, qty, required-by countdown, linked order priority |
| S2 | **Work Order detail** | BOM lines, RM availability, Start/Complete, stage buttons, headcount |
| S3 | **Completion form** | Output qty (numeric keypad), wastage kg + reason (picker), packaging lot no., photo optional |
| S4 | **Raw-material request** | Pick shortage item/qty → creates requisition |
| S5 | **Attendance & labour log** | Tick who is present; assign to Work Order; end-of-shift output |
| S6 | **BOM/Recipe master** | Owner/coordinator web; version history |

---

## 7. API (proposed)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET/POST | `/boms` · `/boms/{id}` | OWNER, OPS | New version rather than edit in place |
| GET | `/production/queue?site=` | PROD_MGR | No price fields |
| POST | `/work-orders` | PROD_MGR, OPS | From requisition |
| POST | `/work-orders/{id}/start` | PROD_MGR | RM check |
| PATCH | `/work-orders/{id}/stage` | PROD_MGR | |
| POST | `/work-orders/{id}/materials/issue` | STORE, PROD_MGR | |
| POST | `/work-orders/{id}/complete` | PROD_MGR | Idempotent |
| POST | `/attendance` | PROD_MGR | |
| POST | `/rm-requests` | PROD_MGR | → M2 requisition |

---

## 8. Events & ports

| Direction | Name | Detail |
| --- | --- | --- |
| Provides | `ProductionPort` | `createRequisition`, `workOrderStatus` |
| Consumes | `production.requisition_created` | Queue it |
| Consumes | `order.cancelled` / reservation changes | Re-plan or cancel WO |
| Consumes | `exception.resolved` (YIELD_VARIANCE, WASTAGE_WRITEOFF) | Close alert / post write-off |
| Publishes | `workorder.started` / `workorder.completed` | → M3, M1, M5 |
| Publishes | `rm.shortage` | → M2 requisition |
| Calls | `InventoryPort`, `ExceptionPort`, `NotifyPort` | |

---

## 9. Integrations, jobs & instrumentation

| Item | Detail |
| --- | --- |
| Job: late WO alert | Notify coordinator/owner if a WO nears `required_by` and is not started |
| Analytics inputs | Yield %, wastage % by item/week, WO on-time % → M7b *Factory Yield & Wastage Trend* |
| Phase 2 | Machine downtime/OEE, biometric attendance, batch cost with overhead absorption |

---

## 10. Acceptance criteria

1. **Scenario F:** order 200, stock 50 → one requisition of 150 appears with `Required By` = delivery time − buffer.
2. A second order for the same item does not duplicate requisitions already planned (net quantity logic).
3. *Start Batch* is blocked with a clear shortage message when RM is insufficient and creates an M2 requisition.
4. *Complete Batch* creates matching `PROD_CONSUME` and `PROD_OUTPUT` ledger rows in one transaction; failure rolls back everything.
5. Variance of +4% against a ±3% tolerance raises a `YIELD_VARIANCE` alert **and** the FG still enters stock.
6. Wastage of 6% of standard requires owner approval before write-off posts; 4% does not.
7. API responses to PROD_MGR contain no price, cost or customer-ledger fields (contract test).
8. Completion posts `workorder.completed` and the linked sales order becomes `READY`.
9. Replaying the same *Complete* request (retry/offline) does not double-post.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| Basic BOM/recipe master; sales-to-production demand queue; tablet Work Order closure (output + wastage) | Machine downtime & OEE; biometric attendance link; granular batch costing with overhead absorption |

---

## 12. Open questions

- `[DECISION]` Yield basis for BR-06: issued raw material vs BOM standard?
- `[DECISION]` Is production make-to-order only, or also make-to-stock for fast movers?
- `[DECISION]` Standard carton/crate weights for converting output to kg.
- Is stage tracking (cooking/processing/packing) needed in MVP or only Queued/In-Progress/Done?
- How many parallel batches can the factory run at once (capacity limit for planning)?

---

## 13. Build checklist

> **Traceability & Evidence:** See [`docs/BLUEPRINT_TRACEABILITY_MATRIX.md`](../BLUEPRINT_TRACEABILITY_MATRIX.md#6-m4-factory-production-traceability).

- [x] `[M4-CHK-01]` Migrations: `bom_headers`, `bom_lines`, `production_requisitions`, `production_work_orders`, `work_order_materials`, `work_order_outputs`, `wastage_records`, `labour_attendance_logs`
- [x] `[M4-CHK-02]` BOM service with versioning
- [x] `[M4-CHK-03]` Requisition planner (net qty, required-by, dedupe) + `ProductionPort`
- [x] `[M4-CHK-04]` RM availability check + shortage → M2 requisition
- [x] `[M4-CHK-05]` Work Order state machine (start/stage/complete/cancel)
- [x] `[M4-CHK-06]` Completion transaction (M3 postings, yield check, wastage rules)
- [x] `[M4-CHK-07]` Attendance log (`apps/tablet` digital log verified; biometric terminal deferred DEF-03)
- [x] `[M4-CHK-08]` Tablet Kanban + completion forms (large buttons, local language in `apps/tablet`)
- [x] `[M4-CHK-09]` Masking tests · late-WO job
- [x] `[M4-CHK-10]` Acceptance tests §10 (+ Scenario F end-to-end verified in `m4-acceptance.spec.ts`)
