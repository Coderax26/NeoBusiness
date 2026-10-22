-- Initialize the test database alongside the dev database
-- This script runs once when the postgres container is first created

CREATE DATABASE neobus_test;
GRANT ALL PRIVILEGES ON DATABASE neobus_test TO neobus;
