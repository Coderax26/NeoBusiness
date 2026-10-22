# NeoBus — Blueprint Traceability Matrix

**Purpose:** Map every blueprint requirement, business rule, and scenario to a module, implementation task, and acceptance test. Use this to verify nothing was dropped.

---

## 1. Business Rules

| Rule ID | Description | Module | Service / Method | Test Location |
|---------|-------------|--------|-----------------|---------------|
| BR-01 | Dynamic Pricing Band: price >= floor auto-approves; below floor -> PENDING_APPROVAL | M1 | PricingService.evaluateLine() | M1 §10 items 1-3 |
| BR-02 | Credit Control: AR + order > limit OR overdue > max_days -> block + CREDIT_BREACH | M1 | CreditService.evaluate() + canDispatch() | M1 §10 items 4-5; M5 §10 item 4 |
| BR-03 | Supplier Price Variance: PO > last price by threshold% -> lock PO, flag open orders | M2 | POService.onLineSave() | M2 §10 items 1-2 |
| BR-04 | Hard Inventory Allocation: confirm order -> reserve stock; deficit -> production/trading req | M3 | InventoryService.reserve() | M3 §10 items 1-4 |
| BR-05 | Blind Receiving + Shortfall: storekeeper sees no PO qty; received < confirmed -> shortfall | M2 | GRNService.recordBlind() | M2 §10 items 5-6 |
| BR-06 | Production Yield Tolerance: output+waste vs. input beyond +-3% -> YIELD_VARIANCE | M4 | CompletionService.checkYield() | M4 §10 item 5 |
| BR-07 | Mobile Custody Chain: collection = AR credit + custody wallet debit, atomically | M6 | CollectionService.logCollection() | M6 §10 items 1-2 |
| BR-08 | Mandatory ePOD Closure: trip cannot close until all stops have final state + ePOD | M5 | TripService.canClose() | M5 §10 items 1-5 |

---

## 2. End-to-End Scenarios (Cross-Module Acceptance Tests)

### Scenario A — Customer negotiates a price (M1, M7)

| Step | Owner | Test |
|------|-------|------|
| Customer asks 500 kg @ 92 | M1 | PricingService returns IN_BAND(92 >= 90) |
| Within band: confirm with zero calls | M1 | Order status = CONFIRMED; no exception raised |
| Below band: staff taps Request Override | M1 | Order status = PENDING_APPROVAL; PRICE_OVERRIDE raised |
| Owner receives push card | M7a | FCM push received within 30s; card has correct payload |
| Owner counters 89.50 | M7a | exception_approvals.status = COUNTERED; counter_json has price |
| Coordinator accepts counter | M1 | Order confirmed at 89.50; audit log has both users |
| Staff cannot confirm below-floor via API | M1 | 403 Forbidden on direct API call |

### Scenario B — Supplier changes price (M2, M1, M7)

| Step | Owner | Test |
|------|-------|------|
| Staff enters PO with +12% price | M2 | BR-03 fires; PO status = PENDING_APPROVAL |
| Card sent to owner | M7a | Card contains old->new price, %, count of affected orders, suggested floor |
| Owner taps "Approve PO & update floor" | M7a | PO issued; M1 floor updated; open orders rechecked |

### Scenario C — Supplier can't fulfil quantity (M2, M3, M7)

| Step | Owner | Test |
|------|-------|------|
| Staff logs confirmed_qty = 600 of 1000 | M2 | po_shortfalls row created; deficit = 400 |
| Backup suppliers ranked | M2 | Supplier B before C (lower price) |
| Backup PO covers deficit | M2 | shortfall.status = COVERED_BY_BACKUP |
| Total supply still short | M2 | ALLOCATION card raised; affected orders listed |

### Scenario D — Delivery needs immediate attention (M5, M6, M7)

| Step | Owner | Test |
|------|-------|------|
| Driver taps Report Issue: Customer Partial Rejection | M5 | issue_report created; routed to Coordinator |
| Value < escalation threshold | M7a | Owner receives NO notification |
| Value >= threshold or CUSTOMER_FULL_REJECTION | M7a | Owner push notification received |

### Scenario E — Customer payment outstanding (M6)

| Step | Owner | Test |
|------|-------|------|
| 08:00 worklist built | M6 | Overdue customers appear; today's delivery stops included |
| Agent logs collection | M6 | AR decreases; wallet increases; WhatsApp receipt fired |
| Payment delayed | M6 | Agent forced to enter PTP date + reason |
| PTP not kept | M6 | ptp_followups.status = BROKEN; priority increased |

### Scenario F — Production must meet upcoming order (M1, M3, M4, M5)

