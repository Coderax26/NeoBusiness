-- Migration 022: M7b Dashboards & Analytics - Materialized Views
-- Sprint 3: Owner-facing dashboards and analytics layer
-- Depends on: M0-M7a, M1-M6 (all prior modules)

-- ============================================================================
-- mv_pulse_today: Owner Pulse Header (cached ≤30s)
-- ============================================================================
CREATE MATERIALIZED VIEW mv_pulse_today AS
SELECT
  s.id AS site_id,
  COALESCE(SUM(CASE
    WHEN so.order_status IN ('CONFIRMED','DISPATCHED','DELIVERED_FULL','INVOICED')
    THEN so.total_amount END), 0)::numeric(14,2) AS todays_sales,
  CASE
    WHEN COALESCE(SUM(CASE
      WHEN so.order_status IN ('DISPATCHED','DELIVERED_FULL','INVOICED')
      THEN so.total_amount END), 0) > 0
    THEN ROUND(
      (COALESCE(SUM(CASE
        WHEN so.order_status IN ('DISPATCHED','DELIVERED_FULL','INVOICED')
        THEN so.total_amount END), 0) -
       COALESCE(SUM(CASE
        WHEN so.order_status IN ('DISPATCHED','DELIVERED_FULL','INVOICED')
        THEN sol.ordered_qty * sol.floor_price_snapshot END), 0)
      ) / COALESCE(SUM(CASE
        WHEN so.order_status IN ('DISPATCHED','DELIVERED_FULL','INVOICED')
        THEN so.total_amount END), 0) * 100, 2)
    ELSE 0
  END AS gross_margin_pct,
  COALESCE(SUM(CASE
    WHEN cr.collected_at >= CURRENT_DATE
     AND cr.collected_at < CURRENT_DATE + INTERVAL '1 day'
     AND cr.payment_mode IN ('CASH', 'CHEQUE')
    THEN cr.amount END), 0)::numeric(14,2) AS cash_collected_today,
  COUNT(ea.id) FILTER (WHERE ea.status = 'PENDING') AS pending_exceptions
FROM sites s
LEFT JOIN sales_orders so ON so.fulfillment_site_id = s.id
  AND so.created_at >= CURRENT_DATE
  AND so.created_at < CURRENT_DATE + INTERVAL '1 day'
LEFT JOIN sales_order_lines sol ON sol.order_id = so.id
LEFT JOIN collection_receipts cr ON cr.site_id = s.id
  AND cr.collected_at >= CURRENT_DATE
  AND cr.collected_at < CURRENT_DATE + INTERVAL '1 day'
  AND cr.payment_mode IN ('CASH', 'CHEQUE')
LEFT JOIN exception_approvals ea ON ea.site_id = s.id
GROUP BY s.id;

CREATE UNIQUE INDEX ON mv_pulse_today (site_id);
-- Note: PostgreSQL does not support RLS on materialized views.
-- Site isolation is enforced in the service layer via WHERE site_id = ...

-- ============================================================================
-- mv_ops_status: Operational Status Matrix
-- ============================================================================
CREATE MATERIALIZED VIEW mv_ops_status AS
SELECT
  s.id AS site_id,
  COUNT(so.id) FILTER (WHERE so.order_status IN ('CONFIRMED','ALLOCATED')) AS orders_pending_dispatch,
  COUNT(DISTINCT wo.id) FILTER (WHERE wo.status IN ('SCHEDULED','IN_PROGRESS')) AS batches_running,
  COUNT(DISTINCT dt.id) FILTER (WHERE dt.status = 'IN_TRANSIT') AS trucks_on_road,
  COUNT(DISTINCT ps.id) FILTER (WHERE ps.status = 'OPEN') AS supplier_shortfalls
FROM sites s
LEFT JOIN sales_orders so ON so.fulfillment_site_id = s.id
LEFT JOIN production_work_orders wo ON wo.site_id = s.id
LEFT JOIN delivery_trips dt ON dt.site_id = s.id
LEFT JOIN po_shortfalls ps ON ps.po_line_id IN (
  SELECT id FROM purchase_order_lines WHERE po_id IN (
    SELECT id FROM purchase_orders WHERE receiving_site_id = s.id
  )
)
GROUP BY s.id;

