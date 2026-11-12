-- Migration 031: Physical Stock Counts, Non-trip Expenses & Reports enablement
-- Reference: docs/Frontend/01_CODEBASE_REVIEW_AND_GAP_ANALYSIS.md §5 and 17_BACKEND_API_GAP_REGISTER.md (G-INV-3, G-FIN-2, G-RPT-1/2)

CREATE TABLE IF NOT EXISTS stock_count_sheets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    location_id uuid REFERENCES locations(id),
    count_no varchar(50) NOT NULL UNIQUE,
    status varchar(30) NOT NULL DEFAULT 'DRAFT',
    notes text,
    created_by uuid NOT NULL REFERENCES users(id),
    approved_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    approved_at timestamptz
);

CREATE TABLE IF NOT EXISTS stock_count_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    count_sheet_id uuid NOT NULL REFERENCES stock_count_sheets(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items(id),
    batch_no varchar(50),
    system_qty numeric(12,3) NOT NULL DEFAULT 0,
    counted_qty numeric(12,3) NOT NULL DEFAULT 0,
    variance_qty numeric(12,3) NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_count_site_status ON stock_count_sheets(site_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_count_items_sheet ON stock_count_items(count_sheet_id);

ALTER TABLE stock_count_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_count_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'stock_count_sheets' AND policyname = 'site_isolation_stock_count_sheets'
    ) THEN
        CREATE POLICY site_isolation_stock_count_sheets ON stock_count_sheets
            FOR ALL
            USING (
                site_id::text = current_setting('app.current_site_id', true)
                OR current_setting('app.current_user_role', true) = 'OWNER'
                OR current_setting('app.current_site_id', true) IS NULL
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'stock_count_items' AND policyname = 'site_isolation_stock_count_items'
    ) THEN
        CREATE POLICY site_isolation_stock_count_items ON stock_count_items
            FOR ALL
            USING (
                EXISTS (
                    SELECT 1 FROM stock_count_sheets s
                    WHERE s.id = stock_count_items.count_sheet_id
                    AND (
                        s.site_id::text = current_setting('app.current_site_id', true)
                        OR current_setting('app.current_user_role', true) = 'OWNER'
                        OR current_setting('app.current_site_id', true) IS NULL
                    )
                )
            );
    END IF;
END $$;

-- Role permissions for reports and finances
INSERT INTO role_permissions (role, permission_code, scope) VALUES
  ('OWNER',       'report.view',    'ALL'),
  ('OWNER',       'finance.view',   'ALL'),
  ('OWNER',       'finance.manage', 'ALL'),
  ('OPS_COORD',   'report.view',    'SITE'),
  ('OPS_COORD',   'finance.view',   'SITE'),
  ('OPS_COORD',   'finance.manage', 'SITE'),
  ('PROD_MGR',    'report.view',    'SITE'),
  ('STOREKEEPER', 'report.view',    'SITE')
ON CONFLICT (role, permission_code) DO NOTHING;

