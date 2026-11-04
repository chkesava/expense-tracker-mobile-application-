# Read-model architecture rules (for agents and humans)

**Applies to every Spendly feature that writes data, reads data, adds a collection or field, or deletes user data.** This includes Claude Code, Codex and people.

Spendly runs a hybrid architecture (epics SPENDLY-494 and SPENDLY-586):
- **Firestore** is the source of truth and is written first.
- **Supabase Postgres** (project `spmsgncjbnbkxvsbpqlu`, workdir `supabase-readmodel/`) is the read model. The app also writes it, only through `rm_client_apply` (SPENDLY-669). The server push and the nightly sync make it match Firestore, and Firestore wins any difference.

Design: `docs/SPENDLY-494-adr.md`. Operations: `docs/READMODEL_RUNBOOK.md`.

These rules sit beside `CLAUDE.md` (Spendly safety invariants) and `docs/AGENT_WORKFLOW.md`. If they disagree, ask the user. Don't pick one silently.

## Before you start: which rules apply?

| Your change… | Read |
|---|---|
| Writes or edits user data (a new writer, form or service) | §1 |
| Adds a Firestore collection or a field that reporting/filters need | §2 |
| Adds or changes a screen that shows **history, reports, analytics, search or filters** | §3 |
| Shows **current-state money** (balances, net worth, current-month tiles, budgets, safe-to-spend) | §4 |
| Deletes user data, or touches account deletion | §5 |
| Touches keys, env, Netlify functions, Supabase grants or RLS | §6 |
| Runs anything against production | §7 |

## 1. Writes: Firestore first, Supabase only through `rm_client_apply`

- **R1.1** Firestore is the source of truth and is written first. The app also writes Supabase, **only** through `rm_client_apply` (security definer: an allowlist, owner, shape, version guard, tombstones), from the on-device outbox. No other client write to Supabase exists: tables are SELECT-only for clients. The server writers are the sync, the push and the purge.
  - **Exception (SPENDLY-616):** the private Storage bucket `spendly-files` in this project holds Spendly's account documents and goal photos, written only through the `spendly-files` Edge Function (`docs/SPENDLY_DOCUMENTS_STORAGE.md`). These are the binaries themselves, not a copy: they are **not rebuildable** from Firestore, which keeps only their metadata and object key. No Postgres table is involved, and no other Supabase write is allowed.
- **R1.2** Every new or changed write to a synced collection must **stamp `updatedAt`** (and `createdAt` on create) with a server timestamp (SPENDLY-571).
  - Incremental sync runs (manual, and the per-write push of SPENDLY-583) find changes by `createdAt`/`updatedAt`. A write without them reaches the read model only on the nightly full run.
  - Add a test that the writer sets both.
- **R1.2a** Writes to synced collections must reach the **per-write push** (SPENDLY-583), so other devices see them within seconds:
  - Writing through `commitMutations` does this automatically, as does writing a collection that has a live listener calling `notifyReadModelSnapshot`.
  - **`categories` has no live listener** (SPENDLY-660): its writers call `noteCategoriesWritten` (`lib/categoryRevision.ts`), which notifies the push and bumps the revision other devices load by.
  - A new writer that does neither must call `notifyReadModelWrites(uid, paths)` after its commit, or `notifyReadModelChanged(uid)` if it can't name its documents.
  - Never send document data to the server; it reads Firestore itself.
- **R1.2b** The nightly sync (SPENDLY-672) depends on the repository variable `READMODEL_NIGHTLY_MODE`.
  - **Unset or `full`:** today's behaviour, a full pass every night.
  - **`safety-net`:** changed-only nights, with a full pass on Sunday (IST). Changes are found by `createdAt`/`updatedAt` with **one collection-group query per collection** across all users; only `users/{uid}/…` paths are copied. The always-full account collections and the `users/{uid}` document still run per user.
  - **Before any upsert,** the sync compares each client-written row (`written_by = 'client'`) with Firestore's version. A typed-column difference is a **divergence**: it is counted in the run's notes and reported by health. Firestore's version replaces the row.
  - **Prerequisites for `safety-net`:**
    - every writer dual-writes in production (670/671 released, `readModel.clientWrites` on);
    - the collection-group field overrides in `firestore.indexes.json` are deployed (`scripts/readmodelCrossUserIndexes.test.ts` keeps them in step with the synced collections).
