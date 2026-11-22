-- Migration: 20261116_033_fix_schema_and_status_constraints.sql
-- 1. Create missing supplier_ledger_entries table used by OpeningBalanceService
-- 2. Expand credit_notes status CHECK constraint to include all lifecycle statuses

CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  entry_type VARCHAR(30) NOT NULL CHECK (entry_type IN ('OPENING', 'BILL', 'PAYMENT', 'DEBIT_NOTE', 'ADJUSTMENT')),
  debit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  ref_no VARCHAR(60),
  running_balance NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supplier_ledger_supplier_posted
  ON supplier_ledger_entries (supplier_id, posted_at DESC);

ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_status_check;
ALTER TABLE credit_notes ADD CONSTRAINT credit_notes_status_check
  CHECK (status IN ('DRAFT', 'REQUESTED', 'APPROVED', 'ISSUED', 'APPLIED', 'REJECTED', 'CANCELLED'));
