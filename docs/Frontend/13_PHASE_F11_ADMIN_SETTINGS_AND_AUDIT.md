# Phase F11 — Administration, Settings & Audit

> **Duration:** 1.5 weeks · **Release:** R3 (users/sites needed earlier for Setup Wizard — deliver minimal versions in F3) · **Backend:** mostly 🔴 (tables exist, APIs missing)

## 1. Goal

Let the Owner manage **people, access, sites, business rules and approval policies** without a developer, and see a **complete, searchable audit trail** of who did what.

---

## 2. Screens

### 2.1 Users (`/admin/users`)
| Feature | API |
|---------|-----|
| List: name, phone, role, sites, status (Active/Disabled), last login, devices | 🔴 G-ADM-1 `GET /admin/users` |
| Invite / create user: name, phone, role, primary site + additional sites (OD-007), language; sends SMS with temporary PIN | 🔴 `POST /admin/users` |
| Edit role/sites (forces re-login per security rule) | 🔴 `PATCH /admin/users/:id` |
| Reset PIN/password, disable/enable, revoke sessions | 🔴 |
| Registered devices list (FCM) and revoke | 🔴 (table `device_registrations`; ✅ register only) |

### 2.2 Roles & access (`/admin/roles`)
- Read-only matrix of the 6 roles × permissions (from `role_permissions`), grouped by module with plain descriptions ("Can confirm orders within price band").
- "What can this person see?" preview: pick a user → see their menu & masked fields.
- Custom roles 🔵 (not in MVP; RBAC is seeded).
- API 🔴 G-ADM-3 `GET /admin/roles` (+ permissions).

### 2.3 Sites & locations (`/admin/sites`)
Sites (Factory, Depot, Warehouse — `site_type`), address, GSTIN per site, active; locations under each site (cold store, dry store, dispatch bay) with type. Map view. API 🔴 G-ADM-2.

### 2.4 Company profile (`/admin/company`)
Legal name, GSTIN, PAN, address, logo, bank details for invoices, invoice footer/terms, financial year, timezone (Asia/Kolkata fixed). API 🔴 G-ADM-4.

### 2.5 Business rules (`/admin/business-rules`)
Friendly editor over `business_rule_config` (scopes GLOBAL / SITE / ITEM_CATEGORY):

| Group | Example settings (plain labels) |
|-------|---------------------------------|
| Pricing | Minimum margin % (default 10%, per category overrides — OD-001), floor rounding (₹0.50) |
| Credit | Default credit days, max overdue days, credit breach behaviour |
| Procurement | Supplier price spike threshold %, backup supplier tolerance (2%, OD-010) |
| Production | Yield tolerance ±3% (OD-012), wastage write-off threshold |
| Inventory | Expiry warning days, stock variance threshold |
| Finance | Handover variance tolerance, PTP grace days, e-way bill threshold ₹50,000 (OD-005) |
| Dashboard | Refresh interval (30 s, OD-021) |

UX: each setting shows description, current value, default, scope, "last changed by/when"; changes need confirmation and are audited; note "takes effect within 5 minutes" (ConfigService cache TTL). API 🔴 G-ADM-5.

### 2.6 Approval rules (`/admin/approval-rules`)
Per exception type: primary approver role, delegate user, delegate value cap (₹), escalation wait minutes (default 60), second escalation user, active. Visual flow: "Request → Delegate (up to ₹5,000) → Owner after 60 min". Guard: cannot enable silent auto-approval (OD-019). API 🔴 G-ADM-6 (table `approval_policies`).

### 2.7 Message templates (`/admin/templates`)
WhatsApp/SMS/in-app templates (`notification_templates`): order confirmation, OTP, exception push, payment reminder; variables preview; provider template id (OD-022 pluggable BSP). API 🔴 G-ADM-7.

### 2.8 Number series (`/admin/number-series`)
View `doc_sequences` per document type (SO, PO, INV, GRN, TRIP…) with prefix & next number (`PREFIX-YYMM-NNNN`); read-only in MVP. API 🔴 G-ADM-8.

### 2.9 Audit trail (`/control/audit`)
| Feature | API |
|---------|-----|
| Search by user, date, module, action (create/update/delete/approve), record id/doc no. | 🔴 G-AUD-1 `GET /audit-logs` (table `immutable_audit_logs`) |
| Row shows who, when (IST), from which device/IP, what changed (before → after diff, redacted secrets) | 🔴 |
| Per-record "History" tab embedded in detail pages | 🔴 `GET /audit-logs?entity=&id=` |
| Export for auditors | 🔴 |

### 2.10 System health (`/admin/system`)
API health (`GET /health` ✅), background job status (outbox relay, notification relay, nightly jobs), last backup time, queue depth, app version. API 🟡 health ✅; jobs/backups 🔴 G-ADM-9.

### 2.11 Data management
Opening balances (F9), imports (F3), export all masters (backup to Excel) 🔴, data retention info.

---

## 3. UX notes for non-tech users

- Settings written as questions: "What is the minimum profit margin you accept?" with the current answer.
- Dangerous changes (role change, disabling user, approval rule) show consequence and require password.
- Audit trail uses sentences: "Priya changed credit limit of ABC Traders from ₹1,00,000 to ₹1,50,000 at 10:32 AM".

## 4. Acceptance criteria

1. Owner creates a coordinator with two sites; the user logs in and sees only those sites.
2. Changing min margin for a category updates floor suggestions after cache TTL; change appears in audit.
3. Approval rule editor prevents configuring auto-approval without approver.
4. Audit search returns changes for an order by its number with before/after values.
5. Non-owner roles cannot reach any `/admin/*` route; API also rejects.

## 5. Task checklist

- [x] F11-01 Users list/create/edit/disable/reset
- [x] F11-02 Roles & permissions matrix + "view as" preview
- [x] F11-03 Sites & locations
- [x] F11-04 Company profile
- [x] F11-05 Business rules editor
- [x] F11-06 Approval rules editor
- [x] F11-07 Templates & number series
- [x] F11-08 Audit trail + per-record history tab
- [x] F11-09 System health
- [x] F11-10 Backend: G-ADM-1…9, G-AUD-1

---

## 6. Implementation & Test Results

- **Shared Rules (`packages/shared/src/admin-rules.ts`):** `canAccessAdminRoute`, `filterUserSites`, `validateApprovalRuleConfig`, `searchAuditTrail`.
- **Screens Implemented:** `/admin/users`, `/admin/roles`, `/admin/sites`, `/admin/company`, `/admin/business-rules`, `/admin/approval-rules`, `/admin/templates`, `/control/audit`, `/admin/system`.
- **Verification:** `npm run test:fe` — **16/16 test files passed (200/200 tests)** (`f11-to-f14-final-phases.spec.ts`); `npm run check:api-routes` passed.

