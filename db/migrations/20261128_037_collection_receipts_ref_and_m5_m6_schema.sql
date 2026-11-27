-- Migration: 20261128_037_collection_receipts_ref_and_m5_m6_schema.sql
-- Purpose:
--   1. Add reference_type and reference_id columns to collection_receipts (needed by M5 getTrip COD check & M6 COD settlement)
--   2. Add updated_by column to delivery_stop_lines (needed by M5 dispatchTrip)
--   3. Harden M6 RLS policies with OWNER bypass and safe ::TEXT site_ids comparison

-- ============================================================
-- 1. Collection Receipts Reference Columns
-- ============================================================
ALTER TABLE collection_receipts ADD COLUMN IF NOT EXISTS reference_type VARCHAR(50);
ALTER TABLE collection_receipts ADD COLUMN IF NOT EXISTS reference_id UUID;

CREATE INDEX IF NOT EXISTS idx_collection_receipts_ref
  ON collection_receipts (reference_type, reference_id)
  WHERE reference_type IS NOT NULL;

-- ============================================================
-- 2. Delivery Stop Lines Audit Column
-- ============================================================
ALTER TABLE delivery_stop_lines ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES users(id);

-- ============================================================
-- 3. Harden M6 RLS Policies (OWNER bypass + safe ::TEXT compare)
-- ============================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS site_isolation_invoices ON invoices;
  CREATE POLICY site_isolation_invoices ON invoices
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_invoice_lines ON invoice_lines;
  CREATE POLICY site_isolation_invoice_lines ON invoice_lines
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR invoice_id IN (SELECT id FROM invoices)
    );

  DROP POLICY IF EXISTS site_isolation_collection_receipts ON collection_receipts;
  CREATE POLICY site_isolation_collection_receipts ON collection_receipts
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_receipt_allocations ON receipt_allocations;
  CREATE POLICY site_isolation_receipt_allocations ON receipt_allocations
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR receipt_id IN (SELECT id FROM collection_receipts)
    );

  DROP POLICY IF EXISTS site_isolation_customer_ledger ON customer_ledger_entries;
  CREATE POLICY site_isolation_customer_ledger ON customer_ledger_entries
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_custody_ledger ON custody_ledger;
  CREATE POLICY site_isolation_custody_ledger ON custody_ledger
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_cash_handovers ON cash_handovers;
  CREATE POLICY site_isolation_cash_handovers ON cash_handovers
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_cheque_register ON cheque_register;
  DROP POLICY IF EXISTS rls_cheque_register ON cheque_register;
  CREATE POLICY site_isolation_cheque_register ON cheque_register
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR receipt_id IN (SELECT id FROM collection_receipts)
    );

  DROP POLICY IF EXISTS site_isolation_ptp_followups ON ptp_followups;
  CREATE POLICY site_isolation_ptp_followups ON ptp_followups
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_eod_closings ON eod_closings;
  CREATE POLICY site_isolation_eod_closings ON eod_closings
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'credit_notes') THEN
    DROP POLICY IF EXISTS rls_credit_notes ON credit_notes;
    CREATE POLICY rls_credit_notes ON credit_notes
      USING (
        current_setting('app.role', TRUE) = 'OWNER'
        OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
      );
  END IF;
END $$;
