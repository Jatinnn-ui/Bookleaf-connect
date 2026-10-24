#!/bin/sh
set -e
# Apply pending migrations (idempotent, safe to run on every boot).
# The Prisma CLI + schema live in an isolated ./migrate dir so the slim runtime
# image doesn't need the full dev dependency tree.
#
# Seeding is NOT run here. The dataset is seeded once against the database
# (e.g. `npx tsx prisma/seed.ts` from a dev machine pointed at the same DB).
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  if [ -f ./migrate/prisma/schema.prisma ]; then
    ./migrate/node_modules/.bin/prisma migrate deploy --schema ./migrate/prisma/schema.prisma
  fi
fi
exec node server.js
