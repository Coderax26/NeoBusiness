-- ============================================================
-- Migration: 20261102_014_m5_fleet_delivery
-- Module:    M5 — Fleet, Dispatch & Delivery
-- Purpose:   Add trip execution, ePOD, issue, expense, and challan workflows.
-- ============================================================

CREATE TABLE IF NOT EXISTS vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  registration_no TEXT NOT NULL,
  vehicle_type TEXT NOT NULL,
  capacity_kg NUMERIC(14,3) NOT NULL CHECK (capacity_kg > 0),
  capacity_crates INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  UNIQUE (site_id, registration_no)
);

CREATE TABLE IF NOT EXISTS delivery_trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  trip_no TEXT NOT NULL UNIQUE,
  trip_date DATE NOT NULL,
  origin_site_id UUID REFERENCES sites(id),
  vehicle_id UUID NOT NULL REFERENCES vehicles(id),
  driver_id UUID NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'LOADING'
    CHECK (status IN ('LOADING', 'IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
  planned_distance_km NUMERIC(14,3),
  route_polyline TEXT,
  started_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  closed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID
);

CREATE TABLE IF NOT EXISTS delivery_stops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  trip_id UUID NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
  sales_order_id UUID REFERENCES sales_orders(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'DELIVERED_FULL', 'DELIVERED_PARTIAL', 'FAILED')),
  invoice_id UUID,
  epod_method TEXT CHECK (epod_method IN ('SIGNATURE', 'PHOTO', 'OTP')),
  epod_signature_url TEXT,
  epod_photo_url TEXT,
  epod_otp_verified BOOLEAN NOT NULL DEFAULT FALSE,
  gps_lat_lng POINT,
  captured_at TIMESTAMPTZ,
  reason_code TEXT,
  exception_notes TEXT,
  is_cod BOOLEAN NOT NULL DEFAULT FALSE,
  cod_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  cod_collected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  idempotency_key TEXT,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID,
  UNIQUE (trip_id, sequence_no),
  UNIQUE (idempotency_key)
);

CREATE TABLE IF NOT EXISTS delivery_stop_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stop_id UUID NOT NULL REFERENCES delivery_stops(id) ON DELETE CASCADE,
  sales_order_line_id UUID,
  item_id UUID NOT NULL REFERENCES items(id),
  loaded_qty NUMERIC(14,3) NOT NULL CHECK (loaded_qty >= 0),
  delivered_qty NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (delivered_qty >= 0),
  returned_qty NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (returned_qty >= 0),
  batch_id UUID,
  return_reason TEXT,
  damaged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (stop_id, item_id)
);

