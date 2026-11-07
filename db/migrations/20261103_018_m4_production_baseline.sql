-- Migration: 20261103_018_m4_production_baseline.sql
-- M4 Factory Production baseline schema
-- Creates BOM, Requisitions, Work Orders, Consumption, Output, Wastage, Attendance tables

-- ============================================================
-- BOM Headers (versioned)
-- ============================================================
CREATE TABLE IF NOT EXISTS bom_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_no VARCHAR(50) NOT NULL,
  item_id UUID NOT NULL REFERENCES items(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  version INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'OBSOLETE')),
  effective_from DATE,
  effective_to DATE,
  yield_pct NUMERIC(5,2) NOT NULL DEFAULT '95.00'
    CHECK (yield_pct > 0 AND yield_pct <= 100),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique: one ACTIVE BOM per item per site
CREATE UNIQUE INDEX IF NOT EXISTS uq_bom_active_per_item_site
  ON bom_headers (item_id, site_id)
  WHERE status = 'ACTIVE';

-- Unique BOM number per site
CREATE UNIQUE INDEX IF NOT EXISTS uq_bom_no_site
  ON bom_headers (bom_no, site_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bom_headers_item_id ON bom_headers (item_id);
CREATE INDEX IF NOT EXISTS idx_bom_headers_site_id ON bom_headers (site_id);
CREATE INDEX IF NOT EXISTS idx_bom_headers_status ON bom_headers (status);

-- ============================================================
-- BOM Lines (input materials)
-- ============================================================
CREATE TABLE IF NOT EXISTS bom_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id UUID NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  qty_per_unit NUMERIC(14,3) NOT NULL
    CHECK (qty_per_unit > 0),
  uom VARCHAR(20) NOT NULL,
  sequence_no INTEGER NOT NULL DEFAULT 1,
  is_critical BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bom_lines_bom_header_id ON bom_lines (bom_header_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_item_id ON bom_lines (item_id);

-- ============================================================
-- Production Requisitions (planned net requirements)
-- ============================================================
CREATE TABLE IF NOT EXISTS production_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  req_no VARCHAR(50) NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id),
  requested_by UUID NOT NULL REFERENCES users(id),
  required_by_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'PENDING', 'APPROVED', 'CONVERTED', 'CANCELLED')),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique requisition number per site
CREATE UNIQUE INDEX IF NOT EXISTS uq_req_no_site
  ON production_requisitions (req_no, site_id);

CREATE INDEX IF NOT EXISTS idx_production_requisitions_site_id ON production_requisitions (site_id);
CREATE INDEX IF NOT EXISTS idx_production_requisitions_status ON production_requisitions (status);
CREATE INDEX IF NOT EXISTS idx_production_requisitions_required_by ON production_requisitions (required_by_date);

