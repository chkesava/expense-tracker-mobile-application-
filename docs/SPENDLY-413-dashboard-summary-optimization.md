# SPENDLY-413: Dashboard Summary and Derived Data Optimization

## Objective

Prevent the dashboard from downloading historical ledgers solely to calculate small aggregate values. Part of the SPENDLY-406 Firestore Read Optimization epic.

## Finding: the dashboard doesn't over-fetch — it silently under-covers

Research found the dashboard never calls `loadAllExpenses`/`loadAllIncomes` and never gates on `expensesComplete`/`incomesComplete` — SPENDLY-410's cursor pagination is already opt-in only (ledger scroll, export). The actual problem is the opposite: with the ledger listener now permanently capped to a ~300-doc staged page (SPENDLY-409), two dashboard computations silently assumed more history than that page can guarantee, with no signal to the user when the assumption breaks:

1. **`cashFlowByMonth(expenses, incomes, activeMonth, 6)`** (`app/(app)/dashboard.tsx`) buckets whatever is in the staged arrays into 6 trailing months. A month with no matching rows renders identically whether nothing happened or the month simply fell outside the staged window — an actively wrong chart for any high-volume user (e.g. SMS auto-import), not just an incomplete one.
2. **Net worth's liquid balance** (`NetWorthWidget` → `useUnifiedNetWorth` → `composeNetWorth` → `computeBankBalance`) replays an account's full signed transaction history unless the account has a manually-set `balanceAsOfDate` baseline (optional, never defaulted). This violates this codebase's own established convention — `hooks/useExpenses.ts` documents `complete` precisely as *"anything that writes money derived from the whole ledger must wait for this, not for `loading`"* — a rule `useFeeIntelligence`, `creditCardAnalytics`, and `ledgerAudit` already follow, but `useUnifiedNetWorth`/`composeNetWorth` did not.

## Scope decision

The ticket's "correct" fix — a per-account running-balance counter maintained via `increment()` alongside every balance-affecting write (expenses, incomes, payments, entries, transfers, borrowings, receivables; ~8-10 call sites), with a rebuild/reconciliation path modeled on Ganesh Seva's `deriveFestivalSummary`/`rebuildFestivalSummary` pattern — is a cross-cutting change to the app's core money-write paths. Per the ticket's own caution ("only introduce denormalized summaries where correctness, write cost, migration and recovery behavior are fully defined"), **this was confirmed with the user as out of scope for this story** and flagged as a recommended follow-up ticket under this epic.

This story ships the safety net instead: fix what's provably wrong or misleading today, using only read-side, pure-function changes — no new Firestore fields, no migration, no new write paths.

## Changes

1. **`shared/utils/spendlyBudget.ts`** — added `oldestTrustedCashFlowMonth` and `trimToTrustedCashFlow`. The first finds the truncation boundary of a possibly-staged `expenses`/`incomes` array (the later of each collection's oldest present month, or `null` when both are known-complete); the second trims `cashFlowByMonth`'s fixed 6-month result down to only the months after that boundary, instead of showing fabricated zero bars.
2. **`app/(app)/dashboard.tsx`** — reads `complete` off `useExpenses()`/`useIncomes()` (already returned, just unused before) and trims `cashFlow` before passing it down.
3. **`components/dashboard/NetWorthWidget.tsx`** — the "Cash movement" label is now dynamic (`last N months`), so a trimmed window never claims more history than it shows.
4. **`shared/utils/accountBalance.ts`** — added `accountNeedsFullLedgerHistory(account, today)`, reusing the existing `effectiveBalanceAsOfDate` check to detect an account with no opening-balance baseline.
5. **`shared/utils/netWorth.ts`** — `NetWorthInputs` gained optional `expensesComplete`/`incomesComplete` (default `true`, so other consumers of `NetWorthInputs` like the runway feature are unaffected); `NetWorthTotals` gained `liquidBalanceMayBePartial: boolean` — true only when a non-credit account lacks a baseline **and** the ledger is staged. Purely informational; the computed totals themselves are unchanged.
6. **`hooks/useUnifiedNetWorth.ts`** — threads `expensesComplete`/`incomesComplete` through and surfaces `liquidBalanceMayBePartial` on `UnifiedNetWorthSummary`.
7. **`components/dashboard/NetWorthWidget.tsx`** — shows one small, non-blocking note under the net worth figure when `liquidBalanceMayBePartial` is true: *"Based on recent activity — set an opening balance date on long-running accounts for full accuracy."*
8. **`components/dashboard/RecentActivityWidget.tsx`** — replaced `` `${expenses.length} total recorded` `` (actually the staged-page count, not the lifetime total) with "Latest activity."
9. **Tests** — `shared/utils/spendlyBudget.test.ts` and `shared/utils/netWorth.test.ts` cover the new cutoff/trim helpers and the `liquidBalanceMayBePartial` flag (complete ledger → false; account with baseline → false even if staged; account without baseline + staged → true; credit accounts never trigger it).

## Verification

- `npm test` — 364 files / 5452 tests passed.
- `npm run typecheck:shared` and `npx tsc -p tsconfig.json --noEmit` — clean.
- `git diff --stat` against the epic branch — touches exactly the 9 files above (5 source + 2 test + this doc, plus tracker/inventory docs on merge).
- Manual/emulator check (seed an account past the staged limit with no `balanceAsOfDate`, confirm the new note appears and disappears once a baseline is set; confirm the cash-flow label matches the bars actually shown) — still pending.

## Left alone, and why

- **Per-account running-balance summary** — the ticket's actual "denormalized summary" ask. Needs a new account field, `increment()` wiring at every balance-affecting write site, a one-time backfill (dry-run first, shared prod Firebase, no staging), and a rebuild/reconciliation path. Recommended as its own follow-up ticket rather than being squeezed into this one.
- `TopCategoriesWidget`, `QuickInsightsWidget`, `SafeToSpendWidget`, `GamificationWidget` — already correctly scoped (month-bounded, or already using the incremental-with-floor pattern for streaks that `hooks/useGamification.ts` documents). No changes needed.
- No Firestore rules/schema changes, no new collections, no migration script.