CREATE UNIQUE INDEX ON mv_ops_status (site_id);
-- Note: PostgreSQL does not support RLS on materialized views.
-- Site isolation is enforced in the service layer via WHERE site_id = ...

-- ============================================================================
-- mv_inventory_alerts: Stock alerts (LOW_STOCK, EXPIRING_SOON, OVERCOMMITTED)
-- ============================================================================
CREATE MATERIALIZED VIEW mv_inventory_alerts AS
SELECT
  ib.site_id,
  ib.item_id,
  i.sku_code,
  i.name,
  ib.batch_number,
  ib.expiry_date,
  ib.qty_on_hand,
  ib.qty_available,
  ib.qty_committed,
  i.min_stock_qty AS min_qty_threshold,
  CASE
    WHEN ib.qty_available <= 0 THEN 'OUT_OF_STOCK'
    WHEN ib.qty_available < i.min_stock_qty THEN 'LOW_STOCK'
    WHEN ib.expiry_date IS NOT NULL AND ib.expiry_date <= CURRENT_DATE + INTERVAL '7 days' THEN 'EXPIRING_SOON'
    WHEN ib.qty_committed > ib.qty_on_hand THEN 'OVERCOMMITTED'
  END AS alert_type
FROM inventory_batches ib
JOIN items i ON i.id = ib.item_id
WHERE ib.qty_available <= 0
   OR (ib.expiry_date IS NOT NULL AND ib.expiry_date <= CURRENT_DATE + INTERVAL '7 days')
   OR ib.qty_committed > ib.qty_on_hand
   OR ib.qty_available < i.min_stock_qty;

CREATE INDEX ON mv_inventory_alerts (site_id, alert_type);
-- Note: PostgreSQL does not support RLS on materialized views.
-- Site isolation is enforced in the service layer via WHERE site_id = ...

-- ============================================================================
-- mv_customer_profitability: Customer profitability ranking
-- ============================================================================
CREATE MATERIALIZED VIEW mv_customer_profitability AS
SELECT
  c.id AS customer_id,
  c.business_name,
  c.customer_code,
  COUNT(DISTINCT so.id) AS order_count,
  SUM(so.total_amount)::numeric(14,2) AS revenue,
  (SUM(so.total_amount) - COALESCE(SUM(so_cost), 0))::numeric(14,2) AS gross_profit,
  CASE
    WHEN SUM(so.total_amount) > 0
    THEN ROUND((SUM(so.total_amount) - COALESCE(SUM(so_cost), 0)) / SUM(so.total_amount) * 100, 2)
    ELSE 0
  END AS gross_margin_pct,
  MAX(so.created_at)::date AS last_order_date
FROM customers c
LEFT JOIN sales_orders so ON so.customer_id = c.id
LEFT JOIN LATERAL (
  SELECT SUM(sol.ordered_qty * sol.floor_price_snapshot) AS so_cost
  FROM sales_order_lines sol WHERE sol.order_id = so.id
) sc ON true
WHERE so.order_status NOT IN ('CANCELLED')
GROUP BY c.id, c.business_name, c.customer_code;

CREATE UNIQUE INDEX ON mv_customer_profitability (customer_id);
CREATE INDEX ON mv_customer_profitability (gross_margin_pct DESC);
-- Note: PostgreSQL does not support RLS on materialized views.
-- Site isolation is enforced in the service layer via WHERE customer_id IN (SELECT id FROM customers WHERE default_site_id = ...)

-- ============================================================================
-- mv_supplier_scorecard: Supplier fill-rate & price inflation
-- ============================================================================
CREATE MATERIALIZED VIEW mv_supplier_scorecard AS
SELECT
  s.id AS supplier_id,
  s.company_name,
  s.supplier_code,
  COUNT(DISTINCT po.id) AS po_count,
  COUNT(DISTINCT gr.id) AS grn_count,
  COALESCE(SUM(grl.received_qty) / NULLIF(SUM(pol.confirmed_qty), 0), 0) AS fill_rate,
  COALESCE(AVG(pol.price_variance_pct), 0) AS avg_price_variance_pct,
  MAX(gr.received_at)::date AS last_receipt_date