- **R1.3** Prefer soft deletes (`deletedAt`) for ledger rows, as today. A hard delete reaches the read model through the push, the app's dual write, or the next **full** pass. That pass is nightly by default, and weekly in `safety-net` mode. The always-full collections (`accounts`, `accountTypes`, `accountTransfers`, `accountEntries`) are the exception: they run in full every night.
- **R1.4** Never write anything under `users/{uid}_duress`. The read model never reads duress trees, and nothing may make it do so.

## 2. New collections and fields

**Synced today (53 tables):**
- Wave 1: `expenses`, `incomes`, `ledgerEvents`, `accounts`, `accountTypes`, `accountTransfers`, `accountEntries`, `accountPayments`, `creditCardBills`, `categories`.
- Save Goals (SPENDLY-609): `financialGoals`, `goalEvents`.
- Wave 2 (SPENDLY-589): `borrowings`, `borrowingRepayments`, `receivables`, `receivableRepayments`, `subscriptions`.
- Wave 3 (SPENDLY-590): `investments`, `holdings`, `portfolioTransactions`, `investmentCashTransactions`, `portfolioSettings`, `epfProfile`, `epfEstablishments`, `epfContributions`, `epfContributionEvents`, `epfTransfers`, `epfTransferEvents`, `epfInterestEntries`, `epfReconciliations`, `epfWageHistory`. Quantities, prices, NAVs and rates use the `decimal` field type (`numeric(24,8)`); money stays `numeric(18,2)`.
- Remaining screen collections (SPENDLY-591 part A): `categoryBudgets`, `decisions`, `calendarReminders`, `feeReviews`, `feeSignalDismissals`, `merchantOverrides`, `recurringDismissals`, `spaces`, `categorizationRules`, `trips`, `runwaySettings`, `runwayOverrides`, `whatIfScenarios`, `goalFundingPlans`, `sipPlans`, `sipTransactions`, `virtualPositions`, `netWorthHistory`, `watchlists`. Dates stored as full ISO strings (trip and SIP plan dates) are copied as text, never cut to a UTC day.
- Stored summaries (SPENDLY-592): `financialSummaries` (`dashboard_{YYYY-MM}`, `epf`), copied exactly (R4.1).

Everything else is **not** in the read model. Waves 2 and 3 were first closed as won't-do (514–518, the no-Blaze decision); SPENDLY-586 brings them back: Wave 2 in 589, Wave 3 in 590. Still not synced: `financialSummaries/netWorth` and `/investments` (retired; R4.1a), `holdingAdjustments`, `portfolioReconciliationAudits`, `decisionEvents`; the `users/{uid}` settings document is copied as `user_settings` (591 part C): allowlisted fields only (`RootSpec.docKeys`; never PIN, lock, role or identity), server-only (not on the client allowlist). Nested collections (591 part B, `watchlists/{listId}/items`) key on doc_id `"{parentId}/{id}"` with a `TableSpec.parent`.

- **R2.1** A new collection is **not** synced unless the story says so. If it must be, all of these go in the same story:
  - a migration in `supabase-readmodel/supabase/migrations/`, with the contract columns (`uid`, `doc_id`, `doc`, `source_path`, `source_update_time`, `source_deleted`, `deleted_at`, `schema_version`, `mapping_status`, `synced_at`), a primary key `(uid, doc_id)`, `(uid, …)` indexes, RLS on, an owner-only SELECT policy, and `grant select … to authenticated`;
  - a `TableSpec` in `shared/utils/readModel/mapping.ts`;
  - the purge function covering it;
  - the realtime ping triggers `<table>_rm_ping_ins` / `<table>_rm_ping_upd` (SPENDLY-593; `assert_security` fails without them);
  - updated lists in `tests/assert_security.sql` and `tests/rls_behaviour.sql`;
  - a sync-core test.

  Then re-run the drills (`supabase-readmodel/drills/run_drills.sh`).
