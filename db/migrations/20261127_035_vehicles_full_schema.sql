-- Migration: 20261127_035_vehicles_full_schema.sql
-- Backfill full vehicles columns & fix vehicles RLS policy when migration 008 created the minimal table first

ALTER TABLE vehicles ALTER COLUMN vehicle_type TYPE TEXT;

ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS capacity_crates INTEGER;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS ownership_type TEXT NOT NULL DEFAULT 'OWNED';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS default_driver_name TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS default_driver_phone TEXT;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS fitness_expiry DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS insurance_expiry DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS puc_expiry DATE;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS created_by UUID;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_by UUID;

DO $$
BEGIN
  DROP POLICY IF EXISTS site_isolation_vehicles ON vehicles;
  DROP POLICY IF EXISTS m5_vehicle_site ON vehicles;
  DROP POLICY IF EXISTS vehicles_site_scope ON vehicles;

  CREATE POLICY vehicles_site_scope ON vehicles
    USING (
      current_setting('app.role', TRUE) = 'OWNER'
      OR site_id::TEXT = ANY(string_to_array(COALESCE(current_setting('app.site_ids', TRUE), ''), ','))
    );
END $$;
