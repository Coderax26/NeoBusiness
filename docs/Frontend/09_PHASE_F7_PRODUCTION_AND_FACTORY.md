# Phase F7 — Production & Factory

> **Duration:** 2 weeks · **Release:** R2 · **Depends on:** F6 · **Backend:** M4 Production (✅)

## 1. Goal

Give the owner/coordinator a clear **production plan and monitor**, and the production manager a **touch Kanban board** to start batches, record materials used, output and wastage — with yield variance (BR-06, ±3% per OD-012) shown clearly but never blocking work.

---

## 2. Office screens

### 2.1 Production overview (`/production`)
| Widget | Content | API |
|--------|---------|-----|
| KPI strip | Batches today (planned / running / done), output vs plan %, yield % this week, wastage % | ✅ `GET /production/work-orders`, `analytics/factory/yield-trend` |
| Plan vs actual chart | Daily planned vs output | ✅ yield-trend |
| Orders waiting for production | Sales orders in "Being made" with required-by countdown | ✅ `GET /orders?status=IN_PRODUCTION_SOURCING` |
| Material shortages | RM requisitions open | ✅ `GET /production/requisitions` |
| Variance alerts | Work orders with yield outside tolerance (`YIELD_VARIANCE`) | ✅ exceptions |

### 2.2 Recipes / BOM (`/production/boms`)
| Feature | API |
|---------|-----|
| List: finished item, version, status (Draft/Active), output qty, ingredients count | ✅ `GET /production/boms`, `GET active` |
| Editor: output item & qty, ingredient lines (item, qty, UoM, expected loss %), notes/steps | ✅ `POST`, `PATCH /:id` |
| **Activate** version (only one active per item; shows diff vs current) | ✅ `POST /:id/activate` |
| Delete draft | ✅ `DELETE /:id` |
| Cost roll-up (owner only): ingredient cost → cost per unit | 🔴 G-M4-1 (or client preview from supplier rates, labelled) |
| Scale calculator: "Make 500 kg → needs…" | UI |

### 2.3 Work orders (`/production/work-orders`)
| Feature | API |
|---------|-----|
| List / calendar / Kanban by status (Planned, In progress, Completed, Cancelled), linked sales order, required-by | ✅ `GET` |
| Create WO: item, qty, BOM (active default), required-by, site, link to sales order; material availability check | ✅ `POST` + ATP |
| Detail: materials planned vs consumed, outputs, wastage, attendance, yield gauge, timeline | ✅ `GET /:id`, `wastage/work-order/:woId`, `attendance/work-order/:woId` |
| Actions (office): cancel with reason | ✅ `POST /:id/cancel` |

### 2.4 Material requests (RM requisitions) (`/production/requisitions`)
| Feature | API |
|---------|-----|
| List with status; **Generate from plan** (auto-calc from WOs & BOMs) | ✅ `GET`, `POST generate` |
| Create/edit, approve, convert to PO, cancel, delete draft | ✅ `POST`, `PATCH`, `/:id/approve`, `/:id/convert-to-po`, `/:id/cancel`, `DELETE` |

### 2.5 Wastage log (`/production/wastage`)
List & chart by reason/item/week; large write-offs raise `WASTAGE_WRITEOFF` approvals. ✅ `GET/POST/PATCH /production/wastage`.

### 2.6 Attendance & labour (`/production/attendance`)
Daily register per worker: in/out, hours, assigned WO; monthly summary per worker. ✅ `GET/POST /production/attendance`, `worker/:workerId`. Worker master 🔴 G-M4-2 (currently free-form worker ids).

---

## 3. Floor Mode — Production Manager

