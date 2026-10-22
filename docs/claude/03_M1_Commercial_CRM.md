# M1 — Commercial & CRM

**Build order:** 3rd (Sprint 1) · **Depends on:** M0, M7a (exceptions) · **Stubs:** `InventoryPort`, `ProcurementPort` (manual landed cost)
**Blueprint refs:** §5.1 M1, BR-01, BR-02, Scenario A, §6.1, §6.2, §7.2(2–3), Open Q1/Q2/Q9

---

## 1. Purpose & scope

Take routine orders off Mr. X's phone. Staff quote and confirm inside a daily price band; anything outside it becomes an exception card.

In scope: customer master & credit profile · item master · Daily Base/Floor price sheet · margin calculator · quotes · sales orders · customer price memory · order lifecycle.

Out of scope here: stock reservation (M3), production (M4), invoicing/AR (M6), dispatch (M5).

> **Item master ownership:** `items` lives in M1 because Sprint 1 goes live with simple SKUs. M2–M5 read it through M1's `ItemPort`.

---

## 2. Roles & permissions

| Role | Can | Cannot |
| --- | --- | --- |
| OWNER | Set daily prices & min margin; approve overrides; change credit limits; everything | — |
| OPS_COORD | Create customers (credit limit defaults only), quote, confirm within band, request price override, view price memory | Confirm below floor; override credit hold; edit credit limit; delete posted records |
| Others | No access to prices or customers (drivers see only name/address/phone of assigned stops via M5) | — |

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`customers`** | `id` PK · `business_name` · `contact_person` · `phone` · `whatsapp_no` · `billing_address` · `gps_lat_lng` · `credit_limit` · `credit_days` · `current_ar_balance` | BP |
| ↳ added | `customer_code` · `max_overdue_days` (BR-02 needs it, schema omits it) · `preferred_delivery_window` · `payment_reliability_score` (computed) · `default_site_id` · `gstin` · `state_code` (place of supply) · `credit_hold` (bool) · `price_tier` · `is_active` | ADD |
| **`customer_contacts`** | `customer_id` · `name` · `phone` · `role` | ADD |
| **`communication_log`** | `customer_id` · `channel` (`CALL` \| `WHATSAPP` \| `VISIT`) · `note` · `user_id` · `at` | ADD (§6.2) |
| **`items`** | `id` PK · `sku_code` · `name` · `item_category` (`TRADED_GOOD` \| `RAW_MATERIAL` \| `PROCESSED_FG` \| `PACKAGING`) · `primary_uom` (`KG` \| `CRATE` \| `CARTON`) · `secondary_uom` · `shelf_life_days` · `tax_rate_pct` | BP |
| ↳ added | `hsn_code` (A5) · `is_catch_weight` · `standard_weight_per_secondary_kg` · `min_margin_pct` · `is_active` | ADD (G6) |
| ↳ added | `tax_treatment` (`TAXABLE` \| `EXEMPT` \| `NIL_RATED` \| `NON_GST`) — **CONFIRMED OD-003**. Taxable lines compute CGST/SGST or IGST; EXEMPT/NIL_RATED/NON_GST lines have `tax_amount = 0`. Both treatments may appear on the same invoice. |
| **`uom_conversions`** | `item_id` · `from_uom` · `to_uom` · `factor` | ADD |
| **`daily_price_lists`** | `id` PK · `item_id` FK · `effective_date` · `latest_landed_cost` · `floor_price` · `target_price` · `updated_by` FK | BP |
| ↳ added | `min_margin_pct_used` · `source` (`AUTO` \| `MANUAL`) · `published_at` | ADD |
| **`quotes`** | `id` PK · `quote_no` · `customer_id` · `site_id` · `status` (`DRAFT` \| `SENT` \| `CONVERTED` \| `EXPIRED` \| `LOST`) · `valid_until` · `created_by` | ADD (§6.1 Draft Quotes) |
| **`quote_lines`** | `quote_id` · `item_id` · `qty` · `quoted_unit_price` · `floor_snapshot` | ADD |
| **`sales_orders`** | `id` PK · `order_no` · `customer_id` FK · `fulfillment_site_id` FK · `order_status` · `total_amount` · `margin_pct` · `created_by` FK · `approved_by` FK nullable · `delivery_date` | BP |
| ↳ added | `source_quote_id` · `delivery_time_window` · `credit_flag` (`OK` \| `HOLD` \| `COD_ONLY`) · `confirmed_at` · `payment_terms` (`CREDIT` \| `COD`) | ADD |
| **`sales_order_lines`** | `id` PK · `order_id` FK · `item_id` FK · `ordered_qty` · `quoted_unit_price` · `floor_price_snapshot` · `allocated_from_stock_qty` · `requires_production_qty` · `delivered_qty` | BP |
| ↳ added | `target_price_snapshot` · `landed_cost_snapshot` · `line_margin_pct` · `qty_secondary` · `returned_qty` | ADD |
| **`order_status_log`** | `order_id` · `from_status` · `to_status` · `by_user` · `at` · `reason` | ADD |

