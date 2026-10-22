# NEO PROJECT — Enterprise Blueprint & Target Operating Model (Reconstructed)

**Product:** NeoCore — lightweight, mobile-first, exception-driven ERP/CRM
**Client:** Mr. X (Business Owner) & Neo Project leadership
**Scope:** Multi-site Food Trading + Processed Food Production
**Source:** `neobusiness_blueprint_argon.txt` (cleaned: broken tables, stray line breaks and typos fixed; module-level detail moved into the module files — see §10 Source Map)

> This file keeps the **business context** that spans all modules. Everything you build lives in `02`–`09`.

---

## 1. Executive Summary

Neo is an operationally active, multi-site business run by Mr. X across two coupled value streams:

- **Food Trading** — buying and selling food commodities.
- **Processed Food Production** — manufacturing finished goods at a factory (10–15 employees).
- **Logistics** — ~3–4 drivers plus dedicated delivery and collection staff.

**Core problem:** the business outgrew phone-based coordination and the owner became the bottleneck. Mr. X is a live human router for price negotiation, order capture, supplier price/shortage handling, production priority, driver dispatch, field troubleshooting and end-of-day account reconciliation. Operational state lives in calls, memory and loose notes, so one change (e.g. a supplier price hike) triggers a cascade of reactive calls.

**Solution:** not more admin headcount and not a heavy legacy ERP — **NeoCore**.

**Transformation objectives**

1. **Owner from "live router" → "exception approver".** Staff execute routine orders, pricing, dispatch and payment logging inside system guardrails. Mr. X acts only through one-tap approvals when margin, credit or supplier tolerances are breached.
2. **Eliminate verbal state.** Turn phone conversations into structured records: Quotes, Sales Orders, Purchase Orders, Production Batches, Trip Sheets, Collection Receipts.
3. **Close the financial loop.** Replace manual end-of-day account review with field collection capture, automated ledger posting and daily cash/bank reconciliation.

---

## 2. Confirmed Facts, Assumptions & Open Questions

### 2.1 Confirmed facts (from the case study)

| # | Fact |
| --- | --- |
| F1 | **Dual business model** — trading and manufacturing share customers, suppliers and logistics. |
| F2 | **Multi-site footprint** — factory, trading storage/warehouses, administrative points. |
| F3 | **Workforce** — Mr. X, a Production Manager, 10–15 factory staff, 3–4 drivers, delivery/collection staff. |
| F4 | **Communication bottleneck** — high daily call volume on pricing, orders, supplier negotiation, production, driver direction, payment follow-up. |
| F5 | **Supplier volatility** — suppliers change prices or short-ship, hitting customer commitments and margins. |
| F6 | **Financial vulnerability** — collections chased by staff and Mr. X; accounts checked manually at day end, with a documented risk of missed entries. |

### 2.2 Working architectural assumptions

| # | Assumption |
| --- | --- |
| A1 | Items are perishable/batch-tracked and use variable units (kg, crates, cartons, metric tons). |
| A2 | Drivers, collectors and the Production Manager have entry-level Android phones with intermittent 4G/5G; office staff use desktop browsers or tablets. |
| A3 | Prices move daily, so the business uses a **Daily Base Price List** with a negotiation band (Floor vs Target), not a static catalog. |
| A4 | Collections mix cash, bank transfer (NEFT/RTGS/IMPS/UPI) and post-dated cheques, collected by drivers or collection staff. |
| A5 | Regional tax invoicing is required (GST, HSN/SAC codes, e-Way bill / delivery challan for goods in transit). |

### 2.3 The 10 open questions and the default baseline to build against

