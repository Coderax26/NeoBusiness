# NEO Business Operations Platform
## Lightweight ERP/CRM — Complete Product and Technical Blueprint

**Version:** 1.0  
**Prepared for:** Neo Project  
**Prepared from:** `neo_project_detailed_business_case_study.pdf`  
**Date:** 16 October 2026  
**Document status:** Implementation blueprint; confirm open decisions during discovery

---

## 1. Executive design decision

Neo should implement one browser-based, mobile-friendly operational system with a shared transaction record from **customer request → quote/order → fulfilment → delivery → collection → reconciliation**. The same record must be able to generate purchasing and production work without the owner re-keying the information.

The first release should be a **modular monolith** rather than a collection of separate applications. It should be simple to deploy and train, but use clean domain boundaries so accounting, warehouse, route planning, or integrations can be expanded later. The platform should optimize for:

1. One current status for every customer order.
2. Clear responsibility at every stage.
3. Owner involvement only for approvals and exceptions.
4. Accurate inventory, delivery, receivable, and collection records.
5. Site-level visibility with consolidated management dashboards.
6. Fast mobile entry for drivers, collectors, production, and factory staff.

The case study does not provide transaction volumes, tax rules, accounting policy, product recipes, payment methods, or approval limits. Those are explicitly configurable or marked as discovery decisions below; they must not be hard-coded from assumptions.

---

## 2. What the case study says the system must solve

Neo trades food items and produces processed food across multiple locations. The owner currently coordinates customers, prices, suppliers, production, delivery, drivers, collections, and end-of-day financial review mainly through telephone calls and manual records. The principal risks are missed information, repeated follow-up, unclear ownership, supplier changes affecting commitments, delivery interruptions, incomplete collection records, and excessive owner dependency.

### 2.1 Future-state outcomes

| Outcome | System capability | Initial measure |
|---|---|---|
| Reduce owner dependency | Assignment queues, approval rules, exception inbox | Fewer routine calls/escalations |
| Preserve customer commitments | Versioned quotes, confirmed price and availability | 100% of confirmed orders have an auditable price |
| Improve fulfilment | Purchase, production, allocation, and shortage workflows | Order status visible without phone calls |
| Improve delivery control | Dispatch board, driver mobile status, proof of delivery | Every dispatch has a completion outcome |
| Improve cash visibility | Receivables ledger, collection tasks, payment allocation | Daily outstanding balance agrees to ledger |
| Coordinate sites | Site dimension on every operational transaction | Site and consolidated views available |
| Scale safely | Role permissions, audit trail, configurable approvals | Staff can complete routine work without owner |

### 2.2 Non-goals for the first release

Do not begin with a full enterprise accounting suite, advanced route optimization, payroll, biometric attendance, e-commerce, predictive analytics, or complex manufacturing planning. Build reliable operational control first and integrate or extend later where justified by volume.

---

## 3. Product principles and operating model

### 3.1 Principles

* **Record once, reuse everywhere:** a confirmed order is the source for fulfilment, dispatch, invoice/receivable, and reporting.
* **Status over conversation:** calls and messages may remain useful, but a status, owner, due date, and next action must exist in the system.
* **Exception-based management:** normal work goes to the responsible role; the owner sees approvals, breaches, shortages, overdue cash, and unresolved exceptions.
* **Append-only financial history:** corrections use reversals or adjustments; users do not silently overwrite financial history.
* **Site-aware by default:** every stock, order, production, dispatch, collection, and cash record has a site.
* **Mobile-first field work:** delivery and collection entries must work on a phone with intermittent connectivity.
* **Simple language:** use business terms such as customer, order, dispatch, collection, shortage, and production batch.
* **Configuration before customization:** approval thresholds, statuses, numbering, taxes, and templates must be configurable.

### 3.2 Proposed responsibility model