FROM suppliers s
LEFT JOIN purchase_orders po ON po.supplier_id = s.id
LEFT JOIN purchase_order_lines pol ON pol.po_id = po.id
LEFT JOIN goods_receipts gr ON gr.po_id = po.id
LEFT JOIN goods_receipt_lines grl ON grl.grn_id = gr.id AND grl.item_id = pol.item_id
WHERE po.po_status NOT IN ('CANCELLED', 'DRAFT')
GROUP BY s.id, s.company_name, s.supplier_code;

CREATE UNIQUE INDEX ON mv_supplier_scorecard (supplier_id);
-- Note: PostgreSQL does not support RLS on materialized views.
-- Site isolation is enforced in the service layer via WHERE supplier_id IN (SELECT DISTINCT supplier_id FROM purchase_orders WHERE receiving_site_id = ...)

-- ============================================================================
-- mv_yield_trend: Factory yield & wastage trend (weekly)
-- ============================================================================
CREATE MATERIALIZED VIEW mv_yield_trend AS
SELECT
  wo.site_id,
  DATE_TRUNC('week', wo.created_at)::date AS week_start,
  SUM(wo.planned_qty)::numeric(14,3) AS total_planned,
  SUM(woo.actual_qty)::numeric(14,3) AS total_output,
  CASE
    WHEN SUM(wo.planned_qty) > 0
    THEN ROUND(SUM(woo.actual_qty) / SUM(wo.planned_qty) * 100, 2)
    ELSE 0
  END AS yield_pct,
  SUM(wr.qty)::numeric(14,3) AS total_wastage,
  CASE
    WHEN SUM(woo.actual_qty) > 0
    THEN ROUND(SUM(wr.qty) / SUM(woo.actual_qty) * 100, 2)
    ELSE 0
  END AS wastage_pct
FROM production_work_orders wo
LEFT JOIN work_order_outputs woo ON woo.work_order_id = wo.id
LEFT JOIN wastage_records wr ON wr.work_order_id = wo.id
WHERE wo.status = 'COMPLETED'
GROUP BY wo.site_id, DATE_TRUNC('week', wo.created_at);

CREATE UNIQUE INDEX ON mv_yield_trend (site_id, week_start);
-- Note: PostgreSQL does not support RLS on materialized views.
-- Site isolation is enforced in the service layer via WHERE site_id = ...

-- ============================================================================
-- mv_ar_aging: AR aging buckets
-- ============================================================================
CREATE MATERIALIZED VIEW mv_ar_aging AS
SELECT
  c.id AS customer_id,
  c.business_name,
  c.customer_code,
  COALESCE(SUM(cle.running_balance) FILTER (WHERE cle.running_balance > 0), 0)::numeric(14,2) AS total_outstanding,
  -- Bucket definitions (due days from CURRENT_DATE):
  -- - 0-7 days: due_date >= CURRENT_DATE - 7 days (including future due dates)
  -- - 8-15 days: due_date < CURRENT_DATE - 7 days AND due_date >= CURRENT_DATE - 15 days
  -- - 16-30 days: due_date < CURRENT_DATE - 15 days AND due_date >= CURRENT_DATE - 30 days
  -- - 30+ days: due_date < CURRENT_DATE - 30 days
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
-- Note: PostgreSQL does not support RLS on materialized views.
-- Site isolation is enforced in the service layer via WHERE customer_id IN (SELECT id FROM customers WHERE default_site_id = ...)

-- ============================================================================
-- Refresh functions for materialized views
-- ============================================================================

-- Refresh pulse today (high frequency - every 30-60s)
CREATE OR REPLACE FUNCTION refresh_mv_pulse_today() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_pulse_today;
END $$;

-- Refresh ops status (medium frequency - every 2-5 min)
CREATE OR REPLACE FUNCTION refresh_mv_ops_status() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ops_status;
END $$;

-- Refresh inventory alerts (medium frequency - every 5 min)
CREATE OR REPLACE FUNCTION refresh_mv_inventory_alerts() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_alerts;
END $$;

-- Refresh analytics views (nightly)
CREATE OR REPLACE FUNCTION refresh_mv_customer_profitability() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_profitability;
END $$;

CREATE OR REPLACE FUNCTION refresh_mv_supplier_scorecard() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_supplier_scorecard;
END $$;

CREATE OR REPLACE FUNCTION refresh_mv_yield_trend() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_yield_trend;
END $$;

CREATE OR REPLACE FUNCTION refresh_mv_ar_aging() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ar_aging;
END $$;