**Reconciled order status (G2):**
`DRAFT → PENDING_APPROVAL → CONFIRMED → IN_PRODUCTION_SOURCING → READY → DISPATCHED → DELIVERED_FULL | DELIVERED_PARTIAL → CLOSED` plus `CANCELLED`, `REJECTED`.
`CLOSED` = delivered **and** invoiced (not necessarily paid).

> **`customers.current_ar_balance` is a cache** of the M6 customer ledger. M1 never writes it; M6 updates it in the same transaction as the ledger entry.

---

## 4. Business rules

### BR-01 — Dynamic Pricing Band
- Every item has a daily `target_price` and `floor_price`.
- `floor_price` = auto-calculated from landed cost and minimum margin, **or** typed in by the owner.
- `margin_pct = (price − landed_cost) / price`   *(defined once — G7)*
- Auto floor: `floor = landed_cost / (1 − min_margin_pct)`, rounded up to ₹0.50.
- Line price **≥ floor** → in band, auto-approve. **< floor** → order goes to `PENDING_APPROVAL` and a `PRICE_OVERRIDE` exception is raised.

```
evaluateLine(item, qty, price):
    band = PricingPort.getBand(item, today)
    margin = (price - band.landed_cost) / price
    if price >= band.floor:  return IN_BAND(margin)
    return BELOW_FLOOR(margin, gap = band.floor - price)
```

### BR-02 — Automated Credit Control
- Customer has `credit_limit` and `max_overdue_days` (defaults ₹1,00,000 / 15 days).
- Block when `current_ar_balance + new_order_value > credit_limit` **or** any invoice is overdue beyond `max_overdue_days`.
- **Evaluate at confirmation** (so staff see the warning early) and **enforce at dispatch** (what the blueprint specifies).
- Outcome: set `credit_flag = HOLD` and raise `CREDIT_BREACH`; owner may approve, convert to `COD_ONLY`, or reject.
- Only the owner can raise `credit_limit` or clear a hold.

### Other rules (ADD, from §6.1/6.2)
| Rule | Behaviour |
| --- | --- |
| Quote validity | `valid_until = now + quote_validity_hours` (default 4 h). Expired quotes cannot convert; re-quote at current band |
| Quote → order | Re-validates against the *current* band unless the quote is still valid and in band at creation |
| Price memory | Order screen shows the last 5 (date, qty, price) for this customer + item |
| Order confirmation | On `CONFIRMED`: snapshot floor/target/cost per line, call `InventoryPort.reserve`, emit `order.confirmed` |
| Customer price variance | If an in-band price differs from last price by more than `customer_price_variance_pct`, show a warning only (no block) |

---

## 5. Workflows & state machines

