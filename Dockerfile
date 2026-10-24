# syntax=docker/dockerfile:1
# Multi-stage build for BookLeaf Connect (Next.js standalone + Prisma).
# Optimized to keep the runtime image small so it builds on low-disk hosts.

FROM node:24-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---- deps: full install (needed to build the app + generate Prisma client) ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate

# ---- build: produce the Next.js standalone bundle ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# ---- migrate-tools: a tiny, isolated install of just the Prisma CLI ----
# Kept separate from the app's node_modules so it can run `migrate deploy` at
# startup without bloating the runtime image with the full dev dependency tree.
FROM base AS migratetools
WORKDIR /tools
COPY prisma ./prisma
RUN npm init -y >/dev/null \
  && npm install --no-save prisma@6 \
  && npm cache clean --force

# ---- runtime ----
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app

# Standalone server bundle ships its own minimal, self-contained node_modules.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public

# Isolated Prisma CLI + schema for migrate-on-start (does NOT touch the app's
# bundled node_modules). Lives under /app/migrate.
COPY --from=migratetools --chown=app:app /tools/node_modules ./migrate/node_modules
COPY --chown=app:app prisma ./migrate/prisma
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["./entrypoint.sh"]
