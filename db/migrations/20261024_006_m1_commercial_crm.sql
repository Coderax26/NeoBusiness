-- ============================================================
-- Migration: 20261024_006_m1_commercial_crm
-- Module:    M1 — Commercial & CRM
-- Purpose:   All M1 tables for orders, pricing, credits, customers.
-- ============================================================

-- ============================================================
-- CUSTOMERS
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_code          TEXT NOT NULL UNIQUE,
  business_name          TEXT NOT NULL,
  contact_person         TEXT,
  phone                  TEXT NOT NULL,
  whatsapp_no            TEXT,
  billing_address        TEXT NOT NULL,
  gps_lat_lng           JSONB,                -- {lat, lng}
  credit_limit           NUMERIC(14,2) NOT NULL,
  credit_days            INTEGER NOT NULL DEFAULT 15,
  current_ar_balance     NUMERIC(14,2) NOT NULL DEFAULT 0.00,
  max_overdue_days       INTEGER NOT NULL DEFAULT 15,
  preferred_delivery_window TEXT,             -- e.g., "14:00-16:00"
  payment_reliability_score NUMERIC(3,2) CHECK (payment_reliability_score >= 0 AND payment_reliability_score <= 1),
  default_site_id        UUID REFERENCES sites(id),
  gstin                  TEXT,
  state_code             TEXT NOT NULL,          -- GST place of supply
  credit_hold            BOOLEAN NOT NULL DEFAULT FALSE,
  price_tier             TEXT NOT NULL DEFAULT 'STANDARD',
  is_active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by             UUID,
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by             UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_code ON customers(customer_code);
CREATE INDEX IF NOT EXISTS idx_customers_site ON customers(default_site_id) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_customers_credit_hold ON customers(credit_hold, credit_limit, current_ar_balance) WHERE credit_hold = TRUE;

COMMENT ON TABLE customers IS 'Customer master with credit limit and AR balance cache (source of truth is M6 customer_ledger_entries).';
COMMENT ON COLUMN customers.current_ar_balance IS 'Cached value from M6. Updated nightly by drift check job.';
COMMENT ON COLUMN customers.max_overdue_days IS 'BR-02: Triggers credit_hold when any invoice exceeds this.';
COMMENT ON COLUMN customers.price_tier IS 'Standing negotiated prices tier (OD-024 awaiting decision).';

-- ============================================================
-- CUSTOMER CONTACTS
-- ============================================================
CREATE TABLE IF NOT EXISTS customer_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('ACCOUNT_MANAGER', 'TAX_OFFICER', 'PURCHASING', 'PROCUREMENT', 'FINANCE', 'OTHER')),
  is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by   UUID
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_contacts_primary ON customer_contacts(customer_id, is_primary) WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer ON customer_contacts(customer_id);

-- ============================================================
-- COMMUNICATION LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS communication_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel        TEXT NOT NULL CHECK (channel IN ('CALL', 'WHATSAPP', 'VISIT')),
  note           TEXT NOT NULL,
  user_id        UUID REFERENCES users(id) ON DELETE SET NULL,
  at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     UUID
);

CREATE INDEX IF NOT EXISTS idx_communication_log_customer ON communication_log(customer_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_communication_log_user ON communication_log(user_id);

-- ============================================================
-- ITEMS
-- ============================================================
CREATE TABLE IF NOT EXISTS items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_code           TEXT NOT NULL UNIQUE,
  name               TEXT NOT NULL,
  item_category      TEXT NOT NULL CHECK (item_category IN ('TRADED_GOOD', 'RAW_MATERIAL', 'PROCESSED_FG', 'PACKAGING')),
  primary_uom        TEXT NOT NULL CHECK (primary_uom IN ('KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER')),
  secondary_uom      TEXT CHECK (secondary_uom IN ('KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER')),
  shelf_life_days    INTEGER,
  tax_rate_pct       NUMERIC(6,4) NOT NULL,
  hsn_code           TEXT,
  is_catch_weight    BOOLEAN NOT NULL DEFAULT FALSE,
  standard_weight_per_secondary_kg NUMERIC(14,3) CHECK (standard_weight_per_secondary_kg >= 0),
  min_margin_pct     NUMERIC(3,2) NOT NULL DEFAULT 0.10,     -- 10% global default per OD-001 CONFIRMED
  tax_treatment      TEXT NOT NULL CHECK (tax_treatment IN ('TAXABLE', 'EXEMPT', 'NIL_RATED', 'NON_GST')),
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by         UUID
);

CREATE INDEX IF NOT EXISTS idx_items_sku ON items(sku_code);
CREATE INDEX IF NOT EXISTS idx_items_category ON items(item_category) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_items_hsn ON items(hsn_code) WHERE is_active = TRUE;

