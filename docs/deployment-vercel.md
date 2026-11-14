# Deploying HERMES to Vercel with Neon Postgres

Live deployment: **https://hermes-nasa.vercel.app** (project `hermes-nasa`,
team `odigiepeters-projects`).

The repository is wired for Vercel's **Services** model:

| Service | Root | What Vercel builds |
|---|---|---|
| `frontend` | `frontend/` | Vite production build, SPA deep-link rewrite in `frontend/vercel.json` |
| `backend` | `backend/` | FastAPI ASGI app from `app.main:app` (Python function) |

`vercel.json` routes `/api/*`, `/ready` and `/health` to the backend and everything else to the
frontend, so the browser keeps calling same-origin `/api/v1/...`.

---

## 1. Database: Neon

Use the **pooled** connection string (`-pooler` in the host, port 5432):

```
DATABASE_URL=postgresql://<user>:<password>@ep-<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

The app adapts automatically:

- `postgresql://` is upgraded to the psycopg 3 driver;
- a `-pooler` host switches SQLAlchemy to `NullPool`, disables psycopg's prepared statements and
  stops sending libpq `options` (Neon's pgbouncer rejects startup parameters);
- each connection runs `SET TIME ZONE 'UTC'` and `SET search_path TO public`, because pooled
  sessions arrive without a usable `search_path`.

### IPv4 on Vercel

Neon advertises both A and AAAA records. Vercel Functions are IPv4-only, so libpq occasionally
dials the AAAA address first and fails with `Cannot assign requested address`. Pin the IPv4
address in the URL while keeping the hostname for TLS/pooler routing:

```
...neon.tech/neondb?sslmode=require&channel_binding=require&hostaddr=44.218.206.133
```

`hostaddr` is one of the endpoint's current A records (`Resolve-DnsName <host> -Type A`). If Neon
moves the endpoint, refresh this value and redeploy.

## 2. Bootstrap the database

Run from `backend/` (any machine that can reach Neon):

```powershell
$env:DATABASE_URL="postgresql://neondb_owner:<password>@ep-<endpoint>-pooler.<region>.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

..\.venv\Scripts\python -m alembic upgrade head
..\.venv\Scripts\python -m scripts.seed_sources
..\.venv\Scripts\python -m scripts.create_admin --email you@example.com
#   omit --password to be prompted (recommended: it stays out of shell history)
```

Seeding and the admin script are idempotent. The current deployment was bootstrapped this way and
carries **333,441 detections**, **182 FireSeal payload blocks**, **7,224 cross-sensor matches** and
**3,056 events** copied from the local store.

To copy data from another PostgreSQL (schema first, then data):

```powershell
pg_dump -h 127.0.0.1 -U postgres firewatch --data-only --no-owner --no-privileges `
  --exclude-table=alembic_version --exclude-table=users --exclude-table=auth_sessions `
  --exclude-table=app_settings -f neon_data.sql
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f neon_data.sql
```

`-1` makes the restore all-or-nothing: a foreign-key mismatch rolls back cleanly instead of leaving
half a dataset. If the target already holds seeded `data_sources`, delete them first so the dump's
ids can be restored.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | Neon pooled URL (+ `hostaddr`) | required |
| `ENVIRONMENT` | `production` | production behaviour, no dev affordances |
| `CORS_ORIGINS` | `https://hermes-nasa.vercel.app` | |
| `LOCAL_DATA_DIRECTORY` | `/tmp/data` | function filesystems are read-only except `/tmp` |
| `LOG_JSON` | `true` | structured logs in Vercel |

Never commit `.env` or credentials.

## 4. Deploy from this machine (no Git connection)

Vercel's API host is blocked on some networks. This project deploys from local source through the
platform API, which the script handles (including transient retries):

```powershell
# from the repository root
$env:VERCEL_TOKEN  = "<token>"
$env:VERCEL_API_IP = "64.239.123.129"   # only when api.vercel.com is blackholed
python backend\scripts\deploy_vercel.py --project hermes-nasa --team <team-id>
```

The script uploads every `git ls-files` path (ignored files such as `.env`, `.venv`,
`node_modules`, `data/` are excluded), creates a production deployment and waits for the build.

Environment-variable changes require a **new deployment**; redeploying the previous one picks them
up without re-uploading files.

## 5. Verify

```powershell
curl https://hermes-nasa.vercel.app/ready
curl https://hermes-nasa.vercel.app/api/v1/system/boot
```

Expected (current deployment):

```
[platform] ok=True : FIREWATCH X 0.1.0 · postgresql · ~44 ms · 12 modules
[fireseal] ok=True : 182 payload blocks · 333,441 pointers · 0 inline payloads
[harmonization] ok=True : 326 probable · 2,047 possible · 4,851 rejected · 3,056 events · assoc-v1
[data] ok=True : 333,441 detections · coverage to 2026-11-14 · delayed · 13 rollup days
```

Then open the site: the first-load sequence runs those four live checks and reveals the workspace
only when all pass. Sign in at `/login`.

## 6. Limits worth knowing on serverless

- **No bulk ingestion in the function.** FIRMS backfills are long-running; run them locally or on a
  worker against the same database. The deployed API is read/query plus small admin writes.
- **Ephemeral disk.** FireSeal archive exports written under `/tmp/data` disappear with the
  instance; durable provenance belongs in object storage.
- **Function size.** `backend/requirements.txt` includes Polars, DuckDB and ReportLab; if a build
  ever exceeds the bundle limit, move the API to a container host and keep Vercel for the frontend.
- **Pooled connections.** Keep the pooler endpoint for the app; use the unpooled endpoint for
  long-running migrations if a session-level command is rejected.
