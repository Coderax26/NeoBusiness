-- Migration: 20261103_017_m5_add_command_queue.sql
-- Add delivery_command_queue table for offline mobile command processing
-- Supports idempotent command replay from driver app

CREATE TABLE IF NOT EXISTS delivery_command_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES users(id),
  site_id UUID NOT NULL REFERENCES sites(id),
  command_type VARCHAR(20) NOT NULL
    CHECK (command_type IN ('DELIVERY', 'DENIAL', 'COD', 'RETURNED', 'EXPENSE', 'ISSUE')),
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'EXPIRED')),
  priority INTEGER NOT NULL DEFAULT 0,
  attempt_no INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  idempotency_key VARCHAR(100),
  error_message TEXT,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  processed_at TIMESTAMPTZ
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_delivery_command_queue_driver_id ON delivery_command_queue (driver_id);
CREATE INDEX IF NOT EXISTS idx_delivery_command_queue_site_id ON delivery_command_queue (site_id);
CREATE INDEX IF NOT EXISTS idx_delivery_command_queue_status ON delivery_command_queue (status);
CREATE INDEX IF NOT EXISTS idx_delivery_command_queue_created_at ON delivery_command_queue (created_at);
CREATE INDEX IF NOT EXISTS idx_delivery_command_queue_idempotency_key ON delivery_command_queue (idempotency_key);

-- RLS Policies
ALTER TABLE delivery_command_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rls_delivery_command_queue ON delivery_command_queue;
CREATE POLICY rls_delivery_command_queue ON delivery_command_queue
  USING (
    current_setting('app.role') = 'OWNER'
    OR site_id = ANY(string_to_array(current_setting('app.site_ids'), ',')::uuid[])
  );

-- Append-only protection (no DELETE)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'neobus_app') THEN
    REVOKE DELETE ON delivery_command_queue FROM neobus_app;
  END IF;
END $$;

-- Trigger to update updated_at timestamp
DROP TRIGGER IF EXISTS trg_delivery_command_queue_updated_at ON delivery_command_queue;
CREATE TRIGGER trg_delivery_command_queue_updated_at
  BEFORE UPDATE ON delivery_command_queue
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Down migration (for rollback)
-- DROP TABLE IF EXISTS delivery_command_queue;