COMMENT ON TABLE items IS 'Item master owned by M1. Read by M2-M5 via ItemPort.';
COMMENT ON COLUMN items.secondary_uom IS 'Second tier UoM (e.g., 1 CARTON = 100 KG).';
COMMENT ON COLUMN items.is_catch_weight IS 'Item where actual weight varies per order (e.g., loose potatoes). Consumed as secondary qty if is_catch_weight = TRUE.';
COMMENT ON COLUMN items.standard_weight_per_secondary_kg IS 'Standard conversion factor from secondary to primary UoM. Uses autoFloor rounding';
COMMENT ON COLUMN items.tax_treatment IS 'CONFIRMED OD-003: TAXABLE lines compute CGST/SGST or IGST. EXEMPT/NIL_RATED/NON_GST lines have tax_amount = 0.';

-- ============================================================
-- UOM CONVERSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS uom_conversions (
  item_id     UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  from_uom    TEXT NOT NULL CHECK (from_uom IN ('KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER')),
  to_uom      TEXT NOT NULL CHECK (to_uom IN ('KG', 'CRATE', 'CARTON', 'LITER', 'BAG', 'OTHER')),
  factor      NUMERIC(7,3) NOT NULL CHECK (factor > 0),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  effective_to TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID,
  PRIMARY KEY (item_id, from_uom, to_uom)
);

CREATE INDEX IF NOT EXISTS idx_uom_conversions_item ON uom_conversions(item_id, is_active);
CREATE INDEX IF NOT EXISTS idx_uom_conversions_effective ON uom_conversions(effective_from, effective_to) WHERE effective_to IS NULL;

