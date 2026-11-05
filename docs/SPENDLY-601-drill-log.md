# SPENDLY-601: plan v2 drill log (D1–D11)

[SPENDLY-601](https://kesavach.atlassian.net/browse/SPENDLY-601), epic SPENDLY-586. Procedures: `docs/READMODEL_RUNBOOK.md` ("Recovery drills", "Plan v2 in one page"). Readiness review: `docs/SPENDLY-601-readiness-review.md`.

**Run:** 2026-11-05 (12:58 UTC), by the user on the Windows laptop, from `feature/SPENDLY-586-supabase-first-reads` at `18991e69`:
- **Firebase emulator:** its own project `demo-readmodel-drill`, port 8180.
- **Database:** Postgres 18 on localhost:55432, database `readmodel_drill`, with every migration up to `20261105000000`.
- **API:** PostgREST 16.5, the API Supabase runs, behind a `/rest/v1` proxy.

The production scripts ran unchanged, driven by `scripts/readmodel-drill.ts`. **Result: 11 of 11 passed.** No production system was touched.

## Results

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

```
2026-11-05T12:58:24.814Z  [setup] emulator 127.0.0.1:8180 (demo-readmodel-drill), Postgres localhost:55432/readmodel_drill, PostgREST via http://127.0.0.1:54321
2026-11-05T12:58:31.715Z  [D1 rebuild] read-model database dropped and recreated; every migration applied
2026-11-05T12:58:35.045Z  [D1 rebuild] emulator seeded: drill-a, drill-b with the SPENDLY-503 golden ledger, plus a duress tree
2026-11-05T12:58:40.515Z  [D1 rebuild] dry run first: exit 0, reads 147
2026-11-05T12:58:52.545Z  [D1 rebuild] full sync (the backfill): exit 0, 12030 ms, Firestore reads 147
2026-11-05T12:59:00.167Z  [D1 rebuild] count parity (readmodel-verify): exit 0
2026-11-05T12:59:02.640Z  [D1 rebuild] PASS: converged: 80 rows match, 0 issues; sync 12030 ms, 147 reads; verify exit 0
2026-11-05T12:59:02.704Z  [D2 sync outage] with the sync stopped: 1 expense added, 1 edited, 1 soft-deleted, 1 expense and 1 transfer hard-deleted
2026-11-05T12:59:05.011Z  [D2 sync outage] before catching up: NOT converged: 2 differs expenses, 1 missing expenses, 1 extra expenses, 1 extra account_transfers
2026-11-05T12:59:17.846Z  [D2 sync outage] incremental run: exit 0, reads 268; NOT converged: 1 extra expenses (extra expenses/c3)
2026-11-05T12:59:31.459Z  [D2 sync outage] PASS: incremental left: extra expenses/c3; after the full run: converged: 79 rows match, 0 issues
2026-11-05T12:59:31.974Z  [D3 Supabase outage] PostgREST stopped: the API answers 503, like a paused or unreachable project
2026-11-05T12:59:42.356Z  [D3 Supabase outage] sync during the outage: exit 1 (non-zero fails the GitHub job, which alerts)
2026-11-05T12:59:42.965Z  [D3 Supabase outage] PostgREST restarted; one expense was written during the outage
2026-11-05T12:59:55.768Z  [D3 Supabase outage] PASS: outage run exit 1; next run exit 0; converged: 80 rows match, 0 issues
2026-11-05T13:00:17.383Z  [D4 kill switch] every screen set to firestore: {"journal":"firestore","insights":"firestore","cashFlow":"firestore","audit":"firestore","cashback":"firestore","goals":"firestore"}
2026-11-05T13:00:38.769Z  [D4 kill switch] PASS: off: true; back to shadow: true; other settings kept: true
2026-11-05T13:00:49.076Z  [D5 bad mapping] "deployed" a mapper that reads expenses.amount from the wrong field and ran the nightly full sync: partial, 1 upserts
2026-11-05T13:00:49.080Z  [D5 bad mapping] detected by field parity against the correct mapper: NOT converged: 18 differs expenses (18 expense amounts wrong)
2026-11-05T13:00:49.292Z  [D5 bad mapping] v_data_quality (health check input) now lists 15 row(s)
2026-11-05T13:01:03.073Z  [D5 bad mapping] rolled back; first full run: exit 1 (repairs reported as failures); converged: 81 rows match, 0 issues
2026-11-05T13:01:16.824Z  [D5 bad mapping] PASS: bad run: partial, 17 parity failures; 18 rows wrong, detected; rollback run exit 1 → converged: 81 rows match, 0 issues; next run exit 0
2026-11-05T13:01:16.854Z  [D6 account purge] purge for drill-b (the delete-account function's call): {"rows":158}
2026-11-05T13:01:24.523Z  [D6 account purge] full sync with drill-b's Firestore data still present: exit 0; [PURGED] skipped 1 erased account(s) that still have Firestore documents: u#4c883cb4a4
2026-11-05T13:01:28.868Z  [D6 account purge] PASS: purge {"rows":158}; resync exit 0; converged: 39 rows match, 0 issues; drill-a intact: true
2026-11-05T13:01:28.972Z  [D7 per-write push] new expense pushed: HTTP 200; read model amount 77
2026-11-05T13:01:29.060Z  [D7 per-write push] edit pushed (request also carried fake data): HTTP 200; read model amount 78
2026-11-05T13:01:29.175Z  [D7 per-write push] hard delete pushed: HTTP 200; tombstoned true
2026-11-05T13:01:29.207Z  [D7 per-write push] push for the erased account drill-b: HTTP 403
2026-11-05T13:01:32.644Z  [D7 per-write push] "something changed" push (per-user sync): HTTP 200; usersync1 copied: true; run trigger push
2026-11-05T13:01:40.845Z  [D7 per-write push] push during a read-model outage: HTTP 599 (the save in Firestore is unaffected)
2026-11-05T13:01:51.305Z  [D7 per-write push] nightly full run after the outage: exit 0; converged: 40 rows match, 0 issues; push_daily {"requests":5,"docs":3,"user_syncs":1,"rejected":1,"failed":0}
2026-11-05T13:01:51.305Z  [D7 per-write push] PASS: create 200→77, edit 200→78, delete 200→tombstoned true, erased 403, user sync 200 (push), outage 599, nightly 0: converged: 40 rows match, 0 issues
2026-11-05T13:01:51.894Z  [D8 client-write outage] 3 expenses saved to Firestore with the read model down; the outbox kept 3 (attempts 1,1,1)
2026-11-05T13:01:52.618Z  [D8 client-write outage] read model back: outbox now 0; rows 100/client, 101/client, 102/client
2026-11-05T13:01:52.657Z  [D8 client-write outage] the same batch replayed: ok; rows unchanged: true
2026-11-05T13:01:52.658Z  [D8 client-write outage] PASS: held 3 during the outage; 0 left after recovery; landed 3/3 as client rows; replay unchanged: true
2026-11-05T13:01:52.835Z  [D9 client-write rejection] a corrupt row (amount "fifty-five"): {"code":"22P02","details":null,"hint":null,"message":"invalid input syntax for type numeric: \"fifty-five\""}; a refusal: true; outbox left 0; stored: false
2026-11-05T13:02:03.310Z  [D9 client-write rejection] PASS: refused: true; stored after refusal: false (before: false); outbox 0; nightly exit 0 → amount 55 (server); converged: 44 rows match, 0 issues
2026-11-05T13:02:03.390Z  [D10 dual-write divergence] the app wrote amount 90 for an expense Firestore holds at 100: ok; read model 90/client
2026-11-05T13:02:11.598Z  [D10 dual-write divergence] nightly full run: exit 0; read model 100/server; divergences counted {"expenses":1}
2026-11-05T13:02:11.598Z  [D10 dual-write divergence] PASS: before 90 (client) → after 100 (server); divergences.expenses 1
2026-11-05T13:02:29.264Z  [D11 one-write rollback] 3 collections on supabase; one write (exit 0): every collection now firestore; per-collection settings and other settings kept: true
2026-11-05T13:02:39.910Z  [D11 one-write rollback] PASS: before: 3 on supabase; after: all firestore true; settings kept true
```