| Role | Owns | Can approve/escalate |
|---|---|---|
| Business owner / administrator | Policy, sensitive approvals, consolidated oversight | Price overrides, exceptional credit, supplier exceptions, write-offs |
| Sales / customer coordinator | Customer records, enquiries, quotes, order capture | Within assigned price authority |
| Procurement coordinator | Supplier records, purchase requests/orders, supplier confirmations | Within purchasing authority |
| Production manager | Plans, releases, and completes production batches | Material substitution or delay escalation |
| Site/storekeeper | Receipts, transfers, stock counts, picking | Stock adjustments within authority |
| Dispatch coordinator | Dispatch planning, driver assignment, delivery exceptions | Reassignment and rescheduling |
| Driver / delivery staff | Delivery status, quantities, proof, cash collected | No price or credit changes |
| Collection staff | Follow-up tasks, payment capture, receipt evidence | No deletion or write-off |
| Finance reviewer | Reconciliation, allocations, receivable review | Adjustments within authority |
| Factory employee | Assigned production steps and quantity/wastage entry | No master-data or financial changes |

One person may hold multiple roles in a small operation. Permissions must follow the role, not the job title.

---

## 4. Scope and release plan

### Release 0 — Discovery and configuration (2–3 weeks)

Confirm product units and pack sizes, sites, opening balances, price authority, credit policy, tax/invoice rules, payment methods, delivery completion rules, recipes/BOMs, production yields, approval limits, and report formats. Observe at least one real order, delivery, collection, supplier purchase, and production cycle.

### Release 1 — Operational control (8–12 weeks)

* Authentication, users, roles, sites, audit log.
* Customers, contacts, suppliers, products, units, price lists.
* Enquiries, quotations, sales orders, order status and approval.
* Purchase requests, purchase orders, goods receipt.
* Inventory ledger and site stock.
* Production orders/batches with material issue and finished receipt.
* Dispatch, driver assignment, proof of delivery.
* Receivables, collection tasks, payment receipts, allocation.
* Owner dashboard, role queues, notifications, exports.

### Release 2 — Stabilization and scale (4–8 weeks)

* Supplier price history and customer price alerts.
* Stock counts, transfers, wastage and expiry controls.
* Delivery/collection offline queue and route sequencing.
* Better production planning, recurring orders, customer statements.
* Accounting export/integration after finance mapping is approved.
* KPI trends, aging, margin and site performance.

### Release 3 — Optional extensions

Advanced route optimization, barcode scanning, WhatsApp/SMS provider integration, customer portal, supplier portal, batch traceability, demand forecasting, and native mobile apps should be justified by measured usage.

---

## 5. Functional architecture

### 5.1 Module map

1. **Platform and administration**
2. **CRM and customer management**
3. **Sales and order management**
4. **Procurement and supplier management**
5. **Inventory and multi-site stock**
6. **Production and batch management**
7. **Dispatch and delivery**
8. **Collections and receivables**
9. **Finance control and reconciliation**
10. **Notifications, tasks, reporting, and audit**

All modules use shared identity, sites, products, parties, attachments, notes, tasks, approvals, and audit events.

### 5.2 Navigation

* Dashboard
* My work
* Customers
* Sales
* Procurement
* Inventory
* Production
* Dispatch
* Collections
* Reports
* Administration

Every list needs search, filters, saved views, pagination, CSV export, and a visible “last updated” timestamp.

---

## 6. Detailed component design

## 6.1 Platform and administration

### Capabilities

* Email/phone login, password reset, optional one-time code.
* User, role, site, and active/inactive status management.
* Site hierarchy: company → operating site → warehouse/factory/store area.
* Number sequences by document type and site.
* Configurable statuses, payment methods, units, tax codes, reason codes, and approval thresholds.
* Attachment storage for signed delivery notes, receipts, invoices, supplier documents, and photos.
* In-app notification center and task inbox.
* Audit log with who, when, action, old value, new value, and source device.

### Rules

* A user sees only permitted sites and data.
* Deactivation prevents new work but preserves history.
* Master data is archived, not deleted, once referenced.
* Time is stored in UTC and displayed in the company timezone.
* All documents have immutable identifiers.

## 6.2 CRM and customer management

### Customer record

Customer code, legal/display name, customer type, phone, alternate phone, email, addresses, delivery locations, preferred contact method, assigned owner, price list, payment terms, credit limit, tax details, active status, notes, and attachments.

### CRM activities

Log calls, messages, visits, enquiries, follow-ups, complaints, and commitments. A call log should capture outcome and next action; it should not pretend to record a call automatically unless telephony integration is later approved.

