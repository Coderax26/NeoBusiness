# NeoBus — Security Policy

**Version:** 1.0.0
**Date:** 2026-10-21

---

## 1. Authentication

### Token design
- Access tokens: JWT HS256, signed with `JWT_SECRET`, 15-minute TTL
- Refresh tokens: JWT HS256, signed with `JWT_REFRESH_SECRET`, 7-day TTL
- Refresh tokens stored in `refresh_tokens` table; revocable individually
- Logout invalidates the refresh token; access tokens expire naturally (short TTL)

### Field staff login
- Phone number + 6-digit PIN (hashed with bcrypt, cost factor 12)
- OTP delivered via SMS for password reset / first login
- Device registration on first login; push token stored

### Office staff login
- Phone number + password (bcrypt, cost factor 12)
- Rate limiting: 5 failed attempts lock account for 15 minutes

### Owner
- Password + optional biometric lock on mobile app (face/fingerprint, handled by Flutter local_auth)
- Approvals require app to be unlocked (biometric) — configured in OD-019

### Rate limiting
- `POST /auth/login`: 5 req/min per IP
- `POST /auth/otp/send`: 3 req/15min per phone
- `POST /auth/otp/verify`: 5 attempts before 15-minute lockout

---

## 2. Authorization (RBAC)

### Roles
`OWNER | OPS_COORD | PROD_MGR | DRIVER | COLLECTOR | STOREKEEPER`

### Enforcement
- All permission checks run on the **server**. UI is not trusted.
- Every controller method is decorated with `@RequirePermission('permission.code')`.
- The `RbacGuard` verifies the authenticated user's role has the required permission.
- Permission grants are stored in `role_permissions` table; loaded at startup and cached.

### Permission codes
```
price.set_daily        order.create             order.confirm_in_band
order.override_price   credit.override          po.create
po.approve             grn.record_blind         stock.transfer
stock.adjust_request   wo.start                 wo.complete
wastage.writeoff       trip.build               trip.load
delivery.capture_epod  collection.log           receipt.verify_handover
invoice.void_request   exception.resolve        eod.signoff
config.edit            audit.view
```

---

## 3. Site-Level Data Isolation

### Implementation
At the beginning of each database transaction, the API sets:
```sql
SET LOCAL app.role = '<role>';
SET LOCAL app.site_ids = '<uuid>,<uuid>';
```

PostgreSQL Row Level Security (RLS) policies on all site-scoped tables filter records to the user's allowed sites. The `OWNER` role sees all sites.

### Belt-and-braces
A bug in the application's `SET LOCAL` logic cannot reveal another site's data because RLS is enforced at the database level. A missing context variable causes the query to return zero rows (fail safe) rather than all rows.

---

## 4. Sensitive Field Masking

The following fields are never returned to roles without explicit permission:
- `unit_price`, `landed_cost`, `floor_price`, `target_price`, `margin_pct` — hidden from DRIVER, STOREKEEPER, PROD_MGR
- `supplier_rate`, `po_unit_price` — hidden from STOREKEEPER, DRIVER, COLLECTOR
- `customer_ar_balance`, `credit_limit`, `credit_days` — hidden from DRIVER, STOREKEEPER, PROD_MGR

Implementation: DTOs use a custom `@Sensitive()` decorator. The serializer interceptor checks the current user's role and removes masked fields before JSON serialization. The UI never receives these values, so a UI bug cannot expose them.

---

## 5. Append-Only Financial Records

The following tables must **never** be updated or deleted after insert:

```sql
stock_ledger_txns
collection_receipts
customer_ledger_entries
custody_ledger
supplier_ledger_entries
immutable_audit_logs
```

Enforcement:
1. `REVOKE UPDATE, DELETE ON <table> FROM neocore_app;` — application DB user cannot mutate
2. Database triggers (`forbid_mutation`) as belt-and-braces in case a superuser is used

Corrections are made by posting a `REVERSAL` row that negates the original, then a new correct row. Both the original and the correction are permanently visible in the audit trail.

---

## 6. Audit Trail

### What is logged
Every business create, update, approve, or state change writes a row to `immutable_audit_logs`:

