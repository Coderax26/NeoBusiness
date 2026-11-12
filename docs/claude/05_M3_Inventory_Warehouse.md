# M3 — Multi-Site Inventory & Warehouse

**Build order:** 5th (Sprint 2) · **Depends on:** M0, M7a · **Replaces stub:** `InventoryPort`
**Blueprint refs:** §5.1 M3, BR-04, BR-05 (stock side), §6.4, §7.2(4), §7.3(2), Open Q8

---

## 1. Purpose & scope

One trustworthy answer to *"how much can we promise, where?"* — physical vs committed stock per site, per location, per batch, with expiry.

In scope: location-segregated stock ledger · Available-to-Promise (ATP) · reservations on order confirmation · batch/lot & expiry (FEFO) · dual unit of measure / catch weight · inter-site transfers · GRN stock posting · dispatch/return postings · stock adjustments with approval.

Out of scope: the GRN *document* and PO matching (M2), production consumption decisions (M4 calls M3 to post), delivery capture (M5).

---

## 2. Roles & permissions

| Role | Can | Cannot |
| --- | --- | --- |
| STOREKEEPER | Blind GRN; load vehicles against manifests; create/receive transfers; request adjustments | See supplier prices; approve own variances |
| PROD_MGR | See RM and FG stock at the factory; consume/produce via M4 | See prices/values |
| OPS_COORD | View ATP across sites; manual reservation release | Post adjustments |
| OWNER | Approve adjustments; consolidated view across sites | — |

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`inventory_batches`** | `id` PK · `site_id` FK · `item_id` FK · `batch_lot_no` · `physical_qty` · `committed_qty` · `mfg_date` · `expiry_date` | BP |
| ↳ added | `location_id` FK (RM store / FG store / warehouse / vehicle) · `physical_qty_secondary` · `status` (`AVAILABLE` \| `QUARANTINE` \| `EXPIRED`) | ADD (G5, G6) |
| **`stock_ledger_txns`** *(append-only)* | `id` PK · `site_id` FK · `item_id` FK · `batch_id` FK · `txn_type` (`GRN` \| `PROD_CONSUME` \| `PROD_OUTPUT` \| `SALE_DISPATCH` \| `RETURN` \| `TRANSFER` \| `ADJUSTMENT`) · `qty_delta` · `reference_doc_id` · `created_at` | BP |
| ↳ added | `location_id` · `qty_delta_secondary` · `reverses_txn_id` (nullable) · `created_by` · extra `txn_type` values: `TRANSIT_OUT`, `TRANSIT_IN`, `DELIVERY_CONFIRM`, `REVERSAL` | ADD |
| **`stock_reservations`** | `id` · `order_line_id` · `batch_id` · `location_id` · `reserved_qty` · `status` (`ACTIVE` \| `RELEASED` \| `FULFILLED`) · `reserved_at` | ADD |
| **`stock_transfers`** | `id` · `transfer_no` · `from_location_id` · `to_location_id` · `status` (`DRAFT` \| `IN_TRANSIT` \| `RECEIVED` \| `CANCELLED`) · `created_by` · `received_by` | ADD |
| **`stock_transfer_lines`** | `transfer_id` · `item_id` · `batch_id` · `sent_qty` · `received_qty` · `variance_reason` | ADD |
| **`stock_adjustments`** | `id` · `location_id` · `item_id` · `batch_id` · `qty_delta` · `reason_code` · `status` (`REQUESTED` \| `APPROVED` \| `REJECTED` \| `POSTED`) · `requested_by` · `approved_by` | ADD |
| **`uom_conversions`** | owned by M1 — M3 reads | — |

**Why a reservations table?** The blueprint keeps only a `committed_qty` number. Per-order reservation rows let you release exactly what an order held, re-allocate between customers (Allocation Card), and explain every committed unit.

**Cached vs truth:** `inventory_batches.physical_qty` and `committed_qty` are caches maintained in the **same transaction** as the ledger/reservation write. A nightly job recomputes from `stock_ledger_txns` and flags drift.

---

## 4. Business rules

