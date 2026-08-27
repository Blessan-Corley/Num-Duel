# Deployment Guide

## Architecture constraints

### Single-instance requirement

**NumDuel uses in-memory state as its primary game store.**

The `MemoryStore` (default) and the `PartyService`/`SocketService` keep all active party
and player state in plain JavaScript `Map` objects inside the Node.js process.
Socket.IO rooms are also local to the process.

**Consequence:** you must run exactly one Node.js process per deployment.
Running multiple instances behind a load balancer without a shared store
will cause players to be routed to different processes, breaking game state.

#### Allowed topologies

| Setup                                      | Works? | Notes                                                              |
| ------------------------------------------ | ------ | ------------------------------------------------------------------ |
| Single Dyno / single VM                    | ✅     | Default and recommended                                            |
| PM2 `cluster` mode                         | ❌     | Each worker has its own Map — parties are invisible across workers |
| Multiple Heroku/Render instances           | ❌     | Same reason as above                                               |
| Single PM2 `fork` mode (`instances: 1`)    | ✅     | One process only                                                   |
| Docker with `--replicas 1`                 | ✅     | One container only                                                 |
| Docker with `--replicas > 1` without Redis | ❌     | Requires Redis store                                               |

#### How to safely scale to multiple instances

1. Set `REDIS_URL` (or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) in your
   environment to enable `RedisStore`.
2. Add a sticky-session load balancer so each client always hits the same Node process,
   **OR** use Socket.IO's Redis adapter so socket events propagate across processes.
3. Note that the current `RedisStore` stores party state but **socket room membership
   is still local** — the Redis adapter is required for full horizontal scaling.

---

## Environment variables

| Variable                   | Required | Default       | Description                                              |
| -------------------------- | -------- | ------------- | -------------------------------------------------------- |
| `NODE_ENV`                 | No       | `development` | Set to `production` in prod                              |
| `PORT`                     | No       | `3000`        | HTTP/WebSocket listen port                               |
| `DATABASE_URL`             | No       | —             | PostgreSQL connection string for profile persistence     |
| `POSTGRES_URL`             | No       | —             | Accepted alias for `DATABASE_URL`                        |
| `POSTGRESQL_URL`           | No       | —             | Accepted alias for `DATABASE_URL`                        |
| `REDIS_URL`                | No       | —             | Standard Redis URL (ioredis); auto-enables Redis mode    |
| `UPSTASH_REDIS_REST_URL`   | No       | —             | Upstash REST endpoint (alternative to REDIS_URL)         |
| `UPSTASH_REDIS_REST_TOKEN` | No       | —             | Upstash REST token                                       |
| `SESSION_SECRET`           | No       | random        | HMAC secret for reconnect tokens — **set in production** |
| `TRUST_PROXY`              | No       | `false`       | Set to `true` or `1` when behind a reverse proxy         |
| `CORS_ORIGINS`             | No       | `*`           | Comma-separated list of allowed CORS origins             |
| `RATE_LIMIT_MAX`           | No       | `100`         | Max requests per window per IP                           |
| `RATE_LIMIT_WINDOW_MS`     | No       | `60000`       | Rate-limit window in ms                                  |

Copy `.env.example` to `.env` and fill in the values you need.

---

## Development

```bash
# Install dependencies
npm install

# Start server + Vite dev server concurrently (hot-reloads both)
npm run dev

# Server only (no Vite HMR)
npm run dev:server

# Vite dev client only (proxies API + Socket.IO to port 3000)
npm run dev:client
```

The Vite dev server runs on **http://localhost:5173** and proxies `/api`, `/socket.io`,
and `/app-config.js` to the Node server on port 3000. Use port 5173 during development
to get hot module replacement.

---

## Production build

```bash
# Build the frontend bundle into dist/
npm run build

# The Express server auto-detects dist/ and serves it instead of public/
npm start
```

`npm run build` runs `vite build`. The output goes to `dist/`. When `dist/` exists,
`server.js` serves it with a 1-day `Cache-Control` max-age; otherwise it falls back to
the raw `public/` directory (useful when running without a build step in development).

---

## Deployment checklist

- [ ] `NODE_ENV=production`
- [ ] `SESSION_SECRET` set to a long random string (`openssl rand -hex 32`)
- [ ] `TRUST_PROXY=true` if behind Nginx / Heroku / Render / Railway
- [ ] `CORS_ORIGINS` set to your actual domain(s), or let the app fall back to `APP_BASE_URL` / `RENDER_EXTERNAL_URL`
- [ ] `DATABASE_URL` set if you want persistent player profiles
- [ ] `npm run build` executed before starting the server
- [ ] Only **one** process / replica unless Redis store is configured
- [ ] Health check endpoint: `GET /api/health`
- [ ] Readiness check endpoint: `GET /api/readiness`

If profiles or leaderboards are unexpectedly disabled in production, check the startup log for:

- `databaseEnabled: false`
- `Database connection string not configured; profile persistence is disabled`

That means no supported database connection string variable reached the runtime process.

---

## Hosting examples

### Railway / Render / Fly.io

```
Build command:  npm run build
Start command:  npm start
```

### Docker Hub publish from GitHub Actions

1. Create a Docker Hub account and a scoped access token.
   - Use your Docker ID, not your email address, for `DOCKERHUB_USERNAME`
   - Create the token with at least `Read & Write` access so CI can push images
   - If you publish to an organization namespace, use a token that has access to that namespace/repository
2. Create the Docker Hub repository `multiplayer-number-guesser` under that namespace if it doesn't already exist.
3. Add these repository secrets in GitHub:
   - `DOCKERHUB_USERNAME`
   - `DOCKERHUB_TOKEN`
   - Optional: `DOCKERHUB_NAMESPACE` if you want to publish under an organization or a namespace different from your login username
4. Push to `main` or create a tag like `v1.0.0`.
5. GitHub Actions will publish:
   - `latest` on the default branch
   - branch/tag refs
   - a `sha-...` image for traceability

Example pull:

```bash
docker pull <dockerhub-user>/multiplayer-number-guesser:latest
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e SESSION_SECRET=<your-secret> \
  -e APP_BASE_URL=http://localhost:3000 \
  -e CORS_ORIGINS=http://localhost:3000 \
  -e SOCKET_CORS_ORIGINS=http://localhost:3000 \
  <dockerhub-user>/multiplayer-number-guesser:latest
```

### GitHub branch protection

To make CI actually gate deployment, configure branch protection on `main` in GitHub:

- Require a pull request before merging
- Require status checks to pass before merging
- Select these checks:
  - `Lint & Format`
  - `Unit & Integration Tests`
  - `Production Build`
  - `End-to-End Tests`
  - `Docker Build & Smoke Test`
- Require branches to be up to date before merging

This repository workflow enforces the checks. Branch protection is the GitHub setting that turns those checks into a real merge gate.

### Heroku

```bash
heroku config:set NODE_ENV=production SESSION_SECRET=$(openssl rand -hex 32) TRUST_PROXY=true
git push heroku main
```

Set `Procfile`:

```
web: npm start
```

### Docker

```bash
docker build -t numduel .
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e SESSION_SECRET=<your-secret> \
  numduel
```

See `docker-compose.yml` for a local Redis + app setup.

---

## Health monitoring

```
GET /api/ping      — lightweight ping (returns 200 without DB/Redis access; best for keeping Render awake)
GET /api/health    — liveness probe (always returns 200 if process is running)
GET /api/readiness — readiness probe (200 when store + database are healthy)
GET /api/stats     — active parties and player counts
```
