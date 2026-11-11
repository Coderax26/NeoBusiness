# NeoBus — Open Decisions Register

**Legend:** CONFIRMED = agreed, fully specified, reflected in code contracts & tests.

---

## OD-001 — Minimum margin percentage (BR-01 floor calculation)

**Status:** CONFIRMED — 2026-10-22
**Approver:** Business Owner (Mr. X)
**Decision:** 10% gross margin, global default. Overridable per item category via `business_rule_config`.
**Implementation:**
- `business_rule_config` key `min_margin_pct_default` = `0.10` (global).
- Per-category override: key `min_margin_pct_CATEGORY_NAME` e.g. `min_margin_pct_PROCESSED_FG` = `0.12`.
- `Money.autoFloor(landedCost, minMarginPct)` uses this value; result rounded UP to nearest ₹0.50.
- Margin definition (G7): `margin_pct = (price - cost) / price` (gross margin, not markup).

---

## OD-002 — Owner escalation value threshold for delivery disputes (M5, M7)

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner (Mr. X)
**Decision:** INR 5,000 threshold. Any delivery dispute or line rejection where value at risk $\ge ₹5,000$, or any full-load rejection (`CUSTOMER_FULL_REJECTION`), escalates directly to the Owner via high-priority exception card. Below ₹5,000, Ops Coordinator resolves autonomously.
**Implementation:**
- `business_rule_config` key `owner_escalation_value_inr` = `5000`.
- Verified in `FleetService.createIssue()`: checks `owner_escalation_value_inr` at site or global scope.
- Creates `issue_reports` with status `ESCALATED_OWNER` when threshold met.

---

## OD-003 — Invoice timing and GST tax treatment

**Status:** CONFIRMED — 2026-10-22
**Approver:** Lead Accountant & Business Owner
**Decision:** Invoice generated at dispatch for all goods. System handles mixed taxable and exempt/nil-rated lines on the same invoice.
**Implementation:**
- Invoice automatically generated on `trip.dispatched` domain event.
- `items` table has `tax_treatment` field: `TAXABLE | EXEMPT | NIL_RATED | NON_GST`.
- Invoice line tax calculation: taxable lines compute CGST/SGST/IGST; exempt/nil compute 0 tax.
- Post-delivery quantity differences resolved exclusively via Credit Notes—never modifying generated invoices.

---

## OD-004 — e-Invoicing (IRN / GST e-invoice) applicability

**Status:** CONFIRMED — 2026-11-11
**Approver:** Lead Accountant
**Decision:** Neo's current turnover does not mandate real-time IRN generation for MVP. The invoice schema retains nullable `irn` and `ack_no` columns. Feature is controlled via `einvoicing_enabled` toggle in `business_rule_config` (set to `false` for MVP). GSP API adapter will activate when turnover mandates.
**Implementation:**
- `business_rule_config` key `einvoicing_enabled` = `false`.
- `invoices` table stores nullable `irn` varchar(100).
- Tax invoice PDF omits signed QR code when `irn` is null, rendering standard B2B tax invoice.

---

## OD-005 — e-Way bill generation: NeoCore or Tally bridge?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner & Logistics Coordinator
**Decision:** In MVP, e-Way bill is generated via accountant's GST portal / Tally tool for consignments exceeding ₹50,000. Ops Coordinator or Driver enters the government-generated `eway_bill_no` into NeoBus, which is printed on the Delivery Challan. Direct API automation scheduled for Phase 4.
**Implementation:**
- `business_rule_config` key `eway_bill_threshold_inr` = `50000`.
- `delivery_challans` table stores `eway_bill_no`.
- `PdfGeneratorService.generateChallan()` renders E-Way Bill number on the Delivery Challan PDF.

---

## OD-006 — OTP delivery channel for field staff authentication

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** SMS is the primary OTP delivery channel for Driver and Collector mobile authentication due to universal reliability in rural/low-data delivery zones. WhatsApp OTP configured as secondary fallback.
**Implementation:**
- `business_rule_config` key `otp_channel_default` = `"SMS"`.
- Handled by `NotificationService` SMS provider adapter with rate limiting and 5-minute expiry.

---

