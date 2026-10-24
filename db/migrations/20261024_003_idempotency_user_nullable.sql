-- 20261024_003_idempotency_user_nullable.sql
-- Idempotency keys can be used by unauthenticated requests (login, OTP).
-- user_id was originally NOT NULL; relax it so anonymous clients can
-- replay the same idempotency key without a user context.

ALTER TABLE idempotency_keys
  ALTER COLUMN user_id DROP NOT NULL;