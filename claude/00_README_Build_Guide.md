# NeoCore — Module-by-Module Build Pack

Reconstructed from the Neo business blueprint. One file per module so you can build, test and ship them one at a time.

**Legend used in every file**

- `BP` — taken directly from the original blueprint.
- `ADD` — proposed by this reconstruction because the blueprint implied it but never specified it. Change freely.
- `[DECISION]` — needs Mr. X's or the team's confirmation before you build that part.

---

## 1. Files in this pack

| File | Contents | Original blueprint ref |
| --- | --- | --- |
| `00_README_Build_Guide.md` | This guide: build order, module contracts, conventions, thresholds, stack | §5.1, §7.1 |
| `01_Blueprint_Reconstructed.md` | Business context, TOM, scenarios A–F, roadmap, KPIs, **gap review (G1–G14)** | §1–4, 5.4, 8, 9 |
| `02_M0_Platform_Foundation.md` | **ADD** — auth, RBAC, sites/users/locations, audit, config, offline sync, security | §5.2, 7.1–7.3 |
| `03_M1_Commercial_CRM.md` | Customers, items, daily price/floor sheet, quotes, sales orders | M1 |
| `04_M2_Procurement_Supplier.md` | Suppliers, POs, price-spike & shortfall handling, GRN document | M2 |
| `05_M3_Inventory_Warehouse.md` | Multi-site ledger, ATP, batches/FEFO, transfers, stock posting | M3 |
| `06_M4_Factory_Production.md` | BOM, demand-to-production, work orders, yield & wastage | M4 |
| `07_M5_Fleet_Dispatch_Delivery.md` | Trips, driver app, ePOD, returns, issue reports | M5 |
| `08_M6_Collections_Financials.md` | Invoicing, AR/AP, receipts, custody wallets, EOD, accounting bridge | M6 |
| `09_M7_Control_Tower_Exceptions.md` | Exception engine, notification hub, owner dashboards, analytics | M7 |

Every module file has the same 13 sections:
1 Purpose & scope · 2 Roles & permissions · 3 Data model · 4 Business rules · 5 Workflows & state machines · 6 Screens · 7 API · 8 Events & ports · 9 Integrations, jobs & instrumentation · 10 Acceptance criteria · 11 MVP vs Phase 2+ · 12 Open questions · 13 Build checklist.

---

## 2. Dependency map

```
                        M0 PLATFORM FOUNDATION
        (auth, RBAC, sites/locations, audit, config, offline sync)
                                 |
              +------------------+------------------+
              |                                     |
     M7a EXCEPTION ENGINE                           |
     + NOTIFICATION HUB   <---- every module raises exceptions / sends messages
              |
   M1 COMMERCIAL & CRM  ------ order.confirmed ------+-----------------+
        |   (price floor, credit)                     |                 |
        |                                             v                 v
        |                                   M3 INVENTORY  <---- M2 PROCUREMENT
        |                                   (ATP, FEFO,          (PO, GRN doc,
        |                                    ledger)              shortfall)
        |                                     |   ^
        |                      production req |   | output / consume
        |                                     v   |
        |                                   M4 FACTORY
        |                                     | workorder.completed
        |                                     v
        +-------- trip.dispatched ----> M5 FLEET & DELIVERY
                                              | delivery.* (ePOD)
                                              v
                                    M6 COLLECTIONS & FINANCIALS
                                              |
                                              v
                          M7b OWNER DASHBOARDS & ANALYTICS (reads all)
```

---

## 3. Module contracts — build independently, integrate later

Modules **never read each other's tables**. They call each other through *ports* (synchronous, in-process interfaces) and react to *domain events* (asynchronous, via an outbox → queue). Until a module exists, wire its port to a **stub** so the others can ship.

### 3.1 Ports

| Port | Owner | Key methods | Used by | Stub until built |
| --- | --- | --- | --- | --- |
| `PricingPort` | M1 | `getBand(item, date)`, `lastPrices(customer, item, n=5)` | M2, M7 | — (M1 is built first) |
| `ItemPort` | M1 | `getItem(id)`, `getUomConversion(item, from, to)` | M2, M3, M4, M5, M6 | — (M1 is built first) |
| `CreditPort` | M1 (reads M6) | `evaluate(customer, orderValue)`, `canDispatch(order)` | M1, M5 | Uses manual AR balance field |
| `InventoryPort` | M3 | `checkATP(location, item, qty)`, `reserve(orderLine)`, `release(...)`, `postDispatch(...)`, `postReturn(...)`, `postGRN(...)` | M1, M2, M4, M5 | Always returns "available"; no ledger |
| `ProcurementPort` | M2 | `latestLandedCost(item)`, `createBackToBackPO(orderLine)`, `suggestBackups(item, qty)` | M1, M3, M4 | Landed cost typed in manually on the price sheet |
| `ProductionPort` | M4 | `createRequisition(orderLine, qty, requiredBy)`, `workOrderStatus(id)` | M1, M3 | Logs requirement only |
| `LedgerPort` | M6 | `postInvoice(...)`, `postReceipt(...)`, `postCreditNote(...)` | M5 | Writes invoices only |
| `ExceptionPort` | M7a | `raise(type, ref, payload)`, `onResolved(type, handler)` | all | — (build right after M0) |
| `NotifyPort` | M7a | `send(channel, template, recipient, payload)` | all | Log-only |

