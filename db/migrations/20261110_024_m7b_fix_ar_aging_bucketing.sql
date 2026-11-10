-- Migration 024: M7b AR Aging Bucket Logic Fix
-- Fix: Corrected inverted bucket logic in mv_ar_aging materialized view
--
-- The previous version had inverted logic where:
--   aging_0_7 was actually 8-30+ days overdue
--   aging_8_15 was actually 16-30+ days overdue
--
-- Correct bucket definitions:
--   0-7 days:   due_date >= CURRENT_DATE - 7 days
--   8-15 days:  due_date < CURRENT_DATE - 7 days AND >= CURRENT_DATE - 15 days
--   16-30 days: due_date < CURRENT_DATE - 15 days AND >= CURRENT_DATE - 30 days
--   30+ days:   due_date < CURRENT_DATE - 30 days

DROP MATERIALIZED VIEW IF EXISTS mv_ar_aging;

CREATE MATERIALIZED VIEW mv_ar_aging AS
SELECT
  c.id AS customer_id,
  c.business_name,
  c.customer_code,
  COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0), 0)::numeric(14,2) AS total_outstanding,
  COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0 AND i.due_date >= CURRENT_DATE - INTERVAL '7 days'), 0)::numeric(14,2) AS aging_0_7,
  COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0 AND i.due_date < CURRENT_DATE - INTERVAL '7 days' AND i.due_date >= CURRENT_DATE - INTERVAL '15 days'), 0)::numeric(14,2) AS aging_8_15,
  COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0 AND i.due_date < CURRENT_DATE - INTERVAL '15 days' AND i.due_date >= CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS aging_16_30,
  COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0 AND i.due_date < CURRENT_DATE - INTERVAL '30 days'), 0)::numeric(14,2) AS aging_30_plus
FROM customers c
JOIN customer_ledger_entries cle ON cle.customer_id = c.id
LEFT JOIN invoices i ON i.id = cle.ref_id AND cle.entry_type IN ('INVOICE', 'DEBIT')
WHERE cle.running_balance > 0
GROUP BY c.id, c.business_name, c.customer_code;

CREATE UNIQUE INDEX ON mv_ar_aging (customer_id);

-- DOWN
-- This migration cannot be rolled back in production without data loss
