# M7a — Exception Engine + Notification Hub — Implementation Plan

**Date:** 2026-10-24
**Status:** PLANNING → ACTIVE (immediately after M0 completion)
**Owner:** Claude Code
**Blueprint ref:** `docs/claude/09_M7_Control_Tower_Exceptions.md` §1–13
**Depends on:** M0 (complete) · reads from every module · used by every module
**Build order:** M0 → **M7a** → M1 → M6

---

## 1. Task list (build order)

| Step | Priority | Task | Description |
|------|----------|------|-------------|
| 1 | P0 | **Migration 005** | Create `exception_approvals`, `exception_events`, `notification_outbox`, `notification_templates`, `whatsapp_optins` tables |
| 2 | P0 | **ExceptionService** | `raise()`, `resolve()`, `expire()`, `escalate()` — with idempotency & single-resolution |
| 3 | P0 | **ExceptionPort implementation** | Replace `ExceptionPortStub` with real `ExceptionService` wired as `EXCEPTION_PORT` provider |
| 4 | P0 | **NotificationService** | `send()` to channels: FCM (real), SMS/WhatsApp (log-only). Queue in `notification_outbox` via `OutboxService` |
| 5 | P0 | **NotifyPort implementation** | Replace `NotifyPortStub` with real `NotificationService` wired as `NOTIFY_PORT` provider |
| 6 | P1 | **Device registration** | `POST /devices/register` endpoint (FCM token storage) |
| 7 | P1 | **Owner API** | `GET /exceptions`, `GET /exceptions/{id}`, `POST /exceptions/{id}/resolve` |
| 8 | P2 | **Background jobs** | Exception expiry/escalation sweep (every 1 min), notification outbox relay |
| 9 | P2 | **Unit tests** | ExceptionService + NotificationService (~10 tests) |
| 10 | P2 | **CI integration** | Ensure `npm test` includes M7a specs |

### NOT IN M7a (deferred)

- Materialised views (`mv_pulse_today`, `mv_ops_status`, etc.) — M7b
- Live Pulse Header, Status Matrix, EOD view — M7b
- Analytics (customer profitability, supplier scorecard, AR aging) — M7b
- WhatsApp / SMS template approvals — M7b (log-only in M7a)

---

## 2. Files to create

### DB
| File | Purpose |
|------|---------|
| `db/migrations/20261024_005_m7a_exceptions_and_notifications.sql` | Migration 005 — all M7a tables |

### Module
| File | Purpose |
|------|---------|
| `apps/api/src/modules/m7a-exceptions/m7a.module.ts` | M7a module — providers, controllers, exports |
| `apps/api/src/modules/m7a-exceptions/exception.service.ts` | Exception lifecycle: raise, resolve, expire, escalate |
| `apps/api/src/modules/m7a-exceptions/notification.service.ts` | Notification dispatch: FCM (real), WhatsApp/SMS (log) |
| `apps/api/src/modules/m7a-exceptions/exception.controller.ts` | Owner API: list, detail, resolve |
| `apps/api/src/modules/m7a-exceptions/device.controller.ts` | `POST /devices/register` (FCM token) |
| `apps/api/src/modules/m7a-exceptions/exception.service.spec.ts` | Unit tests |
| `apps/api/src/modules/m7a-exceptions/notification.service.spec.ts` | Unit tests |

### Module edits
| File | Changes |
|------|---------|
| `apps/api/src/app.module.ts` | Add `M7aExceptionModule` to imports (after `M0PlatformModule`) |
| `apps/api/src/modules/m0-platform/m0-platform.module.ts` | Provide `EXCEPTION_PORT` → real `ExceptionService`, `NOTIFY_PORT` → real `NotificationService` (replacing stubs from `port-stubs.ts`) |

### Docs
| File | Purpose |
|------|---------|
| `docs/PLAN_M7A.md` | This file |
| `docs/M7A_COMPLETION.md` | Completion report (created when M7a is done) |

---

## 3. Schema (migration 005)

