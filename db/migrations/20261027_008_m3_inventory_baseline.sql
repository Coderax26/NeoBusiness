-- Migration 008: M3 Inventory and Warehouse
-- Sprint 2: Multi-site stock tracking, FEFO reservations, ATP queries, GRN, transfers, adjustments

-- 1. Inventory Batches (core stock tracking with expiry for FEFO)
CREATE TABLE IF NOT EXISTS inventory_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    item_id uuid NOT NULL REFERENCES items(id),
    location_id uuid REFERENCES locations(id),
    batch_number varchar(50) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'AVAILABLE', -- AVAILABLE, COMMITTED, EXPIRED, DAMAGED, QUARANTINE
    qty_on_hand numeric(14,3) NOT NULL DEFAULT 0.000,
    qty_committed numeric(14,3) NOT NULL DEFAULT 0.000,
    qty_available numeric(14,3) GENERATED ALWAYS AS (qty_on_hand - qty_committed) STORED,
    expiry_date date,
    mfg_date date,
    received_date date NOT NULL DEFAULT CURRENT_DATE,
    landed_cost_per_unit numeric(14,2),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES users(id),
    updated_by uuid REFERENCES users(id),
    UNIQUE (site_id, item_id, batch_number)
);

-- 2. Stock Ledger Transactions (append-only audit trail for all stock movements)
CREATE TABLE IF NOT EXISTS stock_ledger_txns (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    item_id uuid NOT NULL REFERENCES items(id),
    batch_id uuid REFERENCES inventory_batches(id),
    txn_type varchar(30) NOT NULL, -- RECEIPT, RESERVATION, RELEASE, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT, WRITEOFF, EXPIRY_REMOVAL, SHRINKAGE
    qty numeric(14,3) NOT NULL,
    uom varchar(10) NOT NULL,
    reference_table varchar(50), -- stock_reservations, stock_transfers, stock_adjustments, grn, etc.
    reference_id uuid,
    reference_no varchar(50),
    posted_at timestamptz NOT NULL DEFAULT now(),
    posted_by uuid REFERENCES users(id),
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Stock Reservations (FEFO-based, with idempotency)
CREATE TABLE IF NOT EXISTS stock_reservations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    item_id uuid NOT NULL REFERENCES items(id),
    batch_id uuid NOT NULL REFERENCES inventory_batches(id),
    order_id uuid, -- can reference sales_orders, production_requisitions, transfer_orders
    order_type varchar(30), -- SALES_ORDER, PRODUCTION_REQ, TRANSFER, MANUAL
    qty numeric(14,3) NOT NULL,
    uom varchar(10) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE, RELEASED, CONSUMED, EXPIRED
    reserved_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz, -- reservation expiry for stale detection
    consumed_at timestamptz,
    idempotency_key varchar(100) UNIQUE,
    created_by uuid REFERENCES users(id),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES users(id)
);

-- 4. Stock Transfers (inter-site movement)
CREATE TABLE IF NOT EXISTS stock_transfers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    from_site_id uuid NOT NULL REFERENCES sites(id),
    to_site_id uuid NOT NULL REFERENCES sites(id),
    transfer_no varchar(50) NOT NULL UNIQUE,
    status varchar(20) NOT NULL DEFAULT 'REQUESTED', -- REQUESTED, RESERVED, IN_TRANSIT, RECEIVED, COMPLETED, CANCELLED
    requested_by uuid REFERENCES users(id),
    requested_at timestamptz NOT NULL DEFAULT now(),
    reserved_at timestamptz,
    dispatched_at timestamptz,
    received_at timestamptz,
    completed_at timestamptz,
    cancelled_at timestamptz,
    variance_qty numeric(14,3) NOT NULL DEFAULT 0.000,
    variance_reason text,
    idempotency_key varchar(100) UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES users(id),
    updated_by uuid REFERENCES users(id)
);

