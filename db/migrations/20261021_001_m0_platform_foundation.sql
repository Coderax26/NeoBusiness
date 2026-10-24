-- ============================================================
-- Migration: 20261021_001_m0_platform_foundation
-- Module:    M0 — Platform Foundation
-- Purpose:   All M0 tables. Every other module depends on this.
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SITES
-- ============================================================
CREATE TABLE IF NOT EXISTS sites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  site_type       TEXT NOT NULL CHECK (site_type IN ('FACTORY', 'WAREHOUSE', 'OFFICE')),
  address         TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name             TEXT NOT NULL,
  phone                 TEXT NOT NULL UNIQUE,
  role                  TEXT NOT NULL CHECK (role IN ('OWNER', 'OPS_COORD', 'PROD_MGR', 'DRIVER', 'COLLECTOR', 'STOREKEEPER')),
  assigned_site_id      UUID REFERENCES sites(id),
  pin_hash              TEXT,
  password_hash         TEXT,
  preferred_language    TEXT NOT NULL DEFAULT 'en',
  cash_custody_balance  NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  delegate_for_user_id  UUID REFERENCES users(id),
  last_login_at         TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by            UUID
);

COMMENT ON COLUMN users.cash_custody_balance IS 'CACHED value — source of truth is M6 custody_ledger. Verified nightly by drift check job.';

-- ============================================================
-- LOCATIONS (G5: raw material store, FG store, vehicle, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS locations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id        UUID NOT NULL REFERENCES sites(id),
  name           TEXT NOT NULL,
  location_type  TEXT NOT NULL CHECK (location_type IN ('RAW_MATERIAL_STORE', 'FINISHED_GOODS_STORE', 'TRADING_WAREHOUSE', 'VEHICLE', 'QUARANTINE', 'OFFICE')),
  vehicle_id     UUID,           -- FK to m5 vehicles; set for VEHICLE locations
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     UUID
);

-- ============================================================
-- USER SITE ACCESS (multi-site for coordinators if needed)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_site_access (
  user_id     UUID NOT NULL REFERENCES users(id),
  site_id     UUID NOT NULL REFERENCES sites(id),
  granted_by  UUID REFERENCES users(id),
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, site_id)
);

-- ============================================================
-- ROLE PERMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  role             TEXT NOT NULL CHECK (role IN ('OWNER', 'OPS_COORD', 'PROD_MGR', 'DRIVER', 'COLLECTOR', 'STOREKEEPER')),
  permission_code  TEXT NOT NULL,
  scope            TEXT NOT NULL DEFAULT 'SITE' CHECK (scope IN ('OWN', 'SITE', 'ALL')),
  PRIMARY KEY (role, permission_code)
);

-- ============================================================
-- BUSINESS RULE CONFIG (G8: all thresholds configurable)
-- ============================================================
CREATE TABLE IF NOT EXISTS business_rule_config (
  key          TEXT PRIMARY KEY,
  value_json   JSONB NOT NULL,
  scope        TEXT NOT NULL DEFAULT 'GLOBAL' CHECK (scope IN ('GLOBAL', 'SITE', 'ITEM_CATEGORY')),
  scope_ref    TEXT,
  description  TEXT,
  updated_by   UUID REFERENCES users(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DOCUMENT SEQUENCES (PREFIX-YYMM-NNNN numbering)
-- ============================================================
CREATE TABLE IF NOT EXISTS doc_sequences (
  doc_type    TEXT NOT NULL,
  prefix      TEXT NOT NULL,
  period      TEXT NOT NULL,           -- YYMM e.g. '2610'
  last_no     INTEGER NOT NULL DEFAULT 0,
  site_id     UUID REFERENCES sites(id),
  device_id   TEXT                     -- for offline device-scoped sequences
);
-- Composite uniqueness with NULLs treated as distinct values, enforced
-- via an expression index (PostgreSQL does not allow expressions in a
-- PRIMARY KEY constraint).
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_sequences
  ON doc_sequences (doc_type, period, COALESCE(site_id::TEXT, ''), COALESCE(device_id, ''));

-- ============================================================
-- ATTACHMENTS (ePOD photos, challan PDFs, GRN photos)
-- ============================================================
CREATE TABLE IF NOT EXISTS attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name     TEXT NOT NULL,          -- e.g. 'delivery_stops', 'goods_receipts'
  entity_id       UUID NOT NULL,
  storage_key     TEXT NOT NULL,          -- S3 object key
  mime_type       TEXT NOT NULL,
  file_size_bytes INTEGER,
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  gps_lat_lng     POINT,
  captured_at     TIMESTAMPTZ,            -- device time
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_entity ON attachments(entity_name, entity_id);

-- ============================================================
-- IDEMPOTENCY KEYS (offline sync duplicate prevention)
-- ============================================================
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key           TEXT PRIMARY KEY,
  user_id       UUID REFERENCES users(id),
  endpoint      TEXT NOT NULL,
  request_hash  TEXT,
  response_json JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_idempotency_user ON idempotency_keys(user_id, created_at);

-- ============================================================
-- DEVICE REGISTRATIONS (FCM push tokens)
-- ============================================================
CREATE TABLE IF NOT EXISTS device_registrations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id),
  device_id    TEXT NOT NULL,
  fcm_token    TEXT,
  platform     TEXT CHECK (platform IN ('ANDROID', 'IOS', 'WEB')),
  app_version  TEXT,
  last_sync_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, device_id)
);

