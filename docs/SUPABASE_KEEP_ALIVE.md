# Supabase keep-alive (SPENDLY-125)

Spendly runs on the Supabase **Free** plan. Free projects are paused after a
stretch of low database activity. Spendly keeps its data in Firestore and uses
Supabase only for Storage (`spendly-files`, `ganesh-files`) and their Edge
Functions, so a quiet week can leave Postgres untouched and the project paused.
When that happens, document uploads and signed URLs stop working until someone
restores the project.

A GitHub Actions workflow makes one tiny read-only database call every ~3 days
to prevent that. It is a low-volume keep-alive, **not** a proxy and not a
service. Supabase's current docs are authoritative; if the inactivity policy
changes, revisit the cadence here rather than calling more often:
[Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

## What runs

| Piece | Where |
|---|---|
| Workflow | [`.github/workflows/supabase-keep-alive.yml`](../.github/workflows/supabase-keep-alive.yml) |
| Cadence | `17 6 */3 * *` (06:17 UTC on days 1, 4, 7, ...). GitHub may start it late. |
| Request | `POST <SUPABASE_URL>/rest/v1/rpc/keep_alive` with the `apikey` header |
| Database side | `public.keep_alive()` — `select 1`, no table ([`supabase/keep-alive.sql`](../supabase/keep-alive.sql)) |
| Success | HTTP 200 and body `1`. Anything else fails the run. |

It reads no data, writes nothing, and cannot touch user, account or transaction
records. Nothing in the app polls or keeps Supabase alive.

## Secrets

It reuses the repository secrets the web and Android builds already have. No
new secrets and no service-role key:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — already public in the app bundle,
  and it can only call `keep_alive()`.

Never paste the values into the workflow, logs, docs or Jira.

## One-time setup

1. Supabase dashboard → **SQL editor** → run `supabase/keep-alive.sql`. The
   last query should return `keep_alive = 1`. The file is safe to rerun.
2. GitHub → **Actions** → **Supabase Keep Alive** → **Run workflow** on `main`
   (or `gh workflow run supabase-keep-alive.yml`).
3. Confirm the run is green and its summary says `Supabase keep-alive OK`.

## Troubleshooting

The failed run's error line shows the HTTP status (and PostgREST code, if any),
never the key.

| Error | Likely cause | Fix |
|---|---|---|
| `could not be reached` | Network hiccup, wrong URL, or project paused | Check `EXPO_PUBLIC_SUPABASE_URL`; check the dashboard |
| HTTP 401 / 403 | Wrong or rotated publishable key, or `anon` lost its grant | Update the secret; rerun `keep-alive.sql` |
| HTTP 404 / `PGRST202` | Function missing or schema cache stale | Run `keep-alive.sql` (it reloads the schema cache) |
| HTTP 5xx / 540 | Project paused or unhealthy | See below |
| `secret is not set` | Secret deleted or renamed | Restore it under Settings → Secrets and variables → Actions |

If the project is already paused: restore it from the Supabase dashboard (per
Supabase's current restore procedure), rerun the workflow manually, and note
the cause on the Jira ticket. A green run does not guarantee Supabase will
never pause the project.

## Rollback

1. Disable the workflow (Actions → Supabase Keep Alive → ⋯ → Disable), or
   revert the commit.
2. Optionally `drop function if exists public.keep_alive();` in the SQL editor.
3. Leave the shared secrets alone — the builds use them.
