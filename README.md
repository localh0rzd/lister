# Lister

Lister keeps reusable, composable checklists — packing lists first — that several people can edit
and check off together in real time, also offline, as an installable PWA. The design and all
decisions are in [docs/design.md](docs/design.md).

Nx monorepo with an Angular 22 web app and a NestJS API sharing TypeScript libraries.

| Project                             | Path                            | What                                                                 |
| ----------------------------------- | ------------------------------- | -------------------------------------------------------------------- |
| `lister-web`                        | `apps/lister-web`               | Angular SPA (standalone, zoneless, signals) — http://localhost:4200  |
| `lister-api`                        | `apps/lister-api`               | NestJS REST API under `/api` — http://localhost:3000/api             |
| `shared-api-contracts`              | `packages/shared/api-contracts` | Request/response types used by both (`@lister/shared/api-contracts`) |
| `lister-web-e2e` / `lister-api-e2e` | `apps/*-e2e`                    | Playwright (web) and Vitest + axios (API) e2e suites                 |

## Setup

Node version is pinned in `.nvmrc` (use `fnm use` or `nvm use`).

```bash
npm install
npm start          # API + web together; web proxies /api to the API
npm run start:prod # production builds; the API serves the web app on one origin: http://localhost:3100
                   # (don't run it at the same time as `npm start`: both write dist/apps/lister-api)
```

## Common commands

```bash
npx nx test lister-web               # one project
npx nx affected -t lint typecheck test build   # everything your change touches
npm run lint:workspace               # project tags, library placement and import aliases (CI runs it)
npx nx e2e lister-web-e2e            # first run: npx playwright install chromium
npx nx graph                         # project graph
npm run icons                        # regenerate the PWA icons (tools/generate-pwa-icons.mjs)
npx nx run api-data-access-db:db-generate --name=<change>   # migration from the Drizzle schema
npx nx format:write
```

## Environment variables

| Var                  | Used by    | Default                                                                                                                                                                                                                           |
| -------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`               | lister-api | `3000` (also in the Docker image)                                                                                                                                                                                                 |
| `NODE_ENV`           | lister-api | unset (development: `PUBLIC_URL` optional, the dev server's origin is allowed); `production` in the Docker image, where `PUBLIC_URL` is required                                                                                  |
| `WEB_ROOT`           | lister-api | the production web build next to the API (`dist/apps/lister-web/browser`); served when it exists; `/app/web` in the Docker image                                                                                                  |
| `LISTER_SETUP_TOKEN` | lister-api | unset: a random one-time setup token is logged while no account exists. At least 16 characters fixes it instead (for the e2e suites; never logged). Leave unset in production                                                     |
| `PUBLIC_URL`         | lister-api | none (development allows `http://localhost:4200`); required in production (the Docker image does not set it). Its origin is the only one allowed to open the sync socket                                                          |
| `TRUST_PROXY`        | lister-api | `loopback, linklocal, uniquelocal` (Traefik on a private Docker network); a hop count or addresses/ranges as in Express's "trust proxy". Decides which `X-Forwarded-For` hops are believed for the client IP (sign-in rate limit) |
| `DATABASE_PATH`      | lister-api | `data/lister.db` (relative to the working directory; the folder is created); `/data/lister.db` in the Docker image                                                                                                                |
| `BACKUP_DIR`         | lister-api | the `backups` folder next to the database file (`/data/backups` in the Docker image)                                                                                                                                              |

## Running in Docker behind Traefik

The `Dockerfile` builds the web app and the API into one image: plain HTTP on `PORT` (3000), runs as the
non-root `node` user, keeps the SQLite database on the `/data` volume (`DATABASE_PATH=/data/lister.db`) and has a
health check (`/api/health`). Traefik terminates HTTPS; the app never handles certificates.

```bash
docker build -t lister .
docker buildx build --platform linux/amd64,linux/arm64 -t lister .   # multi-arch
```