| # | Open question | Current | **Default design baseline (confirm with Mr. X)** |
| --- | --- | --- | --- |
| 1 | How are customer orders recorded after a call? | Ad hoc / verbal | Order Desk logs the order in NeoCore during/after the call; later, a structured WhatsApp catalog bot. |
| 2 | Who approves customer pricing and supplier purchases? | 100% Mr. X | Tiered matrix. Staff confirm within Floor Price and approved supplier rates; variances **>3%** go to Mr. X's approval queue. |
| 3 | How are customer balances calculated/reconciled? | Manual EOD notes | Automated double-entry sub-ledger: invoices debit AR, verified receipts credit AR. |
| 4 | How is a delivery completed and who confirms it? | Verbal driver call | Driver captures **ePOD** (signature, photo of stamped challan, or OTP) plus delivered vs returned quantities. |
| 5 | What if a supplier can't fulfil the quantity? | Mr. X re-plans | System raises a **Shortfall Exception**, suggests ranked backup suppliers, or triggers partial-shipment / re-allocation. |
| 6 | How are raw-material needs sent to the factory? | Phone to Production Manager | Confirmed Sales Orders drive MRP against the BOM and push a digital Work Order to the factory tablet. |
| 7 | How are production quantity, wastage and finished goods recorded? | Informal | Production Manager closes Work Orders on a tablet: actual output, scrap weight, packaging lot numbers. |
| 8 | What must be visible per location? | Siloed by site | Stock, dispatch queues and cash registers segregated by location ID, with a consolidated owner view. |
| 9 | What stays with the owner vs delegated? | All with owner | Owner keeps: Daily Base Pricing, credit-limit overrides, non-standard supplier rate approvals, EOD cash sign-off. Everything routine is delegated. |
| 10 | What reports does the owner need? | Manual EOD review | Real-time mobile dashboard: daily cash/collections, margin by order, pending approvals, stock alerts, AR aging. |

---

## 3. Problem Analysis

```
CURRENT STATE: THE "OWNER BOTTLENECK" (HUB-AND-SPOKE)
=====================================================

   [Customers]            [Suppliers]            [3-4 Drivers]
  (Orders/Prices)     (Price Changes/Short)      (Route/Issues)
        \                      |                      /
         \------ (Phone) ------+------ (Phone) ------/
                               v
                     +--------------------+
                     |       MR. X        |  <-- single point of failure
                     |  (Business Owner)  |  <-- memory & manual notes
                     +--------------------+
                               ^
         /------ (Phone) ------+------ (Phone) ------\
        /                      |                      \
 [Production Mgr]      [Collection Staff]      [Manual EOD Books]
 (10-15 workers)       (payment status)        (missed entries!)
```

| Domain | Observed gap | Business / financial risk | Target improvement | Module |
| --- | --- | --- | --- | --- |
| **Sales & Pricing** | Negotiation on calls; agreed prices live in memory; supplier cost hikes not visible when quoting | Margin erosion; selling below replacement cost; billing disputes | Dynamic price guardrails: landed cost linked to quoting; floor prices let staff quote alone | M1 |
| **Order & Inventory visibility** | Stock checked by phone across sites; no committed-vs-available view | Stockouts and over-promising | Multi-site ATP with reservation on order confirmation | M3 |
| **Supplier & Procurement** | Price changes/shortages need urgent owner intervention | Late deliveries, emergency spot buying, unrecorded supplier performance | Exception-driven procurement, shortage workflows, split POs, fill-rate tracking | M2 |
| **Production alignment** | Requirements passed verbally; no link from sales to factory schedule | Idle labour or rush bottlenecks; low-priority items made while urgent orders wait | Demand-driven MRP: Sales Orders → prioritised Work Orders with BOM reservation | M4 |
| **Logistics & Delivery** | Drivers call Mr. X for routes, travel needs, exceptions | Owner distraction, unoptimised routes, unverified delivery claims, transit loss | Digital dispatch, trip sheets, in-app exceptions, mandatory ePOD | M5 |
| **Collections & Accounting** | Field collections tracked informally; manual EOD review | Revenue leakage, cash pilferage, forgotten credit invoices, owner burnout | Mobile receipts, instant WhatsApp receipt, automated EOD cash-handover reconciliation | M6 |

