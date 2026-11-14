# Deploying HERMES to Vercel with Supabase

Target URL: **https://hermes-nasa.vercel.app** (the project name `hermes-nasa`; Vercel
will append a suffix if the name is taken).

The repository is already wired for Vercel's **Services** model:

| Service | Root | What Vercel builds |
|---|---|---|
| `frontend` | `frontend/` | Vite production build, SPA deep-link rewrite in `frontend/vercel.json` |
| `backend` | `backend/` | FastAPI ASGI app from `app.main:app` (Python function, `maxDuration` 60 s) |

`vercel.json` routes `/api/*`, `/ready` and `/health` to the backend and everything else to
the frontend, so the browser keeps calling same-origin `/api/v1/...`.

---

## 1. Database connection (important)

Supabase offers two connection strings:

- **Direct** — `db.<ref>.supabase.co:5432`. It is **IPv6-only** on current projects.
- **Pooler (Supavisor)** — `aws-0-<region>.pooler.supabase.com:6543` (transaction mode) or
  `:5432` (session mode). This has IPv4 and is what serverless platforms need.

Use the **pooler** string in `DATABASE_URL`. The app tolerates either form:

- a plain `postgresql://` URL is upgraded to the psycopg 3 driver automatically
  (`postgresql+psycopg://`), and Supabase hosts get `sslmode=require`;
- a pooler URL switches SQLAlchemy to `NullPool` and disables psycopg's prepared
  statements, which transaction pooling cannot preserve.

```
DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

> Rotate the database password before going live if it has been shared anywhere
> (dashboard → Project Settings → Database → Reset password).

## 2. Bootstrap the database

Run these from `backend/` on a machine that can reach the pooler (set `DATABASE_URL`
first). They create the schema, the source registry and the operator account:

```powershell
$env:DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"

..\.venv\Scripts\python -m alembic upgrade head
..\.venv\Scripts\python -m scripts.seed_sources
..\.venv\Scripts\python -m scripts.create_admin --email you@example.com
#   omit --password to be prompted (recommended: it stays out of shell history)
```

Optional — copy the local dataset (177k detections, ~24 MB) into Supabase:

```powershell
pg_dump --data-only --no-owner --no-privileges --exclude-table=alembic_version `
  -h 127.0.0.1 -U postgres firewatch > firewatch-data.sql
psql "$env:DATABASE_URL" -f firewatch-data.sql
```

Only the data is dumped; the schema is created by Alembic in the step above. Re-run
`alembic upgrade head` afterwards and restart any running API.

## 3. Environment variables (Vercel → Project → Settings → Environment Variables)

| Name | Value | Notes |
|---|---|---|
| `DATABASE_URL` | pooler URL from step 1 | required |
| `ENVIRONMENT` | `production` | enables production behaviour and hides dev affordances |
| `CORS_ORIGINS` | `https://hermes-nasa.vercel.app` | same origin, but keeps cookies/preflights explicit |
| `FIRMS_MAP_KEY` | your NASA key | only needed if ingestion runs from the deployment |
| `LOCAL_DATA_DIRECTORY` | `/tmp/data` | function filesystems are read-only except `/tmp` |
| `LOG_JSON` | `true` | structured logs in Vercel's log view |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | — | not used automatically; create the admin with the script |

Do **not** commit `.env` or paste the key into `vercel.json`.

## 4. Import the project

Vercel's API is not reachable from some networks (the CLI fails with
`ETIMEDOUT api.vercel.com`), so the reliable path is the dashboard:

1. <https://vercel.com/new> → **Import Git Repository** → `Enendugodwin/Hermes`.
2. Project name: `hermes-nasa`.
3. Framework preset: **Other** — `vercel.json` defines both services.
4. Add the environment variables above to **Production** (and Preview if wanted).
5. **Deploy**. First build installs `backend/requirements.txt` for the function and runs
   `npm ci && npm run build` inside `frontend/`.

CLI alternative once the API is reachable:

```powershell
npx vercel link      # choose the hermes-nasa project
npx vercel --prod
```

## 5. Verify

```powershell
curl https://hermes-nasa.vercel.app/ready
curl https://hermes-nasa.vercel.app/api/v1/system/boot
```

Open the site: the first-load sequence runs the four live checks (platform, FireSeal,
harmonization, data) and only reveals the workspace when all pass. Then sign in at
`/login` with the admin created in step 2.

## 6. Limits worth knowing on serverless

- **No bulk ingestion in the function.** FIRMS backfills are long-running and write tens of
  thousands of rows; run them locally or on a worker against the same Supabase database.
  The API stays read/query + small admin writes.
- **Ephemeral disk.** FireSeal archive exports written under `/tmp/data` disappear with the
  instance. Durable provenance exports belong in R2/S3 (the storage settings already exist).
- **Function size.** `backend/requirements.txt` includes Polars, DuckDB and ReportLab; if a
  build exceeds the function bundle limit, move the API to a container host and keep
  Vercel for the frontend (`VITE_API_BASE_URL` then points at the API host).
- **Cold starts.** The boot probe tolerates a slow first request; `maxDuration` is 60 s.
