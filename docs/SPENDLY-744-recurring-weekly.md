# SPENDLY-744 — Recurring-merchant detection on the server

Story in epic **SPENDLY-735**. Branch `feature/SPENDLY-735-remaining`.

## Why
The app ran `detectRecurringPatterns` over the expense list only once the list was complete. For a large ledger the list stays on the staged 300-row page, so detection never ran for the users with the most history (the same root cause as SPENDLY-732).

## What moved
- **Server job `recurring-weekly`:** `scripts/recurring-weekly.ts` + `scripts/lib/recurringWeeklyCore.ts`.
  - It runs the app's own detector and review filter (`filterPatternsForReview`: not already a subscription, merchant not dismissed), unchanged.
  - The result is stored at `users/{uid}/recurringSuggestions/{id}`. The id is the pattern key with `/` replaced.
  - A new suggestion is created with `createdAt`. A changed one is merged, so it keeps `createdAt`. A suggestion no longer eligible is deleted. Each user's writes go in one atomic batch via `applyJobWrites`.
  - Weekly: the Worker dispatches it on the daily 08:30 IST tick. The workflow's gate step stops it on every day but Sunday (IST), before any install. Gated by `RECURRING_WEEKLY_ENABLED`; a manual run defaults to a dry run.
- **App:** `hooks/useRecurringSync.ts` no longer detects. It reads the stored suggestions through `useReadModelSource("recurringSuggestions")` (Firestore by default; the on-device copy, with no listener, in `supabase` mode) and hands them to the existing review queue (`syncRecurringFromServer`). The review UI and the accept/decline flows are unchanged.

## R4.3a exception (owner-approved)
The job's inputs (expenses, subscriptions, recurring dismissals) come from the **Supabase copy**, not Firestore:
- reading every user's whole ledger from Firestore weekly would not fit the Spark read budget;
- a suggestion is advice the user confirms in the app, never money or a balance;
- the job's own output (the stored suggestions) is read from Firestore, so a write never starts from a stale copy of itself.

## Dual store
- **Firestore rule:** `recurringSuggestions` is owner-read, no client write (`firestore/recurringSuggestions.rules.test.ts`, 3 tests).
- **Read model:** a `TableSpec` (`recurring_suggestions`) and migration `20261113000000_readmodel_recurring_suggestions.sql`:
  - a new table with owner-only SELECT RLS and realtime pings;
  - added to the sync allowlist, the purge, live counts and data quality;
  - **not** on the `rm_client_apply` allowlist (the app never writes it).
- **Collection-group indexes:** `createdAt` / `updatedAt` overrides in `firestore.indexes.json`.
- **The SQL tests** (`assert_security`: 59 policies; `purge`: 120 rows; `rls_behaviour`) and `readmodel-identity-check` list the table.

## Migration coordination (important)
The Tax & ITR epic (SPENDLY-288, migration `20261110000000`, not yet on main) restates the same functions:
- `readmodel_sync_table_ok`
- `readmodel_client_table_ok`
- `readmodel_purge_user`
- `readmodel_live_counts`
- `v_data_quality`

**Whichever epic reaches main second must add the other's tables to those lists**, and to the SQL test lists, before its migration is applied. Otherwise the later migration drops the earlier one's tables from the sync and the purge.

## Guards
- **providerSwitch:** "the app runs no recurring detection; the suggestions are server-written". It also checks the rule. The collection is on the integrated read-switch list.
- **listenersOff:** `recurringSuggestions` is a migrated collection (no Firestore listener in `supabase` mode).
- **The server-push allowlist:** `recurringWeeklyCore.ts`.
- **The Worker's daily list:** `recurring-weekly.yml`.

## Tests
`scripts/recurringWeeklyCore.test.ts` (5) covers:
- detect and store;
- no rewrite when unchanged, merge when changed;
- drop when subscribed or dismissed, and deleted expenses ignored;
- a safe id;
- a batch per user, a dry run, and duress.

## Owner steps (after the epic reaches `main`)
1. Deploy the Firestore rules and indexes.
2. Apply migration `20261113000000` (dry run first; mind the coordination note above).
3. Run *Recurring weekly* as a dry run.
4. Set `RECURRING_WEEKLY_ENABLED=true` and redeploy the Worker.
