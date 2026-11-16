# syntax=docker/dockerfile:1
# Lister: one container, plain HTTP on PORT, SQLite on the /data volume. Traefik terminates TLS
# (docs/design.md §2.9). Multi-arch: `docker buildx build --platform linux/amd64,linux/arm64 .`

ARG NODE_VERSION=26.13.0

# ---- build: web app and API ----
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY . .
ENV NX_DAEMON=false NX_TUI=false CI=true
RUN npx nx run-many -t build -p lister-web lister-api --configuration=production --outputStyle=static

# ---- production dependencies of the API (better-sqlite3 is native) ----
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
# The build writes the API's own package.json (only what it imports); the root lockfile pins versions.
COPY --from=build /app/dist/apps/lister-api/package.json ./
COPY --from=build /app/package-lock.json ./
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm install --omit=dev --ignore-scripts --no-audit --no-fund \
 && npm rebuild better-sqlite3 \
 && node -e "new (require('better-sqlite3'))(':memory:')"

# ---- runtime ----
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/lister.db \
    WEB_ROOT=/app/web
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist/apps/lister-api ./
COPY --from=build /app/dist/apps/lister-web/browser ./web
# The node image's `node` user (uid 1000) owns the data volume.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "main.js"]