## OD-007 — Multi-site coordinator access

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** Multi-site coordinator access is enabled. Each coordinator has one primary site (`users.assigned_site_id`), but the Owner can grant additional site memberships via `user_site_access`. The system enforces site boundaries using PostgreSQL Row-Level Security (RLS) matching `app.site_ids`.
**Implementation:**
- `business_rule_config` key `multisite_coordinator_enabled` = `true`.
- Middleware sets `SET LOCAL app.site_ids = '...'` matching all authorized site IDs.

---

## OD-008 — Languages for driver and factory apps

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** English UI with universal iconography and high-contrast numerical layouts for MVP launch. Multi-language infrastructure enabled with `preferred_language` field on `users` table (`en`, `hi`, `mr`), ready for localized translation strings in Phase P3.
**Implementation:**
- `business_rule_config` key `default_language` = `"en"`.
- `users.preferred_language` defaults to `'en'`.

---

## OD-009 — Supplier price-spike baseline: same supplier or item-wide last price?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner & Procurement Manager
**Decision:** Primary baseline is the last issued/closed PO price from the **same supplier** for that item. If no prior purchase order exists for that supplier + item, fallback to the item-wide last purchase price across all suppliers.
**Implementation:**
- `business_rule_config` key `supplier_price_spike_baseline` = `"SAME_SUPPLIER_FIRST"`.
- Implemented in `POService.evaluatePriceVariance()` and verified in procurement acceptance tests.

---

## OD-010 — Backup supplier tolerance for shortfall coverage (M2)

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** Backup suppliers with quote prices within 2% (`supplier_price_variance_pct`) above the primary supplier's price are automatically ranked and eligible for 1-click back-to-back PO creation without requiring an owner approval exception. Beyond 2%, an owner exception is raised.
**Implementation:**
- `business_rule_config` key `backup_supplier_tolerance_pct` = `2`.
- Verified in `SupplierService.rankBackupSuppliers()` and M2 acceptance tests.

---

## OD-011 — Freight and handling allocation into landed cost

**Status:** CONFIRMED — 2026-11-11
**Approver:** Lead Accountant & Business Owner
**Decision:** In MVP, landed cost equals PO line unit price net of discount plus applicable non-creditable taxes. Inbound freight surcharges are tracked as PO header expenses and allocated pro-rata in Phase 4.
**Implementation:**
- `business_rule_config` key `landed_cost_freight_allocation` = `"NONE_MVP"`.
- Landed cost updated upon GRN receipt into `items.latest_landed_cost`.

---

## OD-012 — Yield variance basis: issued RM vs. BOM standard

**Status:** CONFIRMED — 2026-11-11
**Approver:** Production Manager
**Decision:** Yield variance (BR-06) is calculated based on **actual issued/consumed raw material weight** vs. finished goods output + recorded scrap/wastage (mass balance). Tolerance is $\pm 3\%$.
**Implementation:**
- `business_rule_config` key `yield_variance_basis` = `"ISSUED_RAW_MATERIAL"`.
- `business_rule_config` key `yield_variance_tolerance_pct` = `3`.
- Enforced in `WorkOrderService.completeWorkOrder()`: raises `YIELD_VARIANCE` exception if variance exceeds $\pm 3\%$.

---

## OD-013 — Production mode: make-to-order only, or also make-to-stock?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner & Production Manager
**Decision:** Primary production mode is **Make-to-Order (MTO)** driven by production requisitions linked to sales orders. In addition, fast-moving finished goods support **Make-to-Stock (MTS)** replenishment when stock falls below `items.min_stock_qty`.
**Implementation:**
- `business_rule_config` key `production_mode` = `"MAKE_TO_ORDER_PRIMARY"`.
- Supports work orders created from requisitions or triggered by stock reorder thresholds.

---

## OD-014 — ePOD method: OTP required in MVP or only signature/photo?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** Signature and photo are the required offline-first ePOD methods for MVP. OTP verification is supported and optional for high-risk / credit-hold accounts when connectivity is present.
**Implementation:**
- `business_rule_config` key `epod_otp_required` = `false`.
- `delivery_stops` table validates `epod_method IN ('SIGNATURE', 'PHOTO', 'OTP')`.

---

## OD-015 — Cash custody wallet scope: cash + cheques only, or also UPI?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner & Lead Accountant
**Decision:** Field custody wallets track **physical cash and cheques only**. Customer UPI/NEFT collections are recorded and allocated to invoices, but credit Neo's bank account directly and bypass physical driver handovers.
**Implementation:**
- `business_rule_config` key `custody_wallet_scope` = `"CASH_AND_CHEQUE"`.
- `HandoverService` computes expected handover as cash + cheques in hand, omitting direct UPI receipts.

