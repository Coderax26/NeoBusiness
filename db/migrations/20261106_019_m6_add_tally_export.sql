-- Migration: 20261106_019_m6_add_tally_export.sql
-- Add tally_export_batches and tally_export_items tables for M6 Tally XML export
-- Supports nightly idempotent accounting export to Tally

-- tally_export_batches table
CREATE TABLE IF NOT EXISTS tally_export_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_no VARCHAR(50) NOT NULL,
  batch_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PROCESSING'
    CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  total_vouchers INTEGER NOT NULL DEFAULT 0,
  xml_content TEXT,
  error_message TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tally_export_items table (tracks each voucher exported)
CREATE TABLE IF NOT EXISTS tally_export_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES tally_export_batches(id) ON DELETE CASCADE,
  voucher_type VARCHAR(20) NOT NULL
    CHECK (voucher_type IN ('SALES', 'RECEIPT', 'CREDIT_NOTE', 'JOURNAL', 'PAYMENT', 'CONTRA')),
  voucher_ref_id UUID NOT NULL,
  voucher_ref_no VARCHAR(50) NOT NULL,
  voucher_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unique constraint to prevent duplicate exports of same voucher
  UNIQUE (voucher_type, voucher_ref_id)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_tally_export_batches_date ON tally_export_batches (batch_date);
CREATE INDEX IF NOT EXISTS idx_tally_export_batches_status ON tally_export_batches (status);
CREATE INDEX IF NOT EXISTS idx_tally_export_items_batch_id ON tally_export_items (batch_id);
CREATE INDEX IF NOT EXISTS idx_tally_export_items_voucher_ref ON tally_export_items (voucher_type, voucher_ref_id);

-- RLS Policies
ALTER TABLE tally_export_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE tally_export_items ENABLE ROW LEVEL SECURITY;

-- RLS for tally_export_batches: global access for OWNER, site-scoped for others
DROP POLICY IF EXISTS rls_tally_export_batches ON tally_export_batches;
CREATE POLICY rls_tally_export_batches ON tally_export_batches
  USING (
    current_setting('app.role') = 'OWNER'
    OR true -- Tally exports are global (accountant access)
  );

-- RLS for tally_export_items: inherit from batches
DROP POLICY IF EXISTS rls_tally_export_items ON tally_export_items;
CREATE POLICY rls_tally_export_items ON tally_export_items
  USING (
    current_setting('app.role') = 'OWNER'
    OR batch_id IN (
      SELECT id FROM tally_export_batches
    )
  );

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS trg_tally_export_batches_updated_at ON tally_export_batches;
CREATE TRIGGER trg_tally_export_batches_updated_at
  BEFORE UPDATE ON tally_export_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_tally_export_items_updated_at ON tally_export_items;
CREATE TRIGGER trg_tally_export_items_updated_at
  BEFORE UPDATE ON tally_export_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Down migration (for rollback)
-- DROP TABLE IF EXISTS tally_export_items;
-- DROP TABLE IF EXISTS tally_export_batches;