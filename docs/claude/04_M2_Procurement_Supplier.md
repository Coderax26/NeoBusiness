# M2 — Procurement & Supplier

**Build order:** 9th (Sprint 3) — but the **GRN document + blind receiving ships earlier with M3 (Sprint 2), without a PO link** (G10b)
**Depends on:** M0, M7a, M3 (stock posting), M1 (`PricingPort`) · **Stubs until built:** landed cost typed manually on M1's price sheet
**Blueprint refs:** §5.1 M2, BR-03, BR-05, Scenarios B & C, §6.3, §7.2(4), Open Q2/Q5

---

## 1. Purpose & scope

Make supplier price changes and short-shipments *system events* instead of urgent phone calls.

In scope: supplier master · rate card & volatility tracker · rate contracts · purchase requisitions · purchase orders · price-spike handler · shortfall handler with ranked backups · back-to-back trading PO · GRN document (blind) · supplier performance (fill rate, lead time) · supplier AP link.

Out of scope: stock posting itself (M3 posts when GRN is saved), payment mechanics (M6 owns AP ledger).

---

## 2. Roles & permissions

| Role | Can | Cannot |
| --- | --- | --- |
| OWNER | Approve spiked POs, non-standard rates, allocation decisions | — |
| OPS_COORD | Create POs from approved vendor rates; log confirmed quantities; issue backup POs inside tolerance | Issue PO above price-variance threshold without approval |
| STOREKEEPER | Record **blind GRN** (actual quantities only) | See PO quantity, unit price or supplier rate |
| PROD_MGR | Raise purchase requisition for raw materials | See supplier prices |

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`suppliers`** | `id` PK · `company_name` · `phone` · `reliability_score_pct` · `current_ap_balance` | BP |
| ↳ added | `whatsapp_no` · `payment_terms_days` · `gstin` · `lead_time_days_avg` · `is_approved` · `is_active` | ADD |
| **`supplier_items`** | `supplier_id` · `item_id` · `is_primary` · `pack_size` · `min_order_qty` | ADD |
| **`supplier_rate_quotes`** | `id` · `supplier_id` · `item_id` · `quoted_price` · `quoted_at` · `valid_until` · `source` (`CALL` \| `WHATSAPP` \| `PO`) | ADD (§6.3 volatility tracker) |
| **`rate_contracts`** | `id` · `supplier_id` · `item_id` · `agreed_price` · `valid_from` · `valid_to` · `approved_by` | ADD (§5.1 "Rate Contracts") |
| **`purchase_requisitions`** | `id` · `req_no` · `item_id` · `qty` · `needed_by` · `source` (`PRODUCTION` \| `SALES_ORDER` \| `MANUAL`) · `source_ref_id` · `status` (`OPEN` \| `PO_CREATED` \| `CANCELLED`) | ADD |
| **`purchase_orders`** | `id` PK · `po_no` · `supplier_id` FK · `receiving_site_id` FK · `po_status` (`DRAFT` \| `PENDING_APPROVAL` \| `ISSUED` \| `PARTIALLY_RECEIVED` \| `CLOSED`) · `total_amount` | BP |
| ↳ added | `CANCELLED` status · `linked_sales_order_id` (back-to-back) · `expected_delivery` · `parent_po_id` (backup/split PO) · `approved_by` | ADD |
| **`purchase_order_lines`** | `id` PK · `po_id` FK · `item_id` FK · `ordered_qty` · `confirmed_qty` · `received_qty` · `unit_price` · `last_purchase_price_snapshot` | BP |
| ↳ added | `price_variance_pct` · `shortfall_qty` (derived) | ADD |
| **`goods_receipts`** | `id` · `grn_no` · `po_id` (nullable until Sprint 3) · `supplier_id` · `site_id` · `location_id` · `received_by` · `received_at` · `gps_lat_lng` | ADD (G4) |
| **`goods_receipt_lines`** | `grn_id` · `item_id` · `received_qty` · `received_qty_secondary` · `batch_lot_no` · `mfg_date` · `expiry_date` · `condition_note` | ADD |
| **`po_shortfalls`** | `id` · `po_line_id` · `deficit_qty` · `status` (`OPEN` \| `COVERED_BY_BACKUP` \| `ALLOCATED` \| `WRITTEN_OFF`) · `resolution_po_id` | ADD |
| **`supplier_bills`** | `id` · `supplier_id` · `bill_no` · `po_id` · `amount` · `due_date` · `status` | ADD (Phase 2 3-way match; AP in M6) |

