#!/usr/bin/env bash
# SPENDLY-519: read-model performance tests on a throwaway local database.
#
#   PGHOST=localhost PGPORT=55432 PGUSER=postgres bash supabase-readmodel/tests/perf/run_perf.sh
#
# Creates database `readmodel_perf` (dropping any earlier one), applies the
# Supabase role shim and every migration, loads the synthetic 30K-transaction
# user, then runs perf_queries.sql. Refuses any host but localhost/127.0.0.1:
# the load inserts ~300K fake rows and must never reach a real project.
set -euo pipefail

case "${PGHOST:-localhost}" in
  localhost|127.0.0.1) ;;
  *) echo "refusing: PGHOST must be localhost (got ${PGHOST})" >&2; exit 1 ;;
esac

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
db=readmodel_perf

psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $db" -c "create database $db"
export PGDATABASE=$db
psql -v ON_ERROR_STOP=1 -q -f "$root/tests/bootstrap_roles.sql" >/dev/null
for f in $(ls "$root"/supabase/migrations/*.sql | sort); do
  psql -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null
done
psql -v ON_ERROR_STOP=1 -q -f "$here/synthetic_load.sql"
psql -v ON_ERROR_STOP=1 -q -f "$here/perf_queries.sql"