-- ============================================================
-- IMMUTABLE AUDIT LOGS (append-only, no UPDATE/DELETE)
-- ============================================================
CREATE TABLE IF NOT EXISTS immutable_audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES users(id),
  action         TEXT NOT NULL,
  entity_name    TEXT NOT NULL,
  entity_id      UUID,
  old_value_json JSONB,
  new_value_json JSONB,
  ip_address     TEXT,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON immutable_audit_logs(entity_name, entity_id);
CREATE INDEX idx_audit_user ON immutable_audit_logs(user_id, timestamp);
CREATE INDEX idx_audit_timestamp ON immutable_audit_logs(timestamp);

-- ============================================================
-- OUTBOX EVENTS (transactional outbox for domain events)
-- ============================================================
CREATE TABLE IF NOT EXISTS outbox_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type     TEXT NOT NULL,
  aggregate_id   TEXT NOT NULL,
  payload        JSONB NOT NULL,
  module_source  TEXT NOT NULL,
  published_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ,
  error          TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_unprocessed ON outbox_events(processed_at) WHERE processed_at IS NULL;

-- ============================================================
-- REFRESH TOKENS
-- ============================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  device_id  TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ============================================================
-- APPEND-ONLY ENFORCEMENT
-- Tables that must never be mutated after insert.
-- The application DB user will have UPDATE/DELETE revoked.
-- These triggers are belt-and-braces.
-- ============================================================

CREATE OR REPLACE FUNCTION forbid_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'This table is append-only. Post a reversal entry instead of updating or deleting. Table: %', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_mutate_audit_logs
  BEFORE UPDATE OR DELETE ON immutable_audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- ============================================================
-- ROW LEVEL SECURITY — M0 tables
-- ============================================================

-- Users: non-owners see only active users at their sites
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_site_scope ON users
  USING (
    current_setting('app.role', TRUE) = 'OWNER'
    OR id::TEXT = current_setting('app.user_id', TRUE)
    OR assigned_site_id::TEXT = ANY(
      string_to_array(current_setting('app.site_ids', TRUE), ',')
    )
  );

-- Locations: scoped to user's sites
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY locations_site_scope ON locations
  USING (
    current_setting('app.role', TRUE) = 'OWNER'
    OR site_id::TEXT = ANY(
      string_to_array(current_setting('app.site_ids', TRUE), ',')
    )
  );

-- ============================================================
-- SEED: Business Rule Config defaults (README §6)
-- ============================================================

