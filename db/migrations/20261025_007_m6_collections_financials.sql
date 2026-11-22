-- Migration 007: M6 Collections & Financials
-- Sprint 1 Core: Invoices, Receipts, Ledgers, Handovers, PTP

-- 1. Invoices
CREATE TABLE IF NOT EXISTS invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    customer_id uuid NOT NULL REFERENCES customers(id),
    sales_order_id uuid REFERENCES sales_orders(id),
    invoice_no varchar(50) NOT NULL UNIQUE,
    invoice_date date NOT NULL DEFAULT CURRENT_DATE,
    due_date date NOT NULL,
    total_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    paid_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    balance_due numeric(14,2) NOT NULL DEFAULT 0.00,
    taxable_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    cgst numeric(14,2) NOT NULL DEFAULT 0.00,
    sgst numeric(14,2) NOT NULL DEFAULT 0.00,
    igst numeric(14,2) NOT NULL DEFAULT 0.00,
    status varchar(20) NOT NULL DEFAULT 'UNPAID',
    is_cod boolean NOT NULL DEFAULT false,
    place_of_supply_state_code varchar(5),
    irn varchar(100),
    pdf_attachment_id uuid REFERENCES attachments(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES users(id),
    updated_by uuid REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS invoice_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items(id),
    qty numeric(14,3) NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    line_total numeric(14,2) NOT NULL,
    hsn_code varchar(20),
    tax_rate_pct numeric(5,2) NOT NULL DEFAULT 0.00,
    tax_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    tax_treatment varchar(20) NOT NULL DEFAULT 'TAXABLE',
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Collection Receipts (Immutable)
CREATE TABLE IF NOT EXISTS collection_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    customer_id uuid NOT NULL REFERENCES customers(id),
    receipt_no varchar(50) NOT NULL UNIQUE,
    provisional_receipt_no varchar(50),
    amount numeric(14,2) NOT NULL,
    on_account_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    payment_mode varchar(20) NOT NULL,
    reference_no varchar(100),
    collected_at timestamptz NOT NULL DEFAULT now(),
    collected_by_user_id uuid NOT NULL REFERENCES users(id),
    gps_lat_lng point,
    device_id varchar(100),
    idempotency_key varchar(100) UNIQUE,
    reverses_receipt_id uuid REFERENCES collection_receipts(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Receipt Allocations
CREATE TABLE IF NOT EXISTS receipt_allocations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL REFERENCES collection_receipts(id),
    invoice_id uuid NOT NULL REFERENCES invoices(id),
    allocated_amount numeric(14,2) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Customer Ledger Entries (Append-only)
CREATE TABLE IF NOT EXISTS customer_ledger_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    customer_id uuid NOT NULL REFERENCES customers(id),
    entry_type varchar(20) NOT NULL,
    debit numeric(14,2) NOT NULL DEFAULT 0.00,
    credit numeric(14,2) NOT NULL DEFAULT 0.00,
    ref_id uuid NOT NULL,
    ref_no varchar(50),
    posted_at timestamptz NOT NULL DEFAULT now(),
    running_balance numeric(14,2) NOT NULL DEFAULT 0.00,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Custody Ledger (Virtual wallet, BR-07)
CREATE TABLE IF NOT EXISTS custody_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id),
    site_id uuid NOT NULL REFERENCES sites(id),
    entry_type varchar(20) NOT NULL,
    amount_delta numeric(14,2) NOT NULL,
    receipt_id uuid REFERENCES collection_receipts(id),
    handover_id uuid,
    running_balance numeric(14,2) NOT NULL DEFAULT 0.00,
    posted_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Cash Handovers
CREATE TABLE IF NOT EXISTS cash_handovers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    handed_by_user_id uuid NOT NULL REFERENCES users(id),
    received_by_user_id uuid REFERENCES users(id),
    expected_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    counted_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    variance numeric(14,2) NOT NULL DEFAULT 0.00,
    cheque_count integer NOT NULL DEFAULT 0,
    upi_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    status varchar(20) NOT NULL DEFAULT 'PENDING',
    notes text,
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Cheque Register
CREATE TABLE IF NOT EXISTS cheque_register (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id uuid NOT NULL REFERENCES collection_receipts(id),
    cheque_no varchar(50) NOT NULL,
    bank varchar(100) NOT NULL,
    cheque_date date NOT NULL,
    amount numeric(14,2) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'RECEIVED',
    deposited_on date,
    bounce_reason text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 8. PTP (Promise to Pay) Follow-ups
CREATE TABLE IF NOT EXISTS ptp_followups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    customer_id uuid NOT NULL REFERENCES customers(id),
    invoice_id uuid REFERENCES invoices(id),
    promised_date date NOT NULL,
    reason_code varchar(20),
    note text,
    logged_by_user_id uuid NOT NULL REFERENCES users(id),
    status varchar(20) NOT NULL DEFAULT 'OPEN',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 9. EOD Closings
CREATE TABLE IF NOT EXISTS eod_closings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    date date NOT NULL,
    initiated_at timestamptz NOT NULL DEFAULT now(),
    all_trips_closed boolean NOT NULL DEFAULT false,
    all_cash_handed_over boolean NOT NULL DEFAULT false,
    uninvoiced_deliveries integer NOT NULL DEFAULT 0,
    net_cash_position numeric(14,2) NOT NULL DEFAULT 0.00,
    deposit_slip_id uuid REFERENCES attachments(id),
    signed_off_by_user_id uuid REFERENCES users(id),
    signed_off_at timestamptz,
    status varchar(20) NOT NULL DEFAULT 'OPEN',
    UNIQUE(site_id, date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger_entries(customer_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_custody_ledger_user ON custody_ledger(user_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_collection_receipts_customer ON collection_receipts(customer_id);
CREATE INDEX IF NOT EXISTS idx_collection_receipts_collected_by ON collection_receipts(collected_by_user_id);

-- RLS Enablement
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE collection_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE custody_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheque_register ENABLE ROW LEVEL SECURITY;
ALTER TABLE ptp_followups ENABLE ROW LEVEL SECURITY;
ALTER TABLE eod_closings ENABLE ROW LEVEL SECURITY;

-- Apply multi-site RLS policies (using same pattern as M0/M1)
CREATE POLICY site_isolation_invoices ON invoices USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
CREATE POLICY site_isolation_invoice_lines ON invoice_lines USING (invoice_id IN (SELECT id FROM invoices));
CREATE POLICY site_isolation_collection_receipts ON collection_receipts USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
CREATE POLICY site_isolation_receipt_allocations ON receipt_allocations USING (receipt_id IN (SELECT id FROM collection_receipts));
CREATE POLICY site_isolation_customer_ledger ON customer_ledger_entries USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
CREATE POLICY site_isolation_custody_ledger ON custody_ledger USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
CREATE POLICY site_isolation_cash_handovers ON cash_handovers USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
CREATE POLICY site_isolation_cheque_register ON cheque_register USING (receipt_id IN (SELECT id FROM collection_receipts));
CREATE POLICY site_isolation_ptp_followups ON ptp_followups USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
CREATE POLICY site_isolation_eod_closings ON eod_closings USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));

-- Force RLS for app user
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE collection_receipts FORCE ROW LEVEL SECURITY;
ALTER TABLE receipt_allocations FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_ledger_entries FORCE ROW LEVEL SECURITY;
ALTER TABLE custody_ledger FORCE ROW LEVEL SECURITY;
ALTER TABLE cash_handovers FORCE ROW LEVEL SECURITY;
ALTER TABLE cheque_register FORCE ROW LEVEL SECURITY;
ALTER TABLE ptp_followups FORCE ROW LEVEL SECURITY;
ALTER TABLE eod_closings FORCE ROW LEVEL SECURITY;

-- Append-only trigger revokes (M6 §3 G3)
-- Deny UPDATE/DELETE on immutable tables for neobus_app role
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neobus_app') THEN
        REVOKE UPDATE, DELETE ON collection_receipts FROM neobus_app;
        REVOKE UPDATE, DELETE ON customer_ledger_entries FROM neobus_app;
        REVOKE UPDATE, DELETE ON custody_ledger FROM neobus_app;
    END IF;
END $$;
ALTER TABLE ptp_followups ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);
