# syntax=docker/dockerfile:1
# Build context: repository root.
#   docker build -f apps/web/Dockerfile -t brokerdesk-web .

ARG NODE_VERSION=22.22.3

FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/tsconfig.json packages/shared-types/
COPY packages/shared-types/src packages/shared-types/src
RUN npm ci --workspace @brokerdesk/web --workspace @brokerdesk/shared-types --include-workspace-root=false
COPY apps/web apps/web
RUN npm run build -w @brokerdesk/shared-types && npm run build -w @brokerdesk/web

FROM nginx:1.28-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY apps/web/security-headers.conf /etc/nginx/security-headers.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 8080