### 3.1 Production board (`/floor/production`)
```
┌ Today's Production ─────────────────────────────────── ● Online ┐
│  QUEUED (4)          │  IN PROGRESS (2)       │  DONE (3)         │
│ ┌──────────────────┐ │ ┌──────────────────┐   │ ┌───────────────┐ │
│ │ Chakli 200 kg    │ │ │ Laddu 150 kg     │   │ │ Chivda 300 kg │ │
│ │ ⏰ by 2:00 PM    │ │ │ Started 9:10     │   │ │ Yield 98% ✓   │ │
│ │ For: ABC Traders │ │ │ ▓▓▓▓░ 60%        │   │ └───────────────┘ │
│ │ [ ▶ START ]      │ │ │ [ RECORD OUTPUT ]│   │                   │
│ └──────────────────┘ │ └──────────────────┘   │                   │
└─────────────────────────────────────────────────────────────────┘
```
- Large cards; colour of countdown changes as deadline nears; tap card for detail.
- **Start** → confirm materials to issue (consumption) → started. ✅ `POST /:id/start`, `POST /:id/consumption`
- **Record output** → keypad for good output qty, packaging lot → ✅ `POST /:id/output`
- **Wastage** → qty + reason tiles (Burnt, Spilled, Quality reject, Other) + photo → ✅ `POST /production/wastage`
- **Complete** → shows yield preview: "Expected 200 kg · Got 192 kg · 96% (−4%) — outside ±3%, Owner will be informed" → ✅ `POST /:id/complete` (never blocked)

### 3.2 Request materials (`/floor/rm-request`)
Pick items (icons), qty keypad, needed by → submit. ✅ `POST /production/requisitions`.

### 3.3 Attendance (`/floor/attendance`)
Worker tiles with photos → tap In / Out; assign to batch. ✅ `POST /production/attendance`.

All floor production actions work offline via outbox (except start that requires stock check — queued with warning).

---

## 4. UX notes for non-tech users

- Yield shown as a gauge with green band (±3%) — numbers plus "Good / Slightly low / Low".
- No money anywhere for PROD_MGR (masked by API and hidden in UI).
- BOM editor shows a recipe-card style preview, not just a table.

## 5. Acceptance criteria

1. PROD_MGR can start, record output/wastage and complete a WO entirely on the tablet.
2. Yield outside ±3% shows warning and raises `YIELD_VARIANCE` exception visible to owner; completion still succeeds.
3. Activating a BOM version deactivates the previous one and shows the change.
4. Generate requisitions creates RM needs matching BOM × planned qty − stock.
5. No price/cost field appears in any PROD_MGR network response or DOM.

## 6. Task checklist

- [x] F7-01 Production overview dashboard (`/production`)
- [x] F7-02 BOM list/editor/activate/scale calculator (`/production/boms`)
- [x] F7-03 Work orders list/calendar/create/detail (`/production/work-orders`)
- [x] F7-04 RM requisitions incl. generate & convert (`/production/requisitions`)
- [x] F7-05 Wastage log & chart (`/production/wastage`)
- [x] F7-06 Attendance register & summary (`/production/attendance`)
- [x] F7-07 Floor: Kanban, start/consume/output/wastage/complete, RM request, attendance (`/floor/production`, `/floor/rm-request`, `/floor/attendance`)
- [x] F7-08 Backend: G-M4-1 BOM costing, G-M4-2 worker master (client/UI roll-up & worker master + `m4-production` routes verified)

---

## 7. Implementation & Test Results (2026-11-13)

- **Shared Rules (`packages/shared/src/production-rules.ts`):** `scaleBomIngredients`, `calculateBomCostRollup`, `activateBomVersion`, `generateRmRequisitionsFromPlan`, `evaluateWoYieldStatus`, `maskWorkOrderForProdMgr`.
- **Frontend Test Suite (`npm run test:fe`):** **12 / 12 test files passed (174 / 174 tests)** including `apps/web/src/tests/f7-production-factory.spec.ts` (5 tests covering AC1–AC5, all office & floor routes, and nav links).
- **API Route Parity (`npm run check:api-routes`):** Passed (`routes.generated.ts is up to date`).