### 3.2 Domain events

| Event | Published by | Consumed by | Effect |
| --- | --- | --- | --- |
| `price.updated` | M1 | M2, M7 | Recheck open quotes; refresh dashboards |
| `order.pending_approval` | M1 | M7 | Create PRICE_OVERRIDE / CREDIT_BREACH card |
| `order.confirmed` | M1 | M3, M2, M4 | Reserve stock; back-to-back PO suggestion; production requirement |
| `stock.reserved` / `stock.insufficient` | M3 | M1, M4 | Update line allocation; trigger requisition |
| `production.requisition_created` | M3/M1 | M4 | Add to Production Manager queue |
| `workorder.completed` | M4 | M3, M5, M1 | Post stock; mark order READY; notify dispatch |
| `po.price_spike_detected` | M2 | M7, M1 | Owner card; flag open quotes/orders |
| `po.shortfall_detected` | M2 | M7, M3 | Shortfall / Allocation card; backup PO suggestions |
| `grn.posted` | M3 | M2, M6 | Update PO received qty; supplier AP |
| `trip.dispatched` | M5 | M6, M1, M3 | Invoice; order → DISPATCHED; stock to in-transit |
| `delivery.completed` / `delivery.partial` / `delivery.failed` | M5 | M1, M6, M3 | Order status; credit note; return stock |
| `collection.logged` | M6 | M1, M7 | AR drops; credit hold recalculated; pulse updates |
| `handover.verified` | M6 | M7 | Wallet cleared; EOD checklist updates |
| `exception.requested` | any | M7 | Create approval card |
| `exception.resolved` | M7 | originating module | Resume / cancel the paused transaction |
| `eod.closed` | M6 | M7 | Trigger accounting export; freeze day |

---

## 4. Recommended build order (aligned to the 12-week roadmap)

| Step | Build | Sprint | Notes / stubs |
| --- | --- | --- | --- |
| 1 | **M0** Platform Foundation | 0 (wk 1–3) | Everything depends on it. Seed sites, users, config thresholds |
| 2 | **M7a** Exception engine + notification hub (log-only first) | 0–1 | M1's price override needs it on day one |
| 3 | **M1** Commercial & CRM | 1 (wk 4–6) | `InventoryPort` stub = unlimited stock; landed cost entered by hand |
| 4 | **M6** Invoicing, receipts, custody wallets, EOD | 1 | **G10a:** invoice when coordinator taps *Mark Dispatched* (until M5 exists) |
| 5 | **M3** Inventory & ATP (+ GRN posting without PO link) | 2 (wk 7–9) | Replace the `InventoryPort` stub; **G10b** |
| 6 | **M5** Fleet, driver app, ePOD | 2 | Invoice trigger moves to `trip.dispatched`; **G10c** credit block moves to trip loading |
| 7 | **M6 part 2** Accounting bridge (Tally/Zoho) | 2 | Nightly export |
| 8 | **M4** Factory production | 3 (wk 10–12) | Start with single-level BOM |
| 9 | **M2** Procurement (PO, price spike, shortfall, GRN↔PO link) | 3 | Replaces manual landed cost |
| 10 | **M7b** Owner dashboards & analytics | 3 | Reads everything; build the *Pulse Header* earlier if Mr. X wants it sooner |

**Per-module definition of done:** schema migrated → services + ports implemented → API documented → screens working for each role → acceptance criteria (§10 of the module file) passing → audit-log entries verified → offline path tested where the module has a mobile screen.

---

## 5. Global conventions (ADD — adjust to taste)

