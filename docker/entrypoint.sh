#!/bin/sh
set -e
# The runtime image is intentionally slim (standalone bundle only), so schema
# migrations and seeding are performed out-of-band against the database rather
# than on container start:
#   - Migrations: `npx prisma migrate deploy` from a machine/CI with the repo
#   - Seed (once): `npx tsx prisma/seed.ts`
# Both point at the same DATABASE_URL and are idempotent.
exec node server.js
