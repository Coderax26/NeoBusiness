-- Migration: 20261106_020_m6_cheque_lifecycle.sql
-- Extend cheque_register with full lifecycle state machine
-- Supports: RECEIVED -> DEPOSITED -> CLEARED / BOUNCED

-- Add new columns to cheque_register for lifecycle tracking
ALTER TABLE cheque_register
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN ('RECEIVED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'RETURNED')),
  ADD COLUMN IF NOT EXISTS deposited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deposited_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS deposit_slip_no VARCHAR(50),
  ADD COLUMN IF NOT EXISTS bank_deposit_ref VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cleared_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS bounce_reason TEXT,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS returned_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS return_reason TEXT;

-- Indexes for cheque lifecycle queries
CREATE INDEX IF NOT EXISTS idx_cheque_register_status ON cheque_register (status);
CREATE INDEX IF NOT EXISTS idx_cheque_register_deposited_at ON cheque_register (deposited_at);
CREATE INDEX IF NOT EXISTS idx_cheque_register_cleared_at ON cheque_register (cleared_at);

-- RLS Policy update for cheque_register (ensure site isolation)
-- Already exists from M6 base migration, but ensure it covers new columns
DROP POLICY IF EXISTS rls_cheque_register ON cheque_register;
CREATE POLICY rls_cheque_register ON cheque_register
  USING (
    current_setting('app.role') = 'OWNER'
    OR receipt_id IN (
      SELECT id FROM collection_receipts
      WHERE site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
    )
  );

-- Trigger to update updated_at timestamp (if not exists)
DROP TRIGGER IF EXISTS trg_cheque_register_updated_at ON cheque_register;
CREATE TRIGGER trg_cheque_register_updated_at
  BEFORE UPDATE ON cheque_register
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Down migration (for rollback)
-- ALTER TABLE cheque_register
--   DROP COLUMN IF EXISTS deposited_at,
--   DROP COLUMN IF EXISTS deposited_by,
--   DROP COLUMN IF EXISTS deposit_slip_no,
--   DROP COLUMN IF EXISTS bank_deposit_ref,
--   DROP COLUMN IF EXISTS cleared_at,
--   DROP COLUMN IF EXISTS cleared_by,
--   DROP COLUMN IF EXISTS bounce_reason,
--   DROP COLUMN IF EXISTS bounced_at,
--   DROP COLUMN IF EXISTS returned_at,
--   DROP COLUMN IF EXISTS returned_by,
--   DROP COLUMN IF EXISTS return_reason,
--   DROP COLUMN IF EXISTS status;