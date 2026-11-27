-- Migration: 20261128_036_ops_integrity_3pl_opening_stock.sql
-- Purpose:
--   1. Support Third-Party / External Carrier (3PL) delivery on delivery_trips
--   2. Fix RLS policies on M5, M4, M3 (incl. stock_count_sheets/items) & cashbook_entries
--      to bypass for OWNER and avoid empty ::uuid[] cast errors
--   3. Widen stock_adjustments.variance_pct & cashbook_entries.entry_type
--   4. Restore UPDATE privilege on work_order_materials/outputs for neobus_app
--   5. Seed all RBAC permissions required by controllers for fresh Coolify databases

-- ============================================================
-- 1. 3PL / External Delivery Schema on delivery_trips
-- ============================================================
ALTER TABLE delivery_trips ALTER COLUMN vehicle_id DROP NOT NULL;
ALTER TABLE delivery_trips ALTER COLUMN driver_id DROP NOT NULL;

ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS dispatch_mode TEXT NOT NULL DEFAULT 'OWN_FLEET';
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS transporter_name TEXT;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS external_vehicle_no TEXT;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS external_driver_name TEXT;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS external_driver_phone TEXT;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS lr_tracking_no TEXT;
ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS freight_cost NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Ensure existing rows stay consistent before adding constraint
UPDATE delivery_trips
SET dispatch_mode = 'OWN_FLEET'
WHERE dispatch_mode IS NULL;

ALTER TABLE delivery_trips DROP CONSTRAINT IF EXISTS chk_delivery_trips_dispatch_mode;
ALTER TABLE delivery_trips ADD CONSTRAINT chk_delivery_trips_dispatch_mode
  CHECK (
    (dispatch_mode = 'OWN_FLEET' AND vehicle_id IS NOT NULL AND driver_id IS NOT NULL)
    OR (
      dispatch_mode = 'THIRD_PARTY'
      AND COALESCE(TRIM(transporter_name), '') <> ''
      AND COALESCE(TRIM(external_vehicle_no), '') <> ''
    )
  );

-- Also ensure trip_expenses supports optional notes column
ALTER TABLE trip_expenses ADD COLUMN IF NOT EXISTS notes TEXT;

-- ============================================================
-- 2. Column Width Fixes (prevent numeric overflow & truncation)
-- ============================================================
ALTER TABLE stock_adjustments ALTER COLUMN variance_pct TYPE NUMERIC(10,2);
ALTER TABLE stock_adjustments ALTER COLUMN adjustment_type TYPE VARCHAR(30);
ALTER TABLE cashbook_entries ALTER COLUMN entry_type TYPE VARCHAR(50);

-- ============================================================
-- 3. Restore M4 Production Column Privileges (regression from 018:346)
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neobus_app') THEN
    GRANT UPDATE (planned_qty, actual_qty, uom) ON work_order_materials TO neobus_app;
    GRANT UPDATE (planned_qty, actual_qty, uom) ON work_order_outputs TO neobus_app;
  END IF;
END $$;

-- ============================================================
-- 4. Fix M5 Logistics RLS Policies (OWNER bypass + safe ::TEXT compare)
-- ============================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS site_isolation_delivery_trips ON delivery_trips;
  DROP POLICY IF EXISTS m5_trip_site ON delivery_trips;
  CREATE POLICY m5_trip_site ON delivery_trips
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_delivery_stops ON delivery_stops;
  DROP POLICY IF EXISTS m5_stop_site ON delivery_stops;
  CREATE POLICY m5_stop_site ON delivery_stops
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
      OR trip_id IN (
        SELECT id FROM delivery_trips
        WHERE site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
      )
    );

  DROP POLICY IF EXISTS m5_stop_line_site ON delivery_stop_lines;
  CREATE POLICY m5_stop_line_site ON delivery_stop_lines
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR stop_id IN (SELECT id FROM delivery_stops)
    );

  DROP POLICY IF EXISTS m5_challan_site ON delivery_challans;
  CREATE POLICY m5_challan_site ON delivery_challans
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR trip_id IN (SELECT id FROM delivery_trips)
    );

  DROP POLICY IF EXISTS m5_issue_site ON issue_reports;
  CREATE POLICY m5_issue_site ON issue_reports
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS m5_expense_site ON trip_expenses;
  CREATE POLICY m5_expense_site ON trip_expenses
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );
END $$;