> `last_purchase_price_snapshot` is copied onto the PO line when the line is created so BR-03 always compares against the price known at that moment.

---

## 4. Business rules

### BR-03 — Supplier Price Variance
```
on PO line save:
    last = latest ISSUED/CLOSED unit_price for (supplier,item)   # or item-wide if none
    variance = (unit_price - last) / last
    if variance > config.supplier_price_variance_pct:           # default 2%
        PO.status = PENDING_APPROVAL ; lock
        ExceptionPort.raise(SUPPLIER_PRICE_SPIKE, po, payload)
        PricingPort → find open quotes/orders for item whose margin
                      at new cost < threshold → add to payload
```
Card payload (Scenario B): supplier, item, old → new price, % change, count of open customer orders/quotes that drop below threshold, current vs suggested floor, buttons **Approve PO** / **Approve PO & update floor** / **Reject**.

### BR-05 — Blind Receiving & Shortfall (shared with M3)
- GRN screen shows **item name and a quantity box only**. No PO quantity, no price.
- On save: `received_qty` stored; if linked PO line and `received_qty < confirmed_qty` (beyond `supplier_shortfall_exception_pct`) → create `po_shortfalls` row and raise `SUPPLIER_SHORTFALL`.

### Shortfall resolution (Scenario C)
1. Coordinator enters `confirmed_qty` (e.g. 600 of 1,000). Deficit = 400.
2. **Ranking of backups:** approved suppliers for the item with a current quote, ordered by (a) price within tolerance of the primary, (b) `reliability_score_pct` desc, (c) `lead_time_days_avg` asc.
3. If backups cover the deficit within price tolerance → system drafts secondary PO(s); coordinator issues them.
4. If total supply is short → raise `ALLOCATION` exception; owner decides which customers get full vs partial (M1 orders updated accordingly).

### Back-to-back trading PO (§6.3)
From a confirmed trading `sales_order_line`, **one click** creates a draft PO with `linked_sales_order_id` and shows the **net trading spread** (₹ and %) = sale price − PO price.

### Supplier performance
`fill_rate = Σ received_qty / Σ confirmed_qty` (rolling 90 days) · `avg_lead_time` · `price_inflation = Δ unit_price over 30/90 days`. Feeds `reliability_score_pct`.

---

## 5. Workflows & state machines

```
PO:  DRAFT ─► (price OK) ─────────────► ISSUED ─► PARTIALLY_RECEIVED ─► CLOSED
        └──► PENDING_APPROVAL ─approve─┘            (GRN posted)
                     └─reject─► CANCELLED
```
- **Blind GRN flow:** Storekeeper selects supplier/PO (Sprint 3) or free receipt (Sprint 2) → counts items → enters qty + batch/expiry → submit → `grn.posted` → M3 posts stock → M2 updates `received_qty`, PO status, shortfall check.
- **Requisition flow:** Production/Sales demand → requisition → coordinator groups into PO per supplier.

---

## 6. Screens

| # | Screen | User |
| --- | --- | --- |
| S1 | Supplier master & rate card (price history sparkline, fill rate, lead time) | Coordinator, Owner |
| S2 | PO builder (supplier → lines; shows last price, variance badge, spread for back-to-back) | Coordinator |
| S3 | Shortfall workbench (deficit, ranked backups, affected orders, "Create backup PO") | Coordinator |
| S4 | **Blind GRN** (tablet/phone: big quantity keypad, batch/expiry, photo of delivery note) | Storekeeper |
| S5 | Requisitions list | Coordinator, Prod. Mgr |
| S6 | Supplier scorecard | Owner |

---

## 7. API (proposed)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET/POST | `/suppliers`, `/suppliers/{id}/rates` | OPS, OWNER | Rates hidden from STOREKEEPER |
| POST | `/pos` · `/pos/{id}/lines` | OPS | Runs BR-03 |
| POST | `/pos/{id}/issue` | OPS | Blocked while `PENDING_APPROVAL` |
| POST | `/pos/{id}/confirm-quantities` | OPS | Creates shortfall |
| GET | `/shortfalls/{id}/backups` | OPS | Ranked suppliers |
| POST | `/orders/{lineId}/back-to-back-po` | OPS | |
| POST | `/grns` | STOREKEEPER | **Request/response omit PO qty & price** |
| GET | `/suppliers/{id}/performance` | OWNER, OPS | |

