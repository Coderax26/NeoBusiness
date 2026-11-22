-- M2 Procurement & Supplier Module - Baseline Schema
-- Sequence: 021
-- Date: 2026-11-07

-- 1. suppliers table (extended from blueprint §3)
CREATE TABLE IF NOT EXISTS suppliers (
    id uuid PRIMARY KEY,
    supplier_code varchar(50) NOT NULL UNIQUE,
    company_name varchar(255) NOT NULL,
    phone varchar(20) NOT NULL,
    whatsapp_no varchar(20),
    payment_terms_days int NOT NULL DEFAULT 30,
    gstin varchar(15),
    reliability_score_pct numeric(5,2) NOT NULL DEFAULT 0.00, -- 0-100%
    lead_time_days_avg int NOT NULL DEFAULT 7,
    current_ap_balance numeric(14,2) NOT NULL DEFAULT 0.00,
    is_approved boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_suppliers_code ON suppliers(supplier_code);
CREATE INDEX IF NOT EXISTS idx_suppliers_active ON suppliers(is_active) WHERE is_active = true;

-- 2. supplier_items table
CREATE TABLE IF NOT EXISTS supplier_items (
    supplier_id uuid NOT NULL REFERENCES suppliers(id),
    item_id uuid NOT NULL REFERENCES items(id),
    is_primary boolean NOT NULL DEFAULT false,
    pack_size numeric(14,3) NOT NULL DEFAULT 1.000,
    min_order_qty numeric(14,3) NOT NULL DEFAULT 1.000,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL,
    PRIMARY KEY (supplier_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_items_item ON supplier_items(item_id);

-- 3. supplier_rate_quotes table (volatility tracker)
CREATE TABLE IF NOT EXISTS supplier_rate_quotes (
    id uuid PRIMARY KEY,
    supplier_id uuid NOT NULL REFERENCES suppliers(id),
    item_id uuid NOT NULL REFERENCES items(id),
    quoted_price numeric(14,2) NOT NULL,
    quoted_at timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    source varchar(20) NOT NULL CHECK (source IN ('CALL', 'WHATSAPP', 'PO')),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_rate_quotes_lookup ON supplier_rate_quotes(supplier_id, item_id, quoted_at DESC);
CREATE INDEX IF NOT EXISTS idx_supplier_rate_quotes_valid ON supplier_rate_quotes(valid_until) WHERE valid_until IS NOT NULL;

-- 4. rate_contracts table
CREATE TABLE IF NOT EXISTS rate_contracts (
    id uuid PRIMARY KEY,
    supplier_id uuid NOT NULL REFERENCES suppliers(id),
    item_id uuid NOT NULL REFERENCES items(id),
    agreed_price numeric(14,2) NOT NULL,
    valid_from date NOT NULL,
    valid_to date NOT NULL,
    approved_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_contracts_lookup ON rate_contracts(supplier_id, item_id, valid_from, valid_to);

-- 5. purchase_requisitions table
CREATE TABLE IF NOT EXISTS purchase_requisitions (
    id uuid PRIMARY KEY,
    req_no varchar(50) NOT NULL UNIQUE,
    item_id uuid NOT NULL REFERENCES items(id),
    qty numeric(14,3) NOT NULL,
    needed_by date NOT NULL,
    source varchar(20) NOT NULL CHECK (source IN ('PRODUCTION', 'SALES_ORDER', 'MANUAL')),
    source_ref_id uuid,
    status varchar(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'PO_CREATED', 'CANCELLED')),
    requested_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_status ON purchase_requisitions(status);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_item ON purchase_requisitions(item_id);
CREATE INDEX IF NOT EXISTS idx_purchase_requisitions_source ON purchase_requisitions(source, source_ref_id);

-- 6. purchase_orders table
CREATE TABLE IF NOT EXISTS purchase_orders (
    id uuid PRIMARY KEY,
    po_no varchar(50) NOT NULL UNIQUE,
    supplier_id uuid NOT NULL REFERENCES suppliers(id),
    receiving_site_id uuid NOT NULL REFERENCES sites(id),
    po_status varchar(30) NOT NULL DEFAULT 'DRAFT' CHECK (po_status IN ('DRAFT', 'PENDING_APPROVAL', 'ISSUED', 'PARTIALLY_RECEIVED', 'CLOSED', 'CANCELLED')),
    total_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    expected_delivery date,
    linked_sales_order_id uuid REFERENCES sales_orders(id),
    parent_po_id uuid REFERENCES purchase_orders(id),
    approved_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_supplier ON purchase_orders(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_site ON purchase_orders(receiving_site_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_status ON purchase_orders(po_status);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_linked_so ON purchase_orders(linked_sales_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_parent ON purchase_orders(parent_po_id);

-- 7. purchase_order_lines table
CREATE TABLE IF NOT EXISTS purchase_order_lines (
    id uuid PRIMARY KEY,
    po_id uuid NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items(id),
    ordered_qty numeric(14,3) NOT NULL,
    confirmed_qty numeric(14,3) NOT NULL,
    received_qty numeric(14,3) NOT NULL DEFAULT 0.000,
    unit_price numeric(14,2) NOT NULL,
    last_purchase_price_snapshot numeric(14,2) NOT NULL,
    price_variance_pct numeric(7,4) NOT NULL DEFAULT 0.0000,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_po ON purchase_order_lines(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_lines_item ON purchase_order_lines(item_id);

-- 8. goods_receipts table (GRN)
CREATE TABLE IF NOT EXISTS goods_receipts (
    id uuid PRIMARY KEY,
    grn_no varchar(50) NOT NULL UNIQUE,
    po_id uuid REFERENCES purchase_orders(id),
    supplier_id uuid NOT NULL REFERENCES suppliers(id),
    site_id uuid NOT NULL REFERENCES sites(id),
    location_id uuid REFERENCES locations(id),
    received_by uuid NOT NULL REFERENCES users(id),
    received_at timestamptz NOT NULL DEFAULT now(),
    gps_lat numeric(9,6),
    gps_lng numeric(9,6),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goods_receipts_po ON goods_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_supplier ON goods_receipts(supplier_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_site ON goods_receipts(site_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipts_received_at ON goods_receipts(received_at DESC);

-- 9. goods_receipt_lines table
CREATE TABLE IF NOT EXISTS goods_receipt_lines (
    id uuid PRIMARY KEY,
    grn_id uuid NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items(id),
    received_qty numeric(14,3) NOT NULL,
    received_qty_secondary numeric(14,3) NOT NULL DEFAULT 0.000,
    batch_lot_no varchar(50),
    mfg_date date,
    expiry_date date,
    condition_note varchar(500),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_grn ON goods_receipt_lines(grn_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_item ON goods_receipt_lines(item_id);
CREATE INDEX IF NOT EXISTS idx_goods_receipt_lines_batch ON goods_receipt_lines(batch_lot_no);

-- 10. po_shortfalls table
CREATE TABLE IF NOT EXISTS po_shortfalls (
    id uuid PRIMARY KEY,
    po_line_id uuid NOT NULL REFERENCES purchase_order_lines(id) ON DELETE CASCADE,
    deficit_qty numeric(14,3) NOT NULL,
    status varchar(30) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'COVERED_BY_BACKUP', 'ALLOCATED', 'WRITTEN_OFF')),
    resolution_po_id uuid REFERENCES purchase_orders(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_po_shortfalls_po_line ON po_shortfalls(po_line_id);
CREATE INDEX IF NOT EXISTS idx_po_shortfalls_status ON po_shortfalls(status);

-- 11. supplier_bills table (Phase 2 placeholder)
CREATE TABLE IF NOT EXISTS supplier_bills (
    id uuid PRIMARY KEY,
    supplier_id uuid NOT NULL REFERENCES suppliers(id),
    bill_no varchar(100) NOT NULL,
    po_id uuid REFERENCES purchase_orders(id),
    amount numeric(14,2) NOT NULL,
    due_date date NOT NULL,
    status varchar(30) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'VERIFIED', 'APPROVED', 'PAID', 'DISPUTED')),
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_supplier_bills_supplier ON supplier_bills(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_po ON supplier_bills(po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bills_status ON supplier_bills(status);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all M2 tables
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_rate_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_shortfalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_bills ENABLE ROW LEVEL SECURITY;

-- suppliers: global for OWNER, site-scoped for others
DROP POLICY IF EXISTS suppliers_rls ON suppliers;
CREATE POLICY suppliers_rls ON suppliers
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR id IN (
            SELECT DISTINCT supplier_id FROM supplier_items
            JOIN items ON items.id = supplier_items.item_id
            WHERE items.id IN (
                SELECT item_id FROM inventory_batches WHERE site_id = ANY(current_setting('app.site_ids', true)::uuid[])
            )
        )
    );

-- supplier_items: inherits from suppliers
DROP POLICY IF EXISTS supplier_items_rls ON supplier_items;
CREATE POLICY supplier_items_rls ON supplier_items
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR supplier_id IN (
            SELECT id FROM suppliers WHERE current_setting('app.role', true) = 'OWNER'
               OR id IN (
                   SELECT DISTINCT supplier_id FROM supplier_items
                   JOIN items ON items.id = supplier_items.item_id
                   WHERE items.id IN (
                       SELECT item_id FROM inventory_batches WHERE site_id = ANY(current_setting('app.site_ids', true)::uuid[])
                   )
               )
        )
    );

-- supplier_rate_quotes: site-scoped via supplier
DROP POLICY IF EXISTS supplier_rate_quotes_rls ON supplier_rate_quotes;
CREATE POLICY supplier_rate_quotes_rls ON supplier_rate_quotes
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR supplier_id IN (
            SELECT id FROM suppliers WHERE current_setting('app.role', true) = 'OWNER'
               OR id IN (
                   SELECT DISTINCT supplier_id FROM supplier_items
                   JOIN items ON items.id = supplier_items.item_id
                   WHERE items.id IN (
                       SELECT item_id FROM inventory_batches WHERE site_id = ANY(current_setting('app.site_ids', true)::uuid[])
                   )
               )
        )
    );

-- rate_contracts: same as supplier_rate_quotes
DROP POLICY IF EXISTS rate_contracts_rls ON rate_contracts;
CREATE POLICY rate_contracts_rls ON rate_contracts
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR supplier_id IN (
            SELECT id FROM suppliers WHERE current_setting('app.role', true) = 'OWNER'
               OR id IN (
                   SELECT DISTINCT supplier_id FROM supplier_items
                   JOIN items ON items.id = supplier_items.item_id
                   WHERE items.id IN (
                       SELECT item_id FROM inventory_batches WHERE site_id = ANY(current_setting('app.site_ids', true)::uuid[])
                   )
               )
        )
    );

-- purchase_requisitions: site-scoped via receiving site (linked through PO eventually)
DROP POLICY IF EXISTS purchase_requisitions_rls ON purchase_requisitions;
CREATE POLICY purchase_requisitions_rls ON purchase_requisitions
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR source_ref_id IN (
            SELECT id FROM production_requisitions WHERE site_id = ANY(current_setting('app.site_ids', true)::uuid[])
        )
        OR source_ref_id IN (
            SELECT id FROM sales_orders WHERE fulfillment_site_id = ANY(current_setting('app.site_ids', true)::uuid[])
        )
    );

-- purchase_orders: site-scoped via receiving_site_id
DROP POLICY IF EXISTS purchase_orders_rls ON purchase_orders;
CREATE POLICY purchase_orders_rls ON purchase_orders
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR receiving_site_id = ANY(current_setting('app.site_ids', true)::uuid[])
    );

-- purchase_order_lines: inherits from purchase_orders
DROP POLICY IF EXISTS purchase_order_lines_rls ON purchase_order_lines;
CREATE POLICY purchase_order_lines_rls ON purchase_order_lines
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR po_id IN (
            SELECT id FROM purchase_orders WHERE receiving_site_id = ANY(current_setting('app.site_ids', true)::uuid[])
        )
    );

-- goods_receipts: site-scoped via site_id
DROP POLICY IF EXISTS goods_receipts_rls ON goods_receipts;
CREATE POLICY goods_receipts_rls ON goods_receipts
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR site_id = ANY(current_setting('app.site_ids', true)::uuid[])
    );

-- goods_receipt_lines: inherits from goods_receipts
DROP POLICY IF EXISTS goods_receipt_lines_rls ON goods_receipt_lines;
CREATE POLICY goods_receipt_lines_rls ON goods_receipt_lines
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR grn_id IN (
            SELECT id FROM goods_receipts WHERE site_id = ANY(current_setting('app.site_ids', true)::uuid[])
        )
    );

-- po_shortfalls: inherits from purchase_order_lines
DROP POLICY IF EXISTS po_shortfalls_rls ON po_shortfalls;
CREATE POLICY po_shortfalls_rls ON po_shortfalls
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR po_line_id IN (
            SELECT id FROM purchase_order_lines WHERE po_id IN (
                SELECT id FROM purchase_orders WHERE receiving_site_id = ANY(current_setting('app.site_ids', true)::uuid[])
            )
        )
    );

-- supplier_bills: site-scoped via PO
DROP POLICY IF EXISTS supplier_bills_rls ON supplier_bills;
CREATE POLICY supplier_bills_rls ON supplier_bills
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR po_id IN (
            SELECT id FROM purchase_orders WHERE receiving_site_id = ANY(current_setting('app.site_ids', true)::uuid[])
        )
    );

-- ============================================================================
-- APPEND-ONLY PROTECTION (Financial/Stock tables)
-- ============================================================================

-- goods_receipts and goods_receipt_lines are append-only (financial/stock impact)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neobus_app') THEN
    REVOKE DELETE, UPDATE ON goods_receipts FROM neobus_app;
    REVOKE DELETE, UPDATE ON goods_receipt_lines FROM neobus_app;
    REVOKE DELETE, UPDATE ON po_shortfalls FROM neobus_app;
  END IF;
END $$;

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER set_updated_at_suppliers
    BEFORE UPDATE ON suppliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_supplier_items
    BEFORE UPDATE ON supplier_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_supplier_rate_quotes
    BEFORE UPDATE ON supplier_rate_quotes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_rate_contracts
    BEFORE UPDATE ON rate_contracts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_purchase_requisitions
    BEFORE UPDATE ON purchase_requisitions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_purchase_orders
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_purchase_order_lines
    BEFORE UPDATE ON purchase_order_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_goods_receipts
    BEFORE UPDATE ON goods_receipts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_goods_receipt_lines
    BEFORE UPDATE ON goods_receipt_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_po_shortfalls
    BEFORE UPDATE ON po_shortfalls
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_supplier_bills
    BEFORE UPDATE ON supplier_bills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP TRIGGER IF EXISTS set_updated_at_supplier_bills ON supplier_bills;
-- DROP TRIGGER IF EXISTS set_updated_at_po_shortfalls ON po_shortfalls;
-- DROP TRIGGER IF EXISTS set_updated_at_goods_receipt_lines ON goods_receipt_lines;
-- DROP TRIGGER IF EXISTS set_updated_at_goods_receipts ON goods_receipts;
-- DROP TRIGGER IF EXISTS set_updated_at_purchase_order_lines ON purchase_order_lines;
-- DROP TRIGGER IF EXISTS set_updated_at_purchase_orders ON purchase_orders;
-- DROP TRIGGER IF EXISTS set_updated_at_purchase_requisitions ON purchase_requisitions;
-- DROP TRIGGER IF EXISTS set_updated_at_rate_contracts ON rate_contracts;
-- DROP TRIGGER IF EXISTS set_updated_at_supplier_rate_quotes ON supplier_rate_quotes;
-- DROP TRIGGER IF EXISTS set_updated_at_supplier_items ON supplier_items;
-- DROP TRIGGER IF EXISTS set_updated_at_suppliers ON suppliers;
--
-- DROP TABLE IF EXISTS supplier_bills CASCADE;
-- DROP TABLE IF EXISTS po_shortfalls CASCADE;
-- DROP TABLE IF EXISTS goods_receipt_lines CASCADE;
-- DROP TABLE IF EXISTS goods_receipts CASCADE;
-- DROP TABLE IF EXISTS purchase_order_lines CASCADE;
-- DROP TABLE IF EXISTS purchase_orders CASCADE;
-- DROP TABLE IF EXISTS purchase_requisitions CASCADE;
-- DROP TABLE IF EXISTS rate_contracts CASCADE;
-- DROP TABLE IF EXISTS supplier_rate_quotes CASCADE;
-- DROP TABLE IF EXISTS supplier_items CASCADE;
-- DROP TABLE IF EXISTS suppliers CASCADE;