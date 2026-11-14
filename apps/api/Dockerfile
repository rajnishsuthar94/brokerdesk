# syntax=docker/dockerfile:1
# Build context: repository root (npm workspaces need the root lockfile).
#   docker build -f apps/api/Dockerfile -t brokerdesk-api .

ARG NODE_VERSION=22.22.3

# ── Build: install deps, build shared types, generate Prisma client, compile ──
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/tsconfig.json packages/shared-types/
COPY packages/shared-types/src packages/shared-types/src
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN npm ci --workspace @brokerdesk/api --workspace @brokerdesk/shared-types --include-workspace-root=false
COPY apps/api apps/api
RUN npm run build -w @brokerdesk/shared-types \
 && npm run prisma:generate -w @brokerdesk/api \
 && npm run build -w @brokerdesk/api

# ── Migrate: one-shot job that applies pending Prisma migrations ──
FROM build AS migrate
WORKDIR /repo/apps/api
CMD ["npx", "prisma", "migrate", "deploy"]

# ── Production dependencies only ──
FROM node:${NODE_VERSION}-bookworm-slim AS prod-deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
# --ignore-scripts skips the shared-types `prepare` build and Prisma generate
# (both outputs are copied from the build stage). argon2 ships prebuilt binaries
# that are resolved at runtime, so it needs no install script.
RUN npm ci --omit=dev --ignore-scripts --workspace @brokerdesk/api --include-workspace-root=false

# ── Runtime ──
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=build /repo/packages/shared-types/package.json packages/shared-types/
COPY --from=build /repo/packages/shared-types/dist packages/shared-types/dist
COPY --from=build /repo/apps/api/package.json apps/api/
COPY --from=build /repo/apps/api/dist apps/api/dist
WORKDIR /repo/apps/api
# Uploaded photos (local storage driver). Mount a volume here; owned by the non-root user.
RUN mkdir -p /repo/apps/api/storage && chown node:node /repo/apps/api/storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
