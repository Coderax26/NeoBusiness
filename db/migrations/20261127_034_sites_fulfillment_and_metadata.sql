-- Migration: 20261127_034_sites_fulfillment_and_metadata.sql
-- Add site_code, gstin, and is_fulfillment_site capability to sites table

ALTER TABLE sites ADD COLUMN IF NOT EXISTS site_code TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS is_fulfillment_site BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE sites
SET is_fulfillment_site = TRUE
WHERE site_type IN ('FACTORY', 'WAREHOUSE')
  AND is_fulfillment_site = FALSE;

UPDATE sites
SET site_code = UPPER(SUBSTRING(REGEXP_REPLACE(name, '[^A-Za-z0-9]', '', 'g'), 1, 6))
WHERE site_code IS NULL OR site_code = '';

UPDATE sites
SET is_fulfillment_site = TRUE
WHERE id = (
  SELECT id FROM sites WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 1
)
  AND NOT EXISTS (
    SELECT 1 FROM sites WHERE is_active = TRUE AND is_fulfillment_site = TRUE
  );
