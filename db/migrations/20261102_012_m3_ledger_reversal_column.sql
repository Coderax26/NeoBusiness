-- ============================================================
-- Migration: 20261102_012_m3_ledger_reversal_column
-- Module:    M3 - Inventory and Warehouse
-- Purpose:   Add the ledger reversal reference column.
-- ============================================================

ALTER TABLE stock_ledger_txns
    ADD COLUMN IF NOT EXISTS reverses_txn_id UUID
    REFERENCES stock_ledger_txns(id);

-- DOWN
-- Rollback: drop reverses_txn_id.
