# M0 — Platform Foundation  *(ADD — not a numbered module in the blueprint)*

**Build order:** 1st (Sprint 0) · **Depends on:** nothing · **Used by:** every module
**Blueprint refs:** §5.2 RBAC, §7.1 architecture, §7.2(1) sites & users, §7.3 security & fraud prevention, §9.3 field-literacy mitigation

---

## 1. Purpose & scope

The blueprint describes seven business modules but several capabilities they all rely on are never given an owner: login, permissions, site scoping, audit, configuration, offline sync. M0 owns them so M1–M7 can stay purely business logic.

| Capability | Detail | Src |
| --- | --- | --- |
| Authentication | JWT access + refresh tokens over TLS 1.3. Office/owner: phone + password (owner adds app PIN/biometric lock). Field roles: phone + OTP/PIN (low typing) | BP + ADD |
| Authorisation | Role-based access control middleware + permission codes | BP |
| Site scoping | Row-Level Security so users only see their assigned site(s); owner sees all | BP |
| Masking | Prices, supplier rates, margins removed at the API serialiser for restricted roles | BP |
| Audit | Immutable log of every business write | BP |
| Configuration | `business_rule_config` for thresholds; nothing hard-coded | ADD (G8) |
| Locations | Site → location hierarchy incl. Raw-Material Store, FG Store, in-transit vehicles | ADD (G5) |
| Document numbering | Sequences per document type (and per device for offline receipts) | ADD |
| Files | Pre-signed upload to object storage; attachments table | ADD |
| Offline sync framework | Local SQLite queue, idempotency keys, conflict policy (§7) | BP + ADD |
| Job scheduler | Cron/queue host for 08:00 worklist, nightly export, expiry sweeps, EOD | BP |
| Localisation | Local-language labels, numeric-keypad inputs, large buttons for field apps | BP (§9.3) |

---

## 2. Roles & permissions

Six roles (schema `users.role`). The owner has all permissions; the rest follow the matrix in §4.

---

## 3. Data model

| Table | Columns | Src |
| --- | --- | --- |
| **`sites`** | `id` PK · `name` · `site_type` (`FACTORY` \| `WAREHOUSE` \| `OFFICE`) · `address` · `is_active` | BP |
| **`users`** | `id` PK · `full_name` · `phone` (unique) · `role` (`OWNER` \| `OPS_COORD` \| `PROD_MGR` \| `DRIVER` \| `COLLECTOR` \| `STOREKEEPER`) · `assigned_site_id` FK · `cash_custody_balance` (decimal) · `is_active` | BP |
| ↳ added columns | `pin_hash`/`password_hash` · `preferred_language` · `last_login_at` · `delegate_for_user_id` (nullable; see M7 G13) | ADD |
| **`locations`** | `id` PK · `site_id` FK · `name` · `location_type` (`RAW_MATERIAL_STORE` \| `FINISHED_GOODS_STORE` \| `TRADING_WAREHOUSE` \| `VEHICLE` \| `QUARANTINE`) · `vehicle_id` (nullable, FK to M5 `vehicles`) · `is_active` | ADD |
| **`user_site_access`** | `user_id` · `site_id` — lets one user see more than one site | ADD |
| **`role_permissions`** | `role` · `permission_code` · `scope` (`OWN` \| `SITE` \| `ALL`) | ADD |
| **`business_rule_config`** | `key` PK · `value_json` · `scope` (`GLOBAL` \| `SITE` \| `ITEM_CATEGORY`) · `scope_ref` · `updated_by` · `updated_at` | ADD |
| **`doc_sequences`** | `doc_type` · `prefix` · `period` (`YYMM`) · `last_no` · `site_id` nullable · `device_id` nullable | ADD |
| **`attachments`** | `id` PK · `entity_name` · `entity_id` · `storage_key` · `mime_type` · `uploaded_by` · `gps_lat_lng` · `captured_at` | ADD |
| **`idempotency_keys`** | `key` PK · `user_id` · `endpoint` · `request_hash` · `response_json` · `created_at` | ADD |
| **`device_registrations`** | `id` PK · `user_id` · `fcm_token` · `platform` · `app_version` · `last_sync_at` | ADD |

**Tables pre-created in migration 002 (confirmed decisions — owned by other modules but seeded here to avoid cross-module migration ordering):**

