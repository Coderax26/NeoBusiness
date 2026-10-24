# NeoBus — M1 Commercial & CRM Implementation Plan

**Date:** 2026-10-24
**Status:** ACTIVE
**Owner:** Claude Code
**Blueprint ref:** `docs/claude/03_M1_Commercial_CRM.md`
**Depends on:** M0 (Platform), M7a (Exception Engine)

---

## 1. Overview & Scope

Module M1 establishes the Commercial and CRM backbone of NeoBus, designed to take routine ordering off Mr. X's phone and enforce dynamic floor pricing and automated credit controls.

### In Scope
- **Customer Master & Credit Profiles:** CRUD for customers, contacts, communications log, credit limits, credit days, max overdue days, and tax state codes.
- **Item Master & UoM:** SKUs, categories, units of measure, tax rates, HSN codes, and category-level minimum margin percentages (`min_margin_pct`).
- **Daily Price Lists:** Daily target and floor prices per item, with auto-floor computation (`Money.autoFloor` = landed cost / (1 - min margin), rounded up to ₹0.50).
- **Pricing & Credit Ports:** `PricingPort` (band lookup, price memory) and `CreditPort` (AR balance check, credit limit enforcement).
- **Quotes & Sales Orders:** Quote generation and conversion; order entry with live ATP check (via stub/inventory), price band evaluation (BR-01), credit evaluation (BR-02), and exception card generation for overrides via `ExceptionPort`.
- **Order State Machine:** `DRAFT → PENDING_APPROVAL → CONFIRMED → ...` with scenario-verified overrides (Scenario A).

---

## 2. Implementation Tasks (Build Order)

| Step | Priority | Task | Description |
|------|----------|------|-------------|
| 1 | P0 | **Migration 006** | Create `customers`, `customer_contacts`, `communication_log`, `items`, `uom_conversions`, `daily_price_lists`, `quotes`, `quote_lines`, `sales_orders`, `sales_order_lines`, `order_status_log` tables. Seed M1 permissions in `role_permissions`. |
| 2 | P0 | **PricingService & PricingPort** | Implement band lookup, price memory (last 5 sales), and daily price upsert. Wire as `PRICING_PORT`. |
| 3 | P0 | **CreditService & CreditPort** | Implement BR-02 evaluation (`current_ar_balance + new_order_value <= credit_limit` and overdue check). Wire as `CREDIT_PORT`. |
| 4 | P0 | **ItemService & ItemPort** | Implement item retrieval and UoM conversion lookup. Wire as `ITEM_PORT`. |
| 5 | P0 | **OrderService & State Machine** | Implement order creation, BR-01 pricing evaluation, BR-02 credit evaluation, exception raising (`PRICE_OVERRIDE`, `CREDIT_BREACH`), and `exception.resolved` handler integration. |
| 6 | P1 | **API Controllers** | Customer CRUD, Item CRUD, Price Sheet management, Quote lifecycle, Order entry & workflow actions. |
| 7 | P2 | **Unit & E2E Tests** | Comprehensive test coverage for Scenario A (in-band confirmation, below-floor override request, owner counter/approval), credit breach, price memory, and quote expiry. |

---

## 3. Database Schema (Migration 006)

- **`customers`**: profile, credit limit, credit days, current AR balance cache, GPS, status.
- **`customer_contacts`**: multiple contact persons per customer.
- **`communication_log`**: calls, WhatsApp messages, visits.
- **`items`**: SKU, category, UoM, shelf life, HSN, tax rate, tax treatment (`TAXABLE | EXEMPT | NIL_RATED | NON_GST`), min margin pct.
- **`uom_conversions`**: conversion factor between units.
- **`daily_price_lists`**: daily landed cost, floor price, target price per item.
- **`quotes` & `quote_lines`**: valid-until quotes with line snapshots.
- **`sales_orders` & `sales_order_lines`**: order headers, lines, price snapshots, margin percentages, and fulfillment flags.
- **`order_status_log`**: immutable audit trail of state transitions.

---

## 4. Verification & Acceptance Criteria

1. **In-Band Order Confirmation:** Cost ₹82, floor ₹90, target ₹95 → 500 kg at ₹92 confirms immediately with no exception (`CONFIRMED`).
2. **Below-Floor Override Request:** Order at ₹88 → status `PENDING_APPROVAL`, `PRICE_OVERRIDE` exception card created; owner counter to ₹89.50 → coordinator accepts → `CONFIRMED` at ₹89.50.
3. **Credit Breach Hold:** Order exceeding customer credit limit or max overdue days sets `credit_flag = HOLD` and raises `CREDIT_BREACH`.
4. **Price Memory:** Returns the 5 most recent confirmed sales for the customer and item.
5. **Port Wiring:** Real `PRICING_PORT`, `ITEM_PORT`, and `CREDIT_PORT` replace stubs in `AppModule`.
