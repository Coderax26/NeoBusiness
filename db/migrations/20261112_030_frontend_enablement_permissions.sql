-- Migration 030: Frontend Enablement — seed read permissions used by controllers but never granted
-- Reference: docs/Frontend/01_CODEBASE_REVIEW_AND_GAP_ANALYSIS.md §7.4
-- OWNER bypasses RBAC (RbacGuard) but is listed for completeness / permission drift guard.

INSERT INTO role_permissions (role, permission_code, scope) VALUES
  ('OWNER',       'supplier.read',    'ALL'),
  ('OWNER',       'po.read',          'ALL'),
  ('OWNER',       'requisition.read', 'ALL'),
  ('OWNER',       'inventory.read',   'ALL'),
  ('OWNER',       'grn.read',         'ALL'),
  ('OPS_COORD',   'supplier.read',    'SITE'),
  ('OPS_COORD',   'po.read',          'SITE'),
  ('OPS_COORD',   'requisition.read', 'SITE'),
  ('OPS_COORD',   'inventory.read',   'SITE'),
  ('OPS_COORD',   'grn.read',         'SITE'),
  ('PROD_MGR',    'inventory.read',   'SITE'),
  ('STOREKEEPER', 'inventory.read',   'SITE')
ON CONFLICT (role, permission_code) DO NOTHING;

-- DOWN
-- DELETE FROM role_permissions WHERE permission_code IN
--   ('supplier.read','po.read','requisition.read','inventory.read','grn.read');