| Table | Columns | Src |
| --- | --- | --- |
| **`approval_policies`** | `id` PK · `exception_type` UNIQUE · `primary_approver_role` · `can_delegate` · `delegate_user_id` FK · `delegate_value_cap_inr` · `escalation_wait_minutes` (default 60) · `second_escalation_user_id` FK · `updated_by` · `updated_at` | **CONFIRMED OD-019** |
| **`opening_balance_imports`** | `id` PK · `import_type` (`CUSTOMER_AR` \| `SUPPLIER_AP` \| `INVENTORY`) · `cut_off_date` · `status` (`DRAFT` \| `SIGNED_OFF` \| `IMPORTED` \| `REVERSED`) · `signed_off_by` FK · `signed_off_at` · `imported_by` FK · `imported_at` · `reversed_by` FK · `reversed_at` · `reversal_reason` · `row_count` · `total_value` · `notes` · `created_by` FK · `created_at` · `UNIQUE(import_type, cut_off_date, status)` | **CONFIRMED OD-023** |
| **`opening_balance_import_lines`** | `id` PK · `import_id` FK · `row_number` · `entity_code` · `entity_name` · `document_ref` · `document_date` · `due_date` · `quantity` · `uom` · `amount_inr` · `currency` · `validation_status` (`OK` \| `WARN` \| `ERROR`) · `validation_notes` · `ledger_entry_id` | **CONFIRMED OD-023** |

**Reusable domain type:** `tax_treatment_type` enum (`TAXABLE` \| `EXEMPT` \| `NIL_RATED` \| `NON_GST`) — consumed by M1 `items` and M6 `invoice_lines` per **CONFIRMED OD-003**.

| **`immutable_audit_logs`** | `id` PK · `user_id` FK · `action` · `entity_name` · `entity_id` · `old_value_json` · `new_value_json` · `ip_address` · `timestamp` | BP |

> `users.cash_custody_balance` is a **cached** value. The source of truth is the custody ledger in M6; a nightly check job must prove they match.

---

## 4. RBAC matrix (blueprint §5.2)

| Role | Persona | Interface | Can create / execute | Restricted (needs owner approval or blocked) |
| --- | --- | --- | --- | --- |
| **OWNER** | Mr. X | Mobile executive app + web dashboard | Everything: set daily floor prices, approve exceptions, adjust credit limits, view global P&L and all site ledgers | System enforces a dual-log audit trail on manual ledger adjustments |
| **OPS_COORD** | Office / order / collection staff | Web desktop | Log inquiries/orders; quote within the price band; raise POs from approved vendor rates; assign drivers to trips; reconcile physical cash handover | Cannot confirm below Floor Price; cannot override Credit Hold; cannot delete posted invoices or receipts |
| **PROD_MGR** | Factory Production Manager (10–15 staff) | Factory tablet / web | View pending sales demand; start/complete Work Orders; consume raw materials; log output and wastage; request replenishment | Cannot see customer pricing or financial ledgers; cannot write off wastage >5% of standard BOM without owner approval |
| **DRIVER** | 3–4 delivery drivers | Mobile field app (simplified) | View assigned Trip Manifest; navigate; log delivered quantities; capture ePOD; log transit expenses/issues; collect COD against assigned invoices | Cannot see unassigned customers; cannot alter unit prices; cannot mark delivery complete without ePOD or exception reason |
| **COLLECTOR** | Delivery & collection staff | Mobile field app | View assigned AR aging list; log cash/cheque/UPI collections; issue digital receipts; log promise-to-pay dates | Cannot edit invoice amounts; cannot grant rebates/write-offs without owner approval; must settle cash custody daily |
| **STOREKEEPER** | Multi-site / factory store staff | Mobile / tablet scanner | Record supplier GRNs (**blind** quantity check); load vehicles against Trip Manifests; log inter-site transfers | Cannot see supplier unit prices on blind GRN; cannot adjust stock variance without approval |

### Permission codes (ADD — starter set)

`price.set_daily` · `order.create` · `order.confirm_in_band` · `order.override_price` · `credit.override` · `po.create` · `po.approve` · `grn.record_blind` · `stock.transfer` · `stock.adjust_request` · `wo.start` · `wo.complete` · `wastage.writeoff` · `trip.build` · `trip.load` · `delivery.capture_epod` · `collection.log` · `receipt.verify_handover` · `invoice.void_request` · `exception.resolve` · `eod.signoff` · `config.edit` · `audit.view`

---

## 5. Business rules owned here

| Rule | Behaviour |
| --- | --- |
| **Site isolation** | A non-owner query only returns rows whose `site_id` is in the user's allowed sites |
| **Append-only ledgers** | `UPDATE`/`DELETE` blocked on `stock_ledger_txns`, `collection_receipts`, `custody_ledger`, `customer_ledger_entries`, `immutable_audit_logs`. Fix = reversal entry |
| **Price & margin masking** | Factory, driver and warehouse roles never receive unit price, supplier rate or margin fields |
| **Geo-tag & timestamp** | Every ePOD and every field collection stores GPS and device time |
| **Dual-log on manual ledger adjustment** | Owner adjustment writes the audit log *and* an `exception_approvals` record of type `MANUAL_LEDGER_ADJUSTMENT` |

---

## 6. Security implementation notes (blueprint §7.3)