### Customer lifecycle

`Lead → Qualified → Active customer → On hold → Inactive`

An active customer may be placed on hold for overdue credit, but historic orders remain visible.

## 6.3 Sales, quotation, and order management

### Enquiry

Capture customer, requested products, quantity, requested delivery date/site, source, notes, and next action. Convert an enquiry to a quote without re-keying.

### Quote

Quote header: quote number, customer, validity date, price list, currency, tax mode, delivery location, salesperson, and notes. Quote lines: product, specification/pack, requested quantity, unit, unit price, discount, tax, and line total. Record supplier/production cost estimate separately so cost is not exposed to customers.

Quote states: `Draft → Pending approval → Sent → Negotiating → Accepted → Rejected → Expired → Converted`.

Version every change to price, quantity, validity, or delivery promise. Acceptance records user, timestamp, method, and attachment/signature if applicable.

### Sales order

Create from an accepted quote or directly for an authorized user. Capture confirmed commercial terms, requested and committed dates, fulfilment source (`stock`, `purchase`, `production`, `mixed`), site, delivery address, payment terms, and internal notes.

Order states: `Draft → Pending approval → Confirmed → Partially allocated → Ready to dispatch → Dispatched → Partially delivered → Delivered → Partially collected → Paid → Closed`, with controlled `Cancelled` and `On hold` states.

### Sales rules

* A user cannot confirm a price outside their authority without an approval task.
* Orders cannot be dispatched above available/allocated quantity unless an authorized override exists.
* Credit-hold customers require owner/finance approval.
* A change after confirmation creates an order revision and re-evaluates fulfilment, price, delivery, and credit.
* Partial fulfilment is explicit; never silently close an order with a short quantity.

## 6.4 Procurement and supplier management

### Supplier record

Supplier code, name, contacts, addresses, products supplied, lead time, payment terms, currency, tax details, reliability notes, active status, and attachments.

### Purchase request

Generated from an order shortage, production material requirement, reorder point, or manual request. It includes source reason, required-by date, site, product, quantity, and urgency.

### Purchase order

States: `Draft → Pending approval → Sent → Supplier confirmed → Partially received → Fully received → Closed → Cancelled`.

Capture agreed unit price, quantity, expected delivery, site, freight/other charges, tax, payment terms, supplier reference, and confirmation evidence. Maintain price history by supplier/product/date; never overwrite prior prices.

### Shortage and supplier exception

When confirmed supplier quantity is below requirement or price changes beyond a configured tolerance, create an exception with options: alternate supplier, partial fulfilment, customer re-quote, production reschedule, or owner decision. Link the decision to affected sales orders and purchase orders.

## 6.5 Inventory and multi-site stock

### Product master

SKU, name, category, trading/finished/raw-material classification, base unit, selling units and conversion factors, purchase unit, tax code, reorder minimum/maximum, shelf-life/expiry requirement, batch requirement, preferred suppliers, and active status.

Use decimal quantities; do not use floating-point money. Store money as integer minor units or a fixed-precision decimal with currency.

### Stock ledger

Every movement is an immutable ledger entry: receipt, issue, sale allocation, production consumption, finished production, transfer out, transfer in, adjustment, wastage, return, or reversal. Each entry references source document, product, batch/lot if required, site, quantity, unit cost, and user.

Available stock = on-hand − reserved − quarantined. Show on-hand, reserved, available, incoming, and committed quantities separately.

### Operations

* Goods receipt against purchase order; allow partial receipt and rejected quantity.
* Picking/packing against sales order.
* Site-to-site transfer with `Requested → In transit → Received`.
* Stock count with variance approval.
* Wastage/expiry with reason and approval.
* Customer return with inspection outcome.

Do not make negative stock the default. If emergency negative stock is allowed, require a reason and approval and show it prominently.

## 6.6 Production and batch management

### Production master data

Product recipes/BOMs, input materials, standard quantities, expected yield, process steps, by-products, wastage tolerance, unit conversions, and revision effective dates. A recipe revision cannot rewrite a historical batch.

### Production order