---

## 8. Events & ports

| Direction | Name | Detail |
| --- | --- | --- |
| Publishes | `po.price_spike_detected` | → M7 card; M1 flags quotes/orders |
| Publishes | `po.shortfall_detected` | → M7; M3 |
| Publishes | `grn.posted` | Shared with M3/M6 |
| Consumes | `order.confirmed` | Suggest back-to-back PO for trading lines with no stock |
| Consumes | `production.requisition_created` / `rm.shortage` | Create purchase requisition |
| Consumes | `exception.resolved` | SPIKE / SHORTFALL / ALLOCATION |
| Provides | `ProcurementPort` | `latestLandedCost`, `createBackToBackPO`, `suggestBackups` |
| Calls | `PricingPort`, `InventoryPort`, `ExceptionPort`, `NotifyPort` | |

---

## 9. Integrations, jobs & instrumentation

| Item | Detail |
| --- | --- |
| WhatsApp | PO PDF to supplier on `ISSUED` (Phase 2: RFQ broadcast) |
| Landed cost | `latest_landed_cost = latest GRN/PO unit price + allocated freight/handling` → written to M1 price sheet suggestions |
| Job: supplier score | Nightly recompute of fill rate, lead time, reliability |
| Job: stale rate alert | Rates older than N days flagged on S1 |

---

## 10. Acceptance criteria

1. **Scenario B:** last price ₹50, PO line at ₹56 (+12%) → PO locked `PENDING_APPROVAL`; card states +12%, number of affected open orders, current vs suggested floor; "Approve PO & update floor" sets floor and issues the PO in one action.
2. A +1.5% change (below the 2% threshold) issues without any exception.
3. **Scenario C:** PO 1,000 kg, confirmed 600 → 400 kg deficit; backups ranked B (₹51) before C (₹52); issuing a backup PO closes the shortfall as `COVERED_BY_BACKUP`.
4. If backups cannot cover the deficit, an `ALLOCATION` card is raised and affected orders are listed.
5. The Storekeeper API payload for a GRN contains **no** `ordered_qty`, `confirmed_qty` or price fields (contract test).
6. Receiving 580 kg against 600 kg confirmed raises `SUPPLIER_SHORTFALL` (threshold-aware).
7. One-click back-to-back PO shows the correct spread in ₹ and %.
8. Fill rate and lead time update after a GRN posts.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| Supplier master & last-purchase-price memory; PO with price-spike and shortfall alerts; blind mobile GRN | Supplier portal / WhatsApp RFQ broadcast for spot bidding; 3-way match (PO vs GRN vs bill) with OCR; automatic reorder-point POs |

---

## 12. Open questions

- `[DECISION]` Is the price-spike baseline *last PO price from the same supplier* or *last purchase price for the item overall*?
- `[DECISION]` Backup-supplier tolerance: how far above the primary price is still "within tolerance"?
- `[DECISION]` How are freight and handling allocated into landed cost (flat per kg, per trip, per PO)?
- Are there supplier rate contracts today, or all spot buying?
- Do suppliers deliver to more than one site per PO?

---

## 13. Build checklist

- [ ] Migrations: `suppliers`, `supplier_items`, `supplier_rate_quotes`, `rate_contracts`, `purchase_requisitions`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `goods_receipt_lines`, `po_shortfalls`, `supplier_bills`
- [ ] **Sprint 2:** GRN (no PO link) + blind-receiving serialiser + `grn.posted`
- [ ] **Sprint 3:** PO service with BR-03 and `last_purchase_price_snapshot`
- [ ] Link GRN ↔ PO; update `received_qty`; shortfall detection
- [ ] Backup-supplier ranking service
- [ ] Back-to-back PO generator with spread
- [ ] Supplier performance job and scorecard
- [ ] `ProcurementPort` (replace manual landed cost in M1)
- [ ] Screens S1–S6 · acceptance tests §10 (+ Scenarios B, C)