```json
{
  "id": "<uuidv7>",
  "user_id": "<user-uuid>",
  "action": "ORDER_CONFIRMED",
  "entity_name": "sales_orders",
  "entity_id": "<order-uuid>",
  "old_value_json": {"status": "DRAFT"},
  "new_value_json": {"status": "CONFIRMED"},
  "ip_address": "192.168.1.10",
  "timestamp": "2026-10-21T11:00:00Z"
}
```

### How it is enforced
A NestJS `AuditInterceptor` is applied globally to all mutating HTTP methods (POST, PATCH, PUT, DELETE). It captures the before/after state and writes the audit row after the main transaction commits.

### Special case: manual ledger adjustments
The owner's manual ledger adjustments (M6) write **two** records: the `immutable_audit_logs` entry and an `exception_approvals` row of type `MANUAL_LEDGER_ADJUSTMENT`, creating a dual-log that cannot be obscured.

---

## 7. Input Validation and API Security

- All incoming request bodies are validated via NestJS `ValidationPipe` with `class-validator`
- Unknown properties are stripped (whitelist mode)
- SQL injection: impossible via Knex parameterized queries; no raw string concatenation
- XSS: JSON API only; no HTML rendering on the server
- CSRF: not applicable for JWT Bearer token APIs
- TLS: HTTPS enforced in production; HTTP rejected (redirect or 301)
- CORS: configured to allow only the web app origin
- Helmet middleware: security headers (CSP, HSTS, X-Frame-Options)

---

## 8. Secrets Management

### Development
- All secrets in `apps/api/.env` (gitignored)
- `.env.example` contains placeholder values only — no real secrets

### Production
- Secrets injected via the cloud platform's secrets manager (AWS Secrets Manager, GCP Secret Manager, or equivalent)
- Application reads from environment variables only; secrets are never baked into Docker images
- Secret rotation: JWT secrets can be rotated by updating the env variable and issuing new refresh tokens; old access tokens expire within 15 minutes

### What must never be committed to version control
- JWT secrets
- Database passwords
- Redis passwords
- API keys (WhatsApp, SMS, Firebase, S3)
- Any production environment variable values

---

## 9. Data Protection

### In transit
- TLS 1.3 on all external connections
- Internal service-to-service: within the same network segment (Docker internal or VPC)

### At rest
- Database encryption at rest: handled by the managed database provider (required in production)
- S3 object storage: server-side encryption enabled
- PINs and passwords: bcrypt hash only; plaintext never stored

### Geo-tag and timestamp on field collections
Every ePOD photo, cash collection, and GRN record stores:
- GPS coordinates (`gps_lat_lng`)
- Device timestamp (`captured_at`)
- Server receipt timestamp (`received_at`)

Time skew > 5 minutes is flagged for audit review. This creates an immutable, timestamped chain of custody for field activities.

---

## 10. Known Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Owner bypass via direct phone call | Call-redirection SOP; Exception Cards must be faster than a call |
| Shadow pricing by field staff | Floor price enforced server-side; any below-floor submission fails at the API |
| Cash pilferage by collectors | Custody wallet tracked in real time; WhatsApp receipt to customer is instant proof; EOD variance blocks sign-off |
| Offline device compromise | Cached data is scoped to the user's assigned manifest only; no cross-customer data cached |
| Duplicate financial postings on retry | Idempotency keys on all field writes; server stores and replays result |
| Stale RLS context | RLS policies fail-safe to zero rows if context is not set |

---

## 11. Vulnerability Reporting

Report security vulnerabilities to the project owner. Do not file public issues for security bugs.

Include: description, reproduction steps, impact assessment, and (if possible) a proposed fix. A response will be provided within 48 hours.

---

## 12. Compliance Notes (India)

- GST invoicing: tax rates, HSN codes, place of supply, CGST/SGST/IGST split
- e-Way bill: required for goods movement above threshold value
- e-Invoicing (IRN): applicable if annual turnover exceeds current threshold (confirm — see OD-004)
- Data retention: audit logs and financial records retained for minimum 7 years (as required by Indian Companies Act / GST rules)