| Step | Owner | Test |
|------|-------|------|
| SO for 200 cartons; FG stock = 50 | M3 | 50 reserved; requisition for 150 created |
| Required By = delivery - buffer_hours | M4 | Requisition.required_by = tomorrow 11:00 |
| PM taps Start Batch; RM availability checked | M4 | Green if RM available; blocked with shortage message if not |
| PM taps Complete Batch | M4 | PROD_CONSUME + PROD_OUTPUT in one transaction |
| workorder.completed emitted | M4 | M1 order -> READY; dispatch notified |

---

## 3. Module-Level Requirements Traceability

### M0 Platform Foundation

| Requirement | Source | Implementation | Test |
|-------------|--------|---------------|------|
| JWT auth, refresh, OTP | BP §7.1, M0 §1 | AuthService, auth endpoints | M0 AC-1 |
| RBAC middleware | BP §5.2 | RbacGuard, permission codes | M0 AC-2 |
| Site-level RLS | BP §7.3, M0 §5 | PostgreSQL RLS policies | M0 AC-1 |
| Sensitive field masking | BP §7.3, M0 §5 | @Sensitive decorator + serializer | M0 AC-2 |
| Immutable audit log | BP §7.3, M0 §3 | AuditInterceptor + immutable_audit_logs | M0 AC-6 |
| business_rule_config | G8, M0 §1 | ConfigService + seed | M0 AC-5 |
| Location hierarchy (G5) | ADD | locations table with location_type | M0 data model |
| Document numbering | ADD | DocSequenceService | doc_sequences table |
| Offline sync / idempotency | BP + G11 | idempotency_keys table + middleware | M0 AC-4 |
| Append-only ledger triggers | BP §7.3 | PostgreSQL triggers + REVOKE | M0 AC-3 |

### M1 Commercial and CRM

| Requirement | Source | Implementation | Test |
|-------------|--------|---------------|------|
| Customer master with credit profile | BP §6.1, M1 §3 | CustomerService | M1 AC-4,5 |
| Daily floor/target price sheet | BP §6.1, M1 §4 BR-01 | PricingService, daily_price_lists | M1 AC-1,2,8 |
| Quick Order Entry | BP §6.1, M1 §6 S1 | Order API + screen | M1 AC-1,2,3 |
| Order state machine (G2) | ADD | OrderStateMachine | M1 AC-1,2 |
| Price memory (last 5) | BP §6.2 | price-memory query | M1 AC-7 |
| Quote with expiry | ADD | QuoteService + expiry job | M1 AC-6 |
| Credit control BR-02 | BP §6.1 | CreditService | M1 AC-4,5 |
| Items with HSN, UoM, catch-weight (G6) | ADD | items table + uom_conversions | M1 §3 |
| PricingPort, CreditPort, ItemPort | ADD | Port interfaces | Integration |
| order.confirmed event | ADD | OrderService.confirm() | Scenario A |

### M2 Procurement and Supplier

| Requirement | Source | Implementation | Test |
|-------------|--------|---------------|------|
| Supplier master + last price memory | BP §6.3, M2 §1 | SupplierService | M2 AC-8 |
| PO with BR-03 price spike | BP BR-03, M2 §4 | POService.onLineSave() | M2 AC-1,2 |
| Shortfall exception (BR-05) | BP BR-05, M2 §4 | GRNService.checkShortfall() | M2 AC-3,4,6 |
| Blind GRN (storekeeper sees no price/qty) | BP §6.3, M2 §4 | GRN API with masked response | M2 AC-5 |
| Back-to-back trading PO | BP §6.3 | POService.createBackToBack() | M2 AC-7 |
| Backup supplier ranking | Scenario C, M2 §4 | BackupSupplierService | M2 AC-3 |
| Supplier performance tracking | BP §6.3 | SupplierPerformanceJob | M2 AC-8 |
| ProcurementPort | ADD | Port implementation | Integration |

### M3 Inventory and Warehouse

| Requirement | Source | Implementation | Test |
|-------------|--------|---------------|------|
| Multi-site stock ledger | BP §6.4, M3 §1 | LedgerPostingService | M3 AC-2,5 |
| ATP = physical - committed | BP §6.4, M3 §4 BR-04 | ATQService.checkATP() | M3 AC-2 |
| FEFO reservation | BP §6.4, M3 §4 | ReservationService (FOR UPDATE) | M3 AC-3 |
| Concurrency: no double-allocation | M3 §10 AC-1 | Row locking | M3 AC-1 |
| Append-only stock_ledger_txns | BP §7.3, M3 §4 | REVOKE + trigger | M3 AC-5 |
| Vehicle VEHICLE location type | G5 | locations.location_type = VEHICLE | M3 AC-6 |
| Batch/expiry tracking | A1, M3 §4 | inventory_batches with expiry | M3 AC-3 |
| Inter-site transfers | M3 §5 | TransferService | M3 AC-7 |
| Adjustment approval workflow | M3 §5 | AdjustmentService + exception | M3 AC-7 |
| InventoryPort | ADD | Port implementation | Integration |

