-- Migration: 20261024_004_force_rls_all_tables
-- Force Row Level Security so table owners and superusers respect policies
-- (required for developer machines running as the database owner).
-- Also add site_scope policy to the `sites` table.

-- FORCE RLS on existing RLS tables
ALTER TABLE users FORCE ROW LEVEL SECURITY;
ALTER TABLE locations FORCE ROW LEVEL SECURITY;

-- Add RLS policy to sites table
ALTER TABLE sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites FORCE ROW LEVEL SECURITY;

CREATE POLICY sites_site_scope ON sites
  USING (
    current_setting('app.role', TRUE) = 'OWNER'
    OR id::TEXT = ANY(
      string_to_array(current_setting('app.site_ids', TRUE), ',')
    )
  );