-- ============================================================
-- Production Requisition Lines
-- ============================================================
CREATE TABLE IF NOT EXISTS production_requisition_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id UUID NOT NULL REFERENCES production_requisitions(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  required_qty NUMERIC(14,3) NOT NULL
    CHECK (required_qty > 0),
  uom VARCHAR(20) NOT NULL,
  bom_header_id UUID REFERENCES bom_headers(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_production_requisition_lines_req_id ON production_requisition_lines (requisition_id);
CREATE INDEX IF NOT EXISTS idx_production_requisition_lines_item_id ON production_requisition_lines (item_id);

-- ============================================================
-- Production Work Orders (state machine)
-- ============================================================
CREATE TABLE IF NOT EXISTS production_work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_no VARCHAR(50) NOT NULL,
  site_id UUID NOT NULL REFERENCES sites(id),
  bom_header_id UUID NOT NULL REFERENCES bom_headers(id),
  planned_qty NUMERIC(14,3) NOT NULL
    CHECK (planned_qty > 0),
  uom VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  started_by UUID REFERENCES users(id),
  completed_by UUID REFERENCES users(id),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique work order number per site
CREATE UNIQUE INDEX IF NOT EXISTS uq_wo_no_site
  ON production_work_orders (wo_no, site_id);

CREATE INDEX IF NOT EXISTS idx_production_work_orders_site_id ON production_work_orders (site_id);
CREATE INDEX IF NOT EXISTS idx_production_work_orders_bom_header_id ON production_work_orders (bom_header_id);
CREATE INDEX IF NOT EXISTS idx_production_work_orders_status ON production_work_orders (status);

-- ============================================================
-- Work Order Materials (consumed)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_order_materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  batch_id UUID REFERENCES inventory_batches(id),
  planned_qty NUMERIC(14,3) NOT NULL
    CHECK (planned_qty >= 0),
  actual_qty NUMERIC(14,3) NOT NULL DEFAULT '0'
    CHECK (actual_qty >= 0),
  uom VARCHAR(20) NOT NULL,
  variance_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN planned_qty = 0 THEN 0
      ELSE ROUND(((actual_qty - planned_qty) / planned_qty) * 100, 2)
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_materials_wo_id ON work_order_materials (work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_materials_item_id ON work_order_materials (item_id);
CREATE INDEX IF NOT EXISTS idx_wo_materials_batch_id ON work_order_materials (batch_id);

-- ============================================================
-- Work Order Outputs (produced)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_order_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  batch_id UUID REFERENCES inventory_batches(id),
  planned_qty NUMERIC(14,3) NOT NULL
    CHECK (planned_qty >= 0),
  actual_qty NUMERIC(14,3) NOT NULL DEFAULT '0'
    CHECK (actual_qty >= 0),
  uom VARCHAR(20) NOT NULL,
  yield_pct NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE
      WHEN planned_qty = 0 THEN 0
      ELSE ROUND((actual_qty / planned_qty) * 100, 2)
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_outputs_wo_id ON work_order_outputs (work_order_id);
CREATE INDEX IF NOT EXISTS idx_wo_outputs_item_id ON work_order_outputs (item_id);
CREATE INDEX IF NOT EXISTS idx_wo_outputs_batch_id ON work_order_outputs (batch_id);

-- ============================================================
-- Wastage Records
-- ============================================================
CREATE TABLE IF NOT EXISTS wastage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id UUID NOT NULL REFERENCES production_work_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id),
  batch_id UUID REFERENCES inventory_batches(id),
  qty NUMERIC(14,3) NOT NULL
    CHECK (qty > 0),
  uom VARCHAR(20) NOT NULL,
  reason_type VARCHAR(20) NOT NULL
    CHECK (reason_type IN ('NORMAL', 'ABNORMAL', 'EXPIRY', 'DAMAGE')),
  status VARCHAR(20) NOT NULL DEFAULT 'RECORDED'
    CHECK (status IN ('RECORDED', 'APPROVED', 'WRITTEN_OFF')),
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wastage_wo_id ON wastage_records (work_order_id);
CREATE INDEX IF NOT EXISTS idx_wastage_item_id ON wastage_records (item_id);
CREATE INDEX IF NOT EXISTS idx_wastage_status ON wastage_records (status);

-- ============================================================
-- Labour Attendance Logs
-- ============================================================
CREATE TABLE IF NOT EXISTS labour_attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  worker_id UUID NOT NULL REFERENCES users(id),
  work_order_id UUID REFERENCES production_work_orders(id),
  date DATE NOT NULL,
  shift VARCHAR(20) NOT NULL
    CHECK (shift IN ('MORNING', 'AFTERNOON', 'NIGHT', 'GENERAL')),
  hours_worked NUMERIC(4,2) NOT NULL
    CHECK (hours_worked >= 0 AND hours_worked <= 24),
  overtime_hours NUMERIC(4,2) NOT NULL DEFAULT '0'
    CHECK (overtime_hours >= 0),
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attendance_site_id ON labour_attendance_logs (site_id);
CREATE INDEX IF NOT EXISTS idx_attendance_worker_id ON labour_attendance_logs (worker_id);
CREATE INDEX IF NOT EXISTS idx_attendance_wo_id ON labour_attendance_logs (work_order_id);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON labour_attendance_logs (date);

-- ============================================================
-- RLS Policies
-- ============================================================

-- bom_headers: site-scoped via site_id
ALTER TABLE bom_headers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_bom_headers ON bom_headers;
CREATE POLICY rls_bom_headers ON bom_headers
  USING (
    current_setting('app.role') = 'OWNER'
    OR site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
  );

-- bom_lines: inherit from bom_headers via FK
ALTER TABLE bom_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_bom_lines ON bom_lines;
CREATE POLICY rls_bom_lines ON bom_lines
  USING (
    current_setting('app.role') = 'OWNER'
    OR bom_header_id IN (
      SELECT id FROM bom_headers
      WHERE site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
    )
  );

-- production_requisitions: site-scoped
ALTER TABLE production_requisitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_production_requisitions ON production_requisitions;
CREATE POLICY rls_production_requisitions ON production_requisitions
  USING (
    current_setting('app.role') = 'OWNER'
    OR site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
  );

-- production_requisition_lines: inherit from requisitions
ALTER TABLE production_requisition_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_production_requisition_lines ON production_requisition_lines;
CREATE POLICY rls_production_requisition_lines ON production_requisition_lines
  USING (
    current_setting('app.role') = 'OWNER'
    OR requisition_id IN (
      SELECT id FROM production_requisitions
      WHERE site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
    )
  );

-- production_work_orders: site-scoped
ALTER TABLE production_work_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_production_work_orders ON production_work_orders;
CREATE POLICY rls_production_work_orders ON production_work_orders
  USING (
    current_setting('app.role') = 'OWNER'
    OR site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
  );

-- work_order_materials: inherit from work_orders
ALTER TABLE work_order_materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_work_order_materials ON work_order_materials;
CREATE POLICY rls_work_order_materials ON work_order_materials
  USING (
    current_setting('app.role') = 'OWNER'
    OR work_order_id IN (
      SELECT id FROM production_work_orders
      WHERE site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
    )
  );

-- work_order_outputs: inherit from work_orders
ALTER TABLE work_order_outputs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_work_order_outputs ON work_order_outputs;
CREATE POLICY rls_work_order_outputs ON work_order_outputs
  USING (
    current_setting('app.role') = 'OWNER'
    OR work_order_id IN (
      SELECT id FROM production_work_orders
      WHERE site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
    )
  );

-- wastage_records: inherit from work_orders
ALTER TABLE wastage_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_wastage_records ON wastage_records;
CREATE POLICY rls_wastage_records ON wastage_records
  USING (
    current_setting('app.role') = 'OWNER'
    OR work_order_id IN (
      SELECT id FROM production_work_orders
      WHERE site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
    )
  );

-- labour_attendance_logs: site-scoped
ALTER TABLE labour_attendance_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_labour_attendance_logs ON labour_attendance_logs;
CREATE POLICY rls_labour_attendance_logs ON labour_attendance_logs
  USING (
    current_setting('app.role') = 'OWNER'
    OR site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
  );

-- ============================================================
-- Append-Only Protection (no DELETE on financial/stock tables)
-- ============================================================
REVOKE DELETE ON work_order_materials FROM neobus_app;
REVOKE DELETE ON work_order_outputs FROM neobus_app;
REVOKE DELETE ON wastage_records FROM neobus_app;
REVOKE UPDATE (planned_qty, actual_qty, uom) ON work_order_materials FROM neobus_app;
REVOKE UPDATE (planned_qty, actual_qty, uom) ON work_order_outputs FROM neobus_app;

-- ============================================================
-- Updated_At Triggers
-- ============================================================
DROP TRIGGER IF EXISTS trg_bom_headers_updated_at ON bom_headers;
CREATE TRIGGER trg_bom_headers_updated_at
  BEFORE UPDATE ON bom_headers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_bom_lines_updated_at ON bom_lines;
CREATE TRIGGER trg_bom_lines_updated_at
  BEFORE UPDATE ON bom_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_production_requisitions_updated_at ON production_requisitions;
CREATE TRIGGER trg_production_requisitions_updated_at
  BEFORE UPDATE ON production_requisitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_production_requisition_lines_updated_at ON production_requisition_lines;
CREATE TRIGGER trg_production_requisition_lines_updated_at
  BEFORE UPDATE ON production_requisition_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_production_work_orders_updated_at ON production_work_orders;
CREATE TRIGGER trg_production_work_orders_updated_at
  BEFORE UPDATE ON production_work_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_work_order_materials_updated_at ON work_order_materials;
CREATE TRIGGER trg_work_order_materials_updated_at
  BEFORE UPDATE ON work_order_materials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_work_order_outputs_updated_at ON work_order_outputs;
CREATE TRIGGER trg_work_order_outputs_updated_at
  BEFORE UPDATE ON work_order_outputs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_labour_attendance_logs_updated_at ON labour_attendance_logs;
CREATE TRIGGER trg_labour_attendance_logs_updated_at
  BEFORE UPDATE ON labour_attendance_logs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Down Migration (for rollback)
-- ============================================================
-- DROP TABLE IF EXISTS labour_attendance_logs;
-- DROP TABLE IF EXISTS wastage_records;
-- DROP TABLE IF EXISTS work_order_outputs;
-- DROP TABLE IF EXISTS work_order_materials;
-- DROP TABLE IF EXISTS production_work_orders;
-- DROP TABLE IF EXISTS production_requisition_lines;
-- DROP TABLE IF EXISTS production_requisitions;
-- DROP TABLE IF EXISTS bom_lines;
-- DROP TABLE IF EXISTS bom_headers;