```
 DRAFT ──(all lines in band, credit OK)──────────────► CONFIRMED
   │                                                     │
   └─(line < floor or credit breach)─► PENDING_APPROVAL ─┤ approve / counter accepted
                                            │            │
                                            └─ reject ─► REJECTED
 CONFIRMED ─► IN_PRODUCTION_SOURCING ─► READY ─► DISPATCHED ─► DELIVERED_FULL|PARTIAL ─► CLOSED
 (any pre-DISPATCHED state) ─► CANCELLED   (releases reservations)
```

**Scenario A (price negotiation)** — implement exactly:
1. Coordinator opens Quick Order; picks customer/site/date; adds *Item Y × 500 kg*.
2. Screen shows `Cost 82 | Floor 90 | Target 95` and the customer's last 5 prices.
3. Price ₹92 → in band → **Confirm** → `CONFIRMED` in one tap.
4. Price ₹88 → **Request Price Override** → `PRICE_OVERRIDE` card (customer, qty, price, margin, floor).
5. Owner chooses **Approve ₹88 / Counter ₹89.50 / Reject**.
6. *Counter:* order stays `PENDING_APPROVAL` with `counter_price`; coordinator relays it; if customer agrees, coordinator taps **Accept counter** → `CONFIRMED` at the countered price; otherwise **Cancel**.

**Handling `exception.resolved`:** `APPROVED` → `CONFIRMED`; `COUNTERED` → keep pending with counter; `REJECTED` → `REJECTED`.

---

## 6. Screens

| # | Screen | User | Notes |
| --- | --- | --- | --- |
| S1 | **Quick Order Entry** | Coordinator (web) | Single-screen grid, keyboard-fast: customer, site, delivery date, many lines; live ATP and margin chips per line; price-memory side panel |
| S2 | **Daily Base & Floor Price Sheet** | Owner (mobile + web) | Morning 15-minute screen: list of items with yesterday's price, landed cost, editable floor/target; *Publish* button; shows items missing today's price |
| S3 | **Customer 360** | Coordinator / Owner | Profile, credit limit/usage, AR aging (read from M6), price tiers, delivery window, GPS, communication log, reliability score |
| S4 | **Quotes** | Coordinator | Open quotes with countdown to expiry; one-tap convert |
| S5 | **Order tracker** | Coordinator / Owner | Status timeline, lines, allocation, margin |
| S6 | **Pending approvals** | Owner | Provided by M7a; M1 supplies card payload |

---

## 7. API (proposed)

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| GET/POST | `/customers` · `/customers/{id}` | OPS, OWNER | Credit fields owner-only |
| PATCH | `/customers/{id}/credit` | OWNER | Limit, days, hold flag |
| GET | `/customers/{id}/price-memory?item_id=` | OPS, OWNER | Last 5 sales |
| GET/POST | `/items` | OWNER, OPS (read) | |
| GET | `/prices/today` | OPS, OWNER | Band per item |
| PUT | `/prices/{date}` | OWNER | Bulk upsert daily list; emits `price.updated` |
| POST | `/quotes` · `/quotes/{id}/convert` | OPS | |
| POST | `/orders` | OPS | Validates lines via BR-01/02 |
| POST | `/orders/{id}/confirm` | OPS | In-band only |
| POST | `/orders/{id}/request-override` | OPS | Raises `PRICE_OVERRIDE` |
| POST | `/orders/{id}/accept-counter` · `/cancel` | OPS | |
| GET | `/orders?status=&site=&date=` | OPS, OWNER | |

---

## 8. Events & ports

| Direction | Name | Detail |
| --- | --- | --- |
| Publishes | `price.updated` | Item band changed |
| Publishes | `order.pending_approval` | Triggers M7 card |
| Publishes | `order.confirmed` | → M3 reserve, M2 back-to-back suggestion, M4 requirement |
| Consumes | `exception.resolved` | PRICE_OVERRIDE / CREDIT_BREACH |
| Consumes | `stock.reserved` / `stock.insufficient` | Fill `allocated_from_stock_qty` / `requires_production_qty` |
| Consumes | `workorder.completed` | `IN_PRODUCTION_SOURCING → READY` |
| Consumes | `trip.dispatched`, `delivery.*` | Status updates |
| Consumes | `po.price_spike_detected` | Flag open quotes/orders whose margin drops below threshold (BR-03) |
| Provides | `PricingPort`, `CreditPort`, `ItemPort` | See README §3.1 |
| Calls | `InventoryPort`, `ProcurementPort`, `ExceptionPort`, `NotifyPort` | Stubbed until built |

