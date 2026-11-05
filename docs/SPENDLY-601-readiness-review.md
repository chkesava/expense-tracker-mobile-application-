# SPENDLY-601: drills and readiness review for Supabase-first reads (plan v2)

| | |
|---|---|
| Epic | SPENDLY-586 (plan v2) |
| Branch | `feature/SPENDLY-601-drills-readiness` |
| Migration | none |
| Sign-off | **Signed off by the user, 2026-11-05**, after the harness drills passed 11/11 |

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

**Run on 2026-11-05 by the user: 11 of 11 passed** (section 3; full timestamped log in `docs/SPENDLY-601-drill-log.md`). To run it again:

```
initdb -D <dir> -U postgres -A trust && pg_ctl -D <dir> -o "-p 55432" start
POSTGREST_BIN=<path to postgrest.exe> bash supabase-readmodel/drills/run_drills.sh
```

Windows note: give `POSTGREST_BIN` as a Windows path (`C:/tools/postgrest/postgrest.exe`); Node can't run a Git Bash path (`/c/...`), and fails with `spawn UNKNOWN`.

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
- ~~Run the harness, D1–D11~~: done 2026-11-05, 11/11 passed.
- ~~The user's sign-off~~: signed off 2026-11-05.

**After the merge (not blocking the sign-off):**
- Device checks after the release: the palette at launch (674), goals' "waiting to sync" (599), and an expense saved offline moving the tiles (599).

## 3. Harness results

Run 2026-11-05 12:58 UTC on the user's laptop (PostgREST 16.5, Postgres 18, the Firebase emulator), branch at `18991e69`. **11 of 11 passed.** Full log: `docs/SPENDLY-601-drill-log.md`.

| Drill | Expected | Observed | Result |
|---|---|---|---|
| D1 rebuild | zero divergence after a rebuild from nothing | converged: 80 rows match, 0 issues; sync 12030 ms, 147 reads; verify exit 0 | PASS |
| D2 sync outage | the 3-hourly run catches up adds, edits, soft deletes and (always-full) transfer deletes; the nightly full run tombstones the hard-deleted expense; then zero divergence | incremental left: extra expenses/c3; after the full run: converged: 79 rows match, 0 issues | PASS |
| D3 Supabase outage | the sync fails loudly during the outage and converges on the next run; the app side is proven by lib/readModel/outageDrill.test.ts | outage run exit 1; next run exit 0; converged: 80 rows match, 0 issues | PASS |
| D4 kill switch | all screens flip to firestore and back by changing one remote document; other settings untouched | off: true; back to shadow: true; other settings kept: true | PASS |
| D5 bad mapping | the bad deploy alerts at once (its own run is partial, parity failures, non-zero exit) and shows in v_data_quality; rolling back and running the full sync repairs every row; the run after that is clean | bad run: partial, 17 parity failures; 18 rows wrong, detected; rollback run exit 1 → converged: 81 rows match, 0 issues; next run exit 0 | PASS |
| D6 account purge | every drill-b row is erased; a later full sync (Firestore still holding drill-b) does not bring it back; drill-a untouched | purge {"rows":158}; resync exit 0; converged: 39 rows match, 0 issues; drill-a intact: true | PASS |
| D7 per-write push | a saved expense, its edit and its hard delete reach the read model in one push each; fake data in a request is ignored; an erased account is refused; a per-user push copies an unnamed change; a push during an outage fails without affecting Firestore and the nightly run converges | create 200→77, edit 200→78, delete 200→tombstoned true, erased 403, user sync 200 (push), outage 599, nightly 0: converged: 40 rows match, 0 issues | PASS |
| D8 client-write outage | the outbox holds the app's writes while the read model is down and drains on recovery; each write lands once (a replay changes nothing) | held 3 during the outage; 0 left after recovery; landed 3/3 as client rows; replay unchanged: true | PASS |
| D9 client-write rejection | the database refuses the bad row and stores nothing; the outbox drops it instead of retrying forever; the nightly full run copies Firestore's version | refused: true; stored after refusal: false (before: false); outbox 0; nightly exit 0 → amount 55 (server); converged: 44 rows match, 0 issues | PASS |
| D10 dual-write divergence | the full run replaces the client row with Firestore's version and counts the divergence (the health alert's input) | before 90 (client) → after 100 (server); divergences.expenses 1 | PASS |
| D11 one-write rollback | readmodel-set-mode --switch=localCopy --value=false sends every collection back to Firestore on every device in one write, with no release; nothing else changes | before: 3 on supabase; after: all firestore true; settings kept true | PASS |
