-- ============================================================
-- Migration: 20261102_011_m3_hardening
-- Module:    M3 - Inventory and Warehouse
-- Purpose:   Enforce append-only stock ledger behavior.
-- ============================================================

ALTER TABLE stock_ledger_txns
    ADD COLUMN IF NOT EXISTS reverses_txn_id UUID
    REFERENCES stock_ledger_txns(id);

CREATE OR REPLACE FUNCTION prevent_stock_ledger_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'stock_ledger_txns is append-only; post a REVERSAL instead';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS prevent_stock_ledger_update ON stock_ledger_txns;
CREATE TRIGGER prevent_stock_ledger_update
    BEFORE UPDATE OR DELETE ON stock_ledger_txns
    FOR EACH ROW EXECUTE FUNCTION prevent_stock_ledger_mutation();

-- DOWN
-- Rollback: drop prevent_stock_ledger_update and prevent_stock_ledger_mutation,
-- then drop reverses_txn_id.
