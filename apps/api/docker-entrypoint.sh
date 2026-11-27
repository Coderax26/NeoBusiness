#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
attempt=1
max_attempts=10
until node dist/scripts/migrate.js; do
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] Database migrations failed after $max_attempts attempts."
    exit 1
  fi
  echo "[entrypoint] Migration attempt $attempt/$max_attempts failed; retrying in 3s..."
  attempt=$((attempt + 1))
  sleep 3
done

if [ "$BOOTSTRAP_CLIENT" = "true" ]; then
  echo "[entrypoint] Running clean client workspace bootstrap..."
  node dist/scripts/bootstrap-client.js
fi

if [ "$SEED_ON_STARTUP" = "true" ]; then
  echo "[entrypoint] SEED_ON_STARTUP=true: Running demo seed..."
  node dist/scripts/seed.js
fi

echo "[entrypoint] Starting NeoBus API server..."
exec node dist/main.js