Example `docker-compose.yml` (adapt the host name, entrypoint and certificate resolver to your Traefik):

```yaml
services:
  lister:
    image: lister:latest # or build: .
    restart: unless-stopped
    environment:
      PUBLIC_URL: https://lister.example.org # required: Origin check, Secure cookies, passkeys
    volumes:
      - lister-data:/data
    networks: [traefik]
    labels:
      - traefik.enable=true
      - traefik.docker.network=traefik
      - traefik.http.routers.lister.rule=Host(`lister.example.org`)
      - traefik.http.routers.lister.entrypoints=websecure
      - traefik.http.routers.lister.tls=true
      - traefik.http.routers.lister.tls.certresolver=letsencrypt
      - traefik.http.services.lister.loadbalancer.server.port=3000

volumes:
  lister-data:

networks:
  traefik:
    external: true # the network Traefik is attached to
```

Using a bind mount instead of a volume? Make the folder writable by uid 1000 first: `sudo chown 1000:1000 ./data`.

Traefik forwards WebSockets (`/socket.io`) without extra configuration. On first start the log prints a one-time
setup token for creating the first admin account (`docker compose logs lister`). Reset a password with
`docker compose exec lister node main.js reset-password <username>`.

## Backups, purging and restoring

Every night (after 03:00 UTC, or at the next start if the app was down then) the API writes a consistent copy of the
database with SQLite's `VACUUM INTO` to `lister-<UTC time>.db` in `BACKUP_DIR` (`/data/backups`, so on the same
volume), and keeps the newest 14. Right after the backup it purges tombstones (deleted lists, items, runs) and runs
finished more than 30 days ago for good; each space remembers its purge point, and a device that last synced before it
gets a full copy of the space on its next sync, so nothing is lost. The backups are plain SQLite files holding
everything, password hashes included: protect them like the database. Copy the folder off the host if you want a
backup that survives losing the disk.

To restore a backup, stop the server and run the command on a file from `/data/backups`. It copies the backup over the
database and moves every space's version past both the backup's and the lost timeline's, so every device fetches a full
copy of its spaces on its next sync, changes still waiting on a device are sent again, and nothing of the lost timeline
survives on a device. Changes since the backup and spaces created after it are lost.

```bash
docker compose stop lister
docker compose run --rm --no-deps lister ls /data/backups
docker compose run --rm --no-deps lister node main.js restore-backup /data/backups/lister-2026-11-16T03-00-00Z.db
docker compose start lister
```

Pick the file name from the `ls` output. Users whose password or passkeys were created after the backup have to be
created or reset again (`node main.js reset-password <username>` works on the restored data).

Every response carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, a Content Security Policy
(including `frame-ancestors 'none'`) and, when `PUBLIC_URL` is https, `Strict-Transport-Security`. The web build's
inline scripts are allowed by hash (Angular's `security.autoCsp`).

## Working with Claude Code

- `docs/design.md` — design, decisions, and the **open decisions** (answer them in chat or edit the file).
- `CLAUDE.md` — stack, layout, conventions, definition of done.
- `TASKS.md` — the backlog. Add tasks there and ask Claude to "work on the next task".
- How Claude works through the backlog:
  - Each task is one commit on the `work/v1` branch, and nothing is pushed or merged without asking.
  - After each task, a separate review session reviews the commit critically and writes its report to `tmp/reviews/<task>.md`. Claude fixes the findings in a second commit before starting the next task.
  - Claude stops at the end of each milestone with a summary.
- `.claude/skills/` — project skills:
  - `best-practices`, `testing` and `module-boundaries` apply to every change;
  - `tasks` and `task-review` cover the backlog and the reviews;
  - `fullstack-feature`, `angular-feature`, `nest-feature` and `verify` cover feature work and the final checks.
- `.claude/settings.json` enables the official Nx plugin (Nx MCP server + Nx skills).
