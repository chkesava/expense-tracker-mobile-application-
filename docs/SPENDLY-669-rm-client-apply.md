# SPENDLY-669 — `rm_client_apply`: the app's only write path into the read model

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2, ADR v2 §2) |
| Branch | `feature/SPENDLY-669-rm-client-apply` |
| Migration | `supabase-readmodel/supabase/migrations/20261030000000_readmodel_client_apply.sql` |
| Tests | `supabase-readmodel/tests/client_apply.sql` (new; in CI), `assert_security.sql` §8 |

## What it adds

1. **`written_by`** (`client` | `server`, default `server`) and **`client_written_at`** on all 12 synced tables. Existing rows become `server`.
2. **`rm_client_apply(p_table, p_rows, p_deletes)`**, `security definer`, `search_path = ''`, executable only by `authenticated`:
   - **Identity:** `readmodel_auth.uid()` (the same check as every read policy). Duress, expired, wrong-issuer, wrong-audience and anon claims are refused, and so are purged accounts.
   - **Allowlist:** `readmodel_client_table_ok()`, the 12 synced tables. Later stories add theirs.
   - **Shape:**
     - every row's `uid` is the caller's;
     - `doc_id` is non-empty;
     - `doc` is a JSON object;
     - `source_path` starts with `users/<caller>/`;
     - `client_written_at` is present and no more than 1 day in the future;
     - typed values cast or the whole call fails;
     - at most 50 rows and 50 deletes per call.
   - **Version guard.** A client row lands over:
     - no row;
     - an older client write;
     - a server row older than it, which wasn't deleted after it.

     `source_update_time` is set to the client time.
   - **Deletes** are version-guarded tombstones. Their key comes from the table's primary key, so nested tables (591) need no signature change.
   - **Returns** `{upserted, tombstoned}`. Any invalid input refuses the whole call.
3. **Firestore wins.** `readmodel_upsert`, `readmodel_repair` and `readmodel_tombstone` now:
   - leave the two new columns out of their column lists (otherwise every sync would insert NULL into `written_by`);
   - stamp `written_by = 'server'`;
   - **always replace a client row**, whatever its time.
4. **Tables stay SELECT-only** for clients. Tests prove that a direct insert or update is refused.

## Tests (local `postgres:17`, as CI runs them)

- **Every SQL test file passes from a fresh database:** `assert_security` (twice), `rls_behaviour`, `sync_functions`, `purge`, `verify`, `views`, `golden`, `push` and the new `client_apply`.
- **The new migration re-applies cleanly**, so it is re-runnable.
- **`client_apply.sql` covers:**
  - an own write;
  - another user's row;
  - an unknown table and a bookkeeping table;
  - a missing time, a non-object doc, a foreign path, a far-future time, a bad typed value and a batch of 51 (no partial writes);
  - duress, expired, other issuer, other audience and the anon role;
  - direct insert and update refused;
  - the version guard against older and newer client writes, and against older and newer server rows;
  - a tombstone, its RLS hiding, and no resurrection;
  - the server upsert, repair and tombstone replacing client rows;
  - every allowlisted table;
  - **perf: a 50-row batch p95 of 3.58 ms** (budget 100 ms).
- **Not run:** the recovery drills (`drills/run_drills.sh` needs a PostgREST binary; CI doesn't run them either). They cover the sync and push, whose upsert behaviour for server rows is unchanged apart from replacing client rows, which `client_apply.sql` tests.

## Rollout

1. Apply the migration to production: `npx supabase db push --linked --workdir supabase-readmodel`. **Dry run first, then the user's approval** (R7). It is additive: two columns with a constant default and replaced functions. The nightly sync and push keep working, since they send no `written_by`.
2. Nothing calls `rm_client_apply` until SPENDLY-670 (the on-device outbox) ships.
3. **The rule wording in ADR v2 §6** (R1.1, R6.2 and `CLAUDE.md`) goes in with the user's approval.
