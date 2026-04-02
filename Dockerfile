# syntax=docker/dockerfile:1

# ─── Stage 1: base ─────────────────────────────────────────────────────────────
FROM node:24-slim AS base
RUN npm install -g pnpm@10

# ─── Stage 2: deps ─────────────────────────────────────────────────────────────
# Install all workspace dependencies with the lockfile frozen for reproducibility.
FROM base AS deps
WORKDIR /app

# Copy workspace manifests first to maximize layer caching
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json    ./packages/api/
COPY packages/pwa/package.json    ./packages/pwa/
COPY packages/admin/package.json  ./packages/admin/

RUN pnpm install --frozen-lockfile

# ─── Stage 3: builder ──────────────────────────────────────────────────────────
# Build all packages: API (esbuild → CJS), PWA and Admin (Vite → static)
FROM deps AS builder
COPY . .
RUN pnpm build:all

# ─── Stage 4: api ──────────────────────────────────────────────────────────────
# Lean production image for the Fastify API.
# The API build externalises `sharp` and writes a minimal dist/package.json so
# that `npm install` here fetches the correct native binary for this platform.
FROM node:24-slim AS api
WORKDIR /app

COPY --from=builder /app/packages/api/dist ./dist

RUN cd dist && npm install --omit=dev

EXPOSE 3100

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3100

CMD ["node", "dist/index.js"]

# ─── Stage 5: nginx ────────────────────────────────────────────────────────────
# Nginx image that serves the PWA and Admin SPAs and proxies /api/ to the API.
FROM nginx:alpine AS nginx

# nginx.conf uses ${API_HOST} — the image runs envsubst on *.template files at startup.
# docker-compose sets API_HOST=api (the compose service name).
# CapRover sets API_HOST=srv-captain--<api-app-name> via the app's env vars.
COPY nginx/nginx.conf /etc/nginx/templates/default.conf.template

ENV API_HOST=api

# PWA static files  →  served at /
COPY --from=builder /app/packages/pwa/dist   /var/www/pwa
# Admin static files →  served at /admin/
COPY --from=builder /app/packages/admin/dist /var/www/admin
