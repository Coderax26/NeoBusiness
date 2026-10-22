# NeoBus — Architecture Document

**Version:** 1.0.0-draft
**Date:** 2026-10-22
**Status:** Confirmed baseline; deviations require a written ADR

---

## 1. System Context

NeoBus is a modular monolith enterprise platform serving a multi-site food trading and processed food manufacturing business. It replaces phone-based coordination with a structured, digital system of record that routes exceptions to the owner and lets staff handle routine operations autonomously.

### 1.1 User populations and interfaces

| Population | Device | Interface | Connectivity |
|-----------|--------|-----------|-------------|
| Owner (Mr. X) | Personal smartphone | Mobile app (Flutter) | Always-online assumed; exception cards push-delivered |
| Operations Coordinator | Desktop / tablet | Web app (Next.js) | Office — reliable broadband |
| Production Manager | Factory tablet | PWA (tablet layout) | Factory Wi-Fi, mostly online |
| Drivers (3-4) | Android smartphone | Mobile app (Flutter) | Intermittent 4G/5G — OFFLINE-FIRST |
| Collectors | Android smartphone | Mobile app (Flutter) | Intermittent — OFFLINE-FIRST |
| Storekeepers | Tablet or Android phone | PWA (tablet/phone) | Warehouse Wi-Fi, mostly online |

---

## 2. Technology Stack

### 2.1 Backend (confirmed)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js 20 LTS | Blueprint default; strong ecosystem for BullMQ |
| Framework | NestJS with TypeScript (strict) | Dependency injection, module isolation, decorators |
| Database | PostgreSQL 16 | ACID, RLS, triggers, numeric precision |
| Queue / jobs | Redis 7 + BullMQ | Job processing, scheduled tasks, retries, dead-letter |
| ORM / query | Knex.js (raw-friendly) or Drizzle ORM | Predictable SQL, migration-first, no magic |
| API docs | OpenAPI 3 (via `@nestjs/swagger`) | Required by blueprint |
| Auth | JWT (access 15 min, refresh 7 days), bcrypt, TOTP/OTP | |
| File storage | S3-compatible (MinIO in dev, AWS S3 / GCS in prod) | Blueprint requirement |
| Realtime | WebSocket / SSE for exception cards and pulse updates | |

### 2.2 Frontend (confirmed)

| App | Technology | Rationale |
|-----|-----------|-----------|
| Office web | Next.js 14 + TypeScript, React Query | Coordinator order desk, financial dashboards |
| Mobile (Owner, Driver, Collector) | Flutter 3.x + SQLite (drift) | Offline-first, single codebase for Android/iOS |
| Factory / warehouse tablet | Progressive Web App (PWA, responsive) | No app store dependency; works on any tablet |

### 2.3 Infrastructure (development)

```yaml
# docker-compose.yml services
- postgres:16          (port 5432)
- redis:7-alpine       (port 6379)
- minio/minio:latest   (ports 9000, 9001)
- mailhog/mailhog      (port 8025 UI)
```

---

## 3. Application Architecture

### 3.1 Modular monolith

The backend is a **single deployable process** divided into NestJS modules that map exactly to business modules M0–M7. Modules are isolated:

- Modules **never import each other's repositories or services directly**.
- Cross-module calls go through **Ports** (synchronous TypeScript interfaces, injected via NestJS DI).
- Cross-module reactions use **Domain Events** (async, published via a transactional Outbox → BullMQ → handler).

This gives the benefits of microservices (isolation, independent testing) without the operational complexity, and preserves the option to split out a module later if justified.

### 3.2 Request lifecycle

```
Client → API Gateway (NestJS guards: JWT → RBAC → RLS context → idempotency check)
       → Controller (validation pipe)
       → Service (business logic, ports, transactions)
       → Repository (Knex query builder)
       → PostgreSQL (row-level security enforced by session settings)
       → Audit hook (after write)
       → Outbox (domain event if needed)
       → Response (DTO serializer applies field masking)
```

### 3.3 Offline sync for field apps

```
Field device (SQLite write queue)
  → queued command with: idempotency_key, device_id, captured_at, GPS
  → on connectivity: POST /sync/commands
  → server: check idempotency_keys table → if new: execute → store result → return
            if seen: return stored result (no re-execution)
  → device: mark queued command as acknowledged
```

---

## 4. Module Boundary Map