- **R2.2** A field that SQL must **filter or sort on** gets a typed column (migration plus `TableSpec`). Fields only displayed stay in `doc` (jsonb), which always holds the whole document. Never drop data the mapper can't type: it is stored `unmapped` and flagged.
- **R2.3** Changing the meaning or shape of an existing synced field is a **mapping change**. Update the mapping, its tests and the golden fixture, and note it in the PR. A bad mapping corrupts stored rows on the next nightly run (drill D5).
- **R2.4** Migrations are additive and re-runnable. Never edit an applied migration; add a new one. Never put read-model SQL in `supabase/` (that is Ganesh Seva's project).

## 3. Reading history and reports: through the read path

- **R3.1** A new history, report, analytics, search or filter read **must** go through the read path:
  - `resolveReadModelBackend(screen, …)` in `lib/readModel/screenReadPath.ts`, plus `readModelPath().read(...)`;
  - a new key in `READ_MODEL_SCREENS` (`shared/utils/readModelMode.ts`).

  The existing ones are `journal`, `insights`, `cashFlow`, `audit`, `cashback` and `goals` (SPENDLY-611).
- **R3.2** The default is `firestore`, and in `firestore` mode the screen must behave **exactly as before**, with no read-model connection. Prove it with a test that pins the Firestore query and asserts that `connect` isn't called.
- **R3.3** The Firestore source must be **bounded** (a date range, a `limit`, a cursor page). It is the fallback, so an outage can't turn into an unbounded read.
- **R3.4** Each source needs:
  - a `shadow` comparison;
  - a session fallback (a failure means Firestore for the session, logged once, no loop);
  - the freshness badge (`useReadModelFreshness` + `ReadModelFreshnessBadge`);
  - an overlay of this device's newer writes where the screen shows rows (`overlayLocalRows` / `insightsMonthRows`);
  - locally removed ids kept out (`readModelSession.locallyRemovedIds`).
- **R3.5** Implement the query in **both backends** in `lib/readModel/backend.ts`:
  - `supabaseBackend`: RLS does the `uid` filtering, so never add a uid parameter;
  - `loopbackBackend`, so Spendly Test can exercise every mode on a phone.
- **R3.6** Money totals on a read-model screen are computed by the **existing TypeScript helpers** (`shared/utils/*`) over the rows returned. Don't write a new SQL aggregate for display. If one is unavoidable, it needs a golden test against its TypeScript reference (`scripts/readmodel-golden.ts`, `tests/golden.sql`), and a missing amount must make the total unknown, never 0.
- **R3.7** Use the same bucketing rules as the screen. Example: Insights months use `isInMonth` (the `month` field, else the date), so they query the `month` column, not a date range (SPENDLY-513).
- **R3.8** Add the query to `supabase-readmodel/tests/perf/perf_queries.sql`, shaped exactly as supabase-js sends it. The CI budget is p95 < 300 ms for a 30K-transaction user, with no sequential scans.
- **R3.9** A screen flips only through the runbook:
  1. the 14-day parity gate;
  2. `shadow` for 7 days with zero differences;
  3. `supabase` with the user's approval.

  Never change `system_settings/global.readModel` from app code. It is not client-writable, and must stay that way.

## 4. Current-state money: copies only

- **R4.1** Current-state money may be shown from Supabase **only** in one of two forms:
  - copies of Firestore's stored totals: `currentBalance`/`currentOutstanding` and the stored loan, bill and cash fields, or the `financial_summaries` rows (SPENDLY-592: `dashboard_{YYYY-MM}` and `epf`);
  - the existing TypeScript helpers over rows (`composeNetWorth`, …).

  SQL never computes a displayed number. Every money collection needs a 14-day zero-difference shadow before it flips.
- **R4.1a** The retired `financialSummaries/netWorth` and `/investments` are never copied (`TableSpec.excludeDocIds`). Net worth has one definition: `composeNetWorth`, computed live.
- **R4.1b** `scripts/readmodelMoneyGuard.test.ts` enforces R4 in three ways:
  - every SQL view or function that aggregates must be listed with its purpose: reconciliation (R4.2) or a history report;
  - none may aggregate the stored-copy tables;
  - the app may read only the history report among them, never a recomputed balance.

  A new aggregating object fails the test until someone classifies it.
- **R4.2** Don't create a parallel ledger, or recompute an authoritative summary in a component or in SQL (`CLAUDE.md` safety invariants). SQL may recompute only **for reconciliation** (`readmodel_invariants`, parity), never for display.
- **R4.3** Until a collection's read switch is `supabase` (SPENDLY-673), its live window, realtime listeners and anything a user just wrote are served from Firestore, as before.
- **R4.3a** A collection whose data **drives a write** stays on Firestore until that writer reads Firestore directly: due-subscription auto-posting, SIP execution, the EPF summary sync. `lib/readModelLocal/providerSwitch.test.ts` lists them and refuses a read switch on them.

## 5. Deletion

- **R5.1** Account deletion must erase the read model too. `delete-account` calls `readmodel_purge_user`, and the sync then skips the account forever (SPENDLY-508, SPENDLY-520). A new user-data store must be covered by the purge in the same story.
- **R5.2** No physical deletes in the read model except that purge. Everything else is a tombstone.

## 6. Security

- **R6.1** The app may hold only `EXPO_PUBLIC_READMODEL_SUPABASE_URL` and `EXPO_PUBLIC_READMODEL_SUPABASE_PUBLISHABLE_KEY`. The service-role key and the Firebase service account live only in GitHub Actions secrets, Netlify env and local env for scripts. `scripts/readmodelSecrets.test.ts` and `scripts/scan-bundle-secrets.ts` enforce it.
- **R6.2** Client roles get **SELECT only, on an exact list** (`tests/assert_security.sql` §3). `anon` gets nothing. Views must be `security_invoker`. New server functions are `revoke … from public, anon, authenticated` and `grant execute … to service_role`. `rm_client_apply` is the one client-executable write function: `grant execute … to authenticated` only, and covered by `assert_security.sql` and `rls_behaviour.sql`/`client_apply.sql`.
- **R6.3** Identity is the Firebase ID token through Supabase third-party auth. `readmodel_auth.uid()` re-checks issuer, audience, expiry, role and duress. Don't add another auth path.
- **R6.4** Never paste or commit keys. Users set them with `! gh secret set NAME` or the provider's UI.

## 7. Production safety

- **R7.1** One Firebase project serves dev and prod (`expenseapp-27f94`). Test only on the emulator (Spendly Test). The drills use their own emulator project, `demo-readmodel-drill`.
- **R7.2** Any production sync, backfill, rebuild or repair goes in this order: **dry run → report → user approval → apply**. The sync never writes Firestore.
- **R7.3** Flipping a screen, re-running a full sync or purging an account in production needs the user's explicit approval each time.
- **R7.4** Scheduled workflows run only from `main`, and GitHub disables schedules after 60 days without repository activity (runbook, monthly check).

## Checklist for a PR that touches data

- [ ] Writes go to Firestore first (through `commitMutations` or the outbox hook) and stamp `createdAt`/`updatedAt`; Supabase only through `rm_client_apply` (R1)
- [ ] New collection or field: synced or not, explicitly; migration + mapping + RLS + purge if synced (R2)
- [ ] History/report reads go through the read path, default `firestore` unchanged, bounded fallback, shadow, badge, overlay, loopback (R3)
- [ ] No current-state number moved to the read model; no new display aggregate in SQL without a golden test (R3.6, R4)
- [ ] Tests: `npm test`, `tsc`, and the SQL suite (`readmodel-schema.yml`) when `supabase-readmodel/` changed; drills re-run when the sync, mapping or migrations changed
- [ ] PR body lists any migration to apply and any runbook step