---

## 9. Integrations, jobs & instrumentation

| Item | Detail |
| --- | --- |
| WhatsApp | Order confirmation PDF to customer on `CONFIRMED` (via M7 `NotifyPort`) |
| Job: quote expiry | Every minute: mark `EXPIRED` when past `valid_until` |
| Job: missing-price alert | 09:00: notify owner if any active item has no price for today |
| Job: reliability score | Nightly: compute from days-to-pay history (M6 data) |
| KPI 4 | Record `created_at` and `confirmed_at` on orders |
| KPI 5 | Store `margin_pct` and whether an owner override was used, per order |

---

## 10. Acceptance criteria

1. **Scenario A path 1:** cost 82, floor 90, target 95 → 500 kg @ ₹92 confirms with **no** exception.
2. **Scenario A path 2:** @ ₹88 → status `PENDING_APPROVAL`, exactly one `PRICE_OVERRIDE` card containing customer, qty, margin and floor; owner "Counter ₹89.50" → coordinator accepts → `CONFIRMED` at ₹89.50, audit log shows both users.
3. A coordinator cannot confirm a below-floor line even by calling the API directly.
4. Customer with limit ₹1,00,000 and AR ₹80,000 ordering ₹30,000 → `credit_flag = HOLD` and `CREDIT_BREACH` raised.
5. A customer with an invoice 16 days overdue (max overdue days = 15) is held even when the new order fits within the credit limit.
6. A quote older than 4 h cannot be converted.
7. Price memory shows the 5 most recent *confirmed* sales for that customer + item.
8. Publishing a new daily price emits `price.updated`; floors auto-recalculate from landed cost and `min_margin_pct`.
9. Order confirmation time is stored (KPI 4).

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| Customer master & credit limits; daily floor sheet; quick order entry with margin check; one-tap owner approvals; quotes with expiry; price memory | WhatsApp self-service ordering bot; AI dynamic pricing from a commodity index; salesperson commission engine; standing customer price agreements |

---

## 12. Open questions

- `[CONFIRMED 2026-10-22 — OD-001]` `min_margin_pct`: 10% gross margin global default (`business_rule_config.min_margin_pct_default = 0.10`); overridable per item category via `min_margin_pct_<CATEGORY>` (e.g. `min_margin_pct_PROCESSED_FG` = 0.12). Margin definition (G7): `margin_pct = (price − cost) / price`, gross margin not markup.
- `[DECISION]` Does Neo give **standing negotiated prices** to some customers (§6.2 "price tiers")? If yes, they still cannot undercut the floor without approval. (OD-024 — AWAITING)
- `[DECISION]` Does a *still-valid* quote survive an owner re-pricing the floor mid-day?
- `[DECISION]` Is credit evaluated per order or per customer-day (many small orders)?
- Which sites can each customer be served from?

---

## 13. Build checklist

- [ ] Migrations: `customers`, `customer_contacts`, `communication_log`, `items`, `uom_conversions`, `daily_price_lists`, `quotes`, `quote_lines`, `sales_orders`, `sales_order_lines`, `order_status_log`
- [ ] `PricingService` (band lookup, auto-floor, margin) + `PricingPort`
- [ ] `CreditService` (BR-02) + `CreditPort` (AR read via M6 or manual field)
- [ ] Order state machine with guards and status log
- [ ] Quote service + expiry job
- [ ] Price-memory query + index on `(customer_id, item_id, confirmed_at)`
- [ ] Exception integration: raise cards, handle `exception.resolved`
- [ ] API + permission checks + masking tests
- [ ] Screens S1–S5
- [ ] Acceptance tests §10 (+ Scenario A end-to-end)
