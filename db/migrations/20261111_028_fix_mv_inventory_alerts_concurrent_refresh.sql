-- Migration 028: Fix mv_inventory_alerts concurrent refresh
-- PostgreSQL REFRESH MATERIALIZED VIEW CONCURRENTLY requires at least one UNIQUE index without WHERE clause.

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_inventory_alerts ON mv_inventory_alerts (site_id, batch_number);

CREATE OR REPLACE FUNCTION refresh_mv_inventory_alerts() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY mv_inventory_alerts;
    EXCEPTION WHEN OTHERS THEN
        REFRESH MATERIALIZED VIEW mv_inventory_alerts;
    END;
END $$;

-- DOWN
-- DROP INDEX IF EXISTS uq_mv_inventory_alerts;

