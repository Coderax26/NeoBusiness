# Phase F6 — Inventory, Warehouse & Floor Mode

> **Duration:** 2 weeks · **Release:** R2 · **Depends on:** F5 · **Backend:** M3 Inventory (✅), M2 GRN (✅), M7b stock alerts (✅)

## 1. Goal

Show **what stock we have, where, and how fresh it is** in a clear visual way, and give storekeepers a **touch-first Floor Mode** for receiving, loading, transfers and adjustments — even with patchy Wi-Fi.

---

## 2. Office screens

### 2.1 Stock overview (`/inventory/stock`)
| Feature | Detail | API |
|---------|--------|-----|
| KPI strip | Stock value (owner only), items low on stock, expiring in 7 days, negative/drift alerts | ✅ `GET /inventory/stock/current`, `stock-alerts/counts` |
| Views | **By item** (total across sites) · **By site/location** · **By batch** | ✅ `stock/current` |
| Columns | Item, site, location, on hand, reserved, **available (ATP)**, UoM (dual), nearest expiry, status chip (OK / Low / Expiring / Expired) | ✅ |
| Visuals | Stock-level bar vs min stock; heat colour for expiry | UI |
| Drill-down | Item → batches (FEFO order) → movements | ✅ `ledger?itemId=` |
| Actions | Transfer, adjust, reserve/release (coordinator), print stock sheet | ✅ |

### 2.2 Check availability (ATP) (`/inventory/availability`)
Quick tool: pick item + site + date → available qty, reserved, incoming (POs), planned production. ✅ `GET /inventory/stock/atp` (incoming/planned 🟡 needs aggregation G-INV-2).

### 2.3 Batches & expiry (`/inventory/expiry`)
| Feature | API |
|---------|-----|
| Watchlist grouped: Expired · ≤ 3 days · ≤ 7 days · ≤ 30 days; threshold slider | ✅ `GET /inventory/expiry-watchlist?daysThreshold=` |
| Suggested action per batch: "Sell first", "Discount", "Write off" (→ adjustment request) | UI + ✅ adjustments |
| Calendar heatmap of expiries | UI |

### 2.4 Transfers (`/inventory/transfers`)
| Feature | API |
|---------|-----|
| List with status lifecycle (Draft → Dispatched → Received → Completed / Cancelled) | 🟡 needs `GET /inventory/transfers` list (G-INV-1) |
| Create: from site/location → to site/location, items & qty, batch picker (FEFO default) | ✅ `POST /inventory/transfers` |
| Dispatch / Receive (with received qty & variance) / Complete / Cancel | ✅ `POST /transfers/:id/dispatch|receive|complete|cancel` |

### 2.5 Adjustments (`/inventory/adjustments`)
| Feature | API |
|---------|-----|
| Request adjustment: item, batch, qty ±, reason (Damage, Expiry, Count difference, Spillage, Other), photo 🔴 | ✅ `POST /inventory/adjustments` |
| Approval queue for owner/coordinator with value impact (owner only) | 🟡 list needed (G-INV-1); ✅ `approve`, `reject` |
| Large variances raise `STOCK_VARIANCE` exception → appears in Approvals | ✅ |

### 2.6 Stock movements / ledger explorer (`/inventory/ledger`)
Filter by item, batch, site, type (GRN, Sale, Transfer, Production consumption/output, Adjustment, Reversal), date. Running balance column. Append-only: rows show "Reversed by…" links, no edit. ✅ `GET /inventory/ledger`.

### 2.7 Reservations (`/inventory/reservations`)
Which orders hold which batches; release with reason. ✅ `POST reservations`, `reservations/:id/release`; list 🟡 G-INV-1.

### 2.8 Stock count (cycle count) — standard ERP
Create count sheet (site/location/category) → print or count on tablet → enter counted qty → variance review → post as adjustments in bulk. 🔴 G-INV-3 (interim: export stock sheet + bulk adjustment requests).

### 2.9 Stock alerts (`/control/stock-alerts`)
Shared with F10: low stock, expiring, negative, stale/drift — by type with counts. ✅ `GET /stock-alerts`, `/counts`, `/by-type`.

---

## 3. Floor Mode (tablet, `(floor)` route group)

Design rules: landscape 10" tablet, **56 px+ targets**, 18 px+ text, icons + words, numeric keypad, one task per screen, no prices/costs ever, offline-tolerant.

