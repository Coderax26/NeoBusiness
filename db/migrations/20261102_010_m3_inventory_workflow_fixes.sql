-- ============================================================
-- Migration: 20261102_010_m3_inventory_workflow_fixes
-- Module:    M3 - Inventory and Warehouse
-- Purpose:   Align reservation helpers with the M3 baseline schema.
-- ============================================================

CREATE OR REPLACE FUNCTION release_reservation(
    p_reservation_id uuid,
    p_idempotency_key varchar,
    p_released_by uuid
) RETURNS TABLE (
    success boolean,
    released_qty numeric
) AS $$
DECLARE
    v_reservation record;
BEGIN
    SELECT *
      INTO v_reservation
      FROM stock_reservations
     WHERE id = p_reservation_id
       AND status = 'ACTIVE'
     FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0::numeric;
        RETURN;
    END IF;

    UPDATE stock_reservations
       SET status = 'RELEASED',
           updated_at = now(),
           updated_by = p_released_by
     WHERE id = p_reservation_id;

    UPDATE inventory_batches
       SET qty_committed = GREATEST(0, qty_committed - v_reservation.qty),
           updated_at = now(),
           updated_by = p_released_by
     WHERE id = v_reservation.batch_id;

    PERFORM log_stock_txn(
        v_reservation.site_id,
        v_reservation.item_id,
        v_reservation.batch_id,
        'RELEASE',
        v_reservation.qty,
        v_reservation.uom,
        'stock_reservations',
        p_reservation_id,
        p_idempotency_key,
        p_released_by,
        'Released reservation ' || p_reservation_id::text
    );

    RETURN QUERY SELECT true, v_reservation.qty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- DOWN
-- The corrected function is intentionally retained because reverting to the
-- baseline implementation would restore a reference to the nonexistent
-- stock_reservations.released_at column.
