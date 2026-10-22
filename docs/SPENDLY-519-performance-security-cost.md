# SPENDLY-519: Performance, security and cost validation

[SPENDLY-519](https://kesavach.atlassian.net/browse/SPENDLY-519) is part of the SPENDLY-494 epic.

- Branch: `feature/SPENDLY-519-performance-security-cost`, cut from the epic branch after SPENDLY-513 was merged.
- Status on 2026-10-22: everything that can be measured **before any screen is flipped** is done and recorded below. The sections marked **PENDING** need production time (7-day and 30-day windows after the flips) and are filled in by the steps given with them.

## 1. Query performance (measured, local)

**Setup:**
- `supabase-readmodel/tests/perf/synthetic_load.sql` loads the SPENDLY-423 target, a **30,000-transaction user**, alongside 49 other users. The tables hold 275K expenses and 118K ledger events, so the user is about 10% of each table and `uid` selectivity is realistic.
- The data includes soft-deleted rows, tombstones, undated rows, 500 cashback payments, and one transaction with **300 audit events**.
- `perf_queries.sql` runs **every read-model query the app sends**, shaped exactly as `supabase-js`/PostgREST sends it, **as the signed-in user** (role `authenticated` + Firebase claims, so RLS applies).
- Each query runs once to warm, then 30 times, with results serialised as JSON (`doc` detoasted, as for the HTTP response).
- **Budget:** p95 < 300 ms, and no sequential scan of a user-data table.

Local Postgres 18 (Windows laptop), 2026-10-22:

| Query (source) | p50 ms | p95 ms | Rows | Index used |
|---|---|---|---|---|
| Journal month (`journalMonthSource`) | 0.61 | 0.82 | 475 | `expenses_uid_date_idx` |
| Journal page, newest (`journalHistorySource`) | 0.27 | 0.30 | 50 | `expenses_uid_date_idx` |
| Journal page, deep keyset (2022) | 1.46 | 1.75 | 50 | `expenses_uid_date_idx` |
| Journal undated page | 0.70 | 0.82 | 50 | `expenses_uid_date_idx` |
| Filter match, narrow (`backend.matching`) | 1.06 | 1.37 | 56 | `expenses_uid_account_date_idx` |
| Filter match, whole history, first 1,000 | 14.48 | **15.46** | 1000 | `expenses_uid_month_idx` |
| Insights month, expenses (`supabaseByMonthKey`) | 0.53 | 0.63 | 475 | `expenses_uid_month_idx` |
| Insights month, incomes | 0.20 | 0.22 | 48 | `incomes_uid_month_idx` |
| Cash-flow history, 4 months (`v_cash_flow_by_month`) | 1.94 | 2.26 | 4 | `expenses_uid_month_idx`, `incomes_uid_month_idx` |
| Audit, one transaction with 300 events | 0.29 | 0.32 | 100 | `ledger_events_uid_target_idx` |
| Audit trail, deep keyset | 4.63 | 5.02 | 100 | `ledger_events_uid_created_idx` |
| Linked purchases by id, 20 ids (`supabaseByIds`) | 0.37 | 0.40 | 20 | `expenses_pkey` |
| Freshness (`sync_status`) | 0.12 | 0.17 | 2 | (8-row table) |

**Result: every query passes, the slowest p95 is 15.5 ms (20× under budget), and there are no sequential scans.**
- The cash-flow view's month filter is pushed through the `GROUP BY` and the `UNION ALL` into both month indexes, so the view never aggregates a user's whole history.
- Server time doesn't include the network round trip from India to the project's region. That is measured in production (§5).

**Indexes: no change needed.** Every query uses an index. The by-id query first showed a full-user scan only because the test used a subquery; with the literal list PostgREST actually sends, it uses the primary key. The test was corrected, not the schema. So there's no index migration, and the Definition of Done item "index migration applied" doesn't apply.

**Run it:** `PGHOST=localhost PGPORT=55432 PGUSER=postgres bash supabase-readmodel/tests/perf/run_perf.sh`. The script refuses any non-local host. It also runs in CI, as the last step of `readmodel-schema.yml`.

## 2. Security checklist (evidenced)

| Item | Evidence | Result |
|---|---|---|
| RLS on every table | `tests/assert_security.sql` §2 | Pass |
| Owner-only SELECT policies, no write policies | `assert_security.sql` §4 (exactly 11 owner-read policies, sync bookkeeping server-only) | Pass |
| Views are `security_invoker`, so RLS applies through them | `assert_security.sql` §7 and `tests/views.sql` | Pass |
| **No `anon` grants**; `authenticated` holds SELECT only, on an exact list | `assert_security.sql` §3; `views.sql`; `rls_behaviour.sql` §5 (anon reads nothing, even with a valid user's claims) | Pass |
| Cross-user isolation re-run | `rls_behaviour.sql`: own rows only, tombstones hidden, wrong project, expired, duress or empty claims see nothing, every write denied, the cash-flow view totals only the caller's rows | Pass, re-run 2026-10-22 |
| Server functions not client-callable | `sync_functions.sql`, `purge.sql`, `verify.sql`, `views.sql` | Pass |
| Service-role key only on servers | `scripts/readmodelSecrets.test.ts`: never in app code; the only `EXPO_PUBLIC_` values are the URL and the publishable key. Key locations: GitHub Actions secrets (sync, health), Netlify env (purge on account deletion), local env for scripts | Pass |
| **Bundle secret scan** | New `scripts/scan-bundle-secrets.ts`, which catches `sb_secret_`, service-role JWTs, PEM keys, service-account JSON and server env names (`scripts/bundleSecretScan.test.ts`, 4 tests). A real `expo export --platform web` was built with **canary** values: a fake `READMODEL_SUPABASE_SERVICE_ROLE_KEY` and a fake service-account JSON in the build environment, plus a fake publishable key | Pass: the scan found nothing. The publishable canary **is** in the bundle (so the env really was read) and **both secret canaries are absent** |
| Claims function (`readmodel-claims`) | `netlify/functions/readmodel-claims.test.ts`: verified token only, writes only the token's own uid, refuses duress-shaped uids, rejects forged, expired and revoked tokens | Pass (in `npm test`) |
| **Kill switch not client-writable** | `firestore/systemSettings.rules.test.ts` (Firestore emulator): a signed-in user cannot merge `readModel` (or the loopback test knobs) onto `system_settings/global` | Pass, 17/17 |
| Duress never reads the read model | `readmodel_auth.uid()` rejects `_duress`; the client builds no read-model client in duress (SPENDLY-505 tests) | Pass |

**For your sign-off:** the checklist above, plus two manual items in the Supabase dashboard:
1. Authentication → Third-party auth shows only the Firebase project `expenseapp-27f94`.
2. Project settings → API: the secret key appears nowhere outside GitHub and Netlify.

## 3. Cost

| Service | Plan | What the epic uses | Status |
|---|---|---|---|
| Firestore | Spark (free) | Sync reads: ≈ 550 per 3-hourly run and ≈ 3.8K for the nightly run, so **≈ 8–9K reads/day** (ADR §0), against a 50K/day quota with ≈ 22.7K/day already used by the app. Hard budgets: 1,500 per incremental run, 6,000 per full run, 12,000 per day | Estimate. Measured by §5 |
| Supabase | Free, dedicated project | **Storage:** measured at ≈ 700 bytes per expense and ≈ 570 per ledger event, including indexes. Today's ≈ 4,500 documents are **≈ 3 MB**. The 500 MB Free limit holds ≈ 700K rows, so ≈ 150× headroom. **Egress:** the Journal's heaviest read, a 1,000-row filter page, is ≈ 450 KB, far below the 5 GB/month Free egress at this user count | Measured locally; production in §5 |
| GitHub Actions | Free | Sync every 3 h, nightly full run, hourly health check, schema CI. **The repo is public, so standard runners cost nothing** | ₹0 |
| Netlify | Free (300 credits/month) | `readmodel-claims` runs **once per sign-in**, not per read; `readmodel-purge` runs once per account deletion | Negligible; check the credit meter after a month |
| Firebase Blaze | not used | Option C: no triggers | ₹0 |

**Expected monthly cost: ₹0 on the current free plans.**

**Recommendation: stay on Free.**
- Supabase Pro ($25/month) would add backups, but the read model is a **rebuildable copy**: the full sync is the backfill (SPENDLY-509).
- A Free-tier pause is absorbed by the Firestore fallback (SPENDLY-511).
- Revisit only if production egress or storage passes 50% of the Free limits.

**Cost vs. benefit, stated plainly** (the ticket asks for it):
- Until screens are flipped, the epic **adds** ≈ 8–9K Firestore reads a day (the sync) and saves none.
- Each flip then saves the reads listed in the 512 and 513 docs: older Journal history, month loads, the dashboard chart's older months, and audit history.
- Whether the net is positive is unknown until §5 is measured. If the 7-day after-flip window doesn't show fewer total reads than the before-window, the honest conclusion is that the read model's value is the **SQL queries and completeness** (filtered Journal, complete Insights months, audit pages), not read cost.

## 4. Finding: the read-model workflows don't exist on `main`

GitHub runs **scheduled** workflows only from the default branch. A manual run also needs the workflow to be present on the default branch.
- `readmodel-sync.yml`, `readmodel-health.yml` and `readmodel-schema.yml` are on the epic branch only. `gh run list --workflow readmodel-sync.yml` returns *"not found on the default branch"*.
- **So the sync can't run, by schedule or by hand, until the epic (or at least `.github/workflows/readmodel-*.yml` and the scripts they call) reaches `main`.**
- Everything else in the setup list (secrets, migrations, third-party auth) can be done before that, and the 7-, 14- and 30-day gates start only after it.
- The workflows are inert on `main` until `READMODEL_SYNC_ENABLED=true` is set, so merging them early is safe.

## 5. PENDING: production measurements (need the flips)

| Acceptance item | How it gets measured | When |
|---|---|---|
| Firestore reads before vs. after, 7-day windows | Firebase console → Usage: export reads, writes and deletes for the 7 days before the first flip and the 7 days after the last one. Compare with the ADR §2 baseline (≈ 22.7K reads/day). Add the sync's own reads from `sync_runs` (below) | After the 512/513 flips |
| Sync latency p50/p95 and failure rate, 30 days | `supabase-readmodel/reports/sync_metrics.sql`: read-only, no uids. Paste into the read-model project's SQL editor. It reports run duration p50/p95, failure rate, reads per day, data age p50/p95 and open failures | 30 days after `READMODEL_SYNC_ENABLED=true` |
| p95 < 300 ms **in production** | Supabase dashboard → Query performance (`pg_stat_statements`) for the source queries in §1, plus the app's round trip from a phone in `supabase` mode | After the first flip |
| Supabase DB size, egress, connections | Supabase dashboard → Usage | Monthly |

## Tests run (2026-10-22)

- `run_perf.sh` (local PG18): 13 queries, all within budget (§1).
- The full SQL suite on a fresh database: `assert_security`, `rls_behaviour`, `sync_functions`, `purge`, `verify`, `views` and `golden` all pass.
- `firestore/systemSettings.rules.test.ts` on the emulator: 17/17.
- `npm test`: 421 files, 6016 tests pass. `npx tsc --noEmit` is clean.
- `expo export --platform web` with canaries, then `scan-bundle-secrets.ts`: clean.
- `sync_metrics.sql`: checked on seeded rows in a rolled-back transaction.

## Definition of Done

| Item | State |
|---|---|
| Report merged | This doc, on the story branch |
| Index migration applied | **Not needed**: no index change (§1) |
| User sign-off | Waiting: security (§2) and cost (§3) now; §5 after the flips |