```sql
-- Site-scoped RLS (set per request/transaction by the API layer)
--   SET LOCAL app.role = 'STOREKEEPER';
--   SET LOCAL app.site_ids = '<uuid>,<uuid>';
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_scope ON inventory_batches
  USING ( current_setting('app.role') = 'OWNER'
          OR site_id = ANY (string_to_array(current_setting('app.site_ids'), ',')::uuid[]) );

-- Append-only enforcement (belt and braces: privilege + trigger)
REVOKE UPDATE, DELETE ON stock_ledger_txns, collection_receipts FROM neocore_app;
CREATE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Append-only table: post a reversal entry instead'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER no_update_stock BEFORE UPDATE OR DELETE ON stock_ledger_txns
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
```

- **Masking** is done in DTO serialisers per role (e.g. a `@Sensitive('price')` field decorator), not in the UI.
- **Rate limiting** on login and OTP endpoints; lock after repeated failures.
- **Audit** via a generic service hook (or DB trigger) so no module can forget it.

---

## 7. Offline sync contract (Driver, Collector, Storekeeper apps)

| Concern | Rule |
| --- | --- |
| Local store | SQLite (WatermelonDB-style). Pre-load: assigned trip manifest, customer ledger snippet, worklist |
| Write queue | Every action becomes a queued command with `idempotency_key`, `device_id`, `captured_at`, GPS |
| Replay | Server stores `idempotency_keys`; a repeated key returns the original response — **no duplicates** |
| Ordering | Commands for the same entity replay in capture order |
| Conflicts | **Server-authoritative:** prices, stock, credit. **Device-authoritative:** facts that happened in the field (ePOD, cash collected, GPS) |
| Photos | Uploaded separately after the command syncs; command references `attachment_id`; retry with backoff |
| Receipt numbers | Device-scoped provisional number (`R-<device>-<n>`); server issues the final number on sync (G11) |
| Time | Server records both `captured_at` (device) and `received_at` (server); flag if skew >5 min |

---

## 8. Events & ports

M0 publishes no business events. It provides the shared `EventBus` + **outbox** table (so events survive crashes), the `Clock`, `Money`/`Qty` utilities and the `ConfigService.get(key, scope)` API used everywhere.

---

## 9. Jobs & infrastructure

| Item | Detail |
| --- | --- |
| Scheduler | Host for cron jobs registered by other modules (list in each module §9) |
| Outbox relay | Polls outbox → queue → handlers, with retry and dead-letter |
| Storage | S3/GCS bucket, pre-signed PUT, private reads |
| Environments | dev / staging / prod; seed script for sites, users, config |
| Backups | Daily PostgreSQL backup + point-in-time recovery |

---

## 10. Acceptance criteria

1. A `STOREKEEPER` assigned to Site A cannot list stock or orders from Site B (API and direct SQL under RLS).
2. A `DRIVER` response for a trip contains **no** unit price or margin fields.
3. Any `UPDATE` or `DELETE` on `stock_ledger_txns` fails at the database.
4. Sending the same offline command twice (same `idempotency_key`) creates exactly one record.
5. Changing a value in `business_rule_config` changes behaviour with no deploy.
6. Every create/update/approve in tests produces an `immutable_audit_logs` row with user, IP and before/after JSON.

---

## 11. MVP vs Phase 2+

| MVP | Phase 2+ |
| --- | --- |
| Auth, RBAC, RLS, audit, config, idempotency, locations, doc numbering, attachments | SSO / MFA for office users; biometric attendance link; field-level encryption for sensitive data |

---

## 12. Open questions

- `[DECISION]` OTP delivery channel for field staff: SMS or WhatsApp? (OD-006 — AWAITING)
- `[DECISION]` Can one coordinator work across sites (`user_site_access`) or is it one site each? (OD-007 — AWAITING)
- `[DECISION]` Languages needed for the driver/factory apps? (OD-008 — AWAITING)
- Does Neo want a customer-facing login ever (Phase 2 WhatsApp bot aside)?
- `[CONFIRMED 2026-10-22]` OD-019 — exception delegation + escalation: `approval_policies` table seeded with all 12 exception types; `escalation_wait_minutes` = 60; silent auto-approval never permitted.

---

## 13. Build checklist

- [x] Project skeleton, shared utilities (`Money`, `Qty`, `Clock`), event bus + outbox, port contracts/stubs
- [x] Migrations: `sites`, `users`, `locations`, `user_site_access`, `role_permissions`, `business_rule_config`, `doc_sequences`, `attachments`, `idempotency_keys`, `device_registrations`, `immutable_audit_logs`, `outbox_events` (migration 001)
- [ ] Auth endpoints (login, OTP, refresh, logout) + rate limiting
- [ ] RBAC guard + permission seed + masking serialiser
- [ ] RLS policies + request-scoped `SET LOCAL`
- [x] Append-only triggers/revokes (defined in migration 001)
- [ ] Audit service/hook writing to `immutable_audit_logs`
- [ ] Config service + seed of README §6 defaults
- [ ] Doc numbering service
- [ ] File upload service (pre-signed)
- [ ] Offline sync client library + server idempotency middleware
- [ ] Scheduler + job registry
- [ ] Seed script and acceptance tests §10
