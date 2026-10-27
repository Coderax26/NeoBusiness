-- Migration 009: Add Worklist Tables (Production)
-- Production definitions for collection worklists.

-- 1. Collection Worklist Worklists
CREATE TABLE IF NOT EXISTS worklist_worklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id uuid NOT NULL REFERENCES sites(id),
  date date NOT NULL UNIQUE,
  total_customers integer NOT NULL DEFAULT 0,
  total_overdue_amount numeric(14,2) NOT NULL DEFAULT 0.00,
  status varchar(20) NOT NULL DEFAULT 'GENERATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now
);

-- 2. Collection Worklist Items
CREATE TABLE IF NOT EXISTS worklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worklist_id uuid NOT NULL REFERENCES worklist_worklists(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES customers(id),
  priority_score numeric(14,2) NOT NULL,
  overdue_amount numeric(14,2) NOT NULL,
  days_overdue integer NOT NULL,
  reasons text[] NOT NULL,
  assigned_to uuid REFERENCES users(id),
  route_order integer,
  status varchar(20) NOT NULL DEFAULT 'PENDING',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_worklist_items_customer ON worklist_items(customer_id, route_order);
CREATE INDEX IF NOT EXISTS idx_worklist_items_status ON worklist_items(status);

-- RLS Enablement
ALTER TABLE worklist_worklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE worklist_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_worklist_worklists') THEN
        CREATE POLICY site_isolation_worklist_worklists ON worklist_worklists
            USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_worklist_items') THEN
        CREATE POLICY site_isolation_worklist_items ON worklist_items
            USING (worklist_id IN (SELECT id FROM worklist_worklists));
    END IF;
END $$;

DO $$
BEGIN
    ALTER TABLE worklist_worklists FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
END $$;

DO $$
BEGIN
    ALTER TABLE worklist_items FORCE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN
END $$;