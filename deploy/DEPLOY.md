# Deploying PM Confessional to Google Cloud

This migrates the app off Replit to **Cloud Run + Cloud SQL (PostgreSQL 16 + pgvector)**.

**Topology:** one Cloud Run service. The Express API server (`artifacts/api-server`)
also serves the built React SPA (`artifacts/pm-confessional`), so the frontend's
relative `/api/...` calls work from a single origin — no CORS, no second URL.

```
            ┌─────────────────────────── Cloud Run service ───────────────────────────┐
  browser → │  Express :8080   →  /api/*        → routes (Anthropic, Gemini, Postgres) │
            │                  →  everything else → static SPA (dist/public)            │
            └───────────────────────────────────┬──────────────────────────────────────┘
                                                 │ unix socket /cloudsql/...
                                       Cloud SQL (PostgreSQL 16 + pgvector)
```

Anything that builds locally (verified: `pnpm install`, both builds, server boot,
`/api/healthz`, SPA fallback) will build in Cloud Build. The only steps that need
**your** auth/billing are the `gcloud` calls below.

> **Note on the lockfile:** the committed `pnpm-lock.yaml` was out of sync with
> `pnpm-workspace.yaml` (extra `overrides`), which breaks `--frozen-lockfile`.
> It has been regenerated and is now consistent — commit it (see step 7).

---

## 0. Prerequisites (one-time)

```bash
# Install: gcloud CLI (https://cloud.google.com/sdk/docs/install) and the
# postgres client (psql 16+). Then authenticate — run these yourself:
gcloud auth login
gcloud auth application-default login

# Pick / create a project and set defaults.
export PROJECT_ID="pm-confessional"        # or an existing project
export REGION="us-central1"
gcloud config set project "$PROJECT_ID"
gcloud config set run/region "$REGION"

# Enable the APIs we use.
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com
```

---

## 1. Create the Cloud SQL instance (PostgreSQL 16 + pgvector)

```bash
export SQL_INSTANCE="pmc-pg"
export DB_NAME="pmconfessional"
export DB_USER="pmc"
export DB_PASS="$(openssl rand -base64 24)"   # save this; you'll need it below

# db-g1-small is plenty for this workload; bump later if needed.
gcloud sql instances create "$SQL_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-g1-small \
  --region="$REGION" \
  --storage-type=SSD --storage-size=10GB \
  --no-assign-ip                       # private only; we reach it via the Auth Proxy / connector

# If --no-assign-ip gives you trouble for the one-off restore, you can add
# --assign-ip and use the Auth Proxy over public IP instead. Either works.

gcloud sql databases create "$DB_NAME" --instance="$SQL_INSTANCE"
gcloud sql users create "$DB_USER" --instance="$SQL_INSTANCE" --password="$DB_PASS"

# pgvector is available on Cloud SQL; the dump runs CREATE EXTENSION itself, so
# nothing to pre-create here. (The restoring user can create it.)

# Full instance connection name — needed by Cloud Run and the proxy.
export SQL_CONN="$(gcloud sql instances describe "$SQL_INSTANCE" --format='value(connectionName)')"
echo "SQL_CONN=$SQL_CONN"   # looks like: pm-confessional:us-central1:pmc-pg
```

---

## 2. Restore the Replit dump

Run the Cloud SQL Auth Proxy in one terminal, then restore in another.

```bash
# Terminal A — proxy listens on localhost:5432
# Download once: https://cloud.google.com/sql/docs/postgres/sql-proxy#install
./cloud-sql-proxy "$SQL_CONN" --port 5432

# Terminal B — restore (the script auto-finds the newest *.sql.gz in repo root)
cd /home/sheldongomes/AIProjects/pm-confessional
./deploy/restore-db.sh "postgresql://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME"
```

The script confirms before writing, restores in a single transaction, then prints
row counts and the `regrets` indexes (you should see the pgvector HNSW index).

---

## 3. Get the application API keys

| Secret | Where to get it |
|---|---|
| Anthropic API key | <https://console.anthropic.com> → API Keys |
| Gemini API key | <https://aistudio.google.com/apikey> (free tier OK) |
| PostHog personal API key | PostHog → Settings → Personal API keys (project **PMConfessional**, id `415646`) |
| Lenny's Data MCP token | only needed to ingest *new* episodes — skip for now |

The Anthropic base URL changes from the Replit proxy to the real API:
`https://api.anthropic.com`.

---

## 4. Store secrets in Secret Manager

