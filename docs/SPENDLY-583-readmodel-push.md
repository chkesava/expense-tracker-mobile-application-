# SPENDLY-583: Push each saved change to the read model within seconds

[SPENDLY-583](https://kesavach.atlassian.net/browse/SPENDLY-583) is part of the SPENDLY-494 epic.

- **Branch:** `feature/SPENDLY-583-readmodel-push`, cut from the epic branch, which is level with `main` at `eb46150b`.
- **Why:** since 2026-10-23 the sync runs **nightly only** (PR #236), to keep the app's peak days under Firebase's free 50K reads. Without this story, other devices would see older history up to a day late once screens are switched to `supabase`. **This story must be deployed before any screen is switched.**

## Design

The app never writes to Supabase (dual-write was rejected; the reasons are in the ticket). Instead:

```
app saves to Firestore ──► Firestore commits ──► app: "these documents changed" ──► Netlify readmodel-push
                                                                                     │ verify token, check scope/limits
                                                                                     │ read each doc FROM FIRESTORE
                                                                                     ▼
                                                                     Supabase (version-guarded upsert / tombstone)
```

| Piece | File | What it does |
|---|---|---|
| Rules shared by app and server | `shared/utils/readModel/pushRefs.ts` | What can be pushed: only the 10 synced collections, only under `users/{signed-in uid}`, never duress, sane doc ids, at most 50 per request. Requests carry refs, never data |
| Server rules | `netlify/functions/_readmodelPushCore.ts` | Token verified (revocation checked) → duress refused → erased account refused → rate limit → read each document from Firestore → map with the sync's own mapper → upsert, or tombstone if gone. `{mode:"user"}` runs a changed-only sync of that one user instead |
| Server wiring | `netlify/functions/readmodel-push.ts` | Firebase Admin and Supabase service role; `livePushPorts` is also used by the recovery drill |
| App pusher | `lib/readModelPush.ts` | Collects refs and de-duplicates them. Waits 2 s so a burst of saves is one request, **waits for Firestore to commit** (offline, it simply waits), then posts. Never in Spendly Test or duress; drops refs for a user who signed out; failures are logged once and never shown |
| Hook 1 | `lib/commitMutations.ts` | Names every path it wrote: expenses, incomes, audit events, accounts, transfers, entries, payments, bill payments, due-posts, including documents outside the loaded window |
| Hook 2 | the synced collections' live listeners (`FinanceDataProvider` ×7, `CreditCardBillsProvider`, `ExpenseReferenceDataProvider` categories) | Report this device's own unsaved changes (`hasPendingWrites`). That covers the direct writers (bills, categories, investment cash) and writes queued offline in an earlier session |
| Database | `supabase-readmodel/supabase/migrations/20261028000000_readmodel_push.sql` | `push_quota` (per-account rate limit, keyed by uid hash) and `push_daily` (counters). Service-role functions; RLS on; no client grants. An account erase also clears its quota row (trigger) |
| Health | `scripts/lib/readmodelHealth.ts`, `scripts/readmodel-health.ts` | Shows today's push counters; warns at 5 or more failed pushes in a day. Push-triggered runs are ignored by "latest run failed", "last sync" and the run table |
| 14-day gate | `scripts/lib/readmodelParity.ts` | A failed push run doesn't make a day unclean (the nightly run repairs it) |
| Run label | `runSync({ trigger: "push" })` | Per-user syncs are recorded as `incremental` runs with `notes.trigger = "push"` |

**Safety properties:**
- **Firestore is the only source.** The server reads every pushed document itself. Data in a request is ignored (tested, and checked in drill D7).
- **The server is the only Supabase writer.** The app still has read-only access.
- **Version guard:** rows carry Firestore's `updateTime`, so a late or repeated push never overwrites a newer row.
- **Nightly is the safety net.** A lost push only means the change arrives at 02:00 IST.

**Server-side writers** (`delete-account`, `epf-cron`, scripts such as the summary rebuild) don't push. They rely on the nightly run. `epf-cron` writes no synced collection.

## Cost

- **Pushes:** 1 Firestore read per pushed document, about 150 a day at today's volume. A per-user sync costs about 30 reads and is only used for more than 50 documents at once.
- **Nightly:** about 4,300 reads. **Total ≈ 4,500 a day**, versus ≈ 9,100 with the old 3-hourly schedule.
- **Netlify:** one short call per burst of saves (≈ 0.1–0.3 s). Check the 300-credit meter after a month.
- **Rate limit:** 120 cost units per account per 10 minutes, so 120 documents or 4 per-user syncs. Change it with `READMODEL_PUSH_LIMIT`.

## Turning it on / off

- **On:** it works after:
  1. migration `20261028000000` is applied;
  2. a web deploy (which ships the function);
  3. an app release (which ships the hooks).

  It uses the existing Netlify variables (`FIREBASE_SERVICE_ACCOUNT`, `READMODEL_SUPABASE_URL`, `READMODEL_SUPABASE_SERVICE_ROLE_KEY`).
- **Off (rollback):** set Netlify `READMODEL_PUSH_ENABLED=false`. The function then answers 202 and does nothing, and the nightly run continues alone. No app release needed.

## Tests

| Test | Proves |
|---|---|
| `netlify/functions/readmodelPush.test.ts` (11) | Docs read from Firestore and mapped by the sync's mapper. Request data ignored. Hard delete → tombstone. Only the token's uid. 401 for missing, forged or expired tokens; 403 for duress. 400 for non-synced collections, path tricks or more than 50 refs, with nothing read. 403 for an erased account; 429 over the limit. Per-user sync cost. 502 without provider detail. 202 when switched off. CORS |
| `shared/utils/readModel/pushRefs.test.ts` (3) | Pushable = exactly the 10 synced collections; only the signed-in user's paths; de-duplication and cap |
| `lib/readModelPush.test.ts` (8) | One de-duplicated push per burst, **only after Firestore commits**. More than 50 refs → per-user sync. Never when not allowed. Refs dropped on user switch. Failures logged once, later pushes still go. `commitMutations` paths filtered (other users, duress, non-synced, outbox acks). Listener hook: only this device's pending changes, deletes included |
| `scripts/readmodelHealth.test.ts` (+2), `scripts/readmodelParity.test.ts` (+1) | Push runs ignored by health and the gate; push-failure warning; counters in the summary |
| `supabase-readmodel/tests/push.sql` (CI) | Rate limit and window reset; per-account allowance; no raw uid stored; daily counters; erasing an account clears its quota; clients can't call the functions or read the tables |
| **Drill D7** (`scripts/readmodel-drill.ts`) | End to end on the emulator, local Postgres and PostgREST, through `livePushPorts`. Each of these is in the read model in about 0.1–0.2 s: a new expense, its edit (with fake data ignored), its hard delete (tombstoned). Erased account refused. A per-user push copies an unnamed change. A push during an outage fails without touching Firestore, and the nightly run converges with 0 differences |

**Results (2026-10-23):**
- `npm test`: all files pass. `tsc` is clean.
- The SQL suite passes, including `push.sql`.
- Drills: 7/7 pass.

## Leftovers

- **Device check:** with the read model configured, save on one device and confirm the row appears in Supabase within seconds (Table editor, or the `push_daily` counters).
- **After a week of pushes in production:** bring the health check's copy-age limit (`maxLagP95Hours`, now 26 h) back down to a few hours.