---

## OD-016 — Who is the cashier for handover verification?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** Ops Coordinator acts as cashier for routine field handovers at each site (`receipt.verify_handover` permission). If counted cash mismatches expected cash (`CASH_HANDOVER_VARIANCE`), an exception is raised, and any variance resolution requires Owner sign-off.
**Implementation:**
- `business_rule_config` key `handover_cashier_role` = `"OPS_COORD"`.
- Role permissions grant `receipt.verify_handover` to `OPS_COORD` and `OWNER`.

---

## OD-017 — Invoice allocation policy: FIFO or customer-specified?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Lead Accountant
**Decision:** Default allocation is strictly **FIFO (First In, First Out)**, allocating receipts against the oldest unpaid invoices first. Manual override is supported when customer payment remittance specifies exact invoice numbers.
**Implementation:**
- `business_rule_config` key `invoice_allocation_policy` = `"FIFO"`.
- Implemented in `LedgerService.allocateReceipt()`.

---

## OD-018 — Accounting target: Tally Prime, Zoho Books, or QuickBooks?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Lead Accountant & Business Owner
**Decision:** **Tally Prime** XML format is the confirmed statutory accounting bridge target for MVP. Export engine generates idempotent XML batches (`tally_export_batches`, `tally_export_items`).
**Implementation:**
- `business_rule_config` key `accounting_bridge_target` = `"TALLY_PRIME"`.
- Implemented in `TallyExportController` and `TallyExportService`.

---

## OD-019 — Owner delegate for exception approvals when unavailable (G13)

**Status:** CONFIRMED — 2026-10-22
**Approver:** Business Owner
**Decision:** Delegated approval with escalation. Silent auto-approval is NEVER permitted. `PRICE_OVERRIDE` and `CREDIT_BREACH` can be delegated to OPS_COORD up to ₹5,000 INR value cap. `SUPPLIER_PRICE_SPIKE`, `WASTAGE_WRITEOFF`, and `MANUAL_LEDGER_ADJUSTMENT` are strictly owner-only. Escalation timeout is 60 minutes.
**Implementation:**
- `business_rule_config` key `escalation_wait_minutes` = `60`.
- Enforced via `approval_policies` table and `ExceptionService`.

---

## OD-020 — "Today's Sales" definition for owner dashboard

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** "Today's Sales" on the Owner Pulse Header is defined as **the sum of tax invoices issued today** (which maps to dispatched delivery stops). Confirmed orders pending dispatch are displayed separately in the Operational Status matrix.
**Implementation:**
- `business_rule_config` key `todays_sales_definition` = `"TAX_INVOICES_ISSUED"`.
- Reflected in `mv_pulse_today` materialized view and `DashboardService`.

---

## OD-021 — Dashboard refresh rate expectation

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** Near real-time via event-driven materialized view refreshes and background BullMQ workers. Client polling/SSE interval set to 30 seconds.
**Implementation:**
- `business_rule_config` key `dashboard_refresh_interval_seconds` = `30`.
- Materialized views refreshed concurrently on relevant domain events.

---

## OD-022 — WhatsApp BSP provider selection

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** Architecture uses a pluggable `NotificationPort` adapter interface with SMS as the guaranteed fallback channel. Provider onboarding occurs via configuration without code changes.
**Implementation:**
- `business_rule_config` key `whatsapp_bsp_adapter` = `"PLUGGABLE_SMS_FALLBACK"`.
- Implemented in `NotificationService`.

---

## OD-023 — Opening balance cut-off date and data format

**Status:** CONFIRMED — 2026-10-22
**Approver:** Lead Accountant & Business Owner
**Decision:** Standardized CSV template with sign-off cut-off date. Two-step workflow: upload & preview (`DRAFT`) → accountant/owner sign-off (`SIGNED_OFF`) → atomic ledger posting (`IMPORTED`). Reversals create equal-and-opposite entries (`REVERSED`).
**Implementation:**
- `opening_balance_imports` and `opening_balance_import_lines` tables.
- Implemented in `OpeningBalanceService` and `OpeningBalanceController`.

---

