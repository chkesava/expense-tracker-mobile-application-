# SPENDLY-678 Group Funds: post-merge checklist (go-live)

**Epic:** SPENDLY-678, stories 683–688 and 700. Tracker: `docs/SPENDLY-678-group-funds.md`.

Merging to `main` ships nothing by itself. Every step below is a production change: run each **only with the user's go-ahead**, dry run first where one exists (AGENT_WORKFLOW §7). Firebase project `expenseapp-27f94` (one project; no staging). Read-model project `spmsgncjbnbkxvsbpqlu`.

## Why this order
- Group Funds only **adds** client writes (new collections, new `accountEntries` sources). Existing writes are unchanged, so the rules and the schema can go out **before** the app without breaking older builds.
- **The app must not ship before steps 1–3.**
  - Without the rules, every Group Funds save is denied.
  - Without the migration, `readModel.clientWrites` is already **on** in production (SPENDLY-586 checklist step 6). The new app's on-device outbox would then send `group_funds` / `group_fund_events` rows that `rm_client_apply` refuses, and the outbox drops **that whole batch**, including the same save's `account_entries` and `accounts` rows. Firestore stays correct and the nightly sync repairs the copy, but the copy would lag until then.

| # | Step | How | Done |
|---|---|---|---|
| 0 | PR merged to `main`, with PR Checks and **Read-model schema** green | GitHub | ☐ |
| 1 | **Firestore indexes** | "Deploy Firestore rules" workflow with `deploy_indexes: true`, **`dry_run: true` first**. It refuses a deploy that would delete live indexes. Diff first: `firebase firestore:indexes --project expenseapp-27f94` against `firestore.indexes.json` | ☐ |
| 2 | **Firestore rules** | The same workflow, `dry_run: true`, then `dry_run: false`. It can run together with step 1 | ☐ |
| 3 | **Supabase migration** `20261106000000_readmodel_group_funds.sql` | Read-model project, SQL editor (or `supabase db push --workdir supabase-readmodel`). Check first that the previous migrations are applied. Then confirm with `supabase-readmodel/tests/assert_security.sql` §1–4 (owner-read policies are now **56**) | ☐ |
| 4 | **Web deploy** (Netlify), the user's call because of Netlify credits | `web-deploy.yml`. **Before the Android release:** it ships the web app and redeploys `readmodel-push` with the new tables. The deployed push function validates every ref in a request and **rejects the whole request** if one collection is unknown (`parsePushRequest`). So until this runs, a Group Funds save's push is refused, including that save's `accounts` / `accountEntries` refs. The on-device outbox (`rm_client_apply`, after step 3) still copies them, and the nightly sync repairs anything left | ☐ |
| 5 | **Expense Android release** | `release-expense.yml` (workflow_dispatch), with approval. Follow the SPENDLY-586 release notes (the `expo-sqlite` native module is already in v5.2.0). If the web deploy is deferred, expect rejected pushes (step 6) | ☐ |
| 6 | **Verify in production** (read-only) | See below | ☐ |
| 7 | **Jira** | Move SPENDLY-678 and 683, 684, 685, 686, 687, 688 and 700 to **Done** with the merge commit. Leftovers stay in their own tickets | ☐ |
| 8 | **Device QA** | Spendly Test on the Firebase emulator (`docs/LOCAL_TEST_MODE.md`), never the real app. Record the phone's display settings first and restore them exactly | ☐ |

## Step 1 detail: what the index deploy adds
- **Composite:** `groupFundEvents (fundId ASC, createdAtMs DESC)`, for history paging.
- **Field overrides** (the cross-user sync, SPENDLY-672 shape): `groupFunds` and `groupFundEvents` × `createdAt`, `updatedAt`, `createdAtMs`.
- **Not needed:**
  - The month view (`fundId == f and period == M`) and the duplicate check (`fundId`, `memberId`, `period`) use **equality filters only**, so they need no composite index.
  - The reversal lookups are single-field queries.
- Wait until every index reads **Enabled** before step 4. A history page before then fails with `FAILED_PRECONDITION`, and the screen shows its error state.

## Step 3 detail: what the migration does (additive)
- Adds two tables, `group_funds` and `group_fund_events`, with:
  - the contract columns, plus `written_by` and `client_written_at`;
  - the history index;
  - RLS (owner-only SELECT, tombstones hidden);
  - realtime ping triggers.
- Restates in full: `readmodel_sync_table_ok`, `readmodel_client_table_ok` (the `rm_client_apply` allowlist), `readmodel_purge_user`, `readmodel_live_counts` and `v_data_quality`.
- No data is changed. The first rows arrive from the app's writes, the push (after step 5) and the nightly sync.

## Step 6: verify (read-only)
1. **App:** in the Money hub, the Group funds section is visible and empty for existing users (nothing to migrate).
2. **Own account** (or a test user, with permission):
   - create a fund;
   - add one contribution into a bank account;
   - check that:
     - the account balance rises once;
     - the row shows "Held for others" on the account screen;
     - the dashboard shows the "Held for others" card;
     - net worth is unchanged;
   - undo the entry and check that everything goes back.
3. **Supabase:**
   - `select count(*) from group_funds;` and `select count(*) from group_fund_events;` (service role) grow after the save;
   - `v_data_quality` shows no `groupFunds` / `groupFundEvents` rows;
   - the next nightly `readmodel-verify` reports 0 mismatches for both collections.
4. **Read health:** `readmodel-health` shows no rejected pushes once step 4 is done. If the Android release went out first, expect `[PUSH] rejected: bad-request` for Group Funds saves until the web deploy, with the outbox and the nightly sync still copying the data.

## Read-model switches (later, not part of go-live)
- **Leave both at `firestore`** (the default) for go-live:
  - `readModel.groupFunds`: the fund list's collection switch (in `SWITCHED_COLLECTIONS`, so `--all-collections` includes it);
  - `readModel.groupFundHistory`: the screen switch for older history pages and the month view.
- Move to `shadow`, then `supabase`, only after `verify` shows 0 differences for 14 days (READ_MODEL_RULES R4).

## Rollback
- **App:** the feature is self-contained. If needed, revert the merge and release. Data written stays valid and harmless: funds are just docs, and their `accountEntries` are ordinary entries that the balance rebuild already counts.
- **Rules:** redeploy the previous `firestore.rules` from git with the same workflow. Group Funds saves are then denied, and nothing else changes.
- **Supabase:** don't drop the tables. They are unused if the app is reverted, and the purge already covers them.

## Not in this epic
- **Automatic reminders to members who haven't paid:** these need scheduling plus push (SPENDLY-222). Raise a ticket if wanted.
- **Reclassifying past manual account entries** that were really group money: this needs separate approval and a dry run (AC14).
- **Collect-split pots** have the same net-worth gap (user decision, 2026-11-05).