---

## 4. Future-State Target Operating Model

Move from an owner-centric hub-and-spoke model to a **tiered, process-driven model run by management-by-exception**.

```
FUTURE STATE: NEOCORE AS THE SYSTEM OF RECORD
=============================================

 [Customers] --> [Sales & Dispatch Coordinator]   (handles ~85% routine orders/routes)
                         |
                         v
            +--------------------------+
            |     NEOCORE CLOUD ERP    |  <-- real-time state, ATP inventory,
            |  (single source of truth)|      automated ledgers, audit trail
            +--------------------------+
              /        |        |       \
             v         v        v        v
      [Prod. Mgr] [Drivers] [Collectors] [MR. X - OWNER DASHBOARD]
     (Work Orders) (ePOD)   (Receipts)   (only the ~15% exceptions:
                                          price overrides, credit breaches,
                                          supplier shortfalls, EOD sign-off)
```

### Three operational layers

**Layer 1 — Standard execution (staff-led, ~85% of volume)**
- An **Operations / Sales Coordinator** (existing admin/collection staff, upskilled) takes routine order calls, enters quantities and quotes inside Mr. X's pre-approved daily band.
- The **Production Manager** sees confirmed demand on a factory tablet, runs batches and logs output without calling Mr. X.
- **Drivers & collection staff** see assigned stops, delivery quantities and collection targets on their phones and capture deliveries/payments digitally.

**Layer 2 — Exception escalation (system-routed, ~15% of volume)**
When a transaction breaks a rule (discount below floor, credit limit exceeded, supplier price hike above threshold, supplier short-ship), NeoCore pauses it and pushes an actionable **Exception Card** to Mr. X's phone.

**Layer 3 — Strategic control (owner-led)**
- **Morning (15 min):** update the **Daily Base Price & Floor Sheet**; review production and dispatch capacity.
- **Daytime (on demand):** approve / counter-offer / reject Exception Cards with one tap instead of 50+ unstructured calls.
- **Evening (15 min):** review the **Automated EOD Reconciliation Dashboard** — physical cash handed to the cashier vs digital receipts logged by field staff.

---

## 5. End-to-End Scenarios A–F (use these as cross-module acceptance tests)

### Scenario A — Customer negotiates a price  *(M1, M7)*
1. Customer asks for 500 kg of Item Y at ₹92/kg.
2. Staff enter the inquiry. Screen shows `Latest Cost ₹82 | Floor ₹90 | Target ₹95`.
3. **Within band:** ₹92 ≥ ₹90 → staff confirm on the call. **Zero calls to Mr. X.**
4. **Below band:** customer insists on ₹88 → staff tap *Request Price Override*. Mr. X gets: *"Customer ABC wants 500 kg Item Y @ ₹88 (Margin 7.3%, Floor ₹90). [Approve ₹88] [Counter ₹89.50] [Reject]"*. He taps *Counter ₹89.50*; staff relay it and lock the order.

### Scenario B — Supplier changes price  *(M2, M1, M7)*
1. Supplier raises Material Z from ₹50 to ₹56/kg (+12%).
2. Staff enter ₹56 on the draft PO → **BR-03** raises a *Supplier Price Spike* alert.
3. Card to Mr. X: *"Supplier X raised Material Z +12% (₹50→₹56). 3 open customer orders fall below 5% margin; Floor for Item Z must move ₹58→₹64."*
4. He taps *Approve PO & auto-update Floor Price to ₹64* and chooses whether to honour or renegotiate the 3 unconfirmed quotes.

### Scenario C — Supplier can't fulfil the quantity  *(M2, M3, M7)*
1. Order 1,000 kg from Supplier A; A can supply 600 kg.
2. Staff log `Confirmed Qty 600`. NeoCore books a 400 kg **Unfulfilled Deficit** and ranks backups (Supplier B ₹51/kg, Supplier C ₹52/kg) beside the affected orders.
3. If backup supply covers 400 kg within price tolerance → secondary PO issued. If total supply is short → Mr. X gets an **Allocation Card** to decide who gets full vs partial delivery.

