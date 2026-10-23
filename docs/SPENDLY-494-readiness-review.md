# SPENDLY-494 readiness review

[SPENDLY-520](https://kesavach.atlassian.net/browse/SPENDLY-520) holds this review for the [SPENDLY-494](https://kesavach.atlassian.net/browse/SPENDLY-494) epic's acceptance criteria and Definition of Done.

- **Prepared:** 2026-10-22, on the epic branch with every story through 519 merged.
- **Sign-off:** the user, by a comment on SPENDLY-520.

**Verdict: ready for production setup, not yet ready to call the epic done.**
- The code, tests, drills and runbook are complete.
- What remains needs production time: the sync running for 14 days, then 7-day shadow windows per screen, then measurement. It also needs the epic on `main`.

## Overall acceptance criteria

| Criterion | Status | Evidence |
|---|---|---|
| Every request §10 test is implemented and passing in its story | **Met** | Each story doc lists its tests. On the epic branch: `npm test` (6,000+ tests), the SQL suite in CI (`readmodel-schema.yml`: security, RLS, sync functions, purge, verify, views, golden, performance), and the Firestore rules tests |
| 14 days of shadow parity before any read moves | **Not started**: needs the sync live | `readmodel-parity.ts --report` and the health summary's "Parity gate: N of 14" (SPENDLY-510). Every screen defaults to `firestore` until then |
| Each migrated module passes reconciliation and a kill-switch drill | **Kill switch: met** (drill D4, all 5 screens). **Reconciliation: met locally** (drills D1–D3, D5, D6: zero divergence). Production reconciliation runs nightly once live | `docs/SPENDLY-520-drill-log.md` |
| Measured Firestore read and cost deltas are recorded | **Pending**: needs the flips | Method and baselines in `docs/SPENDLY-519-performance-security-cost.md` §5 |

## Data integrity requirements

| Requirement | Status | Evidence |
|---|---|---|
| Firestore is the only write path | Met | The app never writes to Supabase. The service role exists only on servers (`readmodelSecrets.test.ts`, bundle scan in 519) |
| Every create, update and delete reaches Supabase at least once, idempotently and version-guarded | Met (option C: within 3 h for creates and edits, nightly for hard deletes) | `sync_functions.sql` (version guard, replay is a no-op); drills D2 and D3 |
| No physical deletes except the account-deletion purge | Met | Tombstones only (`readmodel_tombstone`); `purge.sql`; D6 |
| Unmappable shapes are stored raw and flagged, never dropped | Met | `mapping_status = 'unmapped'` with the `doc` kept; `sync_failures` (507) |
| A missing value is never shown as a legitimate zero | Met | Null-preserving views (510). The cash-flow chart falls back instead of showing 0 (513) |
| Every derived number has exactly one owner | Met | Screens run the existing TypeScript helpers over read-model rows. SQL views are parity-only, except `v_cash_flow_by_month`, golden-tested against `calculateDashboardSummaries` (510, 513) |
| Transfers conserve money; cashback counted once; promised vs received and open vs paid stay distinct | Met for what moved | Golden fixture tests (503, 510, 513) |

## Security requirements

| Requirement | Status | Evidence |
|---|---|---|
| Firebase identity verified server-side | Met | Supabase third-party JWT verification plus `readmodel_auth.uid()` re-checks (505) |
| RLS on every table, with cross-user tests | Met | `assert_security.sql`, `rls_behaviour.sql` (re-run in 519 and 520) |
| No service-role key in the bundle | Met | `readmodelSecrets.test.ts`; a canary web export scanned clean (519) |
| Sync endpoints not user-invokable | Met | The sync is a GitHub Actions job with repo secrets. SQL write functions are executable by `service_role` only |
| Account-deletion purge covers Supabase | Met | `delete-account` → `readmodel_purge_user` (508); drill D6; erased accounts are no longer re-read (520) |

## Synchronization requirements

| Requirement | Status | Evidence |
|---|---|---|
| Lag, failure and dead-letter metrics | Met | `sync_status`, `sync_runs`, `sync_failures`; `supabase-readmodel/reports/sync_metrics.sql` (519) |
| A failure older than 24 h fails a scheduled run | Met | The health workflow (507) |

## Definition of Done

| Item | Status |
|---|---|
| Every story Done on `main` | **No.** Stories 502–513, 519, 520 and 571 are on the epic branch, not `main`. 514–518 were closed as won't-do (option C). |
| The runbook exists | **Met:** `docs/READMODEL_RUNBOOK.md` (architecture, setup order, alerts, backfill, parity, flipping, recovery drills, cost watch, secrets) |
| Readiness review signed off | **Waiting for you** (this document) |
| Firestore fallback retirement decided or deferred | **Decided: keep the fallbacks permanently,** with revisit conditions (runbook, "Decision record") |

## Open items before the epic can close

**You (setup, no code):**
1. Apply migrations `20261022000000` to `20261027000000`.
2. Enable Firebase third-party auth.
3. Set the GitHub secrets (`READMODEL_SUPABASE_SERVICE_ROLE_KEY`, `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY`) and the Netlify env vars.
4. Do the two dashboard checks in the 519 report §2.

**Merge to `main`:** needed before the sync can run at all, because GitHub runs scheduled and manual workflows only from the default branch. Every screen ships defaulting to `firestore`, and the workflows do nothing until `READMODEL_SYNC_ENABLED=true`. So the merge changes no behaviour by itself.

**Then, in order:**
1. Backfill: dry run, your approval, then the real run.
2. `READMODEL_SYNC_ENABLED=true`.
3. The 14-day parity gate.
4. Per screen: `shadow` for 7 days, then `supabase` with your approval.
5. Measure the read deltas (519 §5) and the 30-day sync metrics.

**Decisions recorded for the flip:**
- **Audit history in `supabase` mode lags up to 3 h** for edits made on this device; it is marked "Updating…". If that isn't acceptable, leave `audit` on `firestore` (513).
- **Cost vs. benefit:** until the flips, the sync adds about 8–9K Firestore reads a day and saves none. The value of the read model may turn out to be the SQL queries and completeness rather than read cost (519 §3).