### BR-04 — Hard Inventory Allocation (ATP)
```
Available_Stock(item, site) = Σ physical_qty − Σ committed_qty   (AVAILABLE, non-expired batches)
```
On `order.confirmed`, for each line, inside one transaction:
```
BEGIN;
  SELECT ... FROM inventory_batches
   WHERE site_id = :site AND item_id = :item AND status='AVAILABLE'
         AND expiry_date >= :delivery_date
   ORDER BY expiry_date ASC                       -- FEFO
   FOR UPDATE;
  allocate across batches until qty satisfied → INSERT stock_reservations; UPDATE committed_qty
  allocated = Σ reserved ; deficit = qty − allocated
COMMIT;
emit stock.reserved(allocated) ; if deficit>0 and item.category = PROCESSED_FG
    → ProductionPort.createRequisition(line, deficit, requiredBy)
    → else (TRADED_GOOD) emit stock.insufficient → M2 back-to-back PO suggestion
```
- Row locks (or `SERIALIZABLE`) prevent double-allocation of the same kilo.
- A batch whose expiry is earlier than the delivery date is never reserved.

### FEFO & expiry
- Picking/allocation order: earliest expiry first.
- Alert tiers (config): e.g. 30 / 14 / 7 days to expiry → notify Storekeeper/Coordinator; at expiry → batch `EXPIRED`, excluded from ATP.

### Dual unit of measure (catch weight)
Quantities are stored in the item's **primary UoM**, with the **secondary** quantity stored alongside (e.g. 40 crates ↔ 812.4 kg). Conversions: fixed factor via `uom_conversions`, or actual weight for `is_catch_weight` items.

### Ledger discipline (§7.3)
- Stock moves **only** by inserting into `stock_ledger_txns`. No direct update of quantities.
- Corrections post a `REVERSAL` row referencing the original, then a fresh correct row.

### Stock movement map
| Event | Ledger rows |
| --- | --- |
| GRN posted | `GRN` +qty at receiving location |
| Production consume / output (from M4) | `PROD_CONSUME` −RM at RM store; `PROD_OUTPUT` +FG at FG store |
| Vehicle loaded (M5) | `SALE_DISPATCH` −qty at site, `TRANSIT_IN` +qty at vehicle location; reservation → `FULFILLED` |
| Delivered (M5) | `DELIVERY_CONFIRM` −qty at vehicle location (stock leaves the business) |
| Returned/undelivered (M5) | `RETURN` +qty back to site (or `QUARANTINE` if damaged) |
| Inter-site transfer | `TRANSFER` −qty at source, `TRANSIT_*`, `TRANSFER` +qty at destination on receipt |
| Adjustment | `ADJUSTMENT` ± qty — only after owner approval |

### Variance rule
Storekeepers cannot change stock to fix a variance; they raise a `stock_adjustments` request → `STOCK_VARIANCE` exception → owner approves → ledger posts.

---

## 5. Workflows & state machines

```
Reservation:  ACTIVE ──(vehicle loaded)──► FULFILLED
                 └───(order cancelled / re-allocated)──► RELEASED

Transfer:  DRAFT ─► IN_TRANSIT ─► RECEIVED (variance>0 → STOCK_VARIANCE exception)
                └──► CANCELLED

Adjustment: REQUESTED ─► APPROVED ─► POSTED   |   REQUESTED ─► REJECTED
```

**Scenario F (stock check part):** SO needs 200 cartons of Item P; FG Store ATP = 50 → reserve 50 (FEFO), deficit 150 → `ProductionPort.createRequisition(150, requiredBy = delivery − dispatch_buffer_hours)`.

---

## 6. Screens

| # | Screen | User |
| --- | --- | --- |
| S1 | **Stock by location** — physical / committed / available, per item and batch; filter by site | Coordinator, Owner |
| S2 | **Expiry watchlist** — batches sorted by days left, colour-coded | Storekeeper, Coordinator |
| S3 | **Blind GRN capture** (shared with M2 S4) | Storekeeper |
| S4 | **Vehicle loading** — checklist against Trip Manifest (item, qty, batch) | Storekeeper |
| S5 | **Transfers** — create, send, receive with variance entry | Storekeeper |
| S6 | **Adjustment requests** | Storekeeper (request) / Owner (approve) |
| S7 | **Ledger explorer** — every movement for an item/batch | Owner, Coordinator |

---

## 7. API (proposed)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET | `/stock?site=&location=&item=` | OPS, OWNER, STORE | Site-scoped by RLS |
| GET | `/atp?item=&site=&date=` | OPS | Used by M1 live chips |
| POST | `/reservations` · `/reservations/{id}/release` | internal / OPS | Called by `InventoryPort` |
| POST | `/grn-postings` | internal | From `grn.posted` |
| POST | `/dispatch-postings` · `/return-postings` | internal | From M5 |
| POST/PATCH | `/transfers` · `/transfers/{id}/send` · `/receive` | STORE | |
| POST | `/adjustments` · `/adjustments/{id}/approve` | STORE / OWNER | |
| GET | `/ledger?item=&batch=&from=&to=` | OWNER, OPS | |

