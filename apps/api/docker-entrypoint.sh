#!/bin/sh
set -e

echo "[entrypoint] Running database migrations..."
node dist/scripts/migrate.js

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
