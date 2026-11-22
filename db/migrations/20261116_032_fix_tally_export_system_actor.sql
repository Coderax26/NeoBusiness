-- Migration: 20261116_032_fix_tally_export_system_actor.sql
-- Allow created_by and updated_by on tally_export_batches to be NULL for
-- system-initiated nightly cron exports (no human user UUID), while preserving
-- the FK constraint to users(id) for user-triggered exports.

ALTER TABLE tally_export_batches
  ALTER COLUMN created_by DROP NOT NULL,
  ALTER COLUMN updated_by DROP NOT NULL;
