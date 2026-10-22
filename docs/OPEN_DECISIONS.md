# NeoBus — Open Decisions Register

**Legend:** CONFIRMED = agreed, no blocker | PROPOSED = recommended default, awaiting sign-off | AWAITING = must be decided before implementation

---

## OD-001 — Minimum margin percentage (BR-01 floor calculation)

**Status:** CONFIRMED — 2026-10-22
**Decision:** 10% gross margin, global default. Overridable per item category via `business_rule_config`.
**Implementation:**
- `business_rule_config` key `min_margin_pct_default` = `0.10` (global).
- Per-category override: key `min_margin_pct_CATEGORY_NAME` e.g. `min_margin_pct_PROCESSED_FG` = `0.12`.
- `Money.autoFloor(landedCost, minMarginPct)` uses this value; result rounded UP to nearest ₹0.50.
- Margin definition (G7): `margin_pct = (price - cost) / price` (gross margin, not markup).

---

## OD-002 — Owner escalation value threshold for delivery disputes (M5, M7)

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** Blueprint Scenario D, M5 §4, README §6 `owner_escalation_value_inr`
**Question:** At what rupee value does a delivery dispute escalate to the owner vs. being handled by the Ops Coordinator?
**Impact:** Determines when Mr. X receives a push notification for a delivery issue.
**Proposed default:** INR 5,000 (coordinator handles below; owner above or for full-load rejections).

---

## OD-003 — Invoice timing and GST tax treatment

**Status:** CONFIRMED — 2026-10-22
**Decision:** Invoice generated at dispatch for all goods. Some goods are tax-free (GST-exempt or nil-rated); the system must handle both taxable and exempt/nil-rated lines on the same invoice.
**Implementation:**
- Invoice generated on `trip.dispatched` event (Sprint 2) or manually via "Mark Dispatched" in Sprint 1.
- `items` table has `tax_treatment` field: `TAXABLE | EXEMPT | NIL_RATED | NON_GST`.
- Invoice line tax calculation: if `tax_treatment = TAXABLE` → compute CGST/SGST or IGST. If `EXEMPT`, `NIL_RATED`, or `NON_GST` → tax_amount = 0, no HSN tax split.
- Both taxable and non-taxable lines can appear on the same GST invoice (standard practice).
- `hsn_code` still required on all lines for record-keeping; tax rates default to 0 for exempt/nil.
- Delivery differences (short/partial delivery at ePOD) resolved via credit note — never by editing the original invoice.
- `IRN` field present but nullable pending OD-004 (e-invoicing applicability confirmation).

---

## OD-004 — e-Invoicing (IRN / GST e-invoice) applicability

**Status:** AWAITING ACCOUNTANT CONFIRMATION
**Source:** M6 §12
**Question:** Does Neo's annual turnover exceed the e-invoicing threshold (currently INR 5 crore)? If yes, NeoCore must generate IRN via the GST portal API.
**Impact:** Changes the invoice generation flow significantly; requires GST portal API integration.
**Proposed default:** Build invoice schema with `irn` field placeholder; activate integration when confirmed applicable.

---

## OD-005 — e-Way bill generation: NeoCore or Tally bridge?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M5 §12, A5
**Question:** Who generates the e-Way bill: NeoCore (via GST portal API) or the accountant's Tally/Zoho tool?
**Impact:** If NeoCore, requires e-Way bill API integration in M5. If Tally, NeoCore only stores the reference number entered by the coordinator.
**Proposed default:** NeoCore stores an `eway_bill_no` field; coordinator enters it manually (sourced from Tally) in MVP. Automate in Phase 2.

---

## OD-006 — OTP delivery channel for field staff authentication

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M0 §12
**Question:** Should OTPs for field-staff login (Driver, Collector) be delivered via SMS or WhatsApp?
**Impact:** Determines SMS gateway vs. WhatsApp BSP integration priority in M0.
**Proposed default:** SMS (more reliable in low-connectivity areas). WhatsApp as Phase 2 enhancement.

---