### Scenario D — Delivery needs immediate attention  *(M5, M6, M7)*
1. Vehicle breakdown, road closure, or customer refuses bruised crates.
2. Driver taps **Report Issue** (e.g. *Customer Partial Rejection*), enters rejected qty, snaps a photo.
3. Alert goes to the **Logistics/Ops Coordinator** first; routine re-routing and returns into the credit-note queue are resolved by SOP. Only high-value disputes (e.g. full-load rejection) escalate to Mr. X.

### Scenario E — Customer payment outstanding  *(M6)*
1. 08:00 daily: NeoCore builds a prioritised **Collection Worklist** from overdue invoices and scheduled delivery stops.
2. At the customer, the agent sees the live ledger on their phone.
3. Cash/cheque paid → logged (**BR-07**), WhatsApp receipt fired, Mr. X's Cash-in-Transit tracker updates. Payment delayed → mandatory **Promise-to-Pay date + reason**, which schedules an automatic follow-up alert.

### Scenario F — Production must meet an upcoming order  *(M1, M3, M4, M5)*
1. Sales Order needs 200 cartons of Item P for tomorrow 2:00 PM; stock is 50.
2. NeoCore creates a **Net Production Requirement** of 150 cartons at the top of the Production Manager's queue, `Required By: tomorrow 11:00 AM`.
3. System checks BOM raw-material stock across sites. If available → Production Manager taps **Start Batch**, allocates workers, taps **Complete Batch** after packing → Dispatch is notified that 200 cartons are ready to load.

---

## 6. Business Rule Index

Full rule text, formulas and pseudo-logic are in the owning module file.

| Rule | One-line summary | Owner | Also touches |
| --- | --- | --- | --- |
| **BR-01** | Dynamic Pricing Band: price ≥ Floor auto-approves; below Floor → `PENDING_OWNER_APPROVAL` | M1 | M7 |
| **BR-02** | Credit Control: AR + new order > limit, or any invoice overdue beyond max days → block dispatch + Credit Hold exception (or COD) | M1 | M5, M6, M7 |
| **BR-03** | Supplier Price Variance: PO price > last purchase price by X% → lock PO for owner; flag affected open quotes/orders | M2 | M1, M7 |
| **BR-04** | Hard Inventory Allocation (ATP): confirming an order soft-locks stock; deficit on processed goods raises a Production Requisition | M3 | M1, M4 |
| **BR-05** | Blind Receiving & Shortfall: storekeeper enters actual qty without seeing PO qty; Received < PO → Shortfall Exception | M2 | M3, M7 |
| **BR-06** | Production Yield Tolerance: output + wastage vs standard input beyond ±3% → Abnormal Yield alert (stock still posts) | M4 | M7 |
| **BR-07** | Mobile Custody Chain for Cash: one collection = AR decreases AND agent wallet increases, atomically; cleared only on "Verify Cash Handover" | M6 | M7 |
| **BR-08** | Mandatory ePOD Closure: trip can't close until every invoice is Delivered (Full/Partial+returns) or Undelivered (+reason) | M5 | M6 |

---

## 7. MVP vs Phase 2+ Feature Matrix

