# SPENDLY-501: Firestore read quick wins (no Supabase)

[SPENDLY-501](https://kesavach.atlassian.net/browse/SPENDLY-501) is a standalone task with no epic parent. It informs the SPENDLY-494 go/no-go ADR (SPENDLY-502).
Branch: `feature/SPENDLY-501-firestore-read-quick-wins`, cut from `origin/main` `bdc2bd9`.

## What changed

| # | Change | Commit | Effect on reads | Numbers shown |
|---|---|---|---|---|
| 1 | `ensureCategoryHierarchy` returns after the `meta/categories` read when the stored version **and** a new taxonomy fingerprint are current | `8b9d111` | A login with an unchanged hierarchy reads **0** category docs instead of the whole collection (≈287 in the SPENDLY-416 session). Users stamped before this pay one more full read, then get stamped | unchanged |
| 2 | The dashboard derives its recent feed from `FinanceDataProvider`'s expenses; the `useRecentExpenses` listener is removed | `f6bb0b5` | One `expenses` listener on the dashboard instead of two (the duplicate cost 5 reads per attach, plus updates) | unchanged (same order and filter; see below) |
| 3 | `useUnifiedNetWorth` defers `usePortfolio` until `secondaryReady`, like the other secondary sources | `dd487d2` | Holdings and investment-cash reads move off first paint on the dashboard. **The total is unchanged** | unchanged |
| 4 | `AccountsList` drops 10 unused hook subscriptions | `ef73113` | The list no longer holds borrowings, receivables and bills listeners open by itself. Net worth still mounts them for its totals | unchanged |
| 5 | `useLedgerEvents` is bounded | `37a2725` | Audit tab: the newest 100 events, then cursor pages of 100 ("Load older entries" and scroll-to-end). Transaction detail and the row audit sheet: `where docId ==`, so they read only that row's events | unchanged |
| 6 | The performance-budget check now also scans `hooks/`, `app/` and `components/` for re-listens to provider-owned collections, and resolves collection/query variables | `522d78b` | Guardrail only. It flags the removed `useRecentExpenses` when that file is restored | n/a |

### Behaviour notes

**Change 1: hidden or archived default categories.**
- **Before:** if a user hid or archived a **default** category, the stored defaults no longer matched the tree. The next login then re-ran the full upsert: it un-hid the category and re-read every expense, budget, rule, subscription and trip.
- **Now:** that only happens when the shipped taxonomy changes.
- So a user's "Hidden from picker" choice now survives logins. That matches the toast's promise, but **it is a behaviour change.**

**Change 2: which expenses the recent feed can see.**
- The old feed queried `orderBy(date desc, createdAt desc) limit(5)`.
- The provider holds the newest 300 rows by `createdAt`.
- A row dated in the future that was *created* more than 300 rows ago would no longer appear in the five-row feed.
- Incomes in the same feed already came from the provider.

**Change 5: `ledgerEvents` index.** The `where docId ==` query uses Firestore's automatic single-field index. No `firestore.indexes.json` change is needed or made.

## Not done in this branch (needs a decision)

**Bounding `accountPayments`, `accountEntries` and `accountTransfers`** (`providers/FinanceDataProvider.tsx` idle-deferred listeners) is **not** done. These full ledgers feed numbers, not just lists:
- `useUnifiedNetWorth` → `composeNetWorth` derives liquid balances for accounts without a `balanceAsOfDate` baseline;
- `CreditCardBillsProvider` uses `accountPayments`;
- `accounts/[id]` running balances use them too (the SPENDLY-487 anchor).

Bounding them changes those numbers unless every consumer first moves to materialized values. That is the territory of SPENDLY-496/497/499, and the ticket requires "balances and net worth unchanged".

**Instrumenting every remaining hook with `logQuerySnapshot`** is only partly done: the new `useLedgerEvents` is instrumented.

**Hook tests** (the listener not mounted) are not possible as written. Vitest only collects `shared/`, `services/`, `lib/`, `supabase/functions/` and `scripts/` (`vitest.config.ts`), so the hook logic was moved into tested pure functions instead:
- `newestLiveExpenses`;
- `taxonomyFingerprint` / `hierarchyStampIsCurrent`;
- `ledgerEventPages`;
- the `ensureCategoryHierarchy` early exit, with Firestore mocked.

## Measurement

**Not measured yet.** The ticket's before/after uses the SPENDLY-416 `[fs-read]` method in Spendly Test (emulator) plus the 7-day Firebase console export. Both need a device or web session that this agent did not run.

Expected, not measured:
- **Cold launch with a current hierarchy stamp:** about −287 reads (categories) and −5 (duplicate dashboard expenses). Against the 885-read session in `docs/SPENDLY-416-qa-rollout.md:75-83`, that is ≈ 593.
- **Audit tab:** at most 100 reads per open instead of the whole `ledgerEvents` collection.

`docs/SPENDLY-415-read-budget.md` will be updated once these are measured.

## Tests

- `npm test`: 364 files, 5,534 tests, all passing.
- `npm run typecheck:shared`: passes.
- `npx tsc -p tsconfig.json --noEmit`: passes.
- `node scripts/verify-performance-budgets.js`: all guardrails pass.