Created from confirmed demand, forecast/reorder request, or manual plan. Fields: production number, site, finished product, planned quantity, required date, source orders, recipe revision, priority, supervisor, and notes.

States: `Draft → Planned → Materials pending → Released → In progress → Quality check → Completed → Closed`, plus `Cancelled` and `On hold`.

### Batch execution

1. Reserve or request required materials.
2. Issue actual material quantities to the batch.
3. Record start/end, operators, equipment/area, quantity produced, rejects/wastage, and notes.
4. Record quality check and release decision.
5. Receive accepted finished quantity into stock.
6. Link finished batch to source customer orders and expiry/lot data where required.

The system must distinguish planned quantity from actual consumption, actual output, and wastage. A production delay or material shortage automatically creates an exception against affected commitments.

## 6.7 Dispatch and delivery

### Dispatch plan

Create from one or multiple ready orders for a site/route/date. Capture dispatch number, driver, vehicle (optional), dispatcher, planned sequence, packages/quantities, cash expected, and delivery instructions.

States: `Planned → Assigned → Picked → Out for delivery → Delivered → Partially delivered → Failed → Returned → Closed`.

### Driver mobile workflow

* View assigned stops and customer contact/address.
* Start trip and mark arrival.
* Confirm delivered quantity by line.
* Record shortage, rejection, damage, customer unavailable, or reschedule reason.
* Capture recipient name/signature/photo/GPS only if legally and operationally approved.
* Record cash/transfer reference collected.
* Work offline and sync with conflict handling.

A delivery completion must record who confirmed it, when, quantities accepted/rejected, and evidence. A driver must not edit the commercial order price.

### Delivery exceptions

Create a task immediately for failed delivery, shortage, damage, customer dispute, cash mismatch, or address problem. Assign to dispatch, sales, finance, or owner based on reason and severity.

## 6.8 Collections and receivables

### Receivable lifecycle

An invoice/charge or approved delivery creates a receivable according to the chosen accounting policy. Because the case study does not confirm invoicing rules, configure one of:

* Invoice at order confirmation.
* Invoice at dispatch.
* Invoice at delivery.
* Manual finance entry/import.

Do not build duplicate ledgers. Select the policy during discovery and make the trigger explicit.

### Collection task

Customer, document(s), amount due, due date, aging bucket, assigned collector, priority, promised payment date, last contact, next action, and outcome.

Collection states: `Open → Contacted → Promise to pay → Part paid → Paid → Disputed → Escalated → Written off (authorized only)`.

### Payment receipt

Receipt number, payer, date/time, method, amount, currency, reference, bank/cash account, collector, evidence, and allocation to one or more receivables. Unallocated payments remain visible in a suspense queue; never force an incorrect allocation.

### Controls

* No deletion of receipts; use reversal with reason and approval.
* Cash collected by a driver/collector is reconciled to dispatch/collection totals.
* Overdue and disputed balances generate tasks.
* End-of-day close compares expected versus recorded collections and requires acknowledgement of variance.

## 6.9 Finance control and reconciliation

This is an operational receivables and cash-control layer, not a claim that the first release is a statutory accounting system. Provide:

* Customer statement and aging.
* Supplier payable view from approved purchase receipts/invoices where available.
* Daily cash/collection summary by user, site, and method.
* Expected versus actual delivery collection.
* Bank/cash account register and reconciliation status.
* Exportable transaction file for the accountant.
* Period close that prevents edits without reopening authorization.

Map the platform to the accountant’s chart of accounts before enabling a live accounting integration.

## 6.10 Tasks, notifications, and exception inbox

Every work item has assignee, team, site, priority, due date, status, source document, and next action. Queues are filtered by “My work”, “My site”, “Overdue”, and “Needs owner”.

Notification channels:

* In-app: mandatory.
* Email: optional for management and approvals.
* SMS/WhatsApp: optional provider integration; never make core processing dependent on message delivery.

Escalate when an approval is overdue, committed delivery is at risk, supplier price/quantity breaches tolerance, customer is on credit hold, collection is overdue, or production misses its required date.

## 6.11 Reporting and dashboards

### Owner dashboard