| Topic | Convention |
| --- | --- |
| Primary keys | UUIDv7 (time-ordered). Blueprint says only `id (PK)` |
| Money | `numeric(14,2)`, currency INR; never float |
| Quantity | `numeric(14,3)` in the item's primary UoM; secondary-UoM quantity stored alongside |
| Timestamps | `timestamptz`, stored UTC, displayed in `Asia/Kolkata` |
| Standard columns | `created_at`, `created_by`, `updated_at`, `updated_by` on every mutable table |
| Soft delete | `is_active` or status; **no hard deletes** on anything financial or stock |
| Corrections | Append-only tables are corrected by **reversal entries**, never UPDATE/DELETE |
| Document numbers | `PREFIX-YYMM-NNNN` from `doc_sequences` (e.g. `SO-2611-0042`); per-device prefix for offline receipts |
| Idempotency | Every mobile write carries a client-generated `idempotency_key` |
| Status fields | Text enums enforced by `CHECK` constraints; transitions only via service methods |
| Audit | Every create/update/approve on business tables writes `immutable_audit_logs` |
| Masking | Cost, margin, supplier rates hidden for non-privileged roles at the API serialisation layer |

---

## 6. Configurable business thresholds (`business_rule_config`)

Seed these defaults; **none are hard-coded** (resolves G8).

| Key | Default | Source |
| --- | --- | --- |
| `customer_price_variance_pct` | 3 | Open Q2 baseline |
| `supplier_price_variance_pct` | 2 | BR-03 / TOM Layer 2 |
| `supplier_shortfall_exception_pct` | 0 *(any shortfall)* — TOM example uses 20 | BR-05 / TOM |
| `yield_variance_tolerance_pct` | 3 | BR-06 |
| `wastage_writeoff_owner_approval_pct` | 5 | RBAC, Production Manager |
| `quote_validity_hours` | 4 | §6.1 |
| `default_credit_limit_inr` | 100000 | BR-02 example |
| `default_max_overdue_days` | 15 | BR-02 example |
| `ar_aging_buckets` | `0-7, 8-15, 16-30, 30+` | §6.8 |
| `collection_worklist_time` | `08:00` | Scenario E |
| `trip_close_deadline` | `20:00` | KPI 6 |
| `dispatch_buffer_hours` | 3 | Scenario F (delivery 2 PM → required by 11 AM) |
| `owner_escalation_value_inr` | *[DECISION]* | Scenario D "high-value disputes" |
| `min_margin_pct_default` | *[DECISION]* | BR-01 |

---

## 7. Technology stack (from blueprint §7.1)

| Layer | Blueprint recommendation | Note |
| --- | --- | --- |
| Backend | Modular monolith — Node.js/NestJS **or** Python/FastAPI | One deployable; one code module per `M#` |
| Database | PostgreSQL (ACID, row-level security, immutable audit log) | `SERIALIZABLE` or `READ COMMITTED` + row locks for stock and ledgers |
| Cache / queue | Redis + BullMQ | BullMQ is Node-only; with FastAPI use Arq or Celery |
| Object storage | S3 / GCS | ePOD photos, challan and invoice PDFs |
| Owner & field mobile | Flutter or React Native + SQLite (WatermelonDB-style sync) | Offline-first for Driver and Collector |
| Factory / warehouse | PWA touch UI + barcode/weight | Tablet |
| Office web | React / Next.js | Coordinator desk |
| Gateway / security | JWT, RBAC middleware, rate limiting, TLS 1.3 | See M0 |
| Integrations | WhatsApp Business API, FCM, Google Maps Routes API, Tally Prime / Zoho Books bridge | Owned by M7, M7, M5, M6 respectively |

**Suggested repo layout (ADD)**

```
/apps
  /api            # modular monolith
    /src/modules
      /m0-platform  /m1-commercial  /m2-procurement  /m3-inventory
      /m4-production /m5-fleet  /m6-finance  /m7-control-tower
    /src/shared    # ports, event bus, outbox, money/qty utils
  /mobile         # owner + driver + collector (offline-first)
  /tablet         # factory + warehouse PWA
  /web            # office desk
/db/migrations    # one migration folder per module
/docs/modules     # these files
```

---

## 8. End-to-end smoke test (run after every module is added)

Use Scenarios A–F from `01_Blueprint_Reconstructed.md` §5. A minimal chain that proves the whole system:

1. Owner sets the daily floor price (M1).
2. Coordinator confirms a within-band order, then a below-band order → owner approves on phone (M1 + M7).
3. Stock is reserved; a shortfall on a processed item creates a Work Order (M3 + M4).
4. Work Order completes; order becomes READY (M4).
5. Trip is built, loaded, dispatched; invoice issued (M5 + M6).
6. Driver captures ePOD and COD cash offline; it syncs without duplicates (M5 + M6).
7. Collector logs a collection; customer gets a WhatsApp receipt (M6 + M7).
8. EOD: wallets verified, checklist all green, owner signs off (M6 + M7).