## OD-007 — Multi-site coordinator access

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M0 §12
**Question:** Can one coordinator work across multiple sites, or is each coordinator assigned to exactly one site?
**Impact:** Affects the `user_site_access` table and RLS policy design.
**Proposed default:** One primary site per coordinator; owner can grant multi-site access via `user_site_access` table. Build for multi-site from day one.

---

## OD-008 — Languages for driver and factory apps

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M0 §12, blueprint §9.3
**Question:** Which regional language(s) are needed for the driver and factory tablet UI?
**Impact:** Affects i18n infrastructure, translation effort, and launch timeline.
**Proposed default:** English only for MVP. Add regional language support (likely Hindi or the local language) in Phase 2 using the `preferred_language` user setting.

---

## OD-009 — Supplier price-spike baseline: same supplier or item-wide last price?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M2 §12, BR-03
**Question:** Is the variance for BR-03 calculated against the last price from the same supplier, or against the last purchase price for the item from any supplier?
**Impact:** Determines the spike-detection query in the PO service.
**Proposed default:** Last issued/closed PO price from the same supplier for the same item. If no prior PO exists for that supplier+item, use the item-wide last purchase price.

---

## OD-010 — Backup supplier tolerance for shortfall coverage (M2)

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M2 §12, Scenario C
**Question:** How far above the primary supplier's price can a backup supplier be and still be considered "within tolerance"?
**Impact:** Determines whether a backup PO can be auto-suggested or requires owner approval.
**Proposed default:** Backup within `supplier_price_variance_pct` (2%) above primary → auto-suggest. Beyond 2% → flag for coordinator/owner decision.

---

## OD-011 — Freight and handling allocation into landed cost

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M2 §12
**Question:** How is freight/handling cost allocated per unit? Options: flat per kg, flat per trip, flat per PO, or not tracked.
**Impact:** Affects `latest_landed_cost` accuracy and therefore the floor price calculation for BR-01.
**Proposed default:** Not tracked in MVP (landed cost = PO unit price). Add freight allocation in Phase 2.

---

## OD-012 — Yield variance basis: issued RM vs. BOM standard

**Status:** AWAITING PRODUCTION MANAGER CONFIRMATION
**Source:** M4 §12, BR-06
**Question:** Should the yield variance (BR-06) be calculated against the actual issued raw material weight, or the BOM standard input weight?
**Impact:** Affects the formula in the completion transaction and what triggers the alert.
**Proposed default:** Issued raw material (mass balance: what went in vs. what came out + waste). This catches both over-consumption and genuine yield loss.

---

## OD-013 — Production mode: make-to-order only, or also make-to-stock?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M4 §12
**Question:** Does the factory only produce against confirmed sales orders, or can the Production Manager also run batches to build finished goods stock for fast-moving items?
**Impact:** Affects the work order creation flow and the production queue ranking.
**Proposed default:** Make-to-order in MVP (all work orders linked to a requisition or sales order). Make-to-stock added as a work order type in Phase 2.

---