## OD-024 — Standing negotiated customer prices ("price tiers")

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner
**Decision:** No standing below-floor customer prices in MVP. All sales orders are evaluated strictly against the daily price band (BR-01). Pre-agreed customer contract rate agreements will be evaluated for Phase 4.
**Implementation:**
- `business_rule_config` key `standing_customer_prices_enabled` = `false`.
- Enforced by `PricingService.evaluateOrderPricing()`.

---

## OD-025 — Inter-site reservation: one fulfillment site per order, or across sites?

**Status:** CONFIRMED — 2026-11-11
**Approver:** Business Owner & Logistics Coordinator
**Decision:** Single fulfillment site per sales order in MVP. When stock is short at the primary site, an inter-site stock transfer is created and received before trip dispatch. Cross-site split shipments deferred to Phase 4.
**Implementation:**
- `business_rule_config` key `intersite_order_fulfillment` = `"SINGLE_SITE_MVP"`.
- Enforced by `InventoryService` FEFO reservation logic.

---

## Summary Table

| ID | Topic | Status | Approver / Target |
|----|-------|--------|-------------------|
| OD-001 | Min margin pct | CONFIRMED — 2026-10-22 | Business Owner (10% gross default) |
| OD-002 | Owner escalation value | CONFIRMED — 2026-11-11 | Business Owner (INR 5,000 threshold) |
| OD-003 | Invoice timing + GST | CONFIRMED — 2026-10-22 | Lead Accountant (Invoice at dispatch, mixed lines) |
| OD-004 | e-Invoicing applicability | CONFIRMED — 2026-11-11 | Lead Accountant (Disabled for MVP, schema ready) |
| OD-005 | e-Way bill generation | CONFIRMED — 2026-11-11 | Logistics Coordinator (Manual ref entry >= 50k INR) |
| OD-006 | OTP field auth channel | CONFIRMED — 2026-11-11 | Business Owner (SMS primary) |
| OD-007 | Multi-site coordinator | CONFIRMED — 2026-11-11 | Business Owner (Multi-site enabled via user_site_access) |
| OD-008 | UI language support | CONFIRMED — 2026-11-11 | Business Owner (English MVP, i18n ready) |
| OD-009 | Price spike baseline | CONFIRMED — 2026-11-11 | Procurement Manager (Same-supplier first, then item cost) |
| OD-010 | Backup supplier tolerance | CONFIRMED — 2026-11-11 | Business Owner (Within 2% auto-suggest) |
| OD-011 | Freight cost allocation | CONFIRMED — 2026-11-11 | Lead Accountant (PO price only for MVP) |
| OD-012 | Yield variance basis | CONFIRMED — 2026-11-11 | Production Manager (Mass balance on issued RM, +/- 3%) |
| OD-013 | Production mode | CONFIRMED — 2026-11-11 | Production Manager (MTO primary, MTS for min_stock) |
| OD-014 | ePOD OTP in MVP | CONFIRMED — 2026-11-11 | Business Owner (Signature/photo required, OTP optional) |
| OD-015 | Custody wallet scope | CONFIRMED — 2026-11-11 | Lead Accountant (Cash + cheques only; UPI direct) |
| OD-016 | Handover cashier role | CONFIRMED — 2026-11-11 | Business Owner (Ops Coordinator verifies routine handovers) |
| OD-017 | Allocation policy | CONFIRMED — 2026-11-11 | Lead Accountant (FIFO default with manual override) |
| OD-018 | Accounting target | CONFIRMED — 2026-11-11 | Lead Accountant (Tally Prime XML export) |
| OD-019 | Owner delegate policy | CONFIRMED — 2026-10-22 | Business Owner (Delegate caps, 60m escalation) |
| OD-020 | Today's sales definition | CONFIRMED — 2026-11-11 | Business Owner (Tax invoices issued today) |
| OD-021 | Dashboard refresh rate | CONFIRMED — 2026-11-11 | Business Owner (30 seconds polling/SSE) |
| OD-022 | WhatsApp BSP provider | CONFIRMED — 2026-11-11 | Business Owner (Pluggable adapter with SMS fallback) |
| OD-023 | Opening balance process | CONFIRMED — 2026-10-22 | Lead Accountant (Signed-off CSV import & reversal) |
| OD-024 | Standing customer prices | CONFIRMED — 2026-11-11 | Business Owner (No standing below-floor prices in MVP) |
| OD-025 | Inter-site reservation | CONFIRMED — 2026-11-11 | Logistics Coordinator (Single-site fulfillment in MVP) |
