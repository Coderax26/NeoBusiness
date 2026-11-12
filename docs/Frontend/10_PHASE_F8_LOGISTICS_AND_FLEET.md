# Phase F8 — Logistics, Fleet & Delivery

> **Duration:** 3 weeks · **Release:** R2 · **Depends on:** F4, F6 · **Backend:** M5 Fleet (✅), M6 COD/invoice (✅)

## 1. Goal

Help the coordinator **plan trips visually, dispatch with the right documents, watch deliveries live and close trips cleanly** (BR-08), while the owner sees trucks on the road at a glance.

---

## 2. Screens

### 2.1 Logistics home / Dispatch board (`/logistics/dispatch`)
| Widget | Content | API |
|--------|---------|-----|
| KPI strip | Orders ready to dispatch · Trips loading · On road · Delivered today / total stops · Failed stops · COD to settle | ✅ `GET /trips?tripDate=`, `cod-settlements/pending`, status-matrix |
| Trip lanes | One row per trip: vehicle, driver, progress bar "Stop 4 of 9", status (Loading, In transit, Completed), last update time | ✅ `GET /trips`, `GET /trips/:id` |
| Map | Vehicle/stop markers by status (requires GPS from driver app) | 🟡 stop coordinates ✅ customer `gpsLatLng`; live vehicle location 🔴 G-FLT-3 |
| Alerts | Failed deliveries, disputes, issues reported, overdue trips | ✅ trip issues; exceptions `DELIVERY_DISPUTE` |
| Refresh | 30 s polling (OD-021) | |

### 2.2 Plan trips — Trip builder (`/logistics/trips/new`)
```
┌ Ready orders (14) ───────┬ Trip: MH12-AB-1234 · Driver Raju ───────┬ Map ────────────┐
│ Filter: Area ▾ Window ▾  │ Capacity ▓▓▓▓▓▓▓░░ 1,450 / 2,000 kg       │   ① ② ③          │
│ ☐ SO-0042 ABC  500 kg ⚠  │ 1. ABC Traders   500 kg  10–12  ⠿        │   route preview  │
│ ☐ SO-0043 XYZ  300 kg    │ 2. XYZ Stores    300 kg  12–2   ⠿        │                  │
│ ...                      │ 3. ...                                   │                  │
│ [Add selected →]         │ ⚠ SO-0042 on credit hold                 │                  │
└──────────────────────────┴──────────────────────────────────────────┴──────────────────┘
                                   [Save trip]   [Generate challans]   [Dispatch ▶]
```
| Feature | API |
|---------|-----|
| Ready orders pool (status READY) with filters (area, site, delivery window, weight) | ✅ `GET /orders?status=READY` |
| Drag orders into trip; reorder stops by drag; auto-suggest sequence by distance 🔵 | UI |
| Vehicle & driver pickers; **capacity meter** (kg / crates) | ✅ `GET /vehicles`; driver list 🔴 G-ADM-1 users by role |
| Warnings: credit hold, not READY, over capacity — block dispatch with reason | ✅ order/credit data |
| Save trip | ✅ `POST /trips` (`CreateTripDto` with stops & lines) |
| Generate challans per stop; **e-way bill reference** field when value ≥ ₹50,000 (OD-005, manual) | ✅ `POST /trips/:tripId/stops/:stopId/challan` |
| Print pack: challans + invoices (invoice at dispatch, OD-003) | ✅ challan PDF, `invoices/:id/pdf` |
| Dispatch (enabled after loading confirmed) with dispatch quantities | ✅ `POST /trips/:id/dispatch` |

### 2.3 Trips list & detail (`/logistics/trips`, `/:id`)
- List: date, trip no., vehicle, driver, stops, status, value (owner/coord), COD collected.
- Detail tabs: **Stops** (each with status Delivered / Partly / Failed, ePOD photo/signature view, returned lines, reason), **Documents** (challans, invoices), **Cash** (COD collected vs expected), **Expenses**, **Issues**, **Timeline**.
- ✅ `GET /trips/:id`, challan PDF. ePOD media 🔴 G-FILE-1.

### 2.4 Close trip (BR-08) (`/logistics/trips/:id/close`)
Checklist with green/red rows: All stops resolved · Returns logged · COD cash handed over · Expenses entered · Issues resolved → **Close trip** enabled only when all green; each red row links to fix. ✅ `POST /trips/:id/close` (server validates; UI mirrors blockers).

### 2.5 Delivery issues desk (`/logistics/issues`)
List of reported issues (damage, short, customer absent, wrong item, dispute) with photos; resolve with outcome (redeliver, credit note, write-off). ✅ `POST /trips/:id/issues`, `POST /issues/:id/resolve`; list 🟡 G-FLT-4.

### 2.6 Trip expenses (`/logistics/expenses`)
Fuel, toll, loading, food, repair per trip; receipts photo; summary per vehicle/month. ✅ `POST /trips/:id/expenses`; list/report 🟡 G-FLT-4.

### 2.7 Vehicles (`/logistics/vehicles`)
Register (from F3) + utilisation (trips, km 🔴, load %), document expiry reminders (insurance, fitness, PUC) 🔴 G-FLT-1, maintenance log 🔵 F13.

### 2.8 Driver & collector monitoring (web)
Read-only views of each driver's current trip and each collector's worklist/wallet for coordinators. ✅ via trips, `custody/expected/:userId`.

---

## 3. UX notes for non-tech users

- Trip builder works by drag-and-drop *and* checkbox + "Add selected" for users not comfortable with dragging.
- Capacity meter changes colour; plain warning "This trip is 150 kg over the truck's limit".
- Close-trip checklist reads like a to-do list; nothing hidden.
- Stop status uses truck/check/cross icons and photos.

## 4. Acceptance criteria

1. Over-capacity or credit-hold orders show blocking warnings; Dispatch disabled until loading confirmed.
2. Challan generated per stop; e-way bill ref requested when stop value ≥ ₹50,000.
3. Dispatch board progress matches stop statuses and refreshes every 30 s.
4. Trip cannot be closed while any BR-08 blocker is red; each blocker links to the fixing screen.
5. COD collected per trip reconciles with COD settlement screen (F9).

## 5. Task checklist

- [ ] F8-01 Dispatch board (lanes, KPIs, alerts, map)
- [ ] F8-02 Trip builder (pool, canvas, capacity, warnings, save)
- [ ] F8-03 Challan generation + print pack + e-way ref
- [ ] F8-04 Dispatch flow
- [ ] F8-05 Trips list & detail with ePOD view
- [ ] F8-06 Close-trip checklist
- [ ] F8-07 Issues desk & expenses
- [ ] F8-08 Vehicle utilisation & reminders
- [ ] F8-09 Backend: G-FLT-1 vehicle update, G-FLT-2 loading confirm, G-FLT-3 live location, G-FLT-4 issues/expenses lists, G-ADM-1 users by role