Today’s orders, orders at risk, pending approvals, dispatches in progress, failed deliveries, overdue receivables, collections today versus expected, supplier shortages/price changes, production due today, stock-outs, and unresolved exceptions. Every metric drills into source records.

### Role dashboards

Sales: open enquiries, quotes awaiting response, orders requiring fulfilment, customer holds.  
Procurement: purchase requests, confirmations due, late suppliers, shortages.  
Production: batches due, material shortages, in-progress output, wastage.  
Dispatch: today’s dispatches, unassigned orders, failed deliveries, cash due.  
Collections: due today, overdue aging, promises due, collector variance.  
Site manager: stock, pending receipts, transfers, open exceptions, daily activity.

### Standard reports

Sales by customer/product/site/date; order funnel and cycle time; gross margin where costs are reliable; purchase price history; supplier fulfilment; inventory valuation and movement; stock aging/expiry; production plan versus actual; delivery success and short delivery; receivable aging; collection effectiveness; cash variance; audit report.

Reports must show filters, generated time, data period, and timezone. Export access follows role permissions.

---

## 7. End-to-end workflows

### 7.1 Customer requirement to cash

1. Sales captures enquiry or order.
2. System checks customer status, price authority, credit, stock, incoming supply, and production capacity.
3. Sales issues quote or records direct order.
4. Required approval is routed to the authorized user.
5. Customer acceptance confirms the order and locks the commercial revision.
6. System reserves stock and creates purchase requests or production orders for shortages.
7. Storekeeper picks; dispatch groups ready lines into a dispatch.
8. Driver delivers and records actual quantities, evidence, and collection.
9. System posts delivery outcome and creates/updates receivable according to policy.
10. Collector follows up; payment is recorded and allocated.
11. Finance/site closes daily variance; order closes only when fulfilment and financial obligations are resolved.

### 7.2 Supplier price change

1. Procurement records new supplier quote with effective date.
2. System compares it with prior price and open purchase orders.
3. If tolerance is exceeded, create a supplier exception.
4. Link affected customer orders and show margin/commitment impact.
5. Authorized user chooses accept, alternate supplier, customer re-quote, partial fulfilment, or cancel.
6. Preserve old and new prices, decision, approver, and affected documents.

### 7.3 Supplier shortage

1. Receipt records ordered, received, rejected, and short quantity.
2. System creates shortage against purchase order and affected sales/production demand.
3. Procurement proposes alternate source or revised quantity/date.
4. Sales/owner approves customer impact where needed.
5. Replan production/dispatch and notify assignees.

### 7.4 Upcoming production order

1. Confirmed demand creates or is linked to a production order.
2. Planner validates recipe revision, material availability, and capacity.
3. Materials are reserved or purchase requests are created.
4. Production manager releases the batch.
5. Factory records actual consumption, output, wastage, and quality result.
6. Finished goods are received and allocated to demand.
7. Delay, shortage, or failed quality creates an exception and updates order risk.

### 7.5 Failed delivery and cash mismatch

1. Driver marks failed/partial delivery with reason and evidence.
2. System returns or quarantines undelivered stock as appropriate.
3. Dispatch creates reschedule task; sales is notified of customer impact.
4. Expected cash is recalculated from accepted quantity.
5. Collector/driver submits actual cash and reference.
6. Any variance goes to finance review; it cannot be silently closed.

---

## 8. Data model

### 8.1 Core entities

`Organization`, `Site`, `User`, `Role`, `Permission`, `Customer`, `Supplier`, `Contact`, `Address`, `Product`, `Unit`, `PriceList`, `TaxCode`, `PaymentTerm`, `Vehicle`, `Driver`, `Recipe`, `RecipeRevision`.

### 8.2 Transaction entities

`Enquiry`, `Quote`, `QuoteLine`, `SalesOrder`, `SalesOrderLine`, `PurchaseRequest`, `PurchaseOrder`, `PurchaseOrderLine`, `GoodsReceipt`, `GoodsReceiptLine`, `StockLedgerEntry`, `StockReservation`, `StockTransfer`, `StockCount`, `Wastage`, `ProductionOrder`, `ProductionMaterial`, `ProductionOutput`, `QualityCheck`, `Dispatch`, `DispatchLine`, `DeliveryEvent`, `Receivable`, `CollectionTask`, `PaymentReceipt`, `PaymentAllocation`, `CashSession`, `Exception`, `Approval`, `Task`, `Notification`, `Attachment`, `Comment`, `AuditEvent`.

