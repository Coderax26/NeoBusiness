-- Migration 023: M7b Dashboard & Analytics Role Permissions
-- Seeds permissions required by M7b dashboards and analytics endpoints
-- Depends on: role_permissions table from M0 migration 001
--
-- Reference: docs/modules/09_M7_Control_Tower_Exceptions.md §2 Roles & permissions
-- S7: Stock alerts, S3: Pulse Header, S4: Strategic analytics, S5: EOD view
--
-- Permission codes (OD-003: dashboards owned by Owner role by default):
--   dashboard.*   - OWNER only financial data
--   analytics.*   - OWNER only strategic analytics
--   stock.read_alerts - all roles can view low stock alerts
--   audit.view    - view audit logs

-- OWNER permissions (full access to all dashboards and analytics)
INSERT INTO role_permissions (role, permission_code, scope) VALUES
  ('OWNER', 'dashboard.read_pulse', 'ALL'),
  ('OWNER', 'dashboard.read_status', 'ALL'),
  ('OWNER', 'dashboard.read_eod', 'ALL'),
  ('OWNER', 'dashboard.read_kpis', 'ALL'),
  ('OWNER', 'analytics.read_customers', 'ALL'),
  ('OWNER', 'analytics.read_suppliers', 'ALL'),
  ('OWNER', 'analytics.read_factory', 'ALL'),
  ('OWNER', 'analytics.read_ar', 'ALL'),
  ('OWNER', 'stock.read_alerts', 'ALL'),
  ('OWNER', 'audit.view', 'ALL')
ON CONFLICT (role, permission_code) DO NOTHING;

-- OPS_COORD permissions (status matrix, stock alerts, audit)
INSERT INTO role_permissions (role, permission_code, scope) VALUES
  ('OPS_COORD', 'dashboard.read_status', 'SITE'),
  ('OPS_COORD', 'stock.read_alerts', 'SITE'),
  ('OPS_COORD', 'audit.view', 'SITE')
ON CONFLICT (role, permission_code) DO NOTHING;

-- PROD_MGR permissions (production view, stock alerts)
INSERT INTO role_permissions (role, permission_code, scope) VALUES
  ('PROD_MGR', 'dashboard.read_status', 'SITE'),
  ('PROD_MGR', 'stock.read_alerts', 'SITE')
ON CONFLICT (role, permission_code) DO NOTHING;

-- STOREKEEPER permissions (stocks, basic dashboard)
INSERT INTO role_permissions (role, permission_code, scope) VALUES
  ('STOREKEEPER', 'stock.read_alerts', 'OWN')
ON CONFLICT (role, permission_code) DO NOTHING;

-- COLLECTOR/DRIVER permissions (limited/no dashboard access)
-- Dashboards are Owner-only; Collectors/Drivers use mobile app

-- DOWN
-- No rollback needed - permissions are additive only