```
                        M0 PLATFORM FOUNDATION
        (auth, RBAC, sites/locations, audit, config, offline sync)
                                 |
              +------------------+------------------+
              |                                     |
     M7a EXCEPTION ENGINE                           |
     + NOTIFICATION HUB  <---- every module raises exceptions
              |
   M1 COMMERCIAL & CRM  ------ order.confirmed ------+-----------------+
        |   (price floor, credit)                     |                 |
        |                                             v                 v
        |                                   M3 INVENTORY  <---- M2 PROCUREMENT
        |                                   (ATP, FEFO,          (PO, GRN,
        |                                    ledger)              shortfall)
        |                                     |   ^
        |                      production req |   | output / consume
        |                                     v   |
        |                                   M4 FACTORY
        |                                     | workorder.completed
        |                                     v
        +-------- trip.dispatched -----> M5 FLEET & DELIVERY
                                               | delivery.* (ePOD)
                                               v
                                     M6 COLLECTIONS & FINANCIALS
                                               |
                                               v
                           M7b OWNER DASHBOARDS & ANALYTICS
```

### 4.1 Data ownership (no cross-module table reads)

| Module | Owns these tables |
|--------|-----------------|
| M0 | sites, locations, users, user_site_access, role_permissions, business_rule_config, doc_sequences, attachments, idempotency_keys, device_registrations, immutable_audit_logs, outbox_events |
| M1 | customers, customer_contacts, communication_log, items, uom_conversions, daily_price_lists, quotes, quote_lines, sales_orders, sales_order_lines, order_status_log |
| M2 | suppliers, supplier_items, supplier_rate_quotes, rate_contracts, purchase_requisitions, purchase_orders, purchase_order_lines, goods_receipts, goods_receipt_lines, po_shortfalls, supplier_bills |
| M3 | inventory_batches, stock_ledger_txns, stock_reservations, stock_transfers, stock_transfer_lines, stock_adjustments |
| M4 | bom_headers, bom_lines, production_requisitions, production_work_orders, work_order_materials, work_order_outputs, wastage_records, labour_attendance_logs |
| M5 | vehicles, delivery_trips, delivery_stops, delivery_stop_lines, delivery_challans, issue_reports, trip_expenses |
| M6 | invoices, invoice_lines, collection_receipts, receipt_allocations, customer_ledger_entries, custody_ledger, cash_handovers, cheque_register, ptp_followups, collection_worklists, credit_notes, supplier_ledger_entries, supplier_payments, cashbook_entries, bank_deposits, eod_closings, accounting_export_batches |
| M7 | exception_approvals, approval_policies, exception_events, notification_templates, notification_outbox, whatsapp_optins |

### 4.2 Port contracts (synchronous interfaces)

| Port | Owner | Stub behaviour until built |
|------|-------|--------------------------|
| PricingPort | M1 | Returns a hardcoded band (cost=0, floor=0, target=MAX) |
| ItemPort | M1 | Returns a mock item object |
| CreditPort | M1 (reads M6 AR) | Returns {status: OK} always |
| InventoryPort | M3 | Returns {available: true, qty: MAX} always |
| ProcurementPort | M2 | Returns landedCost = 0 |
| ProductionPort | M4 | Logs the requirement only; takes no action |
| LedgerPort | M6 | Writes invoices only; skips receipt/credit |
| ExceptionPort | M7a | Log-only until M7a is built |
| NotifyPort | M7a | console.log only until M7a is built |

### 4.3 Domain event contracts

All events are published via the Outbox pattern. The envelope is:

```typescript
{
  id: string;           // UUIDv7
  type: string;         // e.g. "order.confirmed"
  aggregateId: string;  // primary key of the source entity
  payload: object;      // event-specific data (see per-module specs)
  publishedAt: string;  // ISO 8601 UTC
  moduleSource: string; // e.g. "m1-commercial"
}
```

---

## 5. Security Architecture

### 5.1 Authentication

- Access tokens: JWT, signed with `JWT_SECRET`, 15-minute TTL
- Refresh tokens: JWT, signed with `JWT_REFRESH_SECRET`, 7-day TTL, stored in DB (revocable)
- Field staff (Driver, Collector): phone + 6-digit PIN (low-typing friendly)
- Office staff: phone + password
- Owner: password + optional biometric lock on mobile app

### 5.2 Authorization (RBAC)

Roles: `OWNER | OPS_COORD | PROD_MGR | DRIVER | COLLECTOR | STOREKEEPER`

- All authorization checks run on the **server**, never trusted from the client.
- Each endpoint decorated with `@RequirePermission('permission.code')`.
- The guard loads `role_permissions` at startup (cached, refreshed on config change).

### 5.3 Site-level data isolation (Row Level Security)

At the start of each DB transaction, the API sets:
```sql
SET LOCAL app.role = '<role>';
SET LOCAL app.site_ids = '<uuid>,<uuid>';
```
RLS policies on all site-scoped tables filter to allowed sites unless `app.role = 'OWNER'`.