### M4 Factory Production

| Requirement | Source | Implementation | Test |
|-------------|--------|---------------|------|
| BOM master with versioning | BP §6.5, M4 §3 | BOMService | M4 AC-3 |
| Demand-driven requisition from sales | BP §6.5, M4 §4 | RequisitionService + ProductionPort | M4 AC-1,2 |
| Work Order state machine | BP §6.5, M4 §5 | WorkOrderStateMachine | M4 AC-4 |
| RM availability check at Start Batch | M4 §4 | WorkOrderService.start() | M4 AC-3 |
| Completion: consume + output + yield (BR-06) | BP BR-06, M4 §4 | CompletionService | M4 AC-4,5 |
| Wastage approval > 5% | M4 §4 | WastageService + exception | M4 AC-6 |
| Idempotent completion (retry safe) | M4 §10 AC-9 | idempotency_key on complete | M4 AC-9 |
| No price/cost fields in PROD_MGR responses | M4 §10 AC-7 | @Sensitive masking | M4 AC-7 |
| ProductionPort | ADD | Port implementation | Integration |

### M5 Fleet Dispatch and Delivery

| Requirement | Source | Implementation | Test |
|-------------|--------|---------------|------|
| Trip builder with capacity check | BP §6.6, M5 §4 | TripBuilderService | M5 AC internal |
| Credit hold enforcement at dispatch | BP BR-02, M5 §4 | CreditPort.canDispatch() | M5 AC-4 |
| Mandatory ePOD closure (BR-08) | BP BR-08, M5 §4 | TripService.canClose() | M5 AC-1,2,3 |
| COD blocks trip close until logged | M5 §4 | TripService.canClose() | M5 AC-5 |
| Issue routing (Coordinator first) | Scenario D, M5 §4 | IssueRoutingService | M5 AC-6 |
| Delivery idempotency (offline retry) | M5 §10 AC-7 | idempotency_key on deliver | M5 AC-7 |
| GPS + device timestamp on ePOD | M5 §10 AC-8 | DeliveryStopService | M5 AC-8 |
| Driver sees no prices or other customers | M5 §10 AC-9 | Driver DTO masking | M5 AC-9 |
| Invoice created on trip.dispatched | G10a -> M6 | M6 listens to trip.dispatched | M5 AC-10 |
| Delivery challan PDF | A5 | ChallanService | M5 §3 |

### M6 Collections and Financials

| Requirement | Source | Implementation | Test |
|-------------|--------|---------------|------|
| Invoice at dispatch (G1) | G1, M6 §4 | InvoiceService handles trip.dispatched | M6 AC-8 |
| GST split by place of supply | A5, M6 §4 | InvoiceService.calculateGST() | M6 AC-8 |
| BR-07 atomic collection transaction | BP BR-07, M6 §4 | CollectionService.logCollection() | M6 AC-1,2 |
| Custody wallet per agent | M6 §3 | custody_ledger + cash_handovers | M6 AC-3,4 |
| Append-only receipts + ledgers | G3, M6 §5 | REVOKE + triggers | M6 AC-5 |
| Cheque lifecycle | G12, A4 | ChequeService | M6 AC-5 |
| AR aging + credit hold update | M6 §4 | ARAgingJob (00:30) | M6 §4 |
| EOD 10-minute checklist | BP §6.7, M6 §5 | EODService | M6 AC-9 |
| WhatsApp receipt on collection | Scenario E | NotifyPort after-commit | M6 AC-6 |
| Nightly balance drift check | M6 §9 | DriftCheckJob | M6 AC-10 |
| Accounting export (Tally XML) | BP §7.4 | AccountingExportJob | M6 AC-11 |
| LedgerPort | ADD | Port implementation | Integration |

### M7 Control Tower and Exceptions