-- ============================================================
-- 5. Fix M3 Inventory & Stock Count RLS Policies
-- ============================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS site_isolation_inventory_batches ON inventory_batches;
  CREATE POLICY site_isolation_inventory_batches ON inventory_batches
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_stock_ledger_txns ON stock_ledger_txns;
  CREATE POLICY site_isolation_stock_ledger_txns ON stock_ledger_txns
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_stock_reservations ON stock_reservations;
  CREATE POLICY site_isolation_stock_reservations ON stock_reservations
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_stock_transfers ON stock_transfers;
  CREATE POLICY site_isolation_stock_transfers ON stock_transfers
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR from_site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
      OR to_site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_stock_transfer_lines ON stock_transfer_lines;
  CREATE POLICY site_isolation_stock_transfer_lines ON stock_transfer_lines
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR transfer_id IN (SELECT id FROM stock_transfers)
    );

  DROP POLICY IF EXISTS site_isolation_stock_adjustments ON stock_adjustments;
  CREATE POLICY site_isolation_stock_adjustments ON stock_adjustments
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_stock_count_sheets ON stock_count_sheets;
  CREATE POLICY site_isolation_stock_count_sheets ON stock_count_sheets
    FOR ALL
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR current_setting('app.current_user_role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
      OR site_id::TEXT = current_setting('app.current_site_id', TRUE)
    );

  DROP POLICY IF EXISTS site_isolation_stock_count_items ON stock_count_items;
  CREATE POLICY site_isolation_stock_count_items ON stock_count_items
    FOR ALL
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR current_setting('app.current_user_role', TRUE) = 'OWNER'
      OR count_sheet_id IN (SELECT id FROM stock_count_sheets)
    );
END $$;

-- ============================================================
-- 6. Fix M4 Production & Cashbook RLS Policies
-- ============================================================
DO $$
BEGIN
  DROP POLICY IF EXISTS rls_bom_headers ON bom_headers;
  CREATE POLICY rls_bom_headers ON bom_headers
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS rls_bom_lines ON bom_lines;
  CREATE POLICY rls_bom_lines ON bom_lines
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR bom_header_id IN (SELECT id FROM bom_headers)
    );

  DROP POLICY IF EXISTS rls_production_requisitions ON production_requisitions;
  CREATE POLICY rls_production_requisitions ON production_requisitions
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS rls_production_requisition_lines ON production_requisition_lines;
  CREATE POLICY rls_production_requisition_lines ON production_requisition_lines
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR requisition_id IN (SELECT id FROM production_requisitions)
    );

  DROP POLICY IF EXISTS rls_production_work_orders ON production_work_orders;
  CREATE POLICY rls_production_work_orders ON production_work_orders
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS rls_work_order_materials ON work_order_materials;
  CREATE POLICY rls_work_order_materials ON work_order_materials
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR work_order_id IN (SELECT id FROM production_work_orders)
    );

  DROP POLICY IF EXISTS rls_work_order_outputs ON work_order_outputs;
  CREATE POLICY rls_work_order_outputs ON work_order_outputs
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR work_order_id IN (SELECT id FROM production_work_orders)
    );

  DROP POLICY IF EXISTS rls_wastage_records ON wastage_records;
  CREATE POLICY rls_wastage_records ON wastage_records
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR work_order_id IN (SELECT id FROM production_work_orders)
    );

  DROP POLICY IF EXISTS rls_labour_attendance_logs ON labour_attendance_logs;
  CREATE POLICY rls_labour_attendance_logs ON labour_attendance_logs
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );

  DROP POLICY IF EXISTS site_isolation_cashbook ON cashbook_entries;
  CREATE POLICY site_isolation_cashbook ON cashbook_entries
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );
END $$;

