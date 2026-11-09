# SPENDLY-747 — Fee intelligence and ledger health as server-stored results

Story in epic **SPENDLY-735**, audit items E1 and E2. Branch `feature/SPENDLY-735-remaining`.

## Why
The app scanned the whole ledger on the phone in two places:
- **E1:** `detectFees` ran on the Fees, Insights, Calendar and transaction screens, and again on every ledger change.
- **E2:** `runLedgerAudit` ran on the Journal health tab.

Both waited for the full history. With the staged 300-row ledger, they often never ran at all.

## Design
### Server job `insights-daily`
`scripts/insights-daily.ts` + `scripts/lib/insightsDailyCore.ts`. It runs daily at 08:30 IST through the Worker, gated by `INSIGHTS_DAILY_ENABLED`; a manual run defaults to a dry run.

1. **Who changed:** the Supabase copy says which users' inputs changed since their stored result. It compares the newest `synced_at` across expenses, incomes, accountEntries, accounts, accountTypes, feeReviews, creditCardBills, subscriptions and spaces (deletions included) against the stored `inputsSyncedAt`. A version bump (`SERVER_RESULTS_VERSION`) recomputes everyone.
2. **Inputs from Firestore (R4.3a):** a changed user's inputs are read from Firestore, so nothing is computed from the copy. This is the same "the copy says who, Firestore says what" pattern as the bill and subscription jobs, so no rule exception is needed. The read budget defaults to 8000 (`INSIGHTS_MAX_READS_PER_RUN`). A user past the budget waits for the next run.
3. **Compute:** the app's own pure functions run on those inputs.
4. **Store:** one atomic batch per user writes `users/{uid}/serverResults` (server-written, owner-read):
   - `feeRows-<n>`: the fee rows, split so no document nears 1 MB (≤300 rows and ≤600 KB each). Every part carries the same `runId`, and parts the run no longer has are deleted.
   - `ledgerHealth`: the `runLedgerAudit` report, with the same readiness as the Journal tab once everything is loaded. Trips and splits stay "not checked", as on the phone.

### Fees: the scan moved; resolving stayed in the app
`detectFees` is split into two exported steps, and `detectFees` itself is now just both in a row, so every existing fee test still covers it:
- **`classifyFeeRows` (server):** the full-ledger scan. It keeps only candidate rows and reviewed rows.
- **`resolveFeeRows` (app):** pairing (GST, reversal, refund) and the user's reviews, over those stored rows.

This is exact:
- A review is only ever written on an existing record (`useFeeReviewActions`).
- Records only come from candidates or reviewed rows.
- So resolving the stored rows with **any later** set of reviews gives what `detectFees` would.

As a result, a review shows at once with no ledger scan. `useFeeIntelligence` now reads `useServerResults` and resolves the stored rows with `useFeeReviews`. It exposes `computedAt`.

### Journal health tab
`LedgerHealthReport` shows the stored report with "Checked on <date>". It has a **"Not checked yet"** state before the first run. It runs no audit itself.

## Limits (stated, not hidden)
- **Edits between runs:** after a transaction edit, the fee rows and the health report reflect the last daily run, until the next one. Reviews are always current.
- **Not on the SPENDLY-737 run-after-save queue.** Adding a second job to the queue needs a SQL change to its triggers and dispatch. That is left as a follow-up.
- **Before the first run,** the fee screens show no records.

## Dual store
- **Firestore rule:** owner-read, no client write (`firestore/serverResults.rules.test.ts`, 3 tests).
- **Read model:** a TableSpec (`server_results`) and migration `20261114000000_readmodel_server_results.sql`:
  - RLS, realtime pings, the sync allowlist, the purge, live counts and data quality;
  - **not** on the `rm_client_apply` allowlist.
- **Collection-group indexes:** `createdAt`/`updatedAt` overrides in `firestore.indexes.json`.
- **SQL test lists** updated: 60 policies, 122 purge rows.
- **Read switch:** `serverResults` is on the integrated and listenersOff lists.
- **Migration coordination:** this migration restates the lists from `20261113000000` (SPENDLY-744). The Tax epic note in `docs/SPENDLY-744-recurring-weekly.md` applies here too.

## Guards
- **providerSwitch:** "the app runs no full-ledger fee scan or ledger audit" (`detectFees` / `classifyFeeRows` / `runLedgerAudit` in app code), plus the rule.
- **The server-push allowlist:** `insightsDailyCore.ts`.
- **The Worker's daily list:** `insights-daily.yml`.

## Tests
`scripts/insightsDailyCore.test.ts` (7) covers:
- **golden:** stored rows, after a JSON round-trip, resolve to exactly `detectFees` (records, inferences, stats);
- reviews made or cleared after the run;
- only candidate and reviewed rows are stored;
- parts, with a complete set only and the newest run winning;
- the stored health report equals the app's;
- recompute only on change or a version bump;
- Firestore reads only for changed users, plus a dry run and duress.

## Owner steps (after the epic reaches `main`)
1. Deploy the Firestore rules and indexes.
2. Apply migration `20261114000000` after `20261113000000` (dry run first; mind the Tax epic note).
3. Run *Insights daily* as a dry run.
4. Set `INSIGHTS_DAILY_ENABLED=true` and redeploy the Worker.
5. **UI review:** the Fees screens and the Journal health tab ("Checked on…", "Not checked yet").