INSERT INTO business_rule_config (key, value_json, scope, description) VALUES
  ('customer_price_variance_pct',       '3',     'GLOBAL', 'Max % deviation from last customer price before showing a warning'),
  ('supplier_price_variance_pct',       '2',     'GLOBAL', 'Max % price increase on a PO before it is locked for owner approval (BR-03)'),
  ('supplier_shortfall_exception_pct',  '0',     'GLOBAL', 'Any shortfall triggers an exception (0 = any shortfall). Change to 20 for >20% only.'),
  ('yield_variance_tolerance_pct',      '3',     'GLOBAL', 'Max ±% yield variance before BR-06 alert is raised'),
  ('wastage_writeoff_owner_approval_pct', '5',   'GLOBAL', 'Wastage above this % of BOM standard requires owner approval before stock write-off'),
  ('quote_validity_hours',              '4',     'GLOBAL', 'Hours until a quote expires after creation'),
  ('default_credit_limit_inr',          '100000','GLOBAL', 'Default credit limit for new customers (INR)'),
  ('default_max_overdue_days',          '15',    'GLOBAL', 'Max days overdue before BR-02 credit hold triggers'),
  ('ar_aging_buckets',                  '"0-7,8-15,16-30,30+"', 'GLOBAL', 'AR aging bucket definitions (days)'),
  ('collection_worklist_time',          '"08:00"', 'GLOBAL', 'Daily time (HH:MM IST) to build collection worklists'),
  ('trip_close_deadline',               '"20:00"', 'GLOBAL', 'Daily deadline (HH:MM IST) for all trips to be closed (KPI 6)'),
  ('dispatch_buffer_hours',             '3',     'GLOBAL', 'Hours before delivery time that goods must be ready (production Required By calculation)'),
  ('min_margin_pct_default',            '0.10',  'GLOBAL', 'Minimum gross margin % for auto-floor: floor = cost / (1 - pct). CONFIRMED OD-001.'),
  ('owner_escalation_value_inr',        '5000',  'GLOBAL', 'INR value above which delivery disputes escalate to owner — AWAITING OWNER CONFIRMATION (OD-002)'),
  ('escalation_wait_minutes',           '60',    'GLOBAL', 'Minutes to wait before escalating unresolved exception to delegate. CONFIRMED OD-019.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- SEED: Role permissions (starter set)
-- ============================================================

INSERT INTO role_permissions (role, permission_code, scope) VALUES
  -- OWNER gets all permissions
  ('OWNER', 'price.set_daily', 'ALL'),
  ('OWNER', 'order.create', 'ALL'),
  ('OWNER', 'order.confirm_in_band', 'ALL'),
  ('OWNER', 'order.override_price', 'ALL'),
  ('OWNER', 'credit.override', 'ALL'),
  ('OWNER', 'po.create', 'ALL'),
  ('OWNER', 'po.approve', 'ALL'),
  ('OWNER', 'grn.record_blind', 'ALL'),
  ('OWNER', 'stock.transfer', 'ALL'),
  ('OWNER', 'stock.adjust_request', 'ALL'),
  ('OWNER', 'wo.start', 'ALL'),
  ('OWNER', 'wo.complete', 'ALL'),
  ('OWNER', 'wastage.writeoff', 'ALL'),
  ('OWNER', 'trip.build', 'ALL'),
  ('OWNER', 'trip.load', 'ALL'),
  ('OWNER', 'delivery.capture_epod', 'ALL'),
  ('OWNER', 'collection.log', 'ALL'),
  ('OWNER', 'receipt.verify_handover', 'ALL'),
  ('OWNER', 'invoice.void_request', 'ALL'),
  ('OWNER', 'exception.resolve', 'ALL'),
  ('OWNER', 'eod.signoff', 'ALL'),
  ('OWNER', 'config.edit', 'ALL'),
  ('OWNER', 'audit.view', 'ALL'),
  -- OPS_COORD permissions
  ('OPS_COORD', 'order.create', 'SITE'),
  ('OPS_COORD', 'order.confirm_in_band', 'SITE'),
  ('OPS_COORD', 'po.create', 'SITE'),
  ('OPS_COORD', 'stock.transfer', 'SITE'),
  ('OPS_COORD', 'stock.adjust_request', 'SITE'),
  ('OPS_COORD', 'trip.build', 'SITE'),
  ('OPS_COORD', 'trip.load', 'SITE'),
  ('OPS_COORD', 'receipt.verify_handover', 'SITE'),
  ('OPS_COORD', 'invoice.void_request', 'SITE'),
  ('OPS_COORD', 'eod.signoff', 'SITE'),
  -- PROD_MGR permissions
  ('PROD_MGR', 'wo.start', 'SITE'),
  ('PROD_MGR', 'wo.complete', 'SITE'),
  ('PROD_MGR', 'stock.adjust_request', 'SITE'),
  -- DRIVER permissions
  ('DRIVER', 'delivery.capture_epod', 'OWN'),
  ('DRIVER', 'collection.log', 'OWN'),
  -- COLLECTOR permissions
  ('COLLECTOR', 'collection.log', 'OWN'),
  -- STOREKEEPER permissions
  ('STOREKEEPER', 'grn.record_blind', 'SITE'),
  ('STOREKEEPER', 'trip.load', 'SITE'),
  ('STOREKEEPER', 'stock.transfer', 'SITE'),
  ('STOREKEEPER', 'stock.adjust_request', 'SITE')
ON CONFLICT (role, permission_code) DO NOTHING;
