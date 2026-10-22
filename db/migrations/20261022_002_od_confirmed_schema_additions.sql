-- ============================================================
-- Migration: 20261022_002_od_confirmed_schema_additions
-- Purpose:   Schema additions driven by confirmed open decisions:
--            OD-003: tax_treatment on items
--            OD-019: escalation fields on approval_policies (M7a tables)
--            OD-023: opening_balance_imports table (M6 tables)
-- Note:      These tables are pre-created here so the M0 seed and
--            Item master migrations can reference them without
--            cross-module migration ordering issues.
-- ============================================================

-- ============================================================
-- OD-003: item tax_treatment — add field ahead of M1 item master migration
-- The M1 migration creates the full items table; this migration
-- adds a helper domain type for tax treatment.
-- ============================================================

-- Reusable domain for tax treatment (used by items and invoice_lines)
DO $$ BEGIN
  CREATE TYPE tax_treatment_type AS ENUM ('TAXABLE', 'EXEMPT', 'NIL_RATED', 'NON_GST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- OD-019: approval_policies — exception delegation and escalation
-- (Full exception_approvals table created in M7a migration;
--  approval_policies is platform-level config, owned by M0.)
-- ============================================================

CREATE TABLE IF NOT EXISTS approval_policies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_type          TEXT NOT NULL,
  -- Who normally receives this exception
  primary_approver_role   TEXT NOT NULL DEFAULT 'OWNER',
  -- Delegation
  can_delegate            BOOLEAN NOT NULL DEFAULT FALSE,
  delegate_user_id        UUID REFERENCES users(id),  -- must be set if can_delegate = TRUE
  delegate_value_cap_inr  NUMERIC(14,2),               -- null = unlimited (within role permissions)
  -- Escalation timing (OD-019: no auto-approve, only escalate)
  escalation_wait_minutes INTEGER NOT NULL DEFAULT 60,
  second_escalation_user_id UUID REFERENCES users(id), -- emergency contact / backup
  -- Metadata
  updated_by              UUID REFERENCES users(id),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exception_type)
);

COMMENT ON TABLE approval_policies IS
  'OD-019: Delegation + escalation rules per exception type. Silent auto-approval is NEVER permitted.';

COMMENT ON COLUMN approval_policies.delegate_value_cap_inr IS
  'If set, delegate may only approve exceptions where value_at_risk <= this cap. Owner receives exceptions above the cap.';

-- Seed default policies for all 12 exception types
INSERT INTO approval_policies (exception_type, primary_approver_role, can_delegate, escalation_wait_minutes) VALUES
  ('PRICE_OVERRIDE',           'OWNER', TRUE,  60),
  ('CREDIT_BREACH',            'OWNER', TRUE,  60),
  ('SUPPLIER_PRICE_SPIKE',     'OWNER', FALSE, 60),
  ('SUPPLIER_SHORTFALL',       'OWNER', TRUE,  60),
  ('ALLOCATION',               'OWNER', TRUE,  60),
  ('YIELD_VARIANCE',           'OWNER', FALSE, 60),
  ('WASTAGE_WRITEOFF',         'OWNER', FALSE, 60),
  ('STOCK_VARIANCE',           'OWNER', TRUE,  60),
  ('CREDIT_REBATE_WRITEOFF',   'OWNER', FALSE, 60),
  ('DELIVERY_DISPUTE',         'OWNER', TRUE,  30),
  ('MANUAL_LEDGER_ADJUSTMENT', 'OWNER', FALSE, 60),
  ('CASH_HANDOVER_VARIANCE',   'OWNER', TRUE,  30)
ON CONFLICT (exception_type) DO NOTHING;

-- ============================================================
-- OD-023: opening_balance_imports — controlled signed-off import
-- ============================================================

CREATE TABLE IF NOT EXISTS opening_balance_imports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type    TEXT NOT NULL CHECK (import_type IN ('CUSTOMER_AR', 'SUPPLIER_AP', 'INVENTORY')),
  cut_off_date   DATE NOT NULL,
  status         TEXT NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT', 'SIGNED_OFF', 'IMPORTED', 'REVERSED')),
  -- Sign-off (accountant uploads, coordinator/owner confirms)
  signed_off_by  UUID REFERENCES users(id),
  signed_off_at  TIMESTAMPTZ,
  -- Import execution
  imported_by    UUID REFERENCES users(id),
  imported_at    TIMESTAMPTZ,
  -- Reversal (if import was wrong and needs to be undone)
  reversed_by    UUID REFERENCES users(id),
  reversed_at    TIMESTAMPTZ,
  reversal_reason TEXT,
  -- Summary
  row_count      INTEGER,
  total_value    NUMERIC(14,2),
  notes          TEXT,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Only one SIGNED_OFF or IMPORTED batch per type+date
  UNIQUE (import_type, cut_off_date, status)
);

COMMENT ON TABLE opening_balance_imports IS
  'OD-023: Two-step signed-off import for opening AR/AP/Inventory balances. Idempotent on DRAFT; irreversible after IMPORTED except via explicit REVERSAL.';

CREATE TABLE IF NOT EXISTS opening_balance_import_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id       UUID NOT NULL REFERENCES opening_balance_imports(id),
  row_number      INTEGER NOT NULL,
  -- CSV template fields
  entity_code     TEXT NOT NULL,   -- customer/supplier code or item SKU
  entity_name     TEXT,
  document_ref    TEXT NOT NULL,   -- invoice number / PO number / batch reference
  document_date   DATE NOT NULL,
  due_date        DATE,
  quantity        NUMERIC(14,3),   -- for INVENTORY imports
  uom             TEXT,            -- for INVENTORY imports
  amount_inr      NUMERIC(14,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'INR',
  -- Validation result
  validation_status TEXT CHECK (validation_status IN ('OK', 'WARN', 'ERROR')),
  validation_notes  TEXT,
  -- Link to posted ledger entry (set after import)
  ledger_entry_id UUID
);

CREATE INDEX idx_ob_import_lines ON opening_balance_import_lines(import_id);
