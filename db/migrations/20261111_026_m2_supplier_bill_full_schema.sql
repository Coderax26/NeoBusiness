-- Migration: M2 Supplier Bill Full Schema and Tax Invoices Table
-- Enhances supplier_bills table with full schema for 3-way matching and tax invoice generation
-- Creates tax_invoices table for supplier bill tax invoices
-- Depends on: 20261107_021_m2_procurement_baseline.sql (supplier_bills base table exists)
--
-- This migration adds the missing columns for:
-- - Site isolation (site_id)
-- - Tax splitting (subtotal, tax_total, cgst, sgst, igst)
-- - Status machine (status, three_way_status)
-- - Approval workflow (approved_by, approved_at, approval_reason, rejection_reason)
-- - Tax invoice linkage (tax_invoice_id)
--
-- Also creates the tax_invoices table for supplier bill tax invoices

-- ============================================================================
-- CREATE tax_invoices TABLE (for supplier bill tax invoices)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_invoices (
    id uuid PRIMARY KEY,
    invoice_type varchar(50) NOT NULL CHECK (invoice_type IN ('SUPPLIER_BILL', 'CUSTOMER', 'DEBIT', 'CREDIT')),
    bill_id uuid REFERENCES supplier_bills(id),
    customer_id uuid NOT NULL REFERENCES suppliers(id),
    site_id uuid NOT NULL REFERENCES sites(id),
    invoice_no varchar(100) NOT NULL,
    invoice_date timestamptz NOT NULL,
    due_date timestamptz NOT NULL,
    total_amount numeric(14,2) NOT NULL,
    subtotal numeric(14,2) NOT NULL,
    tax_total numeric(14,2) NOT NULL DEFAULT 0.00,
    cgst numeric(14,2) NOT NULL DEFAULT 0.00,
    sgst numeric(14,2) NOT NULL DEFAULT 0.00,
    igst numeric(14,2) NOT NULL DEFAULT 0.00,
    status varchar(30) NOT NULL DEFAULT 'GENERATED' CHECK (status IN ('GENERATED', 'ISSUED', 'PAID', 'CANCELLED')),
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_invoices_site ON tax_invoices(site_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_customer ON tax_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_status ON tax_invoices(status);
CREATE INDEX IF NOT EXISTS idx_tax_invoices_bill ON tax_invoices(bill_id);

-- ============================================================================
-- ADD MISSING COLUMNS TO supplier_bills
-- ============================================================================

-- Add site_id for RLS scoping (references sites table)
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES sites(id);

-- Add bill_number column if not exists
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS bill_number varchar(100);

-- Add currency column
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS currency varchar(10) DEFAULT 'INR';

-- Add bill_date column
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS bill_date timestamptz;

-- Add due_date column
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS due_date timestamptz;

-- Add tax-related columns
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS subtotal numeric(14,2) DEFAULT 0.00;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS tax_total numeric(14,2) DEFAULT 0.00;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS cgst numeric(14,2) DEFAULT 0.00;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS sgst numeric(14,2) DEFAULT 0.00;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS igst numeric(14,2) DEFAULT 0.00;

-- Add status and three_way_status columns
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS status varchar(30) DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'VERIFIED', 'APPROVED', 'PAID', 'DISPUTED'));
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS three_way_status varchar(30) DEFAULT 'MATCHED' CHECK (three_way_status IN ('MATCHED', 'TIMING_MISMATCH', 'AMOUNT_MISMATCH', 'FULL_MISMATCH'));

-- Add approval columns
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS rejection_reason text;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS approval_reason text;
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES users(id);
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Add tax invoice linkage
ALTER TABLE supplier_bills ADD COLUMN IF NOT EXISTS tax_invoice_id uuid REFERENCES tax_invoices(id);

-- ============================================================================
-- UPDATE RLS POLICIES
-- ============================================================================

-- Enable RLS on supplier_bills if not already enabled
ALTER TABLE supplier_bills ENABLE ROW LEVEL SECURITY;

-- Update RLS policy for site-level isolation
DROP POLICY IF EXISTS supplier_bills_rls ON supplier_bills;
CREATE POLICY supplier_bills_rls ON supplier_bills
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR site_id = ANY(current_setting('app.site_ids', true)::uuid[])
    );

-- Enable RLS on tax_invoices
ALTER TABLE tax_invoices ENABLE ROW LEVEL SECURITY;