```bash
# DATABASE_URL uses the Cloud SQL unix socket (no SSL certs needed on Cloud Run).
printf 'postgresql://%s:%s@/%s?host=/cloudsql/%s' \
  "$DB_USER" "$DB_PASS" "$DB_NAME" "$SQL_CONN" \
  | gcloud secrets create DATABASE_URL --data-file=-

printf '%s' "YOUR_ANTHROPIC_KEY" | gcloud secrets create AI_INTEGRATIONS_ANTHROPIC_API_KEY --data-file=-
printf '%s' "YOUR_GEMINI_KEY"    | gcloud secrets create GEMINI_API_KEY --data-file=-
printf '%s' "YOUR_POSTHOG_KEY"   | gcloud secrets create POSTHOG_PERSONAL_API_KEY --data-file=-
# Optional, only for ingestion:
# printf '%s' "YOUR_LENNYS_TOKEN" | gcloud secrets create LENNYS_DATA_MCP_TOKEN --data-file=-
```

Grant the Cloud Run runtime service account access (it defaults to the Compute SA):

```bash
export PROJECT_NUM="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
export RUN_SA="${PROJECT_NUM}-compute@developer.gserviceaccount.com"

for S in DATABASE_URL AI_INTEGRATIONS_ANTHROPIC_API_KEY GEMINI_API_KEY POSTHOG_PERSONAL_API_KEY; do
  gcloud secrets add-iam-policy-binding "$S" \
    --member="serviceAccount:$RUN_SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 5. Build & deploy to Cloud Run

`gcloud run deploy --source .` builds the `Dockerfile` with Cloud Build and
deploys in one step. (Make sure the `*.sql.gz` dump is git-ignored / not in the
build context — `.dockerignore` already excludes it.)

```bash
cd /home/sheldongomes/AIProjects/pm-confessional

gcloud run deploy pm-confessional \
  --source . \
  --region "$REGION" \
  --allow-unauthenticated \
  --add-cloudsql-instances "$SQL_CONN" \
  --set-env-vars "NODE_ENV=production,BASE_PATH=/,PUBLIC_DIR=/app/public,LOG_LEVEL=info,AI_INTEGRATIONS_ANTHROPIC_BASE_URL=https://api.anthropic.com,POSTHOG_PROJECT_ID=415646" \
  --set-secrets "DATABASE_URL=DATABASE_URL:latest,AI_INTEGRATIONS_ANTHROPIC_API_KEY=AI_INTEGRATIONS_ANTHROPIC_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest,POSTHOG_PERSONAL_API_KEY=POSTHOG_PERSONAL_API_KEY:latest" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 4
```

Notes:
- **Do not set `PORT`** — Cloud Run injects it (8080); the server reads it.
- `--min-instances 0` scales to zero (cheapest). Set to `1` to avoid cold starts.
- The frontend PostHog keys are baked into the SPA at build time via Dockerfile
  build args (defaults match the old Replit values). To change them, pass
  `--build-env-vars` is not supported by `run deploy --source`; instead build
  explicitly: `gcloud builds submit --tag ...` with `--substitutions`, or edit the
  `ARG` defaults in the `Dockerfile`.

---

### Reproducible rebuilds (after the first deploy)

For repeatable, SHA-tagged builds (and CI), use the committed `cloudbuild.yaml`
instead of `--source .`:

```bash
# One-time: an Artifact Registry repo to hold the images.
gcloud artifacts repositories create pm-confessional \
  --repository-format=docker --location="$REGION"

# Build + push + deploy in one shot (tags image with the commit SHA).
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SQL_CONN="$SQL_CONN"
```

Roll back by deploying a previous SHA tag:
`gcloud run deploy pm-confessional --image .../pm-confessional:<SHA> --region "$REGION"`.

---

## 6. Verify

```bash
export URL="$(gcloud run services describe pm-confessional --region "$REGION" --format='value(status.url)')"
curl -s "$URL/api/healthz"        # → {"status":"ok"}
curl -s "$URL/api/regrets/stats"  # → real numbers from the restored DB
open "$URL"                        # the SPA
```

Walk the app: search a few confessions, start a Decision Coach session (exercises
Gemini embeddings + Anthropic), and confirm events land in PostHog.

---

## 7. Commit the migration changes & point the repo away from Replit

```bash
cd /home/sheldongomes/AIProjects/pm-confessional
git checkout -b gcp-migration
git add Dockerfile .dockerignore .gitignore .env.example deploy/ \
        pnpm-lock.yaml artifacts/api-server/src/app.ts
git commit -m "Add Google Cloud (Cloud Run + Cloud SQL) deployment"
git push -u origin gcp-migration   # open a PR, or push to main if you prefer
```

---

## 8. Optional follow-ups

- **Custom domain:** `gcloud run domain-mappings create --service pm-confessional --domain <your-domain>`.
- **Ongoing ingestion:** the `/api/ingest/*` routes and `scripts/` need
  `LENNYS_DATA_MCP_TOKEN`. Add that secret and run ingestion as a one-off
  Cloud Run Job rather than in the web service.
- **Cost:** Cloud Run scales to zero; the steady cost is the Cloud SQL instance
  (~$10–25/mo for db-g1-small). Stop the instance when not demoing to save money.
- **Backups:** enable automated Cloud SQL backups
  (`gcloud sql instances patch "$SQL_INSTANCE" --backup-start-time=03:00`).
