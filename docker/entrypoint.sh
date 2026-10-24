#!/bin/sh
set -e
# Apply pending migrations (safe to run repeatedly). Seeding is NOT automatic;
# run `docker compose exec app npx tsx prisma/seed.ts` once (it is idempotent).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  npx prisma migrate deploy
fi
exec node server.js