| Area | MVP (Day-1 must-haves) | Phase 2+ |
| --- | --- | --- |
| **Sales & Pricing** | Customer master & credit limits; Daily Base/Floor price sheet; Quick Order Entry with margin check; one-tap owner exception approvals | WhatsApp self-service ordering bot; AI dynamic pricing from commodity index; salesperson commission engine |
| **Collections & Finance** | Automated invoicing from delivery; mobile field collection; **Agent Cash Custody Wallet** + EOD handover reconciliation; automated WhatsApp receipts | UPI dynamic QR on driver app; OCR of cheques and deposit slips; automated dunning reminders |
| **Delivery & Fleet** | Trip manifest builder & driver assignment (3–4 drivers); driver app with offline sync; mandatory ePOD + partial-delivery logging | Live GPS telemetry & route-optimisation AI; cold-chain sensors; crate/empty-container deposit ledger |
| **Suppliers & Procurement** | Supplier master & last-purchase-price memory; PO with price-spike and shortfall alerts; blind mobile GRN | Supplier portal / WhatsApp RFQ broadcast; 3-way match (PO/GRN/bill) with OCR; auto reorder-point POs |
| **Inventory & Multi-site** | Multi-site ledger (physical vs committed ATP); batch/expiry tracking; inter-site transfer workflow | Barcode/QR labels & scanners; Bluetooth/RS232 weighing-scale integration |
| **Factory Production** | Basic BOM/recipe master; sales-to-production demand queue; tablet Work Order closure (output + wastage) | Machine downtime & OEE; biometric attendance; granular batch costing |

---

## 8. Implementation Roadmap, Testing, Risks, KPIs

### 8.1 Twelve-week roadmap (four 3-week sprints)

> The original calls these "Phase 0–3". They are renamed **Sprint 0–3** here to avoid clashing with "MVP / Phase 2+" in §7.

```
SPRINT 0 (wk 1-3)        SPRINT 1 (wk 4-6)          SPRINT 2 (wk 7-9)          SPRINT 3 (wk 10-12)
Discovery & master data  Order-to-Cash & Collections Logistics & Multi-Site     Production & Procurement
======================   ==========================  =======================    ========================
- Lock 10 open questions - Go-live: Customer Master  - Go-live: Driver App      - Go-live: Factory Tablet
- Cleanse customer AR &  - Go-live: Daily Price List - Trip manifests & ePOD    - BOMs & Work Orders
  supplier AP balances   - Go-live: Sales Order Desk - Multi-site ATP stock     - Supplier POs & shortfall
- Map SKU & BOM masters  - Go-live: Mobile field     - Blind GRN at warehouses    - Full executive dashboard
- Provision cloud infra    collections & EOD cash    - Full Tally/accounting      - Sign-off & optimisation
                           custody reconciliation      bridge sync
```

**Why Order-to-Cash first:** the case study ranks Order Lifecycle, Owner Workload, Collections/Financial Records and Delivery Coordination as the four high-priority areas. Stopping leakage at EOD and removing routine calls gives ROI within ~6 weeks.

### 8.2 Testing & validation

1. **Conference Room Pilot (CRP):** walk Mr. X, the Production Manager and lead collection staff through clickable wireframes using Scenarios A–F *before* production code.
2. **7-day parallel run (week 6):** run mobile collections + EOD cash handover alongside Mr. X's manual review; NeoCore must catch 100% of transactions and surface anything the manual process missed.
3. **Offline / low-connectivity stress test:** Driver and Collector apps in airplane mode and weak 2G/3G — ePOD photos, partial deliveries and receipts queue in local SQLite and sync with **no duplicates**.
4. **Guardrail & penetration test:** try to bypass Floor Price, Credit Limit and Cash Custody with non-owner accounts; RBAC and DB triggers must block it.

### 8.3 Adoption risks & mitigation

| Risk | Context | Mitigation |
| --- | --- | --- |
| Owner habit regression | Customers/drivers keep calling Mr. X's mobile directly | Call-redirection script: *"I've approved your price band on the desk — transferring you to [Coordinator] to lock your dispatch slot."* |
| Field digital literacy | Drivers/factory staff struggle with English-heavy ERP screens | Zero-typing, local-language UI; large colour-coded buttons; voice-note attachments; numeric keypad only |
| Shadow pricing / cash leakage | Collector takes cash and delays logging to use the float | Only instant WhatsApp receipts count as proof of payment; any `COD` delivery blocks trip closure until cash is logged |
| Master-data fatigue | BOM recipes and opening balances stall go-live | Progressive enrichment: launch with simple SKUs and verified opening AR; add multi-level BOMs in Sprint 3 |