### 8.3 Mandatory common fields

All business records should include `id` (UUID), human-readable number where relevant, `organization_id`, `site_id` where applicable, `status`, `created_at`, `created_by`, `updated_at`, `updated_by`, and optional `deleted_at` only for non-financial master data. Transaction records also need `version` for optimistic concurrency.

### 8.4 Key relationships

* Customer 1—many enquiries, quotes, orders, receivables, payments.
* Quote 1—many versions and lines; accepted quote 0—1 sales order.
* Sales order 1—many lines, reservations, dispatch lines, receivables, and exceptions.
* Supplier 1—many purchase orders and price records.
* Purchase order 1—many receipts; receipt posts stock ledger entries.
* Production order consumes stock and produces stock; it may fulfil many order lines.
* Dispatch contains lines from one or more orders; delivery events update dispatch lines.
* Payment receipt allocates to one or more receivables and is immutable after posting.
* Every approval, task, exception, attachment, and audit event references a source record.

### 8.5 Data quality rules

Required customer phone or alternate contact before order confirmation; unique product SKU; unique document numbers per organization/sequence; positive quantities; valid unit conversion; no closed-period edits; no duplicate payment reference within the same account; valid site access; no hard deletion of referenced records.

---

## 9. Technical architecture

### 9.1 Recommended stack

* **Web UI:** responsive React/TypeScript application or equivalent.
* **API:** typed REST API with OpenAPI; modular monolith with domain services.
* **Database:** PostgreSQL with UUID keys, constraints, indexes, and transactional ledger writes.
* **Background jobs:** queue for notifications, scheduled aging, exports, and sync retries.
* **Object storage:** S3-compatible private bucket for attachments and delivery evidence.
* **Authentication:** managed identity provider or secure application auth with MFA option.
* **Deployment:** containerized web/API/worker plus managed database; separate staging and production.
* **Observability:** structured logs, error tracking, health checks, audit events, uptime alerts.

The exact vendors can change; the interfaces and data ownership should not.

### 9.2 API boundaries

Use resource-oriented endpoints such as:

`/customers`, `/products`, `/quotes`, `/sales-orders`, `/purchase-orders`, `/inventory`, `/production-orders`, `/dispatches`, `/receivables`, `/payments`, `/tasks`, `/reports`.

Commands that cause business transitions should be explicit (`confirm`, `approve`, `allocate`, `dispatch`, `deliver`, `receive-payment`, `close`) and validated server-side. Do not let clients change status with arbitrary update requests.

### 9.3 Reliability and concurrency

* Database transaction for each status transition and ledger posting.
* Idempotency key for payment, receipt, delivery sync, and external webhook commands.
* Optimistic version check on edits; show conflict rather than overwriting.
* Outbox event table for reliable notifications/integration.
* Retry transient jobs with backoff; surface permanent failures in an admin queue.
* Daily automated backups, point-in-time recovery where available, and tested restore procedure.

### 9.4 Offline field operation

The mobile web experience stores only assigned work and unsynced entries locally. Each offline command has a client ID, timestamp, user, and idempotency key. On reconnection the API accepts valid commands, rejects stale/conflicting commands with a human-readable reason, and preserves the attempted event for review. Do not permit offline price changes, approvals, write-offs, or master-data edits.

---

## 10. Security, permissions, and audit

### 10.1 Access control

Use least privilege with role + site scope. Separate permissions for view, create, edit, approve, post, reverse, export, and administer. Sensitive fields such as cost, margin, credit limit, and write-off authority require separate permission.

### 10.2 Required controls

* MFA for owner, administrators, and finance approvers.
* Secure password hashing and session expiration.
* TLS in transit and encryption at rest.
* No secrets in source control; use environment/secret manager.
* Rate limiting and input validation on API endpoints.
* Attachment type/size validation and malware scanning where available.
* Audit all price, credit, stock, production, dispatch, receipt, payment, approval, and permission changes.
* Mask personal data in exports where not needed.
* Backups encrypted and access logged.

