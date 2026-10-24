# syntax=docker/dockerfile:1
# Multi-stage build for BookLeaf Connect (Next.js standalone + Prisma).
# Kept lean so it builds on hosts with small/ephemeral build disks.

FROM node:24-alpine AS base
RUN apk add --no-cache openssl libc6-compat
WORKDIR /app

# ---- build: single full install, generate client, build standalone bundle ----
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
# Avoid downloading extra Prisma engines we don't need (keeps disk usage down).
ENV PRISMA_CLI_QUERY_ENGINE_TYPE=library
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --ignore-scripts && npx prisma generate
COPY . .
RUN npx next build \
  && npm prune --omit=dev \
  && npm cache clean --force

# ---- runtime: only the standalone bundle (self-contained) ----
FROM base AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN addgroup -S app && adduser -S app -G app

# Next.js standalone output ships its own minimal node_modules for the server.
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
COPY --chown=app:app docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
ENTRYPOINT ["./entrypoint.sh"]
