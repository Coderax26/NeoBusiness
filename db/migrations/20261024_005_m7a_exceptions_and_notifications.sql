-- ============================================================
-- Migration: 20261024_005_m7a_exceptions_and_notifications
-- Module:    M7a — Exception Engine + Notification Hub
-- Purpose:   Tables for the "management by exception" control tower:
--            exception cards, approval policies, audit events,
--            and the notification dispatch queue.
-- Depends on: migration 001 (users, sites), 002 (approval_policies)
-- ============================================================

-- ============================================================
-- exception_approvals — the "Exception Card"
-- ============================================================
CREATE TABLE IF NOT EXISTS exception_approvals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_type    TEXT NOT NULL,
  reference_table   TEXT NOT NULL,
  reference_id      TEXT NOT NULL,
  requested_by      UUID NOT NULL REFERENCES users(id),
  site_id           UUID REFERENCES sites(id),
  context_payload_json JSONB NOT NULL,   -- ExceptionPayload (title, summary, facts, actions)
  status            TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'COUNTERED', 'EXPIRED')),
  priority          TEXT NOT NULL DEFAULT 'NORMAL'
                     CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  value_at_risk     NUMERIC(14,2),
  owner_remarks     TEXT,
  resolved_by       UUID REFERENCES users(id),
  resolved_at       TIMESTAMPTZ,
  expires_at        TIMESTAMPTZ NOT NULL,
  escalated_to      UUID REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exception_status ON exception_approvals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_exception_type ON exception_approvals(exception_type);

-- Idempotency: one pending exception per (type, reference_table, reference_id)
CREATE UNIQUE INDEX IF NOT EXISTS uq_exception_unique_pending
  ON exception_approvals (exception_type, reference_table, reference_id)
  WHERE status = 'PENDING';

-- ============================================================
-- exception_events — lifecycle audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS exception_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_id  UUID NOT NULL REFERENCES exception_approvals(id),
  event         TEXT NOT NULL CHECK (event IN ('RAISED', 'NOTIFIED', 'VIEWED', 'RESOLVED', 'EXPIRED', 'ESCALATED')),
  by_user       UUID REFERENCES users(id),
  at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB
);
CREATE INDEX IF NOT EXISTS idx_exception_events_exception ON exception_events(exception_id, at);

-- ============================================================
-- notification_outbox — dispatch queue
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_outbox (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel         TEXT NOT NULL CHECK (channel IN ('FCM', 'WHATSAPP', 'SMS', 'IN_APP')),
  recipient_type  TEXT NOT NULL CHECK (recipient_type IN ('USER', 'CUSTOMER', 'SUPPLIER')),
  recipient_ref   TEXT NOT NULL,
  template_code   TEXT NOT NULL,
  payload_json    JSONB NOT NULL,
  status          TEXT NOT NULL DEFAULT 'QUEUED'
                   CHECK (status IN ('QUEUED', 'SENT', 'DELIVERED', 'FAILED')),
  provider_msg_id TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notif_status ON notification_outbox(status, attempts);

-- ============================================================
-- notification_templates — message body templates
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT NOT NULL UNIQUE,
  channel     TEXT NOT NULL CHECK (channel IN ('FCM', 'WHATSAPP', 'SMS', 'IN_APP')),
  language    TEXT NOT NULL DEFAULT 'en',
  title       TEXT,
  body        TEXT NOT NULL,
  wa_template_id TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- whatsapp_optins — customer/supplier WhatsApp consent
-- ============================================================
CREATE TABLE IF NOT EXISTS whatsapp_optins (
  phone       TEXT PRIMARY KEY,
  party_type  TEXT NOT NULL CHECK (party_type IN ('CUSTOMER', 'SUPPLIER')),
  party_id    UUID,
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- SEED: Notification templates (M7a MVP: FCM push + in-app)
-- ============================================================
INSERT INTO notification_templates (code, channel, language, title, body)
VALUES
  ('exception_card_push', 'FCM', 'en',
   'Action Required',
   '{count} exception card(s) need your review. Tap to resolve.'),
  ('in_app_exception', 'IN_APP', 'en',
   NULL,
   'Exception card: {title} — value at risk: ₹{value_at_risk}'),
  ('otp_delivery', 'SMS', 'en',
   NULL,
   'Your NeoBus OTP code is {otp_code}. Valid for 5 minutes.')
ON CONFLICT (code) DO NOTHING;