### 10.3 Audit event shape

`event_id`, actor, role, site, timestamp, action, entity type/id, request/correlation ID, previous values, new values, reason, IP/device metadata where policy permits. Audit data is append-only and accessible to authorized reviewers.

---

## 11. User experience and screen specifications

### Shared screen behavior

Every detail page shows status, responsible person, site, dates, linked documents, activity timeline, tasks, exceptions, and audit history. Primary actions are status-aware. Destructive actions require reason and confirmation; financial actions use reversal, not delete.

### Minimum screens

1. **Login and site selection:** identity, selected site, last login, support.
2. **Owner dashboard:** KPI cards with drill-down and exception list.
3. **My work:** tasks grouped by overdue/today/upcoming.
4. **Customer detail:** contact, open orders, balances, activities, delivery locations.
5. **Quote/order editor:** product search, price authority indicator, margin/availability warnings, approval action.
6. **Order fulfilment view:** allocation, procurement, production, dispatch, delivery, receivable timeline.
7. **Procurement board:** request-to-receipt status and supplier exceptions.
8. **Inventory by site:** availability, reservations, movements, count/transfer actions.
9. **Production board:** batches due, material readiness, actual output/wastage.
10. **Dispatch board:** date/site filters, assignment, route order, driver status.
11. **Driver delivery view:** one action per stop, offline indicator, proof capture.
12. **Collections board:** aging, promises, receipt capture, variance queue.
13. **Reports:** filters, saved views, export, drill-down.
14. **Administration:** users, roles, sites, numbering, rules, templates, audit.

### Mobile design

Large touch targets, minimal typing, product/customer search, camera attachment, clear sync state, no dense tables, and a deliberate “save and continue” flow. Test with real drivers and collectors on low bandwidth.

---

## 12. Notifications and document templates

Templates should exist for quote, order confirmation, purchase order, delivery note, receipt, customer statement, supplier shortage notice, and collection reminder. Templates use organization/site identity and configurable language. A generated document records its source revision.

Notification events include approval requested, approval completed/rejected, supplier confirmation late, stock shortage, production due/late, dispatch assigned, delivery failed, payment due/overdue, and collection variance. Notifications are reminders, not the system of record.

---

## 13. Implementation steps

### Step 1 — Confirm the operating model

Workshop the real order-to-cash flow with owner, sales, production, dispatch, collection, finance, and one site representative. Document actual exceptions rather than only the ideal path.

### Step 2 — Establish master data

Clean customers, suppliers, products, units, pack sizes, sites, price lists, payment terms, recipes, opening stock, and opening receivables. Assign owners for future maintenance.

### Step 3 — Configure authority

Agree price discount bands, credit limits, purchase limits, stock adjustment limits, write-off authority, production release authority, and owner escalation rules.

### Step 4 — Prototype the critical slice

Build customer → quote/order → stock/purchase/production → dispatch → delivery → payment. Run it with representative data and real users before adding optional features.

### Step 5 — Validate controls

Test partial delivery, supplier shortage, price change, credit hold, failed delivery, cash mismatch, duplicate payment retry, offline sync, permission denial, and reversal.

### Step 6 — Pilot one site and one route

Use a controlled pilot for two weeks. Compare system records to actual paper/phone activity daily. Fix labels and workflow friction before rollout.

### Step 7 — Migrate and train

Load opening balances with reconciliation sign-off. Train by role using scenario cards. Nominate a super-user at each site.

### Step 8 — Go live with support

Freeze master-data changes during cutover, take a backup, verify users and sequences, operate a daily issue triage, and require owner sign-off on the first week’s reconciliation.

### Step 9 — Measure and improve

Review KPIs weekly for the first eight weeks; prioritize exceptions and adoption problems, not feature requests detached from measured need.

---

## 14. Testing and acceptance

### Functional acceptance scenarios

