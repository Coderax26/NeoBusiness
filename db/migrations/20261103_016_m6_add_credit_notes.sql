-- Migration: 20261103_016_m6_add_credit_notes.sql
-- Add credit_notes and credit_note_lines tables for M6 credit note flow
-- Supports returned goods, damaged goods, price adjustments, and write-offs

-- credit_notes table
CREATE TABLE IF NOT EXISTS credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_no VARCHAR(50) NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  order_id UUID REFERENCES sales_orders(id),
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ISSUED', 'APPLIED', 'CANCELLED')),
  reason_type VARCHAR(30) NOT NULL
    CHECK (reason_type IN ('RETURNED', 'SOLD_QUIETLY', 'ABNORMAL_DAMAGE', 'EXPIRY', 'OTHER')),
  total_debit NUMERIC(14,2) NOT NULL DEFAULT '0.00',
  status_reason TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES users(id),
  rejected_at TIMESTAMPTZ,
  rejected_reason TEXT,
  counter_amount NUMERIC(14,2),
  counter_remarks TEXT
);

-- credit_note_lines table
CREATE TABLE IF NOT EXISTS credit_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES credit_notes(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES sales_orders(id),
  item_id UUID NOT NULL REFERENCES items(id),
  line_item_id UUID REFERENCES sales_order_lines(id),
  debited_qty NUMERIC(14,3) NOT NULL,
  unit_price NUMERIC(14,2) NOT NULL,
  total_debit NUMERIC(14,2) NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on credit_note_no per site
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_notes_no_site
  ON credit_notes (credit_note_no, site_id);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_credit_notes_customer_id ON credit_notes (customer_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_order_id ON credit_notes (order_id);
CREATE INDEX IF NOT EXISTS idx_credit_notes_status ON credit_notes (status);
CREATE INDEX IF NOT EXISTS idx_credit_notes_site_id ON credit_notes (site_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_credit_note_id ON credit_note_lines (credit_note_id);
CREATE INDEX IF NOT EXISTS idx_credit_note_lines_item_id ON credit_note_lines (item_id);

-- RLS Policies
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_note_lines ENABLE ROW LEVEL SECURITY;

-- RLS for credit_notes: users see only their site's credit notes
DROP POLICY IF EXISTS rls_credit_notes ON credit_notes;
CREATE POLICY rls_credit_notes ON credit_notes
  USING (
    current_setting('app.role') = 'OWNER'
    OR site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
  );

-- RLS for credit_note_lines: inherit from credit_notes via FK
DROP POLICY IF EXISTS rls_credit_note_lines ON credit_note_lines;
CREATE POLICY rls_credit_note_lines ON credit_note_lines
  USING (
    current_setting('app.role') = 'OWNER'
    OR credit_note_id IN (
      SELECT id FROM credit_notes
      WHERE site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
    )
  );

-- Append-only protection for credit_notes (no DELETE, no UPDATE on financial fields)
REVOKE DELETE ON credit_notes FROM neobus_app;
REVOKE DELETE ON credit_note_lines FROM neobus_app;
REVOKE UPDATE (total_debit, status, credit_note_no) ON credit_notes FROM neobus_app;
REVOKE UPDATE (debited_qty, unit_price, total_debit) ON credit_note_lines FROM neobus_app;

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS trg_credit_notes_updated_at ON credit_notes;
CREATE TRIGGER trg_credit_notes_updated_at
  BEFORE UPDATE ON credit_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_credit_note_lines_updated_at ON credit_note_lines;
CREATE TRIGGER trg_credit_note_lines_updated_at
  BEFORE UPDATE ON credit_note_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Down migration (for rollback)
-- DROP TABLE IF EXISTS credit_note_lines;
-- DROP TABLE IF EXISTS credit_notes;