-- ============================================================
-- DAILY PRICE LISTS
-- ============================================================
CREATE TABLE IF NOT EXISTS daily_price_lists (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  effective_date         DATE NOT NULL,
  latest_landed_cost     NUMERIC(14,2) NOT NULL,
  floor_price            NUMERIC(14,2) NOT NULL,
  target_price           NUMERIC(14,2) NOT NULL,
  min_margin_pct_used    NUMERIC(3,2) NOT NULL,
  source                 TEXT NOT NULL CHECK (source IN ('AUTO', 'MANUAL')),
  published_at           TIMESTAMPTZ NOT NULL,
  updated_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_price_lists_item_date ON daily_price_lists(item_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_daily_price_lists_dates ON daily_price_lists(effective_date);

COMMENT ON TABLE daily_price_lists IS 'Daily band per item: cost, floor (auto or manual), target. Price.updated event published when published.';

-- ============================================================
-- QUOTES
-- ============================================================
CREATE TABLE IF NOT EXISTS quotes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_no          TEXT NOT NULL,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  site_id           UUID NOT NULL REFERENCES sites(id),
  status            TEXT NOT NULL CHECK (status IN ('DRAFT', 'SENT', 'CONVERTED', 'EXPIRED', 'LOST')),
  total_amount      NUMERIC(14,2) NOT NULL,
  margin_pct        NUMERIC(5,2),
  valid_until       TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  source_quote_id   UUID REFERENCES quotes(id) ON DELETE SET NULL  -- for counter-quotes
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_quotes_no_site ON quotes(quote_no, site_id);
CREATE INDEX IF NOT EXISTS idx_quotes_customer ON quotes(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_valid_until ON quotes(valid_until) WHERE status IN ('SENT', 'CONVERTED');
CREATE INDEX IF NOT EXISTS idx_quotes_source ON quotes(source_quote_id) WHERE source_quote_id IS NOT NULL;

COMMENT ON TABLE quotes IS 'Commercial quotes with validity period. convert() moves lines into sales order.';
COMMENT ON COLUMN quotes.source_quote_id IS 'Counter-quote: when a quote is returned with a counter, source_quote_id links it.';

-- ============================================================
-- QUOTE LINES
-- ============================================================
CREATE TABLE IF NOT EXISTS quote_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id        UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  qty             NUMERIC(14,3) NOT NULL,
  quoted_unit_price NUMERIC(14,2) NOT NULL,
  floor_price_snapshot NUMERIC(14,2) NOT NULL,
  target_price_snapshot NUMERIC(14,2) NOT NULL,
  landed_cost_snapshot NUMERIC(14,2) NOT NULL,
  margin_pct_snapshot NUMERIC(5,2),
  qty_secondary   NUMERIC(14,3),               -- primary UoM qty converted to secondary (if catch weight)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID
);

CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON quote_lines(quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_lines_item ON quote_lines(item_id);

-- ============================================================
-- SALES ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no          TEXT NOT NULL,
  customer_id       UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  fulfillment_site_id UUID REFERENCES sites(id),
  order_status      TEXT NOT NULL CHECK (order_status IN ('DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'IN_PRODUCTION_SOURCING', 'READY', 'DISPATCHED', 'DELIVERED_FULL', 'DELIVERED_PARTIAL', 'CLOSED', 'CANCELLED', 'REJECTED')),
  total_amount      NUMERIC(14,2) NOT NULL,
  margin_pct        NUMERIC(5,2),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at      TIMESTAMPTZ,
  delivery_date     DATE,
  delivery_time_window TEXT,
  credit_flag       TEXT CHECK (credit_flag IN ('OK', 'HOLD', 'COD_ONLY')),
  payment_terms     TEXT CHECK (payment_terms IN ('CREDIT', 'COD')),
  source_quote_id   UUID REFERENCES sales_orders(id) ON DELETE SET NULL,   -- for converted quotes
  created_at_idx    TIMESTAMPTZ NOT NULL DEFAULT NOW(),        -- functional index for sorting
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by        UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_no_site ON sales_orders(order_no, fulfillment_site_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_customer ON sales_orders(customer_id, order_status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_site ON sales_orders(fulfillment_site_id) WHERE order_status IN ('DRAFT', 'CONFIRMED');
CREATE INDEX IF NOT EXISTS idx_sales_orders_credit ON sales_orders(credit_flag, delivery_date) WHERE credit_flag IN ('HOLD', 'COD_ONLY');
CREATE INDEX IF NOT EXISTS idx_sales_orders_source ON quotes(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_created ON sales_orders(created_at_idx DESC);  -- chronological for price memory

COMMENT ON TABLE sales_orders IS 'Commercial order lifecycle. order.confirmed event triggers M3 reserve and M2 back-to-back suggestion.';
COMMENT ON COLUMN sales_orders.approved_by IS 'Owner/Coordinator who manually approved a below-floor order.';
COMMENT ON COLUMN sales_orders.confirmed_at IS 'KPI 4: time when first in-band line was confirmed.';
COMMENT ON COLUMN sales_orders.source_quote_id IS 'Converted from a quote. Counter-quotes reuse this pattern.';

-- ============================================================
-- SALES ORDER LINES
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_order_lines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  item_id                 UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  ordered_qty             NUMERIC(14,3) NOT NULL,
  quoted_unit_price       NUMERIC(14,2) NOT NULL,
  floor_price_snapshot    NUMERIC(14,2) NOT NULL,
  target_price_snapshot   NUMERIC(14,2) NOT NULL,
  landed_cost_snapshot    NUMERIC(14,2) NOT NULL,
  margin_pct_snapshot     NUMERIC(5,2),
  allocated_from_stock_qty NUMERIC(14,3) NOT NULL DEFAULT 0.000,
  requires_production_qty NUMERIC(14,3) NOT NULL DEFAULT 0.000,
  delivered_qty           NUMERIC(14,3) NOT NULL DEFAULT 0.000,
  line_margin_pct         NUMERIC(5,2),
  qty_secondary           NUMERIC(14,3),       -- primary UoM qty converted to secondary (if catch weight)
  line_total              NUMERIC(14,2) NOT NULL,
  returned_qty            NUMERIC(14,3) NOT NULL DEFAULT 0.000,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by              UUID,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by              UUID
);

CREATE INDEX IF NOT EXISTS idx_sales_order_lines_order ON sales_order_lines(order_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_lines_item ON sales_order_lines(item_id);

-- ============================================================
-- ORDER STATUS LOG (audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS order_status_log (
  order_id    UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status   TEXT NOT NULL,
  by_user     UUID REFERENCES users(id) ON DELETE SET NULL,
  at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reason      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID,
  PRIMARY KEY (order_id, at)  -- one row per status transition per order
);

CREATE INDEX IF NOT EXISTS idx_order_status_log_order ON order_status_log(order_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_order_status_log_status ON order_status_log(from_status, to_status);

COMMENT ON TABLE order_status_log IS 'Immutable audit trail of order status changes forimeline view.';

-- ============================================================
-- SEED: M1 PERMISSOins
-- ============================================================
-- Consumers and reporters need permissions for M1 entities.
-- Policy enforcement for CR-01/BR-02 (price/credit) is purely at the data layer with only OWNER allowed to bypass.
INSERT INTO role_permissions (role, permission_code, scope) VALUES
  -- OWNER permissions
  ('OWNER', 'customer.view', 'ALL'),
  ('OWNER', 'customer.modify', 'ALL'),
  ('OWNER', 'customer.credit_override', 'ALL'),
  ('OWNER', 'item.view', 'ALL'),
  ('OWNER', 'item.modify', 'ALL'),
  ('OWNER', 'price.set_daily', 'ALL'),
  ('OWNER', 'item.modify_margin', 'ALL'),
  ('OWNER', 'quote.view', 'ALL'),
  ('OWNER', 'order.manage', 'ALL'),
  ('OWNER', 'order.approve_override', 'ALL'),

  -- OPS_COORD permissions
  ('OPS_COORD', 'customer.view', 'SITE'),            -- read-only
  ('OPS_COORD', 'customer_contact.view', 'SITE'),
  ('OPS_COORD', 'item.view', 'SITE'),                -- read-only from customer site
  ('OPS_COORD', 'quote.create', 'SITE'),
  ('OPS_COORD', 'quote.view', 'SITE'),
  ('OPS_COORD', 'order.create', 'SITE'),
  ('OPS_COORD', 'order.view', 'SITE'),
  ('OPS_COORD', 'order.request_override', 'SITE')
ON CONFLICT (role, permission_code) DO NOTHING;