* Create customer, quote, approval, acceptance, and order.
* Confirm order with stock allocation and with shortage.
* Generate purchase request/order and partial receipt.
* Generate production order, issue materials, record output/wastage, and receive finished goods.
* Pick, dispatch, deliver partially, capture proof, and reschedule balance.
* Create receivable, follow up, receive part payment, allocate, and show aging.
* Record supplier price change and trace affected customer commitments.
* Restrict user by role/site and verify denied actions.
* Reverse payment/stock adjustment with reason and audit.
* Disconnect driver device, record delivery, reconnect, sync once, and resolve conflict.

### Non-functional acceptance

* Common list/detail pages load within an agreed target under expected concurrent usage.
* No duplicate posting when the user retries a command.
* Backup restore is demonstrated.
* Every critical transaction is auditable.
* Exported totals reconcile to screen totals for the same filter.
* Mobile workflows are usable on the agreed devices and network conditions.

### Definition of done

Code reviewed, automated tests pass, migration is repeatable, permissions are tested, audit events exist, user help text is present, staging acceptance is signed, backup/restore is verified, and a rollback plan exists.

---

## 15. KPI baseline and target framework

Capture a baseline during discovery, then track:

* Owner calls/escalations per day and percentage of routine versus exception.
* Order entry to confirmation time.
* Quote acceptance rate and price override rate.
* Order fill rate and on-time delivery rate.
* Failed/partial delivery rate and reason.
* Supplier on-time/in-full rate and purchase price variance.
* Production plan adherence, yield, and wastage.
* Stock accuracy and stock-out frequency.
* Days sales outstanding and overdue amount.
* Collection success versus amount due.
* Cash variance by collector/site.
* Percentage of transactions completed in the system.
* Open exceptions by age and owner.

Do not set numeric targets until a two-to-four-week baseline is available.

---

## 16. Open decisions requiring Neo sign-off

1. Legal entity, currency, tax/VAT/GST, invoice numbering, and statutory requirements.
2. Sites, warehouses, stock ownership, and inter-site transfer policy.
3. Product catalogue, unit conversions, pack sizes, batches, expiry, and traceability needs.
4. Price authority, discount limits, customer credit limits, and approval hierarchy.
5. When revenue/receivable is created: order, dispatch, delivery, or accountant import.
6. Accepted payment methods, bank/cash accounts, receipt evidence, and reconciliation owner.
7. Delivery proof: signature, photo, GPS, customer code, or another method.
8. Production recipes, expected yields, quality checks, wastage tolerance, and batch rules.
9. Whether drivers/collectors use shared phones or personal devices.
10. Connectivity constraints and supported Android/iOS/browser devices.
11. Required integrations: accounting, WhatsApp/SMS, maps, printers, barcode scanners.
12. Data retention, privacy, backup retention, and audit access policy.
13. Historical data to migrate and opening-balance sign-off owner.
14. Reports required daily, weekly, monthly, and for accountant/auditor use.

These decisions are gates, not hidden assumptions. The implementation team should maintain a signed decision register and update configuration/design when answers change.

---

## 17. Recommended first backlog

| Priority | Epic | First outcome |
|---|---|---|
| P0 | Identity, roles, sites, audit | Safe delegated access |
| P0 | Master data | Reliable customers, products, suppliers |
| P0 | Sales order lifecycle | One order record from request to commitment |
| P0 | Inventory ledger | Trustworthy stock by site |
| P0 | Dispatch/delivery | Visible fulfilment and proof |
| P0 | Receivables/collections | Daily outstanding and collection control |
| P1 | Procurement | Supplier commitments and shortages |
| P1 | Production | Demand-driven batch planning and actuals |
| P1 | Exceptions/approvals | Owner handles only decisions and risk |
| P1 | Dashboards/reports | Management visibility without calls |
| P2 | Offline sync | Reliable field use in weak connectivity |
| P2 | Accounting/integrations | Reduce re-entry after policy is confirmed |

---

## 18. Final recommendation

Neo should not digitize the existing phone-call pattern as a collection of disconnected forms. The application should make the operating model explicit: every commitment is a record, every record has an owner and next action, every handoff creates a visible status, every exception has a reason and escalation path, and every financial or stock movement is auditable.

Start with one complete operational loop and a disciplined pilot. When the owner can open one dashboard and answer “what is due, what is at risk, who owns it, and what cash is outstanding?” without calling several people, the lightweight ERP/CRM is delivering the value identified in the case study.