### 8.4 KPIs (Day-90 targets)

| # | KPI | Baseline | Day-90 target | Measured by |
| --- | --- | --- | --- | --- |
| 1 | Owner operational call volume | ~40–70+ routine calls/day | **< 10/day** (80%+ via tap approvals) | Call-log sample + Exception Queue count |
| 2 | EOD reconciliation time | 60–90 min, with missed entries | **< 10 min** | Timestamps: EOD close initiated → owner sign-off |
| 3 | Missed financial entries | Frequent risk | **0%** (100% digital receipt + wallet match) | Weekly audit: AR disputes vs cash register |
| 4 | Routine order confirmation speed | Waits on Mr. X | **< 2 min** within floor | `Order Created` → `Order Confirmed` timestamps |
| 5 | Unplanned margin-erosion events | Unmeasured | **100% visibility** before order lock (BR-01, BR-03) | Orders sold below target margin without owner override |
| 6 | Delivery completion visibility | Reconstructed via calls | **100% real-time ePOD** | % of trips closed with valid ePOD before 8:00 PM |

Instrumentation needed for each KPI is specified in `09_M7_Control_Tower_Exceptions.md` §9.

---

## 9. Review Notes — Gaps, Inconsistencies & Resolutions

These are things I found while reconstructing the blueprint. Each module file implements the **proposed resolution**; confirm with Mr. X / the team and change if needed.

| # | Finding in the original | Proposed resolution (used in this pack) |
| --- | --- | --- |
| G1 | **Invoice timing contradicts itself.** §6.1 invoices *after* delivery; §6.7 says "instant invoicing upon dispatch"; MVP says "from delivery". | Generate the tax invoice **at dispatch** (the invoice/challan must travel with goods — A5). Differences found at ePOD are settled with a **credit note**. Confirm with the accountant. |
| G2 | **Order status mismatch.** Schema enum has 7 values; §6.1 lifecycle has 9 (no `IN_PRODUCTION_SOURCING`, no partial delivery). | Unified enum in M1: `DRAFT, PENDING_APPROVAL, CONFIRMED, IN_PRODUCTION_SOURCING, READY, DISPATCHED, DELIVERED_FULL, DELIVERED_PARTIAL, CLOSED, CANCELLED, REJECTED`. |
| G3 | **Append-only vs mutable.** §7.3 says `collection_receipts` is append-only, but the schema updates `handover_status` on it. | Receipts stay immutable. Handover is recorded in a new `cash_handovers` + `custody_ledger` (M6). |
| G4 | **Tables the features need but the schema lacks:** quotes, GRN, stock reservations, stock transfers, production requisition, work-order materials/outputs, attendance log, vehicles, delivery challans, trip expenses, issue reports, invoice lines, receipt allocations, credit notes, PTP follow-ups, custody & AR ledgers, EOD closings, notifications, approver policies, business-rule config, cheque (PDC) register, supplier bills/payments. | Added to the owning module, each tagged `ADD`. |
| G5 | **Location granularity.** Schema only has `sites`, but §6.4 needs Raw-Material Store, FG Store and *In-Transit Vehicles* as separate stock locations. | New `locations` table (M0) with `location_type` incl. `VEHICLE`. |
| G6 | **Units & tax fields.** Dual UoM / catch-weight has no conversion fields; `hsn_code` missing despite A5. | `uom_conversions`, `qty_secondary` columns, and `items.hsn_code` added (M1/M3). |
| G7 | **Margin vs markup.** Scenario A's "7.3%" is markup on cost ((88−82)/82); margin on price is 6.8%. | Define `margin_pct = (price − cost) / price`. Floor derives from `min_margin_pct`. Scenario numbers are treated as illustrative. |
| G8 | **Thresholds disagree:** supplier variance 2% (BR-03) vs 3% (Q2); shortfall 20% (TOM) vs "any shortfall" (BR-05); yield ±3% (BR-06) vs wastage 5% (RBAC). | All thresholds live in `business_rule_config` (M0) with defaults; nothing hard-coded. |
| G9 | **Exception types incomplete.** Schema lists 5; the text also needs allocation, wastage write-off, stock variance, credit rebate/write-off, delivery dispute, manual ledger adjustment. | Enum extended in M7. |
| G10 | **Roadmap sequencing conflicts.** (a) Invoicing-from-delivery in Sprint 1 but ePOD/driver app in Sprint 2. (b) Blind GRN in Sprint 2 but POs in Sprint 3. (c) Dispatch credit block before the fleet module exists. | (a) Sprint 1 invoices on coordinator's "Mark Dispatched". (b) GRN ships in Sprint 2 *without* PO link; PO linkage + shortfall added Sprint 3. (c) `CreditPort` enforced at "Mark Dispatched" first, then at trip loading. See README §4. |
| G11 | **Offline vs "instant" receipt.** Offline collection can't send a WhatsApp receipt or get a server receipt number immediately. | Device-scoped provisional receipt numbers; WhatsApp receipt fires on sync; idempotency keys prevent duplicates. |
| G12 | **Cheques.** A4 says post-dated cheques are collected, but there's no cheque lifecycle. | Cheque register in M6: `RECEIVED → DEPOSITED → CLEARED / BOUNCED`. |
| G13 | **Owner is still a single approver.** Exceptions pile up if Mr. X is unavailable — the original bottleneck again. | Approval policy table with optional delegate + escalation timer (M7). Needs Mr. X's decision. |
| G14 | **Minor:** "9 domains" in the §6 heading but only 8 subsections; two "Phase" numbering schemes; stray typo ("necessariamente"); broken table formatting. | Cleaned in this file. |

