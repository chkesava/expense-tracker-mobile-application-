# SPENDLY-791: Space totals from the server, independent of loaded months

## Problem
Vaults → Spaces added each Space up in the app (`summarizeSpace`) over `useExpenses()`. Since SPENDLY-748 that list holds only the months already loaded. "Brother hospital expenses" has its expenses in August, which wasn't loaded, so it showed ₹0 and 0 expenses. The open Space's list had the same gap.

## Owner direction (2026-11-19)
- A Space shows the right numbers whether or not older months are loaded.
- Every calculation runs on GitHub Actions, started by the Cloudflare Worker (epic SPENDLY-735: the app only delivers).
- Any change to an expense in a Space updates that Space automatically.

## What changed
**Server (`space-daily`)**
- `scripts/lib/spaceDailyCore.ts` + `scripts/space-daily.ts`. Per user: the Spaces, then every expense `where spaceId in [...]` (any month) from Firestore. Totals use the app's own rule (`buildStoredSpaceTotals` → `summarizeSpace`, `buildSpaceCategoryBreakdown`), soft-deleted rows excluded (`isActiveLedgerRow`).
- Writes `users/{uid}/financialSummaries/spaces` = `{ spaces: { [spaceId]: { totalSpent, expenseCount, firstExpenseDate, lastExpenseDate, categories } }, summaryVersion, calculatedAt }` through `applyJobWrites` (own tree, read-model push, dry run). Derived whole, replaced whole (a deleted Space drops out), written only when it differs.
- `.github/workflows/space-daily.yml`: `trigger` = manual / cron / queue; cron and queue runs gated by `SPACE_DAILY_ENABLED`.
- Cloudflare Worker: `space-daily.yml` joins `DAILY_WORKFLOWS` (03:00 UTC, 08:30 IST).

**Run after save (Supabase migration 20261119000000)**
- `server_run_queue` takes job `space-daily`; `server_run_dispatch` also sends `space-daily.yml` (queue mode, per-job debounce, no uid).
- Triggers: any app save to `spaces`; an app save to `expenses` whose doc has a `spaceId` now or had one before (assign, move, remove, edit, delete). Other expenses never queue. Server writes and duress uids never queue.

**App**
- `hooks/useSpacesSummary.ts` reads the stored doc through `useReadModelSource("financialSummaries")` (no Firestore listener in `supabase` mode).
- `SpacesList`, `SpaceCard`, `SpaceDetailModal` show stored totals. Only the budget share is worked out on screen, against the Space's current budget, so a budget edit shows at once. Before the server has stored a Space, it shows "Updating totals…" / "—", never ₹0.
- The open Space loads every one of its expenses (`loadSpaceExpenses` → `readSpaceExpenses`): the read model's `doc->>spaceId` match in `supabase` mode, else a Firestore `spaceId ==` query (indexed).

## Invariants
- A Space still never owns money; no ledger, no stored balances beyond a read-out.
- Firestore is the source; the summary is recomputed whole from it (R4.3a).
- No new collection: `financialSummaries` is already synced, mapped, purged and allowed.

## Tests
- `scripts/spaceDailyCore.test.ts`: any-month totals, soft-delete, no churn, whole replace, duress, queue, dry run.
- `shared/utils/spaceMath.test.ts`: stored totals, budget share, pending is null not zero.
- `lib/spacesRunAfterSave.contract.test.ts`: triggers, dispatch, workflow, server load by `spaceId`, screens show stored totals.
- `supabase-readmodel/tests/space_run_queue.sql` + `assert_security.sql` §13 (CI only; Docker isn't available locally).
- Worker list test, server-push guard updated.

## Go-live (production steps, each needs approval)
1. Merge to main.
2. Manual `space-daily.yml` dry run, then a real manual run (writes the summary for every Space owner).
3. Apply migration 20261119000000 (dry run first).
4. Set `SPACE_DAILY_ENABLED=true`; redeploy the Worker.
5. Then release the app / web build.
