# SPENDLY-487: Anchor account "Balance after" on the stored balance

## Bug
On 2026-10-10, on the user's phone (read-only), the HDFC account was inconsistent between two screens:

| Screen | Value | Activities |
|---|---|---|
| Overview | ₹56,080.50 | |
| Transactions, latest "Balance after" (default startup page: 336 of 808 ledger records loaded) | ₹1,20,260.50 | 98 |
| Transactions, latest "Balance after" (full history loaded in Journal) | ₹56,080.50 | 161 |

## Cause
- `buildAccountActivities` replayed running balances **forward from `openingBalance`** over whatever rows were in memory.
- The expense ledger is paginated (newest pages first), so missing older pages meant missing spending. Here that was 63 HDFC expenses worth ₹64,180.
- The header uses the materialized `currentBalance`, which the server rebuild reconciles, and that value was correct.

## Fix (zero extra Firestore reads)
Loading the whole ledger to fix the replay would cost 700+ document reads, so the fix uses data already in memory.

### Anchor on the stored balance
For non-credit accounts where `balanceInitialized === true`, `currentBalance` is a finite number, and neither reconciliation flag says `needs_reconciliation`:
- Running balances walk **backwards from `currentBalance`** over the loaded rows, newest to oldest.
- The newest row always equals the header.

### Partial-ledger boundary
Expenses and incomes page separately, so below the oldest loaded page of an incomplete collection there can be gaps.
- `partialLedgerBoundary()` returns the latest of those oldest-loaded dates.
- Rows on or before that date get **no** running balance instead of a guess.

### No trustworthy stored balance
- The old forward replay is kept, but only when the ledger is complete (`ledgerComplete`).
- Otherwise no running balance is shown.

### Account health
`useAccountActivities` now exposes `ledgerComplete` and `loadedFrom`. The Account health card says "Based on activity after <date>. Older history isn't loaded yet." while history is partial.

## Files
- `shared/utils/accountBalance.ts`: the anchor, `AccountActivityOptions` and `partialLedgerBoundary`.
- `hooks/useAccountActivities.ts`: passes completeness and the boundary.
- `components/accounts/AccountHealthCard.tsx`, `app/(app)/accounts/[id].tsx`: the partial-history note.
- `shared/utils/accountBalance.test.ts`: six new tests, including the device scenario.

## Not in scope
- **Older history on the account screen:** loading it would need a per-account paged query (`where accountId == id`, ordered by date). That reads only that account's docs, on demand, and could be a follow-up.
- **Highest/lowest/average balance:** these still cover only the rows that have a running balance. The card now says so.

## Tests
- `npm test`: 352 test files pass.
- `npm run typecheck:shared`: clean.
- `npx tsc -p tsconfig.json --noEmit`: clean.
