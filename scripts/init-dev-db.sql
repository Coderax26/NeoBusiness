-- Initialize the dev database alongside the test database.
-- Runs once when the postgres container is first created.

CREATE DATABASE neobus_dev;
GRANT ALL PRIVILEGES ON DATABASE neobus_dev TO neobus;

-- ── App role (non-superuser, respects Row Level Security) ────────────────────
-- The `neobus` user is the database owner and is a superuser, which
-- bypasses RLS even with FORCE ROW LEVEL SECURITY. The application
-- connects as `neobus_app`, a non-superuser, so RLS policies are
-- actually enforced. This is the only way to validate RLS on a
-- developer machine running as the DB owner.

CREATE ROLE neobus_app NOLOGIN;
GRANT CONNECT ON DATABASE neobus_dev TO neobus_app;
GRANT USAGE ON SCHEMA public TO neobus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO neobus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO neobus_app;
ALTER ROLE neobus_app WITH LOGIN PASSWORD 'neobus_app_secret';
GRANT neobus_app TO neobus;

-- ── Test database ────────────────────────────────────────────────────────────

CREATE DATABASE neobus_test;
GRANT ALL PRIVILEGES ON DATABASE neobus_test TO neobus;

-- Same app role for the test database.
CREATE ROLE neobus_app NOLOGIN;
GRANT CONNECT ON DATABASE neobus_test TO neobus_app;
GRANT USAGE ON SCHEMA public TO neobus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO neobus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO neobus_app;
ALTER ROLE neobus_app WITH LOGIN PASSWORD 'neobus_app_secret';
GRANT neobus_app TO neobus;