---

## 8. Events & ports

| Direction | Name | Detail |
| --- | --- | --- |
| Provides | `InventoryPort` | `checkATP`, `reserve`, `release`, `postDispatch`, `postReturn`, `postGRN` |
| Consumes | `order.confirmed` | Reserve |
| Consumes | `order.cancelled` | Release |
| Consumes | `grn.posted` | Post `GRN` rows |
| Consumes | `workorder.started/completed` | Post `PROD_CONSUME` / `PROD_OUTPUT` |
| Consumes | `trip.loaded`, `delivery.*` | Dispatch, delivery confirm, return |
| Consumes | `exception.resolved` (STOCK_VARIANCE) | Post or reject adjustment |
| Publishes | `stock.reserved`, `stock.insufficient` | → M1, M4, M2 |
| Publishes | `production.requisition_created` | via `ProductionPort` |
| Publishes | `stock.low` / `stock.expiring` | → M7 stock alerts |

---

## 9. Integrations, jobs & instrumentation

| Item | Detail |
| --- | --- |
| Job: expiry sweep | Daily 06:00: mark expired batches, send alerts |
| Job: drift check | Nightly: recompute `physical_qty`/`committed_qty` from ledger; alert on mismatch |
| Job: stale reservation | Release reservations on orders cancelled/expired |
| Phase 2 | Barcode/QR labels and handheld scanners; Bluetooth/RS232 scale integration |

---

## 10. Acceptance criteria

1. Two coordinators confirming orders for the last 100 kg at the same moment → only one succeeds in full; ATP never goes negative (concurrency test).
2. ATP = physical − committed per site, and updates immediately after reserve/release.
3. A reservation always picks the earliest-expiry batch first and never a batch expiring before the delivery date.
4. **Scenario F:** stock 50, order 200 → reservation 50 + requisition for 150 with correct `Required By`.
5. Any attempt to `UPDATE stock_ledger_txns` fails; a `REVERSAL` row restores balance and keeps the original.
6. Vehicle load → stock appears in the vehicle's `VEHICLE` location; delivery confirm clears it; return puts it back.
7. A transfer received short raises a variance request instead of silently changing stock.
8. A Storekeeper at Site B cannot see Site A stock (RLS).
9. Nightly drift job reports zero drift after the above tests.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| Multi-site ledger (physical vs committed ATP); batch/expiry tracking; inter-site transfer workflow | Barcode/QR label printing & handheld scanners; digital weighing-scale integration |

---

## 12. Open questions

- `[DECISION]` Expiry alert thresholds per category (days).
- `[DECISION]` Is a damaged/returned batch auto-quarantined or re-sellable?
- `[DECISION]` Reserve across *multiple sites* for one order, or only the fulfilment site?
- How are open-bag/crate partial quantities handled for loose commodities?
- Physical stock-count cycle (weekly/monthly) — needed in MVP?

---

## 13. Build checklist

> **Traceability & Evidence:** See [`docs/BLUEPRINT_TRACEABILITY_MATRIX.md`](../BLUEPRINT_TRACEABILITY_MATRIX.md#5-m3-inventory--warehouse-traceability).

- [x] `[M3-CHK-01]` Migrations: `inventory_batches`, `stock_ledger_txns` (+ append-only triggers), `stock_reservations`, `stock_transfers`, `stock_transfer_lines`, `stock_adjustments`
- [x] `[M3-CHK-02]` Ledger posting service (single entry point; updates cached qty in-transaction)
- [x] `[M3-CHK-03]` ATP query + `InventoryPort` (swap out stub in M1)
- [x] `[M3-CHK-04]` FEFO reservation algorithm with row locking + concurrency test (verified in `p4-production-readiness.spec.ts`)
- [x] `[M3-CHK-05]` GRN posting handler (before M2 PO link exists)
- [x] `[M3-CHK-06]` Transfer workflow and variance handling
- [x] `[M3-CHK-07]` Adjustment request → exception → posting
- [x] `[M3-CHK-08]` Vehicle location handling (`VEHICLE` locations) for M5
- [x] `[M3-CHK-09]` Expiry/drift/stale-reservation jobs
- [x] `[M3-CHK-10]` Screens S1–S7 · acceptance tests §10 (+ Scenario F stock part verified in `m3-acceptance.spec.ts`)
