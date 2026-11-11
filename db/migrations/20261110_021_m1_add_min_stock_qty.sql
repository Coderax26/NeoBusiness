-- Migration 023: Add min_stock_qty column to items table
-- Sprint 3: Required for M7b inventory alerts (LOW_STOCK)
-- Depends on: 006_m1_commercial_crm (items table)

-- Add min_stock_qty column to items table for M7b stock alerts
ALTER TABLE items
ADD COLUMN IF NOT EXISTS min_stock_qty NUMERIC(14,3) NOT NULL DEFAULT 0.000;

COMMENT ON COLUMN items.min_stock_qty IS 'Minimum stock threshold for low-stock alerts (M7b dashboards). Set per item by Owner/OPS_COORD.';

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================
-- ALTER TABLE items DROP COLUMN IF EXISTS min_stock_qty;