# syntax=docker/dockerfile:1
# Single-container build: Fastify API serves the frontend SPA and uploaded media.
# Deploy this as one CapRover app — no separate nginx container needed.

# ─── Stage 1: base ─────────────────────────────────────────────────────────────
FROM node:24-slim AS base
RUN npm install -g pnpm@10

# ─── Stage 2: deps ─────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/api/package.json    ./packages/api/
COPY packages/app/package.json    ./packages/app/

ENV CYPRESS_INSTALL_BINARY=0
RUN pnpm install --frozen-lockfile

# ─── Stage 3: app builder ──────────────────────────────────────────────────────
FROM deps AS app-builder
COPY tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY packages/app    ./packages/app

RUN pnpm --filter @betel/app build

# ─── Stage 4: api builder ──────────────────────────────────────────────────────
FROM deps AS api-builder
COPY packages/shared ./packages/shared
COPY packages/api    ./packages/api

RUN pnpm --filter @betel/api build

# ─── Stage 5: production image ─────────────────────────────────────────────────
FROM node:24-slim
WORKDIR /app

# Copy the bundled API
COPY --from=api-builder /app/packages/api/dist ./dist

# Copy the frontend build into the API's public dir (served at /)
COPY --from=app-builder /app/packages/app/dist ./dist/public

# Install production-only deps declared in dist/package.json (e.g. sharp)
RUN cd dist && npm install --omit=dev

RUN mkdir -p /app/uploads

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=80 \
    UPLOADS_DIR=/app/uploads

CMD ["node", "dist/index.js"]