-- RLS policy for tax_invoices
DROP POLICY IF EXISTS tax_invoices_rls ON tax_invoices;
CREATE POLICY tax_invoices_rls ON tax_invoices
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR site_id = ANY(current_setting('app.site_ids', true)::uuid[])
    );

-- ============================================================================
-- CREATE supplier_bill_items TABLE (if not exists from migration 025)
-- ============================================================================

CREATE TABLE IF NOT EXISTS supplier_bill_items (
    id uuid PRIMARY KEY,
    bill_id uuid NOT NULL REFERENCES supplier_bills(id) ON DELETE CASCADE,
    batch_id uuid NOT NULL REFERENCES inventory_batches(id),
    item_id uuid NOT NULL REFERENCES items(id),
    quantity numeric(14,3) NOT NULL,
    rate_per_unit numeric(14,2) NOT NULL,
    tax_amount numeric(14,2) NOT NULL DEFAULT 0.00,
    line_total numeric(14,2) NOT NULL,
    tax_treatment varchar(20) NOT NULL DEFAULT 'TAXABLE' CHECK (tax_treatment IN ('TAXABLE', 'EXEMPT', 'NIL_RATED', 'NON_GST')),
    tax_rate varchar(10) NOT NULL DEFAULT '0',
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid NOT NULL
);

-- Indexes for supplier_bill_items
CREATE INDEX IF NOT EXISTS idx_supplier_bill_items_bill ON supplier_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bill_items_item ON supplier_bill_items(item_id);
CREATE INDEX IF NOT EXISTS idx_supplier_bill_items_batch ON supplier_bill_items(batch_id);

-- Enable RLS on supplier_bill_items
ALTER TABLE supplier_bill_items ENABLE ROW LEVEL SECURITY;

-- RLS policy for supplier_bill_items
DROP POLICY IF EXISTS supplier_bill_items_rls ON supplier_bill_items;
CREATE POLICY supplier_bill_items_rls ON supplier_bill_items
    USING (
        current_setting('app.role', true) = 'OWNER'
        OR bill_id IN (
            SELECT id FROM supplier_bills WHERE site_id = ANY(current_setting('app.site_ids', true)::uuid[])
        )
    );

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

-- Drop existing triggers if they exist to avoid conflicts
DROP TRIGGER IF EXISTS set_updated_at_supplier_bills ON supplier_bills;
DROP TRIGGER IF EXISTS set_updated_at_supplier_bill_items ON supplier_bill_items;
DROP TRIGGER IF EXISTS set_updated_at_tax_invoices ON tax_invoices;

CREATE TRIGGER set_updated_at_supplier_bills
    BEFORE UPDATE ON supplier_bills
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_supplier_bill_items
    BEFORE UPDATE ON supplier_bill_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER set_updated_at_tax_invoices
    BEFORE UPDATE ON tax_invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- DATA MIGRATION: Populate site_id from linked PO
-- ============================================================================

UPDATE supplier_bills
SET site_id = (
    SELECT receiving_site_id
    FROM purchase_orders
    WHERE purchase_orders.id = supplier_bills.po_id
)
WHERE site_id IS NULL AND po_id IS NOT NULL;

-- ============================================================================
-- DOWN MIGRATION
-- ============================================================================

-- DROP TRIGGER set_updated_at_tax_invoices ON tax_invoices;
-- DROP TRIGGER set_updated_at_supplier_bill_items ON supplier_bill_items;
-- DROP TRIGGER set_updated_at_supplier_bills ON supplier_bills;
-- ALTER TABLE supplier_bill_items DROP COLUMN IF EXISTS updated_by;
-- ALTER TABLE supplier_bill_items DROP COLUMN IF EXISTS updated_at;
-- ALTER TABLE supplier_bill_items DROP COLUMN IF EXISTS tax_rate;
-- ALTER TABLE supplier_bill_items DROP COLUMN IF EXISTS tax_treatment;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS tax_invoice_id;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS approval_reason;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS approved_by;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS approved_at;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS three_way_status;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS status;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS subtotal;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS tax_total;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS cgst;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS sgst;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS igst;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS due_date;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS tax_invoice_id;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS site_id;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS bill_date;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS currency;
-- ALTER TABLE supplier_bills DROP COLUMN IF EXISTS bill_number;
-- DROP TABLE IF EXISTS supplier_bill_items CASCADE;
-- DROP TABLE IF EXISTS tax_invoices;