| Requirement | Source | Implementation | Test |
|-------------|--------|---------------|------|
| Exception engine (raise/resolve/expire) | BP §6.8, M7 §4 | ExceptionService | M7 AC-1,2,3 |
| All 12 exception types | G9, M7 §3 | exception_type enum | M7 §3 |
| Card payload standard | M7 §4 | CardPayloadBuilders | M7 AC-4,5 |
| FCM push to owner | BP §7.4, M7 §9 | FCMService | M7 AC-1 |
| WhatsApp customer notifications | BP §7.4, M7 §9 | WhatsAppService | M7 AC-7 |
| Pulse Header (today's sales, margin, cash, exceptions) | M7 §6 S2 | mv_pulse_today | M7 AC-6 |
| Operational Status Matrix | M7 §6 S3 | mv_ops_status | M7 §6 |
| Strategic analytics | M7 §6 S4 | Analytics endpoints | M7 AC-10 |
| EOD view for owner | M7 §6 S5 | Reads from M6 | M7 §6 |
| Audit trail viewer | M7 §6 S7 | AuditLogViewer | M7 AC-8 |
| Policy/threshold settings | M7 §6 S8 | PolicyService | M7 §6 |
| KPI instrumentation (KPI 1-6) | BP §9, M7 §9 | KPIService | M7 AC-10 |
| ExceptionPort, NotifyPort | ADD | Port implementations | All modules |
| Approval delegate + auto-expire (G13) | ADD | approval_policies table | OD-019 |

---

## 4. Gap Resolutions Traceability (G1–G14)

| Gap | Resolution | Where implemented |
|-----|-----------|------------------|
| G1 Invoice timing | Invoice at dispatch; credit note for delivery differences | M6 §4, M5 §10 AC-10 |
| G2 Order status enum | 11-value unified enum (DRAFT...CANCELLED) | M1 §3 |
| G3 Append-only receipts | Receipts immutable; handover in cash_handovers table | M6 §3, G3 note |
| G4 Missing tables | All 20+ missing tables added across modules | Per-module §3 ADD rows |
| G5 Location granularity | locations table with location_type incl. VEHICLE | M0 §3 |
| G6 UoM + tax fields | uom_conversions, qty_secondary, hsn_code | M1 §3, M3 §3 |
| G7 Margin definition | margin_pct = (price - cost) / price | M1 §4 BR-01 |
| G8 Threshold conflicts | All in business_rule_config; none hard-coded | M0 §3, README §6 |
| G9 Incomplete exception types | Enum extended to 12 types | M7 §3 |
| G10a Invoice before M5 | Sprint 1: manual Mark Dispatched; Sprint 2: trip.dispatched | M6 §13 Sprint 1 |
| G10b GRN before M2 | Sprint 2: GRN without PO link; Sprint 3: linked to PO | M2 §3, M2 §13 |
| G10c Credit block before M5 | Sprint 1: checked at Mark Dispatched; Sprint 2: at trip load | M5 §4 |
| G11 Offline receipt numbering | Provisional device-scoped number; final on sync | M0 §7, M6 §3 |
| G12 Cheque lifecycle | cheque_register table: RECEIVED -> DEPOSITED -> CLEARED/BOUNCED | M6 §3 |
| G13 Single approver bottleneck | approval_policies with delegate + auto-expire | M7 §3, OD-019 |
| G14 Minor inconsistencies | Cleaned in blueprint reconstruction | Blueprint files |

---

## 5. Non-Negotiable Engineering Requirements Traceability

| Requirement | Where enforced |
|-------------|---------------|
| Server-side authorization (not UI-only) | RbacGuard on all endpoints; permission codes validated at controller |
| Site-level data isolation | PostgreSQL RLS; SET LOCAL per request; tested with cross-site query |
| Sensitive field masking | @Sensitive decorator; enforced in DTO serializer |
| Audit trail (append-only, user+IP+before/after) | AuditInterceptor on all mutating endpoints; immutable_audit_logs |
| DB transactions for financial/stock changes | All multi-table writes use explicit BEGIN/COMMIT; rollback on error |
| Idempotency for offline sync | idempotency_keys table; checked before execution |
| Precise decimal for money and quantity | numeric(14,2) and numeric(14,3); no float anywhere |
| No overselling under concurrency | FOR UPDATE row locking in FEFO reservation; concurrency test required |
| No hard-delete of posted transactions | Append-only enforcement via REVOKE + database triggers |
| Configurable thresholds | business_rule_config table; ConfigService; no magic numbers in code |
| Explicit state machines | OrderStateMachine, WorkOrderStateMachine, TripStateMachine |
| Transactional outbox for events | outbox_events table; OutboxRelay polls after commit |
| Retry/dead-letter for failed jobs | BullMQ dead-letter queue; job failure alerts |
| Structured logging | JSON logs with request ID, user ID, module, level |
| Health checks | GET /health: DB ping + Redis ping |
| No credentials in code | All secrets in environment variables; .env.example has no real values |
| Input validation | NestJS ValidationPipe with class-validator on all DTOs |
| Rate limiting | nestjs/throttler on auth and OTP endpoints |