-- 5. Stock Transfer Lines (individual items within a transfer)
CREATE TABLE IF NOT EXISTS stock_transfer_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_id uuid NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
    item_id uuid NOT NULL REFERENCES items(id),
    from_batch_id uuid REFERENCES inventory_batches(id),
    to_batch_id uuid REFERENCES inventory_batches(id),
    requested_qty numeric(14,3) NOT NULL,
    reserved_qty numeric(14,3) NOT NULL DEFAULT 0.000,
    dispatched_qty numeric(14,3) NOT NULL DEFAULT 0.000,
    received_qty numeric(14,3) NOT NULL DEFAULT 0.000,
    uom varchar(10) NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'PENDING', -- PENDING, RESERVED, DISPATCHED, RECEIVED, COMPLETED
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Stock Adjustments (write-off, shrinkage, expiry removal, variance corrections)
CREATE TABLE IF NOT EXISTS stock_adjustments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id uuid NOT NULL REFERENCES sites(id),
    item_id uuid NOT NULL REFERENCES items(id),
    batch_id uuid REFERENCES inventory_batches(id),
    adjustment_no varchar(50) NOT NULL UNIQUE,
    adjustment_type varchar(20) NOT NULL, -- WRITEOFF, SHRINKAGE, EXPIRY_REMOVAL, VARIANCE_CORRECTION, FOUND
    qty numeric(14,3) NOT NULL,
    uom varchar(10) NOT NULL,
    variance_pct numeric(5,2), -- Calculated in service layer
    reason text NOT NULL,
    status varchar(20) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    requested_by uuid REFERENCES users(id),
    requested_at timestamptz NOT NULL DEFAULT now(),
    approved_by uuid REFERENCES users(id),
    approved_at timestamptz,
    rejected_by uuid REFERENCES users(id),
    rejected_at timestamptz,
    rejection_reason text,
    idempotency_key varchar(100) UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inventory_batches_site_item ON inventory_batches(site_id, item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_site_item_status_expiry ON inventory_batches(site_id, item_id, status, expiry_date);
CREATE INDEX IF NOT EXISTS idx_inventory_batches_expiry ON inventory_batches(expiry_date) WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_ledger_txns_site_item ON stock_ledger_txns(site_id, item_id, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_txns_batch ON stock_ledger_txns(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_txns_reference ON stock_ledger_txns(reference_table, reference_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_site_item ON stock_reservations(site_id, item_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_batch ON stock_reservations(batch_id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_order ON stock_reservations(order_id, order_type);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_status ON stock_reservations(status);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_expiry ON stock_reservations(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_site ON stock_transfers(from_site_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_site ON stock_transfers(to_site_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_lines_transfer ON stock_transfer_lines(transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_site_item ON stock_adjustments(site_id, item_id);
CREATE INDEX IF NOT EXISTS idx_stock_adjustments_status ON stock_adjustments(status);

-- RLS Enablement
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger_txns ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS Policies (site-scoped queries using app.site_ids setting)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_inventory_batches') THEN
        CREATE POLICY site_isolation_inventory_batches ON inventory_batches
            USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_stock_ledger_txns') THEN
        CREATE POLICY site_isolation_stock_ledger_txns ON stock_ledger_txns
            USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_stock_reservations') THEN
        CREATE POLICY site_isolation_stock_reservations ON stock_reservations
            USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_stock_transfers') THEN
        CREATE POLICY site_isolation_stock_transfers ON stock_transfers
            USING (from_site_id = ANY (current_setting('app.site_ids', true)::uuid[])
                OR to_site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_stock_transfer_lines') THEN
        CREATE POLICY site_isolation_stock_transfer_lines ON stock_transfer_lines
            USING (transfer_id IN (SELECT id FROM stock_transfers));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polname = 'site_isolation_stock_adjustments') THEN
        CREATE POLICY site_isolation_stock_adjustments ON stock_adjustments
            USING (site_id = ANY (current_setting('app.site_ids', true)::uuid[]));
    END IF;
END $$;

-- Force RLS for app user
ALTER TABLE inventory_batches FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger_txns FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_reservations FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE stock_adjustments FORCE ROW LEVEL SECURITY;

-- Append-only trigger revokes (deny UPDATE/DELETE on immutable ledger tables for neobus_app role)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neobus_app') THEN
        REVOKE UPDATE, DELETE ON stock_ledger_txns FROM neobus_app;
        REVOKE UPDATE, DELETE ON stock_reservations FROM neobus_app;
        REVOKE UPDATE, DELETE ON stock_transfers FROM neobus_app;
        REVOKE UPDATE, DELETE ON stock_transfer_lines FROM neobus_app;
        REVOKE UPDATE, DELETE ON stock_adjustments FROM neobus_app;
    END IF;
END $$;

-- Updated-at trigger for all M3 tables
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_batches_updated_at ON inventory_batches;
CREATE TRIGGER update_inventory_batches_updated_at BEFORE UPDATE ON inventory_batches
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_transfers_updated_at ON stock_transfers;
CREATE TRIGGER update_stock_transfers_updated_at BEFORE UPDATE ON stock_transfers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_transfer_lines_updated_at ON stock_transfer_lines;
CREATE TRIGGER update_stock_transfer_lines_updated_at BEFORE UPDATE ON stock_transfer_lines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_adjustments_updated_at ON stock_adjustments;
CREATE TRIGGER update_stock_adjustments_updated_at BEFORE UPDATE ON stock_adjustments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_stock_reservations_updated_at ON stock_reservations;
CREATE TRIGGER update_stock_reservations_updated_at BEFORE UPDATE ON stock_reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to log stock ledger entry (used by service layer)
CREATE OR REPLACE FUNCTION log_stock_txn(
    p_site_id uuid,
    p_item_id uuid,
    p_batch_id uuid,
    p_txn_type varchar,
    p_qty numeric,
    p_uom varchar,
    p_reference_table varchar,
    p_reference_id uuid,
    p_reference_no varchar,
    p_posted_by uuid,
    p_note text
) RETURNS uuid AS $$
DECLARE
    v_txn_id uuid;
BEGIN
    INSERT INTO stock_ledger_txns (
        site_id, item_id, batch_id, txn_type, qty, uom,
        reference_table, reference_id, reference_no,
        posted_by, note
    ) VALUES (
        p_site_id, p_item_id, p_batch_id, p_txn_type, p_qty, p_uom,
        p_reference_table, p_reference_id, p_reference_no,
        p_posted_by, p_note
    ) RETURNING id INTO v_txn_id;
    RETURN v_txn_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get available qty for ATP (FEFO ordered)
CREATE OR REPLACE FUNCTION get_atp_qty(
    p_site_id uuid,
    p_item_id uuid,
    p_qty numeric DEFAULT NULL
) RETURNS TABLE (
    batch_id uuid,
    batch_number varchar,
    qty_available numeric,
    expiry_date date,
    landed_cost_per_unit numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ib.id as batch_id,
        ib.batch_number,
        ib.qty_available,
        ib.expiry_date,
        ib.landed_cost_per_unit
    FROM inventory_batches ib
    WHERE ib.site_id = p_site_id
      AND ib.item_id = p_item_id
      AND ib.status = 'AVAILABLE'
      AND ib.qty_available > 0
      AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
    ORDER BY
        CASE WHEN ib.expiry_date IS NULL THEN 1 ELSE 0 END, -- null expiry last
        ib.expiry_date ASC,
        ib.created_at ASC; -- tie-breaker: first created first
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to reserve stock using FEFO (called from service layer with FOR UPDATE)
CREATE OR REPLACE FUNCTION reserve_stock_fefo(
    p_site_id uuid,
    p_item_id uuid,
    p_qty numeric,
    p_order_id uuid,
    p_order_type varchar,
    p_idempotency_key varchar,
    p_created_by uuid
) RETURNS TABLE (
    reservation_id uuid,
    batch_id uuid,
    reserved_qty numeric
) AS $$
DECLARE
    v_remaining numeric := p_qty;
    v_batch record;
BEGIN
    -- Check idempotency first
    IF EXISTS (SELECT 1 FROM stock_reservations WHERE idempotency_key = p_idempotency_key) THEN
        RETURN QUERY
        SELECT sr.id as reservation_id, sr.batch_id, sr.qty as reserved_qty
        FROM stock_reservations sr
        WHERE sr.idempotency_key = p_idempotency_key;
        RETURN;
    END IF;

    -- Lock and iterate batches in FEFO order
    FOR v_batch IN
        SELECT ib.id as batch_id, ib.qty_available
        FROM inventory_batches ib
        WHERE ib.site_id = p_site_id
          AND ib.item_id = p_item_id
          AND ib.status = 'AVAILABLE'
          AND ib.qty_available > 0
          AND (ib.expiry_date IS NULL OR ib.expiry_date >= CURRENT_DATE)
        ORDER BY
            CASE WHEN ib.expiry_date IS NULL THEN 1 ELSE 0 END,
            ib.expiry_date ASC,
            ib.created_at ASC
        FOR UPDATE
    LOOP
        IF v_remaining <= 0 THEN
            EXIT;
        END IF;

        DECLARE
            v_reserve_qty numeric := LEAST(v_remaining, v_batch.qty_available);
            v_reservation_id uuid;
        BEGIN
            -- Create reservation
            INSERT INTO stock_reservations (
                site_id, item_id, batch_id, order_id, order_type,
                qty, uom, status, idempotency_key, created_by
            ) VALUES (
                p_site_id, p_item_id, v_batch.batch_id, p_order_id, p_order_type,
                v_reserve_qty, (SELECT uom FROM items WHERE id = p_item_id),
                'ACTIVE', p_idempotency_key, p_created_by
            ) RETURNING id INTO v_reservation_id;

            -- Update batch committed qty
            UPDATE inventory_batches
            SET qty_committed = qty_committed + v_reserve_qty,
                updated_at = now(),
                updated_by = p_created_by
            WHERE id = v_batch.batch_id;

            -- Log ledger entry
            PERFORM log_stock_txn(
                p_site_id, p_item_id, v_batch.batch_id,
                'RESERVATION', v_reserve_qty,
                (SELECT uom FROM items WHERE id = p_item_id),
                'stock_reservations', v_reservation_id,
                p_idempotency_key,
                p_created_by,
                'FEFO reservation for order ' || p_order_id::text
            );

            -- Return this reservation
            RETURN QUERY SELECT v_reservation_id as reservation_id, v_batch.batch_id, v_reserve_qty as reserved_qty;

            v_remaining := v_remaining - v_reserve_qty;
        END;
    END LOOP;

    -- If we couldn't reserve full qty, log what we got
    IF v_remaining > 0 THEN
        -- Partial reservation - return what was reserved
        RETURN;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release a reservation
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
    v_batch_id uuid;
    v_qty numeric;
BEGIN
    -- Check idempotency
    IF EXISTS (
        SELECT 1 FROM stock_reservations
        WHERE idempotency_key = p_idempotency_key
        AND id != p_reservation_id
    ) THEN
        RETURN QUERY SELECT false as success, 0 as released_qty;
        RETURN;
    END IF;

    -- Get reservation with lock
    SELECT * INTO v_reservation
    FROM stock_reservations
    WHERE id = p_reservation_id
      AND status = 'ACTIVE'
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN QUERY SELECT false as success, 0 as released_qty;
        RETURN;
    END IF;

    v_batch_id := v_reservation.batch_id;
    v_qty := v_reservation.qty;

    -- Update reservation status
    UPDATE stock_reservations
    SET status = 'RELEASED',
        released_at = now(),
        updated_at = now(),
        updated_by = p_released_by
    WHERE id = p_reservation_id;

    -- Update batch committed qty
    UPDATE inventory_batches
    SET qty_committed = qty_committed - v_qty,
        updated_at = now(),
        updated_by = p_released_by
    WHERE id = v_batch_id;

    -- Log ledger entry
    PERFORM log_stock_txn(
        v_reservation.site_id, v_reservation.item_id, v_batch_id,
        'RELEASE', v_qty,
        (SELECT uom FROM items WHERE id = v_reservation.item_id),
        'stock_reservations', p_reservation_id,
        p_idempotency_key,
        p_released_by,
        'Released reservation ' || p_reservation_id::text
    );

    RETURN QUERY SELECT true as success, v_qty as released_qty;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;