CREATE TABLE IF NOT EXISTS delivery_challans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challan_no TEXT NOT NULL UNIQUE,
  trip_id UUID NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES delivery_stops(id) ON DELETE CASCADE,
  eway_bill_no TEXT,
  pdf_attachment_id UUID REFERENCES attachments(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS issue_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  trip_id UUID NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
  stop_id UUID REFERENCES delivery_stops(id) ON DELETE SET NULL,
  reported_by UUID NOT NULL REFERENCES users(id),
  category TEXT NOT NULL CHECK (category IN (
    'BREAKDOWN', 'ROAD_CLOSURE', 'CUSTOMER_PARTIAL_REJECTION',
    'CUSTOMER_FULL_REJECTION', 'OTHER'
  )),
  rejected_qty NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  value_at_risk NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (value_at_risk >= 0),
  photo_attachment_id UUID REFERENCES attachments(id),
  voice_note_attachment_id UUID REFERENCES attachments(id),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'RESOLVED', 'ESCALATED')),
  resolved_by UUID REFERENCES users(id),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trip_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id),
  trip_id UUID NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('FUEL', 'TOLL', 'OTHER')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  receipt_attachment_id UUID REFERENCES attachments(id),
  logged_by UUID NOT NULL REFERENCES users(id),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS trip_no TEXT;
  ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS origin_site_id UUID;
  ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS planned_distance_km NUMERIC(14,3);
  ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS route_polyline TEXT;
  ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS closed_by UUID;
  ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS created_by UUID;
  ALTER TABLE delivery_trips ADD COLUMN IF NOT EXISTS updated_by UUID;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS site_id UUID;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS sales_order_id UUID;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS invoice_id UUID;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS epod_method TEXT;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS epod_signature_url TEXT;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS epod_photo_url TEXT;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS epod_otp_verified BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS gps_lat_lng POINT;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS captured_at TIMESTAMPTZ;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS reason_code TEXT;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS exception_notes TEXT;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS is_cod BOOLEAN NOT NULL DEFAULT FALSE;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS cod_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS cod_collected_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS created_by UUID;
  ALTER TABLE delivery_stops ADD COLUMN IF NOT EXISTS updated_by UUID;
  UPDATE delivery_stops ds
    SET site_id = dt.site_id
    FROM delivery_trips dt
    WHERE ds.trip_id = dt.id AND ds.site_id IS NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_trips_trip_no
  ON delivery_trips(trip_no) WHERE trip_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_delivery_stop_idempotency
  ON delivery_stops(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_delivery_trips_driver_status
  ON delivery_trips(driver_id, status, trip_date);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_trip_sequence
  ON delivery_stops(trip_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_issue_reports_site_status
  ON issue_reports(site_id, status);
CREATE INDEX IF NOT EXISTS idx_trip_expenses_trip
  ON trip_expenses(trip_id);

INSERT INTO role_permissions (role, permission_code, scope) VALUES
  ('OWNER', 'fleet.read', 'ALL'),
  ('OWNER', 'fleet.manage', 'ALL'),
  ('OWNER', 'fleet.dispatch', 'ALL'),
  ('OWNER', 'fleet.read_own', 'ALL'),
  ('OWNER', 'fleet.deliver', 'ALL'),
  ('OWNER', 'fleet.close', 'ALL'),
  ('OWNER', 'fleet.resolve_issue', 'ALL'),
  ('OPS_COORD', 'fleet.read', 'SITE'),
  ('OPS_COORD', 'fleet.manage', 'SITE'),
  ('OPS_COORD', 'fleet.dispatch', 'SITE'),
  ('OPS_COORD', 'fleet.resolve_issue', 'SITE'),
  ('STOREKEEPER', 'fleet.read', 'SITE'),
  ('STOREKEEPER', 'fleet.dispatch', 'SITE'),
  ('DRIVER', 'fleet.read_own', 'OWN'),
  ('DRIVER', 'fleet.deliver', 'OWN'),
  ('DRIVER', 'fleet.close', 'OWN')
ON CONFLICT (role, permission_code) DO NOTHING;

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_stop_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_challans ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_expenses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'm5_vehicle_site' AND polrelid = 'vehicles'::regclass) THEN
    CREATE POLICY m5_vehicle_site ON vehicles
      USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'm5_trip_site' AND polrelid = 'delivery_trips'::regclass) THEN
    CREATE POLICY m5_trip_site ON delivery_trips
      USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'm5_stop_site' AND polrelid = 'delivery_stops'::regclass) THEN
    CREATE POLICY m5_stop_site ON delivery_stops
      USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'm5_stop_line_site' AND polrelid = 'delivery_stop_lines'::regclass) THEN
    CREATE POLICY m5_stop_line_site ON delivery_stop_lines
      USING (stop_id IN (SELECT id FROM delivery_stops));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'm5_challan_site' AND polrelid = 'delivery_challans'::regclass) THEN
    CREATE POLICY m5_challan_site ON delivery_challans
      USING (trip_id IN (SELECT id FROM delivery_trips));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'm5_issue_site' AND polrelid = 'issue_reports'::regclass) THEN
    CREATE POLICY m5_issue_site ON issue_reports
      USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'm5_expense_site' AND polrelid = 'trip_expenses'::regclass) THEN
    CREATE POLICY m5_expense_site ON trip_expenses
      USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
  END IF;
END $$;

-- DOWN
-- DROP TABLE IF EXISTS trip_expenses;
-- DROP TABLE IF EXISTS issue_reports;
-- DROP TABLE IF EXISTS delivery_challans;
-- DROP TABLE IF EXISTS delivery_stop_lines;
-- DROP TABLE IF EXISTS delivery_stops;
-- DROP TABLE IF EXISTS delivery_trips;
-- DROP TABLE IF EXISTS vehicles;
