-- Migration 008 (M6 additions): Add cashbook_entries, vehicles, delivery_trips, delivery_stops
-- Required for M6 EOD closings, cash handovers, and collection worklists.

CREATE TABLE IF NOT EXISTS cashbook_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    entry_type varchar(20) NOT NULL,
    amount numeric(14,2) NOT NULL,
    ref_id uuid,
    ref_no varchar(50),
    date date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehicles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    registration_no varchar(50) NOT NULL,
    vehicle_type varchar(20) NOT NULL,
    capacity_kg numeric(10,2),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_trips (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    trip_date date NOT NULL,
    vehicle_id uuid NOT NULL REFERENCES vehicles(id),
    driver_id uuid NOT NULL REFERENCES users(id),
    status varchar(20) NOT NULL DEFAULT 'SCHEDULED',
    started_at timestamptz,
    closed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_stops (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id uuid NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
    customer_id uuid NOT NULL REFERENCES customers(id),
    sequence_no integer NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'PENDING',
    delivered_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cashbook_entry_type ON cashbook_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_cashbook_site_date ON cashbook_entries(site_id, date);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_site_date ON delivery_trips(site_id, trip_date);
CREATE INDEX IF NOT EXISTS idx_delivery_trips_status ON delivery_trips(status);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_trip ON delivery_stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_customer ON delivery_stops(customer_id);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_status ON delivery_stops(status);

-- RLS
ALTER TABLE cashbook_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_stops ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_cashbook') THEN
        CREATE POLICY site_isolation_cashbook ON cashbook_entries
            USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_vehicles') THEN
        CREATE POLICY site_isolation_vehicles ON vehicles
            USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_delivery_trips') THEN
        CREATE POLICY site_isolation_delivery_trips ON delivery_trips
            USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_delivery_stops') THEN
        CREATE POLICY site_isolation_delivery_stops ON delivery_stops
            USING (trip_id IN (SELECT id FROM delivery_trips));
    END IF;
END $$;