---

## 10. Source Map — where each original section now lives

| Original section | Now in |
| --- | --- |
| 1 Executive Summary | This file §1 |
| 2 Facts / Assumptions / Open Questions | This file §2 |
| 3 Problem Analysis | This file §3 |
| 4 Target Operating Model | This file §4 |
| 5.1 Modules overview | `00_README_Build_Guide.md` |
| 5.2 RBAC matrix | `02_M0_Platform_Foundation.md` §4 |
| 5.3 Business rules BR-01…BR-08 | §6 index here; full text in M1 (01, 02), M2 (03, 05), M3 (04), M4 (06), M6 (07), M5 (08) |
| 5.4 Scenarios A–F | This file §5 (+ per-module acceptance tests) |
| 6.1–6.2 Sales, CRM | `03_M1_Commercial_CRM.md` |
| 6.3 Supplier & Procurement | `04_M2_Procurement_Supplier.md` |
| 6.4 Multi-site Inventory | `05_M3_Inventory_Warehouse.md` |
| 6.5 Factory Production | `06_M4_Factory_Production.md` |
| 6.6 Logistics & Delivery | `07_M5_Fleet_Dispatch_Delivery.md` |
| 6.7 Collections & Day-End | `08_M6_Collections_Financials.md` |
| 6.8 Reporting & Control Tower | `09_M7_Control_Tower_Exceptions.md` |
| 7.1 Architecture | `00_README_Build_Guide.md` §7 and `02_M0_Platform_Foundation.md` |
| 7.2 Database schema | Split across all module files (tables tagged `BP` = in original, `ADD` = proposed) |
| 7.3 Security & fraud prevention | `02_M0_Platform_Foundation.md` §6 |
| 7.4 Integrations | WhatsApp/FCM → M7; Google Maps → M5; Tally/Zoho bridge → M6 |
| 8 MVP vs Future | This file §7 (and per-module §11) |
| 9 Roadmap / Testing / Risks / KPIs | This file §8 |