-- ============================================================
-- 7. Seed All Missing RBAC Permissions for Fresh Deployments
-- ============================================================
INSERT INTO role_permissions (role, permission_code, scope) VALUES
  -- OWNER completeness
  ('OWNER', 'exception.read', 'ALL'),
  ('OWNER', 'orders.read', 'ALL'),
  ('OWNER', 'invoice.read', 'ALL'),
  ('OWNER', 'device.register', 'ALL'),
  ('OWNER', 'po.confirm', 'ALL'),
  ('OWNER', 'po.issue', 'ALL'),
  ('OWNER', 'po.cancel', 'ALL'),
  ('OWNER', 'requisition.create', 'ALL'),
  ('OWNER', 'requisition.update', 'ALL'),
  ('OWNER', 'grn.create', 'ALL'),
  ('OWNER', 'grn.update', 'ALL'),
  ('OWNER', 'supplier.create', 'ALL'),
  ('OWNER', 'supplier.update', 'ALL'),
  ('OWNER', 'supplier.rate.manage', 'ALL'),
  ('OWNER', 'inventory.adjust', 'ALL'),
  ('OWNER', 'inventory.transfer', 'ALL'),
  ('OWNER', 'inventory.reserve', 'ALL'),
  ('OWNER', 'inventory.grn', 'ALL'),
  ('OWNER', 'production.bom.read', 'ALL'),
  ('OWNER', 'production.bom.create', 'ALL'),
  ('OWNER', 'production.bom.update', 'ALL'),
  ('OWNER', 'production.bom.activate', 'ALL'),
  ('OWNER', 'production.bom.delete', 'ALL'),
  ('OWNER', 'production.requisition.read', 'ALL'),
  ('OWNER', 'production.requisition.create', 'ALL'),
  ('OWNER', 'production.requisition.update', 'ALL'),
  ('OWNER', 'production.requisition.approve', 'ALL'),
  ('OWNER', 'production.requisition.cancel', 'ALL'),
  ('OWNER', 'production.requisition.convert', 'ALL'),
  ('OWNER', 'production.requisition.delete', 'ALL'),
  ('OWNER', 'production.requisition.generate', 'ALL'),
  ('OWNER', 'production.workorder.read', 'ALL'),
  ('OWNER', 'production.workorder.create', 'ALL'),
  ('OWNER', 'production.workorder.start', 'ALL'),
  ('OWNER', 'production.workorder.consume', 'ALL'),
  ('OWNER', 'production.workorder.output', 'ALL'),
  ('OWNER', 'production.workorder.complete', 'ALL'),
  ('OWNER', 'production.workorder.cancel', 'ALL'),
  ('OWNER', 'production.wastage.read', 'ALL'),
  ('OWNER', 'production.wastage.create', 'ALL'),
  ('OWNER', 'production.wastage.update', 'ALL'),
  ('OWNER', 'production.attendance.read', 'ALL'),
  ('OWNER', 'production.attendance.create', 'ALL'),

  -- OPS_COORD permissions
  ('OPS_COORD', 'exception.read', 'SITE'),
  ('OPS_COORD', 'orders.read', 'SITE'),
  ('OPS_COORD', 'invoice.read', 'SITE'),
  ('OPS_COORD', 'device.register', 'OWN'),
  ('OPS_COORD', 'supplier.create', 'SITE'),
  ('OPS_COORD', 'supplier.update', 'SITE'),
  ('OPS_COORD', 'supplier.rate.manage', 'SITE'),
  ('OPS_COORD', 'po.confirm', 'SITE'),
  ('OPS_COORD', 'po.issue', 'SITE'),
  ('OPS_COORD', 'po.cancel', 'SITE'),
  ('OPS_COORD', 'requisition.create', 'SITE'),
  ('OPS_COORD', 'requisition.update', 'SITE'),
  ('OPS_COORD', 'grn.create', 'SITE'),
  ('OPS_COORD', 'grn.update', 'SITE'),
  ('OPS_COORD', 'inventory.adjust', 'SITE'),
  ('OPS_COORD', 'inventory.transfer', 'SITE'),
  ('OPS_COORD', 'inventory.reserve', 'SITE'),
  ('OPS_COORD', 'inventory.grn', 'SITE'),
  ('OPS_COORD', 'production.bom.read', 'SITE'),
  ('OPS_COORD', 'production.bom.create', 'SITE'),
  ('OPS_COORD', 'production.bom.update', 'SITE'),
  ('OPS_COORD', 'production.bom.activate', 'SITE'),
  ('OPS_COORD', 'production.requisition.read', 'SITE'),
  ('OPS_COORD', 'production.requisition.create', 'SITE'),
  ('OPS_COORD', 'production.requisition.update', 'SITE'),
  ('OPS_COORD', 'production.requisition.approve', 'SITE'),
  ('OPS_COORD', 'production.requisition.cancel', 'SITE'),
  ('OPS_COORD', 'production.requisition.convert', 'SITE'),
  ('OPS_COORD', 'production.requisition.generate', 'SITE'),
  ('OPS_COORD', 'production.workorder.read', 'SITE'),
  ('OPS_COORD', 'production.workorder.create', 'SITE'),
  ('OPS_COORD', 'production.workorder.start', 'SITE'),
  ('OPS_COORD', 'production.workorder.consume', 'SITE'),
  ('OPS_COORD', 'production.workorder.output', 'SITE'),
  ('OPS_COORD', 'production.workorder.complete', 'SITE'),
  ('OPS_COORD', 'production.workorder.cancel', 'SITE'),
  ('OPS_COORD', 'production.wastage.read', 'SITE'),
  ('OPS_COORD', 'production.wastage.create', 'SITE'),
  ('OPS_COORD', 'production.attendance.read', 'SITE'),
  ('OPS_COORD', 'production.attendance.create', 'SITE'),
  ('OPS_COORD', 'fleet.deliver', 'SITE'),
  ('OPS_COORD', 'fleet.close', 'SITE'),

  -- PROD_MGR permissions
  ('PROD_MGR', 'production.bom.read', 'SITE'),
  ('PROD_MGR', 'production.bom.create', 'SITE'),
  ('PROD_MGR', 'production.bom.update', 'SITE'),
  ('PROD_MGR', 'production.bom.activate', 'SITE'),
  ('PROD_MGR', 'production.workorder.read', 'SITE'),
  ('PROD_MGR', 'production.workorder.create', 'SITE'),
  ('PROD_MGR', 'production.workorder.start', 'SITE'),
  ('PROD_MGR', 'production.workorder.consume', 'SITE'),
  ('PROD_MGR', 'production.workorder.output', 'SITE'),
  ('PROD_MGR', 'production.workorder.complete', 'SITE'),
  ('PROD_MGR', 'production.workorder.cancel', 'SITE'),
  ('PROD_MGR', 'production.requisition.read', 'SITE'),
  ('PROD_MGR', 'production.requisition.create', 'SITE'),
  ('PROD_MGR', 'production.requisition.update', 'SITE'),
  ('PROD_MGR', 'production.requisition.approve', 'SITE'),
  ('PROD_MGR', 'production.requisition.cancel', 'SITE'),
  ('PROD_MGR', 'production.requisition.convert', 'SITE'),
  ('PROD_MGR', 'production.requisition.generate', 'SITE'),
  ('PROD_MGR', 'production.wastage.read', 'SITE'),
  ('PROD_MGR', 'production.wastage.create', 'SITE'),
  ('PROD_MGR', 'production.wastage.update', 'SITE'),
  ('PROD_MGR', 'production.attendance.read', 'SITE'),
  ('PROD_MGR', 'production.attendance.create', 'SITE'),
  ('PROD_MGR', 'inventory.read', 'SITE'),
  ('PROD_MGR', 'inventory.reserve', 'SITE'),
  ('PROD_MGR', 'item.view', 'ALL'),
  ('PROD_MGR', 'device.register', 'OWN'),

  -- STOREKEEPER permissions
  ('STOREKEEPER', 'inventory.read', 'SITE'),
  ('STOREKEEPER', 'inventory.adjust', 'SITE'),
  ('STOREKEEPER', 'inventory.transfer', 'SITE'),
  ('STOREKEEPER', 'inventory.reserve', 'SITE'),
  ('STOREKEEPER', 'inventory.grn', 'SITE'),
  ('STOREKEEPER', 'grn.read', 'SITE'),
  ('STOREKEEPER', 'grn.create', 'SITE'),
  ('STOREKEEPER', 'grn.update', 'SITE'),
  ('STOREKEEPER', 'po.read', 'SITE'),
  ('STOREKEEPER', 'supplier.read', 'ALL'),
  ('STOREKEEPER', 'item.view', 'ALL'),
  ('STOREKEEPER', 'fleet.read', 'SITE'),
  ('STOREKEEPER', 'fleet.dispatch', 'SITE'),
  ('STOREKEEPER', 'device.register', 'OWN'),

  -- DRIVER & COLLECTOR permissions
  ('DRIVER', 'fleet.read', 'OWN'),
  ('DRIVER', 'fleet.read_own', 'OWN'),
  ('DRIVER', 'fleet.deliver', 'OWN'),
  ('DRIVER', 'collection.log', 'SITE'),
  ('DRIVER', 'invoice.read', 'SITE'),
  ('DRIVER', 'device.register', 'OWN'),
  ('COLLECTOR', 'collection.log', 'SITE'),
  ('COLLECTOR', 'finance.view', 'SITE'),
  ('COLLECTOR', 'invoice.read', 'SITE'),
  ('COLLECTOR', 'customer.view', 'SITE'),
  ('COLLECTOR', 'device.register', 'OWN')
ON CONFLICT (role, permission_code) DO NOTHING;
