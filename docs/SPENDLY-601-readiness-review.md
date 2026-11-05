# SPENDLY-601: drills and readiness review for Supabase-first reads (plan v2)

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-601-drills-readiness` |
| Migration | none |
| Sign-off | **The user**, after the harness drills below have run on their machine |

## 1. The drills

### App side (read path): `lib/readModelLocal/outageDrills.test.ts`, run 2026-11-05

These use the real pieces: the on-device copy, realtime, the read store and the switch decision. Only the network is a fake read model that can be taken down.

| Drill | Expected | Observed | Result |
|---|---|---|---|
| R1 realtime down | The copy keeps up by polling the catch-up; polling stops once live again | Channel error → "down"; a save from another device arrived through the poll; "live" again on reconnect | PASS |
| R2 airplane mode | Every row is served offline, with this device's unsent save on top. A cold launch offline reopens the copy; back online, it catches up | Rows and the overlay are served, and money is exact (1500.25). **A cold launch offline used to fail the copy** (the state went to "error", so every supabase collection fell back to Firestore), **fixed in this story**: it now reopens "ready", then catches up when back online | PASS (after the fix) |
| R3 Supabase paused on first launch | The copy can't fill, so every collection reads Firestore | State "error"; every collection decides "firestore" | PASS |
| R4 copy failure mid-session | That collection falls back to Firestore for the session | The read store reports the error; the decision is "fell back this session" | PASS |
| R5 one-write rollback | `readModel.localCopy = false` sends every collection to Firestore; the per-collection settings are kept for turning it back on | Every synced collection on supabase → all firestore → back to supabase | PASS |
| R6 realtime off | Back in the foreground the copy catches up; a refresh while offline keeps the copy ready | **There was no foreground refresh**, although the runbook said there was. **Added in this story**; caught up, and stays ready offline | PASS (after the fix) |

App-side drills that were already in place: D3's screens falling back with the banner (`lib/readModel/outageDrill.test.ts`); outbox retry, backoff and refusal (`lib/readModelClientWrites.test.ts`, `shared/utils/readModel/clientOutbox.test.ts`); realtime reconnect, catch-up and resync (`lib/readModelRealtime.test.ts`).

### Server side (write path): `scripts/readmodel-drill.ts`, D8–D11 added

The harness from SPENDLY-520 runs the production scripts unchanged against:
- the Firebase emulator (its own project);
- a local Postgres with every migration;
- PostgREST (Supabase's API).

| Drill | Procedure it proves | Pass condition |
|---|---|---|
| D8 client-write outage | The app saves while the read model is down | The outbox holds the 3 writes during the outage and drains on recovery. Each lands once as a client row, and replaying a batch changes nothing |
| D9 client-write rejection | `rm_client_apply` gets a corrupt row | The database refuses it and stores nothing. The outbox drops it (no retry loop). The nightly full run copies Firestore's version, and everything converges |
| D10 dual-write divergence | The app's row disagrees with Firestore (90 vs 100) | The full run replaces it with Firestore's 100 (`written_by` server) and counts `divergences.expenses` (the health alert's input) |
| D11 one-write rollback | `readmodel-set-mode.ts --switch=localCopy --value=false --apply` | Every collection decides firestore. The per-collection and other settings are kept. No release |
| D7 per-write push *(520/583)* | Covers the push outage (server writers) | The push fails during the outage without touching Firestore, and the nightly run converges |
| D5 bad mapping *(520)* | Covers a bad mapping **on a money table**: `expenses.amount` read from the wrong field | It alerts and shows in `v_data_quality`. Rolling back repairs every row |

**Not run here yet.** The harness needs a PostgREST binary, and downloading one wasn't permitted in this session. To run all of D1–D11 and produce the timestamped log:

```
initdb -D <dir> -U postgres -A trust && pg_ctl -D <dir> -o "-p 55432" start
POSTGREST_BIN=<path to postgrest.exe> bash supabase-readmodel/drills/run_drills.sh
```

Save the log over `docs/SPENDLY-520-drill-log.md` (or next to it) and paste the results table into section 3 below.

## 2. Readiness against the plan v2 invariants (`docs/SPENDLY-586-plan.md` §1)

| # | Invariant | Evidence | Status |
|---|---|---|---|
| 1 | **Firestore stays the source of truth;** Firestore wins | Every write goes to Firestore first (`commitMutations`). The full sync replaces client rows and counts divergences (672; D10). Writers whose inputs could come from the copy verify on Firestore (R4.3a: 597 bill pass, 598 portfolio snapshot, subscription auto-posting, watchlist setup, 599 net-worth point, goals, 674 category rewrites), pinned by `providerSwitch.test.ts` | Met |
| 2 | **One mapper** | The client (`buildClientEntry`) and the server (sync, push) both use `shared/utils/readModel/mapping.ts`. The client maps the cached document right after the write (670) | Met |
| 3 | **Clients write only through `rm_client_apply`** | Security invoker, `authenticated` only, allowlisted tables, the owner check, the version guard, deletes as tombstones (`supabase-readmodel/tests/client_apply.sql`, `assert_security.sql`). Tables are SELECT-only for clients. D9 shows a rejected row isn't stored | Met |
| 4 | **Duress, local test and signed out never touch Supabase** | `effectiveCollectionMode` (duress, local test and signed out all read Firestore), the copy's `canUse`, realtime's `canListen`, the outbox's `canSend` (`collectionMode.test.ts`, `localCopy.test.ts`, `readModelRealtime.test.ts`, `readModelClientWrites.test.ts`) | Met |
| 5 | **No display number gets a second owner** | Stored totals are exact copies (592's money guard, `readmodelMoneyGuard.test.ts`). Net worth, budgets and safe-to-spend come from the existing TypeScript helpers (599). No SQL computes a displayed number | Met |
| 6 | **Every collection has a Firestore fallback and a server-side kill switch** | Per collection: `readModel.<collection>` (673). For everything at once: `readModel.localCopy` (R5, D11). A session fallback on any copy failure (R4). Listeners are off only in supabase mode (`listenersOff.test.ts`). The firestore → shadow (7/14 days) → supabase steps are in the checklist, step 9 | Met |
| 7 | **Production changes:** dry run, report, approval, apply; migrations additive | Every migration in the epic was applied that way (checklist §2). Nothing in 601 touches production | Met |

**Risks from the plan:**
- **Divergence:** the outbox plus repair (D8–D10).
- **A buggy client:** the RPC's checks plus repair (D9).
- **An unrouted writer:** 671's guard (`readModelWriteHooks.test.ts`).
- **A stale or leaking copy:** realtime, the foreground refresh (R6), the wipe on sign-out, the size cap.
- **A pause or outage:** health, the fallback (R3), the outbox drain (D8). The Free plan's guardrails are in 595.

**Found and fixed during the review:**
- A cold launch in airplane mode failed the copy over to Firestore (R2).
- Without realtime, the copy never caught up within a session, although the runbook said it did (R6). The runbook now describes the actual behaviour.

**Open before the user signs off:**
- Run the harness, D1–D11.
- Device checks after the release: the palette at launch (674), goals' "waiting to sync" (599), and an expense saved offline moving the tiles (599).

## 3. Harness results

*(Paste the table from `run_drills.sh` here after the run.)*