```sql
-- exception_approvals: the "Exception Card"
CREATE TABLE IF NOT EXISTS exception_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_type  TEXT NOT NULL,
  reference_table TEXT NOT NULL,
  reference_id    TEXT NOT NULL,
  requested_by    UUID NOT NULL REFERENCES users(id),
  site_id         UUID REFERENCES sites(id),
  context_payload_json JSONB NOT NULL,   -- ExceptionPayload (title, summary, facts, actions)
  status          TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','COUNTERED','EXPIRED','COUNTERED')),
  priority        TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','CRITICAL')),
  value_at_risk    NUMERIC(14,2),
  owner_remarks   TEXT,
  resolved_by     UUID REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  escalated_to    UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_exception_status ON exception_approvals(status, created_at);
CREATE INDEX idx_exception_type ON exception_approvals(exception_type);

-- exception_events: audit trail of card lifecycle
CREATE TABLE IF NOT EXISTS exception_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id   UUID NOT NULL REFERENCES exception_approvals(id),
  event          TEXT NOT NULL CHECK (event IN ('RAISED','NOTIFIED','VIEWED','RESOLVED','EXPIRED','ESCALATED')),
  by_user        UUID REFERENCES users(id),
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json  JSONB
);

-- notification_outbox: queue of notifications to send
CREATE TABLE IF NOT EXISTS notification_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         TEXT NOT NULL CHECK (channel IN ('FCM','WHATSAPP','SMS','IN_APP')),
  recipient_type  TEXT NOT NULL CHECK (recipient_type IN ('USER','CUSTOMER','SUPPLIER')),
  recipient_ref   TEXT NOT NULL,     -- user_id or phone
  template_code   TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED','SENT','DELIVERED','FAILED')),
  provider_msg_id TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notif_status ON notification_outbox(status, attempts);

-- notification_templates: message templates
CREATE TABLE IF NOT EXISTS notification_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  channel     TEXT NOT NULL CHECK (channel IN ('FCM','WHATSAPP','SMS','IN_APP')),
  language    TEXT NOT NULL DEFAULT 'en',
  title       TEXT,           -- for push notifications
  body        TEXT NOT NULL,
  wa_template_id TEXT,        -- WhatsApp template ID
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- device_registrations: FCM tokens (referenced by users table)
-- Already exists in migration 001 — M7a provides the registration endpoint.

-- whatsapp_optins: customer/supplier WhatsApp consent
CREATE TABLE IF NOT EXISTS whatsapp_optins (
  phone       TEXT PRIMARY KEY,
  party_type  TEXT NOT NULL CHECK (party_type IN ('CUSTOMER','SUPPLIER')),
  party_id    UUID,
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Seed:** Insert notification templates for `exception_card_push` (FCM), `otp_delivery` (SMS), `order_confirmation` (WHATSAPP).

---

## 4. Architecture

### ExceptionService flow

```
Module raises exception
  → ExceptionPort.raise(type, ref, payload, siteId)
  → ExceptionService creates exception_approvals (PENDING)
  → Looks up approval_policies for exception_type
  → Resolves approver (primary approver role → specific user via user_site_access)
  → Sets expires_at = now + auto_expire_minutes
  → Emits domain event via OutboxService.raise(trx, 'exception.requested', exceptionId, {...}, 'm7')
  → Queues notification_outbox row (FCM push to approver's device)
```

### Notification relay (background)

```
Every 10s:
  → SELECT * FROM notification_outbox WHERE status='QUEUED' AND attempts < 3
  → For each: call FCMProvider.send(payload)
    - success → UPDATE status='SENT', provider_msg_id=...
    - failure → UPDATE attempts++, error=...
  → Fallback: if FCM fails AND channel was FCM, log as SMS fallback TODO (M7b)
```

### Resolve flow

```
POST /exceptions/{id}/resolve {action, remarks, counter?}
  → ExceptionService.resolve(id, action, remarks, counterJson)
  → Single-resolution: check status == PENDING, else return existing
  → Update approval status (APPROVED|REJECTED|COUNTERED)
  → Emit OutboxService.raise(trx, 'exception.resolved', refId, {action, counter}, 'm7')
  → Write exception_events (RESOLVED) row
  → Write immutable_audit_logs row
  → Originating module (M1 etc.) consumes exception.resolved event → resumes
```

### Module wiring

The `EXCEPTION_PORT` and `NOTIFY_PORT` are defined in `src/shared/ports/ports.interface.ts` with injection tokens. Currently, `M0PlatformModule` does NOT provide them (stubs exist but aren't wired). M7a will:

1. Register `ExceptionService` as the provider for `EXCEPTION_PORT`
2. Register `NotificationService` as the provider for `NOTIFY_PORT`
3. Both are `@Global()` so all modules can inject them via `@Inject(EXCEPTION_PORT)`

M7a module also needs to export `ExceptionService` and `NotificationService` for direct injection.

---

## 5. Acceptance Criteria (M7 §10, items 1–4 for M7a)

1. Raising `PRICE_OVERRIDE` creates an exception card; a notification is queued in `notification_outbox`; the card is visible on `GET /exceptions?status=pending`.
2. Resolving the same card twice results in one resolution (idempotent).
3. A card with an expiry policy (auto_expire_minutes) is auto-set to `EXPIRED` and triggers escalation (delegated to delegate_user_id if configured).
4. M1's `ExceptionPort.onResolved('PRICE_OVERRIDE')` handler fires with the action and counter price.

### Additional M7a-specific checks

5. `POST /devices/register` stores FCM token in `device_registrations`.
6. `GET /exceptions` respects the caller's `app.site_ids` via RLS.
7. Notification relay dispatches a queued FCM notification and marks `status='SENT'`.
8. Unit tests cover: raise, resolve-idempotency, expiry-escalation, notification-queue, resolve-handler-registration.

---

## 6. Definition of Done

- [ ] Migration 005 applied, all M7a tables exist
- [ ] `npm run build` clean
- [ ] `npm test` — all 42 existing + 10 new = 52 tests pass
- [ ] `GET /exceptions?status=pending` returns pending cards scoped to caller's sites
- [ ] `POST /exceptions/{id}/resolve` is idempotent
- [ ] Exception expires after `auto_expire_minutes` and escalates per policy
- [ ] `POST /devices/register` persists FCM tokens
- [ ] Notification relay runs and dispatches to FCM (or logs fallback)
- [ ] `docs/M7A_COMPLETION.md` created
- [ ] `docs/CHANGELOG.md` updated with M7a entry
- [ ] Git commit

---

## 7. Notes

- `approval_policies` table + 12 seeds already exist in migration 002 — no work needed there.
- `ExceptionPort` and `NotifyPort` interfaces already exist in `src/shared/ports/ports.interface.ts`.
- Stub implementations exist in `src/shared/ports/port-stubs.ts` — M7a replaces them.
- `OutboxService` (from M0) handles event emission — no change needed.
- `immutable_audit_logs` trigger (from M0) captures all M7a writes.
- `IdrContextMiddleware` / `RlsContextMiddleware` from M0 applies site isolation automatically.
- FCM provider: for MVP, we'll use a log-based fallback (no real Firebase credentials in dev). Real integration in M7b.
- `exception.requested`, `exception.resolved`, `notification.failed` event types already exist in `domain-events.ts`.