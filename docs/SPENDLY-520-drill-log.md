# SPENDLY-520: recovery drill log

[SPENDLY-520](https://kesavach.atlassian.net/browse/SPENDLY-520) is part of the SPENDLY-494 epic. Procedures are in `docs/READMODEL_RUNBOOK.md`, section "Recovery drills".

**Run:** 2026-10-22, local stack (Windows laptop):
- **Firebase emulator:** its own project `demo-readmodel-drill`, port 8180.
- **Database:** Postgres 18 on localhost:55432, database `readmodel_drill`, with every migration up to `20261027000000`.
- **API:** PostgREST 16.5, the API Supabase runs, behind a `/rest/v1` proxy.

**What ran:**
- The **production scripts, unchanged**: `readmodel-sync.ts`, `readmodel-verify.ts`, `readmodel-set-mode.ts`, and the `delete-account` purge call.
- Driven by `scripts/readmodel-drill.ts`.
- Judged by `shared/utils/readModel/convergence.ts`: the mapper over the current Firestore documents is the oracle; live rows, typed columns, duress and purged accounts are all checked.

**Data:** two users with the SPENDLY-503 golden ledger (transfers both ways, soft delete and restore, a cross-month edit, card spend, a refund, cashback, a voided payment), plus a duress tree. The ids are synthetic (`drill-a`, `drill-b`).

**No production system was touched,** and no Firestore writes happened outside the drill emulator. Production drills (D4, the D1 dry run) are for after the setup, with approval.

## Results

| Drill | Expected | Observed | Result |
|---|---|---|---|
| D1 rebuild | zero divergence after a rebuild from nothing | converged: 52 rows match, 0 issues; sync 6108 ms, 55 reads; verify exit 0 | PASS |
| D2 sync outage | the 3-hourly run catches up adds, edits, soft deletes and (always-full) transfer deletes; the nightly full run tombstones the hard-deleted expense; then zero divergence | incremental left: extra expenses/c3; after the full run: converged: 51 rows match, 0 issues | PASS |
| D3 Supabase outage | the sync fails loudly during the outage and converges on the next run; the app side is proven by lib/readModel/outageDrill.test.ts | outage run exit 1; next run exit 0; converged: 52 rows match, 0 issues | PASS |
| D4 kill switch | all screens flip to firestore and back by changing one remote document; other settings untouched | off: true; back to shadow: true; other settings kept: true | PASS |
| D5 bad mapping | the bad deploy alerts at once (its own run is partial, parity failures, non-zero exit) and shows in v_data_quality; rolling back and running the full sync repairs every row; the run after that is clean | bad run: partial, 17 parity failures; 18 rows wrong, detected; rollback run exit 1 → converged: 53 rows match, 0 issues; next run exit 0 | PASS |
| D6 account purge | every drill-b row is erased; a later full sync (Firestore still holding drill-b) does not bring it back; drill-a untouched | purge {"configured":true,"rows":58}; resync exit 0; converged: 25 rows match, 0 issues; drill-a intact: true | PASS |

```
2026-10-22T13:08:34.291Z  [setup] emulator 127.0.0.1:8180 (demo-readmodel-drill), Postgres localhost:55432/readmodel_drill, PostgREST via http://127.0.0.1:54321
2026-10-22T13:08:35.724Z  [D1 rebuild] read-model database dropped and recreated; every migration applied
2026-10-22T13:08:36.401Z  [D1 rebuild] emulator seeded: drill-a, drill-b with the SPENDLY-503 golden ledger, plus a duress tree
2026-10-22T13:08:40.963Z  [D1 rebuild] dry run first: exit 0, reads 55
2026-10-22T13:08:47.072Z  [D1 rebuild] full sync (the backfill): exit 0, 6108 ms, Firestore reads 55
2026-10-22T13:08:51.984Z  [D1 rebuild] count parity (readmodel-verify): exit 0
2026-10-22T13:08:52.472Z  [D1 rebuild] PASS: converged: 52 rows match, 0 issues; sync 6108 ms, 55 reads; verify exit 0
2026-10-22T13:08:52.508Z  [D2 sync outage] with the sync stopped: 1 expense added, 1 edited, 1 soft-deleted, 1 expense and 1 transfer hard-deleted
2026-10-22T13:08:52.904Z  [D2 sync outage] before catching up: NOT converged: 2 differs expenses, 1 missing expenses, 1 extra expenses, 1 extra account_transfers
2026-10-22T13:08:58.870Z  [D2 sync outage] incremental run: exit 0, reads 48; NOT converged: 1 extra expenses (extra expenses/c3)
2026-10-22T13:09:05.550Z  [D2 sync outage] PASS: incremental left: extra expenses/c3; after the full run: converged: 51 rows match, 0 issues
2026-10-22T13:09:06.055Z  [D3 Supabase outage] PostgREST stopped: the API answers 503, like a paused or unreachable project
2026-10-22T13:09:17.252Z  [D3 Supabase outage] sync during the outage: exit 1 (non-zero fails the GitHub job, which alerts)
2026-10-22T13:09:17.550Z  [D3 Supabase outage] PostgREST restarted; one expense was written during the outage
2026-10-22T13:09:23.465Z  [D3 Supabase outage] PASS: outage run exit 1; next run exit 0; converged: 52 rows match, 0 issues
2026-10-22T13:09:44.167Z  [D4 kill switch] every screen set to firestore: {"journal":"firestore","insights":"firestore","cashFlow":"firestore","audit":"firestore","cashback":"firestore"}
2026-10-22T13:10:04.732Z  [D4 kill switch] PASS: off: true; back to shadow: true; other settings kept: true
2026-10-22T13:10:07.289Z  [D5 bad mapping] "deployed" a mapper that reads expenses.amount from the wrong field and ran the nightly full sync: partial, 1 upserts
2026-10-22T13:10:07.290Z  [D5 bad mapping] detected by field parity against the correct mapper: NOT converged: 18 differs expenses (18 expense amounts wrong)
2026-10-22T13:10:07.399Z  [D5 bad mapping] v_data_quality (health check input) now lists 15 row(s)
2026-10-22T13:10:13.937Z  [D5 bad mapping] rolled back; first full run: exit 1 (repairs reported as failures); converged: 53 rows match, 0 issues
2026-10-22T13:10:20.398Z  [D5 bad mapping] PASS: bad run: partial, 17 parity failures; 18 rows wrong, detected; rollback run exit 1 → converged: 53 rows match, 0 issues; next run exit 0
2026-10-22T13:10:20.415Z  [D6 account purge] purge for drill-b (the delete-account function's call): {"configured":true,"rows":58}
2026-10-22T13:10:25.729Z  [D6 account purge] full sync with drill-b's Firestore data still present: exit 0; [PURGED] skipped 1 erased account(s) that still have Firestore documents: u#4c883cb4a4
2026-10-22T13:10:26.514Z  [D6 account purge] PASS: purge {"configured":true,"rows":58}; resync exit 0; converged: 25 rows match, 0 issues; drill-a intact: true
```
## Findings

1. **Fixed in this story: an erased account was re-read every night** (D6, first run). After `delete-account` purged an account, if its Firestore documents still existed (the Firestore half of a deletion not finished), every full sync:
   - read them (wasted reads);
   - had the database refuse them (correct);
   - then had parity report every row as missing (28 in the drill), every night, with nothing able to repair it.

   Now the sync asks `readmodel_is_purged` first and skips erased accounts entirely, with a `[PURGED]` note instead of a failure. Covered by `scripts/readmodelSyncCore.test.ts`; D6 re-run passes.
2. **By design, now documented: a repair run exits red** (D5). The run that repairs diverged rows reports them as parity failures and exits non-zero, so every repair is seen. The run after it is green. The runbook says so, so a red run after a rollback isn't mistaken for a failed rollback.
3. **By design, now documented: a bad mapper corrupts on its first nightly run** (D5). Parity repair writes what the deployed mapper builds. So a bad mapper rewrites stored rows, and alerts on that same run (`partial`, parity failures, non-zero exit, `v_data_quality` grows). The procedure is to revert, run full, then check the following run is green. Flip affected screens to `firestore` meanwhile.
4. **Hard deletes wait for the nightly run** (D2): a 3-hourly run can't see a deleted document. The always-full small collections (accounts, transfers, entries, types) catch deletes every run. This is ADR §0 behaviour, confirmed.
