# Read-model runbook (SPENDLY-494)

This runbook is for operating the Firestore → Supabase read model. Firestore stays the source of truth. Supabase is a copy that the sync job keeps up to date, and nothing in the app writes to it.

| Piece | Where |
|---|---|
| Sync job | `.github/workflows/readmodel-sync.yml`, runs `scripts/readmodel-sync.ts`. Every 3 h it copies only what changed; at 02:00 IST it copies everything (SPENDLY-506) |
| Health check | `.github/workflows/readmodel-health.yml`, runs `scripts/readmodel-health.ts` hourly at :45 (SPENDLY-507) |
| Supabase project | `spmsgncjbnbkxvsbpqlu`. Tables: `sync_runs`, `sync_failures`, `sync_status`, `sync_checkpoints` |
| Design | `docs/SPENDLY-494-adr.md` §0 and §8 |

## How you find out something is wrong

The **Read-model sync health** workflow goes red. GitHub emails the repository owner about failed workflow runs, and the run's **step summary** lists the problems with metrics. It names collections and counts, never users.

| Health problem | What it means | What to do |
|---|---|---|
| Supabase is unreachable or paused | Supabase Free pauses a project after a week without activity, or the project is down | Restore the project in the Supabase dashboard. Screens fall back to Firestore by themselves (SPENDLY-511). The next sync run catches up; nothing is lost |
| No sync run for over 4 h | The schedule is off or stuck | Check Actions → Read-model sync. Is it enabled? Is `READMODEL_SYNC_ENABLED` `true`? GitHub **disables schedules after 60 days without repository activity**; re-enable the workflow |
| No full sync run for over 26 h | The nightly run is missing or failing | As above. Deletes and edits from older app versions aren't being caught |
| The latest sync run failed | The job crashed: secrets, Firestore or Supabase errors | Open the run's log. Fix the cause, then **Run workflow** (`mode=incremental`, `dry_run=false`) |
| Failures older than 24 h: `<collection> (mapping)` | A document has a value the read model can't type, such as a non-numeric amount. Its row is stored `unmapped`, with typed columns null | Find it in Supabase (`sync_failures`: doc id and field) and correct the source document in the app. The next pass maps it and resolves the failure by itself |
| `<collection> (pair_failed)` | Reading or writing one user's collection failed | It retries every run. If it persists, the run log has the reason (with a hashed uid) |
| `* (orphan_uid)` | A full sync found read-model data for an account that no longer exists in Firestore: it was deleted without its read-model purge (SPENDLY-508), probably because the Netlify site lacked the read-model settings | Erase it. In the SQL editor, as service role, run `select public.readmodel_purge_user('<uid>');`. The uid is in `sync_failures`. The purge also clears the failure. Then check `READMODEL_SUPABASE_URL` and `READMODEL_SUPABASE_SERVICE_ROLE_KEY` are set on the Netlify site |
| `<collection> (mass_tombstone_guard)` | A full pass found more than half of a user's rows in a table missing, so it refused to mark them deleted | Check Firestore. If the user really deleted them, tombstone them by hand (below). If it was a bad read, the next clean full pass resolves it |
| p95 copy age over 4 h | Copies are going stale | Usually a symptom of one of the problems above; check the runs list in the summary |
| Warning: runs skipped for the daily read budget | The sync used its 12K Firestore reads per day | Expected only in a backlog. If it repeats, check `reads_used` per run in `sync_runs` |

## Replay and recovery

There is no separate replay step. Every run re-reads the **current** Firestore document, and the upsert is version-guarded. So:
- **A failed run:** no high-water mark advanced, and the next run re-covers the same window.
- **To force a catch-up now:** Actions → Read-model sync → **Run workflow**, `mode=full`, `dry_run=false`.
- **Running it twice is harmless:** the second run changes nothing.
- **Rebuild from scratch:** truncate the read-model tables, then run a full sync. Firestore is untouched.

**Manual tombstone,** after you've checked a mass-tombstone guard in Firestore. Run as the service role in the SQL editor:

```sql
select public.readmodel_tombstone('<table>', '<uid>', array['<doc id>', ...]);
update public.sync_failures set resolved_at = now()
 where uid = '<uid>' and collection = '<collection>' and error_class = 'mass_tombstone_guard' and resolved_at is null;
```

## Turning it off

| Goal | Action |
|---|---|
| Stop syncing | Set `READMODEL_SYNC_ENABLED` to anything but `true` (stops both workflows), or disable them under Actions |
| Stop reads from Supabase | The per-screen kill switch (SPENDLY-511), or leave the app's `EXPO_PUBLIC_READMODEL_*` empty |
| Cut client access entirely | `revoke select on all tables in schema public from authenticated;` |

## Monthly check (first Monday)

- [ ] Actions → **Read-model sync** and **Read-model sync health** are enabled and green. GitHub disables schedules after 60 days without repository activity.
- [ ] `sync_runs`: Firestore `reads_used` per day is well under the 12K budget.
- [ ] `sync_failures`: nothing open older than a day.
- [ ] Supabase dashboard: the project isn't near a Free-plan limit (500 MB database, egress).

## Secrets and variables

| Name | Kind | Used by |
|---|---|---|
| `READMODEL_FIREBASE_SERVICE_ACCOUNT` | Actions secret: a service account with **Cloud Datastore Viewer** only | sync |
| `READMODEL_SUPABASE_SERVICE_ROLE_KEY` | Actions secret | sync, health |
| `READMODEL_SUPABASE_URL` | Actions variable | sync, health |
| `READMODEL_SYNC_ENABLED` | Actions variable, `true` to schedule | sync, health |
| `READMODEL_MAX_READS_PER_DAY` | Actions variable, optional (default 12000) | sync, health |
| `READMODEL_SUPABASE_URL`, `READMODEL_SUPABASE_SERVICE_ROLE_KEY` | **Netlify site** environment variables | `delete-account`: the `readmodel` purge phase (SPENDLY-508) |

None of these may appear in app code or as an `EXPO_PUBLIC_` variable. `scripts/readmodelSecrets.test.ts` enforces that.