## OD-014 — ePOD method: OTP required in MVP or only signature/photo?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M5 §12, Open Q4
**Question:** Is OTP-based ePOD (OTP sent to customer's phone at delivery) required for launch, or is signature + photo sufficient for MVP?
**Impact:** If OTP required: needs SMS/WhatsApp send at delivery time and assumes customer connectivity. If not: simpler and more reliable offline.
**Proposed default:** Signature and photo in MVP. OTP as optional Phase 2 enhancement.

---

## OD-015 — Cash custody wallet scope: cash + cheques only, or also UPI?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M6 §4, BR-07, §12
**Question:** Does the field agent's custody wallet track only physical cash and cheques (instruments in hand), or also UPI/bank transfers that the agent collects on Neo's behalf?
**Impact:** Affects the handover workflow — UPI funds should credit Neo's bank account directly; the agent does not physically hold them.
**Proposed default:** Custody wallet = cash + cheques (physical custody). UPI/bank collections are recorded and allocated but do not require a physical handover. Mark wallet as "cash and cheque balance only".

---

## OD-016 — Who is the cashier for handover verification?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M6 §12
**Question:** Is the person who verifies field cash handovers the Ops Coordinator, or only the owner?
**Impact:** Determines which role has the `receipt.verify_handover` permission.
**Proposed default:** Ops Coordinator acts as cashier for routine handovers. Owner for any handover variance flagged as DISPUTED.

---

## OD-017 — Invoice allocation policy: FIFO or customer-specified?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M6 §12
**Question:** When a customer pays an amount that doesn't cover all outstanding invoices, how is it allocated: oldest-first (FIFO) or customer-specified?
**Impact:** Affects `receipt_allocations` logic and AR aging.
**Proposed default:** FIFO (oldest invoice first). Coordinator can manually override allocation for specific receipts.

---

## OD-018 — Accounting target: Tally Prime, Zoho Books, or QuickBooks?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M6 §12, §9 accounting bridge
**Question:** Which accounting tool does Neo use for statutory books?
**Impact:** Determines the export format (Tally XML vs. Zoho/QuickBooks API) for the nightly accounting bridge.
**Proposed default:** Design the export layer as pluggable. Build Tally XML first (most common for Indian SMEs). Zoho and QuickBooks as alternate exporters.

---

## OD-019 — Owner delegate for exception approvals when unavailable (G13)

**Status:** CONFIRMED — 2026-10-22
**Decision:** Delegated approval with escalation. Silent auto-approval is NEVER permitted.
**Implementation:**
- `approval_policies` table has `delegate_user_id` (nullable), `escalation_wait_minutes` (default 60), and `can_delegate` flag per exception type.
- Escalation flow: owner → (wait `escalation_wait_minutes`) → push/SMS to delegate → (wait `escalation_wait_minutes` again) → push/SMS to owner's emergency contact (if set) → exception stays OPEN, never auto-resolved.
- `PRICE_OVERRIDE` and `CREDIT_BREACH`: owner can delegate to OPS_COORD with a value cap (e.g. OPS_COORD can approve PRICE_OVERRIDE up to ₹5,000 value at risk).
- `SUPPLIER_PRICE_SPIKE`, `WASTAGE_WRITEOFF`, `MANUAL_LEDGER_ADJUSTMENT`: owner-only, no delegation in MVP.
- The `exception_approvals` table gains: `escalated_to_user_id`, `escalated_at`, `value_cap_inr` on delegate policies.
- Owner must configure delegate assignments in the Policy Settings screen before go-live (M7b).
- All escalation events are logged in `immutable_audit_logs`.

---

## OD-020 — "Today's Sales" definition for owner dashboard

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M7 §12
**Question:** Does "Today's Sales" on the Pulse Header mean: (a) sum of confirmed order values, (b) sum of dispatched order values, or (c) sum of tax invoices issued?
**Impact:** Affects M7b read model query and owner expectations.
**Proposed default:** Sum of tax invoices issued today (dispatched = invoiced). Most accurate for revenue recognition. Confirm with owner.

---

## OD-021 — Dashboard refresh rate expectation

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M7 §12
**Question:** How frequently should the owner's Pulse Header update? Real-time (sub-second via WebSocket), near-real-time (~30-60 seconds via polling), or manual refresh?
**Impact:** Determines WebSocket infrastructure, materialised view refresh frequency.
**Proposed default:** 30-60 second refresh via SSE (server-sent events). WebSocket only for exception card push notifications.

---

## OD-022 — WhatsApp BSP provider selection

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M7 §12, §9
**Question:** Which WhatsApp Business Solution Provider (BSP) will Neo use? Options include Twilio, Gupshup, Kaleyra, 360dialog, Interakt.
**Impact:** API integration details differ by provider. Template approval process must begin early.
**Proposed default:** No code written against a specific BSP until confirmed. Notification hub uses an adapter interface so the provider is swappable.

---

## OD-023 — Opening balance cut-off date and data format

**Status:** CONFIRMED — 2026-10-22
**Decision:** Use a signed-off cut-off date and a controlled CSV import template. Accountant signs off the data before it is imported.
**Implementation:**
- A dedicated `opening_balance_imports` table stores each import batch: `id`, `import_type` (`CUSTOMER_AR | SUPPLIER_AP | INVENTORY`), `cut_off_date`, `status` (`DRAFT | SIGNED_OFF | IMPORTED | REVERSED`), `signed_off_by`, `signed_off_at`, `imported_by`, `imported_at`, `row_count`, `total_value`.
- Import template (CSV): `entity_code, entity_name, document_ref, document_date, due_date, amount_inr, currency` — one row per outstanding invoice/bill.
- Import is idempotent: can be re-run on DRAFT; only one import per `(import_type, cut_off_date)` can be SIGNED_OFF.
- Sign-off is a two-step action: accountant uploads + previews → owner or OPS_COORD clicks "Sign Off" → status moves to SIGNED_OFF → import runs → status becomes IMPORTED.
- Once IMPORTED, the batch can be REVERSED (posts equal and opposite entries) but cannot be re-imported.
- `customer_ledger_entries` and `supplier_ledger_entries` get `entry_type = OPENING_BALANCE` for these rows.
- Provide an import template download endpoint and a preview-before-import endpoint.
- Action: accountant to confirm cut-off date by end of Sprint 0 (target: last day of previous month).

---

## OD-024 — Standing negotiated customer prices ("price tiers")

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M1 §12, §6.2
**Question:** Do any customers have pre-agreed standing prices that differ from the daily floor/target? If so, can they still undercut the floor without approval?
**Impact:** Affects the pricing engine and how BR-01 is evaluated for tier customers.
**Proposed default:** No standing prices in MVP. All orders evaluated against the daily band. Add customer price agreements in Phase 2.

---

## OD-025 — Inter-site reservation: one fulfillment site per order, or across sites?

**Status:** AWAITING BUSINESS OWNER APPROVAL
**Source:** M3 §12
**Question:** When stock is short at the fulfillment site, can an order be partially filled from another site, or must it be fulfilled entirely from one site?
**Impact:** Affects the FEFO reservation algorithm complexity significantly.
**Proposed default:** Single fulfillment site per order in MVP. Multi-site fulfillment in Phase 2.

---

## Summary Table

| ID | Topic | Status |
|----|-------|--------|
| OD-001 | Min margin pct | CONFIRMED (10% gross) |
| OD-002 | Owner escalation value | AWAITING |
| OD-003 | Invoice timing + GST tax treatment | CONFIRMED (dispatch; mixed taxable/exempt) |
| OD-004 | e-Invoicing applicability | AWAITING (accountant) |
| OD-005 | e-Way bill generation | AWAITING |
| OD-006 | OTP channel for field auth | AWAITING |
| OD-007 | Multi-site coordinator | PROPOSED (multi-site) |
| OD-008 | Language support | PROPOSED (English MVP) |
| OD-009 | Price spike baseline | PROPOSED (same-supplier) |
| OD-010 | Backup supplier tolerance | PROPOSED (within 2%) |
| OD-011 | Freight allocation | PROPOSED (not MVP) |
| OD-012 | Yield basis | PROPOSED (issued RM) |
| OD-013 | Production mode | PROPOSED (MTO only) |
| OD-014 | ePOD OTP in MVP | PROPOSED (sig/photo only) |
| OD-015 | Custody wallet scope | PROPOSED (cash+cheque) |
| OD-016 | Cashier role | PROPOSED (Coordinator) |
| OD-017 | Allocation policy | PROPOSED (FIFO) |
| OD-018 | Accounting target | PROPOSED (Tally first) |
| OD-019 | Owner delegate | CONFIRMED (delegate + escalation, no auto-approve) |
| OD-020 | Today's sales definition | AWAITING |
| OD-021 | Dashboard refresh rate | PROPOSED (30-60s) |
| OD-022 | WhatsApp BSP provider | AWAITING |
| OD-023 | Opening balance data | CONFIRMED (signed-off CSV template) |
| OD-024 | Standing customer prices | PROPOSED (no MVP) |
| OD-025 | Inter-site reservation | PROPOSED (single-site MVP) |
