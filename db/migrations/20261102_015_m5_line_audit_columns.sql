-- ============================================================
-- Migration: 20261102_015_m5_line_audit_columns
-- Module:    M5 — Fleet, Dispatch & Delivery
-- Purpose:   Add standard audit columns to pre-existing stop lines.
-- ============================================================

ALTER TABLE delivery_stop_lines
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID;

-- DOWN
-- ALTER TABLE delivery_stop_lines DROP COLUMN IF EXISTS updated_by;
-- ALTER TABLE delivery_stop_lines DROP COLUMN IF EXISTS created_by;
