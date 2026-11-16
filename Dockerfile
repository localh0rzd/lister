# syntax=docker/dockerfile:1
# Lister: one container, plain HTTP on PORT, SQLite on the /data volume. Traefik terminates TLS
# (docs/design.md §2.9). Multi-arch: `docker buildx build --platform linux/amd64,linux/arm64 .`
#
# Only the runtime stage is per platform, and it runs nothing at build time: the web app and the
# API bundle are plain JavaScript, and the API's production dependencies have no install scripts
# (better-sqlite3 ships prebuilt binaries for every target). So the build and deps stages run on
# the build machine's platform, and a cross-platform build needs no emulation.

ARG NODE_VERSION=26.13.0

# ---- build: web app and API ----
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts
COPY . .
ENV NX_DAEMON=false NX_TUI=false CI=true
RUN npx nx run-many -t build -p lister-web lister-api --configuration=production --outputStyle=static

# ---- production dependencies of the API ----
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION}-slim AS deps
ARG TARGETARCH
WORKDIR /app
# The build writes the API's own package.json and a lockfile pruned to it (only what it imports).
COPY --from=build /app/dist/apps/lister-api/package.json /app/dist/apps/lister-api/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts --no-audit --no-fund \
 && arch="$(case "$TARGETARCH" in amd64) echo x64 ;; *) echo "$TARGETARCH" ;; esac)" \
 && test -f "node_modules/better-sqlite3/prebuilds/linux-$arch.node" \
 && mkdir /data

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
COPY --from=deps --chown=1000:1000 /data /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "main.js"]
