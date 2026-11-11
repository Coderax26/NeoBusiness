-- Migration 027: M2 Supplier Bill Status Enum Expansion & M7b AR Aging Query Correction
--
-- Workstream A:
-- Expands supplier_bills status constraint to include DRAFT, PENDING_APPROVAL, APPROVED, REJECTED.
-- Adds total_amount column to supplier_bills (synced with amount).
--
-- Workstream D:
-- Corrects mv_ar_aging materialized view to aggregate invoice-level balance_due
-- instead of repeatedly summing cumulative customer-level running balances across ledger entries.

-- ============================================================================
-- 1. UPDATE supplier_bills STATUS CONSTRAINT & COLUMNS
-- ============================================================================

ALTER TABLE supplier_bills DROP CONSTRAINT IF EXISTS supplier_bills_status_check;
ALTER TABLE supplier_bills ADD CONSTRAINT supplier_bills_status_check
    CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'RECEIVED', 'VERIFIED', 'PAID', 'DISPUTED'));

ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS total_amount numeric(14,2) DEFAULT 0.00;

UPDATE supplier_bills
SET total_amount = amount
WHERE (total_amount IS NULL OR total_amount = 0.00) AND amount IS NOT NULL;

-- ============================================================================
-- 2. CORRECT mv_ar_aging MATERIALIZED VIEW
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS mv_ar_aging;

CREATE MATERIALIZED VIEW mv_ar_aging AS
SELECT
  c.id AS customer_id,
  c.business_name,
  c.customer_code,
  COALESCE(SUM(i.balance_due), 0)::numeric(14,2) AS total_outstanding,
  COALESCE(SUM(i.balance_due) FILTER (WHERE i.due_date >= CURRENT_DATE - INTERVAL '7 days'), 0)::numeric(14,2) AS aging_0_7,
  COALESCE(SUM(i.balance_due) FILTER (WHERE i.due_date < CURRENT_DATE - INTERVAL '7 days' AND i.due_date >= CURRENT_DATE - INTERVAL '15 days'), 0)::numeric(14,2) AS aging_8_15,
  COALESCE(SUM(i.balance_due) FILTER (WHERE i.due_date < CURRENT_DATE - INTERVAL '15 days' AND i.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS aging_16_30,
  COALESCE(SUM(i.balance_due) FILTER (WHERE i.due_date < CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS aging_30_plus
FROM customers c
JOIN invoices i ON i.customer_id = c.id
WHERE i.balance_due > 0
  AND i.status NOT IN ('CANCELLED', 'PAID')
GROUP BY c.id, c.business_name, c.customer_code;

CREATE UNIQUE INDEX ON mv_ar_aging (customer_id);

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP MATERIALIZED VIEW IF EXISTS mv_ar_aging;
-- CREATE MATERIALIZED VIEW mv_ar_aging AS
-- SELECT
--   c.id AS customer_id,
--   c.business_name,
--   c.customer_code,
--   COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0), 0)::numeric(14,2) AS total_outstanding,
--   COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0 AND i.due_date >= CURRENT_DATE - INTERVAL '7 days'), 0)::numeric(14,2) AS aging_0_7,
--   COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0 AND i.due_date < CURRENT_DATE - INTERVAL '7 days' AND i.due_date >= CURRENT_DATE - INTERVAL '15 days'), 0)::numeric(14,2) AS aging_8_15,
--   COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0 AND i.due_date < CURRENT_DATE - INTERVAL '15 days' AND i.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS aging_16_30,
--   COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0 AND i.due_date < CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS aging_30_plus
-- FROM customers c
-- JOIN customer_ledger_entries cle ON cle.customer_id = c.id
-- LEFT JOIN invoices i ON i.id = cle.ref_id AND cle.entry_type IN ('INVOICE', 'DEBIT')
-- WHERE cle.running_balance > 0
-- GROUP BY c.id, c.business_name, c.customer_code;
-- CREATE UNIQUE INDEX ON mv_ar_aging (customer_id);
-- ALTER TABLE supplier_bills DROP CONSTRAINT IF EXISTS supplier_bills_status_check;
-- ALTER TABLE supplier_bills ADD CONSTRAINT supplier_bills_status_check
--     CHECK (status IN ('RECEIVED', 'VERIFIED', 'APPROVED', 'PAID', 'DISPUTED'));
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS total_amount;