### 3.1 Receive goods — Blind GRN (`/floor/grn`)
```
┌ Receive goods ───────────────────────────── ● Online · Last sync 10:02 ┐
│ Supplier: Sai Traders     PO: PO-2611-0021     Vehicle: MH12 AB 1234     │
├───────────────────────────────────────────────────────────────────────┤
│  🥫 Sugar 50kg bag       [   0   ] bags     Batch [____] Expiry [____]  │
│  🫘 Toor Dal 30kg bag    [   0   ] bags     Batch [____] Expiry [____]  │
├───────────────────────────────────────────────────────────────────────┤
│  📷 Photo of delivery note      📝 Notes                                  │
│                                      [  ✓ SAVE RECEIPT  ]                │
└───────────────────────────────────────────────────────────────────────┘
```
- Expected deliveries list → tap PO → item list only (**no ordered qty, no price**, BR-05).
- Big keypad for qty, batch & expiry pickers (expiry auto-suggested from shelf life).
- Photo of delivery note (G-FILE-1), damage flag per line.
- Offline: saved to outbox with idempotency key; syncs once.
- API ✅ `GET /procurement/grns/po/:poId/blind-view`, `POST /procurement/grns` (or `POST /inventory/grn`).

### 3.2 Load vehicle (`/floor/loading`)
Trips loading today → stop-wise item checklist with FEFO batch suggestion → tick each line / enter loaded qty → "Loading complete" (enables Dispatch in office). API 🟡 trip detail ✅ `GET /trips/:id`; loading confirmation endpoint 🔴 G-FLT-2 (or `trips/:id/dispatch` with `DispatchLineDto` performed by coordinator).

### 3.3 Transfers send/receive (`/floor/transfers`)
Incoming/outgoing lists → tap → confirm quantities with keypad → Dispatch / Receive. ✅ transfer actions.

### 3.4 Check stock (`/floor/stock`)
Search/scan item → qty by location & batch with expiry colours (qty only, masked). ✅ `stock/current`.

### 3.5 Report damage / adjustment (`/floor/adjustments`)
Pick item → batch → qty → reason tile → photo → submit for approval. ✅ `POST /inventory/adjustments`.

### 3.6 Offline behaviour
| Item | Spec |
|------|------|
| Badge | Online · Offline · Syncing (n) · Last synced time — always visible |
| Outbox | IndexedDB queue (reuse logic from `apps/tablet/src/index.ts`); each item has idempotency key |
| Allowed offline | GRN capture, loading ticks, transfer receive, adjustment request, production output/wastage (F7) |
| Not allowed offline | Approvals, pricing, confirmations — buttons disabled with reason |
| Failures | List of failed items with plain reason and "Retry"/"Edit" |
| Device clock | Sends `captured_at`; server flags > 5 min skew |

---

## 4. UX notes for non-tech users

- Stock shown with friendly units ("40 crates ≈ 812 kg").
- Expiry colours: green > 30 days, amber ≤ 7, red ≤ 3/expired, with words.
- Floor screens use item photos/icons; minimal typing; success screens with big ✓ and "Next delivery" button.
- Adjustments explain: "This needs approval because it changes stock value."

## 5. Acceptance criteria

1. Stock overview totals match `stock/current`; ATP = on hand − reserved.
2. Blind GRN: network responses and DOM have no `ordered_qty`/`unit_price` (automated test).
3. Offline GRN + transfer receive + adjustment sync exactly once after reconnect.
4. Ledger shows reversals linked, with no edit/delete controls.
5. Expiry watchlist threshold change updates list and counts.

## 6. Task checklist

- [ ] F6-01 Stock overview (3 views) + drill-down
- [ ] F6-02 ATP checker
- [ ] F6-03 Expiry watchlist + suggested actions
- [ ] F6-04 Transfers office screens
- [ ] F6-05 Adjustments request + approval queue
- [ ] F6-06 Ledger explorer
- [ ] F6-07 Reservations view
- [ ] F6-08 Floor Mode shell + offline outbox + badge
- [ ] F6-09 Floor: Blind GRN, Loading, Transfers, Stock lookup, Adjustments
- [ ] F6-10 Backend: G-INV-1 list endpoints, G-INV-2 ATP projection, G-INV-3 stock count, G-FLT-2 loading confirm, G-FILE-1

