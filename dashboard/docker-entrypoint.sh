#!/bin/sh
set -e

# Run migrations if RUN_MIGRATIONS is set to true
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  node ./node_modules/tsx/dist/cli.mjs src/db/migrate.ts
  echo "Migrations complete."
fi

# Start the application
exec node server.js