### 5.4 Sensitive field masking

Fields tagged `@Sensitive('price' | 'margin' | 'supplier_rate')` in the DTO class are removed from the serialized response for roles that are not permitted to see them. This happens at the API layer, not in the UI.

### 5.5 Append-only ledgers

`UPDATE` and `DELETE` are revoked from the application DB user on:
- `stock_ledger_txns`
- `collection_receipts`
- `customer_ledger_entries`
- `custody_ledger`
- `immutable_audit_logs`
- `supplier_ledger_entries`

Database triggers enforce this as a belt-and-braces measure.

### 5.6 Audit trail

Every business write calls `AuditService.log({ userId, action, entity, entityId, oldValue, newValue, ip })` which inserts into `immutable_audit_logs`. This is enforced via a NestJS interceptor on all mutating endpoints.

---

## 6. Data Conventions

| Convention | Rule |
|-----------|------|
| Primary keys | UUIDv7 (time-ordered, generated in the application layer) |
| Money | `numeric(14,2)` — never float; currency INR |
| Quantities | `numeric(14,3)` in primary UoM; secondary qty alongside |
| Timestamps | `timestamptz` stored UTC; displayed in `Asia/Kolkata` |
| Standard columns | `created_at`, `created_by`, `updated_at`, `updated_by` on all mutable tables |
| Soft delete | `is_active boolean` or status field; no hard deletes on financial or stock data |
| Corrections | Reversal entries only — never UPDATE/DELETE posted transactions |
| Document numbers | `PREFIX-YYMM-NNNN` from `doc_sequences` table; per-device prefix for offline receipts |
| Idempotency | Every mobile write includes a client-generated `idempotency_key` |
| Status fields | Text enums enforced by PostgreSQL `CHECK` constraints |

---

## 7. Offline Synchronization

### 7.1 Local store
Driver, Collector, Storekeeper apps use SQLite (via drift/WatermelonDB pattern). Pre-loaded at login: assigned trip manifest, customer ledger snippets, worklist.

### 7.2 Write queue
Every offline action creates a local command record containing: `idempotency_key`, `device_id`, `captured_at` (device time), GPS coordinates, and the command payload.

### 7.3 Sync protocol
On reconnect: POST commands in capture order to `/sync/commands`. Server checks `idempotency_keys` table; seen keys return the stored response; new keys execute and store. Photo attachments sync separately after the command, with exponential backoff.

### 7.4 Conflict resolution
- **Server-authoritative:** prices, stock quantities, credit limits — server values win.
- **Device-authoritative:** ePOD captures, cash collected amounts, GPS coordinates — device values win (these are facts that happened offline).
- Time skew > 5 minutes is flagged for audit review.

---

## 8. Deployment Architecture

### 8.1 Development
Docker Compose: PostgreSQL + Redis + MinIO + Mailhog. API runs locally via `npm run dev`. No Kubernetes complexity.

### 8.2 Production (target, documented — not yet configured)
- **API**: Containerized NestJS behind a load balancer (single instance initially, horizontally scalable)
- **Database**: Managed PostgreSQL (e.g., Supabase, RDS, or self-hosted with PITR backups)
- **Queue**: Managed Redis (e.g., Upstash or ElastiCache)
- **Storage**: AWS S3 or GCS
- **CDN**: CloudFront or Cloudflare for web app assets
- **Monitoring**: Structured JSON logs, health checks at `/health`, error tracking (e.g., Sentry)
- **Secrets**: Environment variables injected by the platform (not baked into images)

---

## 9. Architectural Decision Records (ADR)

| ADR | Decision | Rationale |
|-----|---------|-----------|
| ADR-001 | Modular monolith, not microservices | Business requirement does not justify operational complexity; module boundaries preserved for future extraction |
| ADR-002 | Knex/Drizzle over TypeORM/Prisma | Raw SQL control needed for FEFO row locking, RLS SET LOCAL, append-only triggers, and financial precision |
| ADR-003 | Flutter for mobile (not React Native) | Blueprint explicitly approves it; better offline SQLite support via drift; single codebase |
| ADR-004 | PostgreSQL RLS over application-layer filtering | Belt-and-braces: application sets context, DB enforces it — a bug in the app cannot leak another site's data |
| ADR-005 | Transactional Outbox, not direct queue publish | Prevents events from being lost if the process crashes after the DB commit but before the queue write |
| ADR-006 | UUIDv7 primary keys | Time-ordered (index-friendly), globally unique (safe for offline generation), no sequential ID guessing |
