#!/usr/bin/env bash
# SPENDLY-520: run the read-model recovery drills on a local stack.
#
# Needs:
#   - a local Postgres (any version >= 15) you can reach as a superuser, e.g.
#       initdb -D /tmp/pg -U postgres -A trust && pg_ctl -D /tmp/pg -o "-p 55432" start
#   - PostgREST (https://github.com/PostgREST/postgrest/releases), the API
#     Supabase runs; point POSTGREST_BIN at the binary
#   - the Firebase CLI (the Firestore emulator is started for you)
#
#   POSTGREST_BIN=/path/to/postgrest DRILL_PG_URI=postgres://postgres@localhost:55432/readmodel_drill \
#     bash supabase-readmodel/drills/run_drills.sh
#
# The harness (scripts/readmodel-drill.ts) refuses a non-emulator Firestore,
# a project other than demo-readmodel-drill, a non-local Postgres or a database without "drill" in
# its name. It drops and recreates that database.
set -euo pipefail
: "${POSTGREST_BIN:?set POSTGREST_BIN to the PostgREST binary}"
export DRILL_PG_URI="${DRILL_PG_URI:-postgres://postgres@localhost:55432/readmodel_drill}"
export DRILL_WORKDIR="${DRILL_WORKDIR:-$(mktemp -d)}"
export DRILL_LOG="${DRILL_LOG:-$DRILL_WORKDIR/drill-log.md}"

# Its own emulator (port 8180, firebase.drill.json) and its own project id, so
# a Spendly Test emulator on 8080 and its data are never touched.
cd "$(dirname "$0")/../.."
npx firebase --config supabase-readmodel/drills/firebase.drill.json emulators:exec --only firestore   --project demo-readmodel-drill "npx tsx scripts/readmodel-drill.ts"
echo "drill log: $DRILL_LOG"
