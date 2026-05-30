#!/usr/bin/env bash
#
# Restore the Replit Postgres dump into a target Postgres (Cloud SQL or local).
#
# The dump is PostgreSQL 16 + pgvector (regrets.embedding is vector(768)) and
# already contains `CREATE EXTENSION IF NOT EXISTS vector`, so the only
# prerequisite is that the connecting role may create extensions on the target
# database (the Cloud SQL default `postgres` user can).
#
# Usage:
#   ./deploy/restore-db.sh "postgresql://USER:PASS@HOST:5432/DBNAME" [dump.sql.gz]
#
# With Cloud SQL, the easiest path is to run this against a Cloud SQL Auth Proxy
# listening on localhost (see deploy/DEPLOY.md), e.g.:
#   ./deploy/restore-db.sh "postgresql://postgres:PASS@127.0.0.1:5432/pmconfessional"
#
set -euo pipefail

CONN="${1:-}"
DUMP="${2:-}"

if [[ -z "$CONN" ]]; then
  echo "Usage: $0 <postgres-connection-string> [dump.sql.gz]" >&2
  exit 1
fi

# Default to the most recent prod dump in the repo root if not given.
if [[ -z "$DUMP" ]]; then
  DUMP="$(ls -1t "$(dirname "$0")"/../*.sql.gz 2>/dev/null | head -n1 || true)"
fi
if [[ -z "$DUMP" || ! -f "$DUMP" ]]; then
  echo "Could not find a .sql.gz dump (looked for the newest in the repo root). Pass it explicitly." >&2
  exit 1
fi

command -v psql >/dev/null || { echo "psql not found. Install postgresql-client (v16+ recommended)." >&2; exit 1; }

echo "Dump : $DUMP"
echo "Target: ${CONN%%:*}://****  (host hidden)"

# The dump was produced by pg_dump 16.10, which emits the newer \restrict /
# \unrestrict psql meta-commands. psql clients older than 16.10 error on them,
# so strip those lines when the local client is too old.
PSQL_MAJOR_MINOR="$(psql --version | grep -oE '[0-9]+\.[0-9]+' | head -n1)"
STRIP_RESTRICT=0
# crude version compare: treat <16.10 (and any 15.x/14.x) as needing the strip
case "$PSQL_MAJOR_MINOR" in
  16.1[0-9]|16.[2-9][0-9]|17.*|18.*) STRIP_RESTRICT=0 ;;
  *) STRIP_RESTRICT=1 ;;
esac

echo
read -r -p "This will DROP and recreate the dumped tables on the target. Continue? [y/N] " ans
[[ "$ans" == "y" || "$ans" == "Y" ]] || { echo "Aborted."; exit 1; }

# ON_ERROR_STOP so a failed statement aborts the whole restore loudly.
if [[ "$STRIP_RESTRICT" -eq 1 ]]; then
  echo "psql $PSQL_MAJOR_MINOR is older than 16.10 — stripping \\restrict/\\unrestrict lines."
  gunzip -c "$DUMP" | grep -vE '^\\(un)?restrict ' | psql "$CONN" -v ON_ERROR_STOP=1 --single-transaction
else
  gunzip -c "$DUMP" | psql "$CONN" -v ON_ERROR_STOP=1 --single-transaction
fi

echo
echo "Restore complete. Sanity check:"
psql "$CONN" -c "SELECT
  (SELECT count(*) FROM regrets)          AS regrets,
  (SELECT count(*) FROM episodes)         AS episodes,
  (SELECT count(*) FROM coaching_sessions) AS coaching_sessions;"
echo "pgvector index:"
psql "$CONN" -c "SELECT indexname FROM pg_indexes WHERE tablename = 'regrets';"
