# SPENDLY-496: balance-moving writes that skipped the stored account balance

[SPENDLY-496](https://kesavach.atlassian.net/browse/SPENDLY-496) is a standalone bug, P0-2 in the 2026-10-11 audit. It is the second item of the correctness track (495 → 496 → 497 → 499 → 500 → 503).

Branch: `fix/SPENDLY-496-balance-moving-writes`, cut from `main` `0e7db3f`.

## Flow table: every flow `computeBankBalance` counts, against its write path

| Flow (row field → account) | Write path | Before this fix |
|---|---|---|
| Expense / income (`accountId`) | `services/ledger/*` | ✅ balance ops |
| Bill payment, from side (`fromAccountId`) | `services/creditCards/billPayment.ts` | ✅ |
| Manual entry (`accountId`) | `FinanceDataProvider.addEntry/deleteEntry` | ✅ |
| Transfer, both legs | `FinanceDataProvider.addTransfer/deleteTransfer` | ✅ |
| Bank ↔ investment-cash leg | `services/portfolio/investmentCash.ts` | ✅ already fixed by **SPENDLY-523** |
| Recurring / EMI due-post | `services/subscriptions/duePost.ts` | ✅ already fixed by **SPENDLY-523** |
| **Borrowing** (`creditedAccountId`, +principal) | `BorrowingsReceivablesProvider` create / edit / delete (cascade) | ❌ **no balance op** → fixed |
| **Borrowing repayment** (`paymentAccountId`, −amount) | add / delete | ❌ → fixed |
| **Money lent** (`sourceAccountId`, −originalAmount) | create / edit / delete (cascade) | ❌ → fixed |
| **Collection** (`receivedAccountId`, +amount) | add / delete | ❌ → fixed |
| **Split own-share expense** (`accountId`) | `useSplits.createSplit` | ❌ no balance op and **no dashboard op** → fixed |
| Split gift-purchase expense | `useSplits` gift purchase | balance ✅; **no dashboard op** → fixed |
| Split balance ops applied with a forced `batch.update` | `useSplits` (4 places) | ❌ the `financialSummaries/netWorth` set-merge failed the whole batch when that doc did not exist → fixed |
| Legacy `addPayment` / `addExternalPayment` | `FinanceDataProvider` | No balance op, but **no callers** (bill payments use `billPayment.ts`). Left as is; noted |

## The fix

| File | Change |
|---|---|
| `shared/utils/ledgerAccountDeltas.ts` | New `netBankBalanceDeltas(before, after, accountContext, today)`, built on SPENDLY-523's `ledgerRowAccountDeltas`. It gives the net change per account when rows are replaced:<br>• create: `before = []`;<br>• delete or cascade: `after = []`;<br>• edit: both.<br>Same rules as `computeBankBalance`: non-credit accounts only, and only rows on or after the account's effective `balanceAsOfDate` |
| `services/ledger/debtBalanceOps.ts` (new) | `debtLedgerBalanceOps` reads the accounts (cache first) and turns the deltas into `buildAccountBalanceOps`, which also covers net worth. It skips accounts that no longer exist, because an update to a missing doc would fail the batch |
| `services/ledger/fetchAccountTypes.ts` | `AccountInfo` gains `exists` and `balanceAsOfDate` |
| `providers/BorrowingsReceivablesProvider.tsx` | These 8 writes now go through **`commitMutations`** (the offline outbox, whose ack guard stops a replay applying an increment twice), with the balance ops in the same atomic batch:<br>• create, edit and cascade delete of a borrowing;<br>• add and delete of a borrowing repayment;<br>• the same four for receivables.<br>A delete reads the row if it isn't in memory, so its effect can still be reversed |
| `lib/stageMutationOps.ts` (moved from `investmentCash.ts`) | Stages ops on a raw batch, honouring `set`/`merge`/`update`/`delete`. Used by `useSplits` and `investmentCash` |
| `hooks/useSplits.ts` | Uses `stageMutationOps` in place of the forced `batch.update`. The own-share expense now gets its account balance op and its dashboard op (`computeDashboardExpenseCreateOps` from SPENDLY-495); the gift expense gets its dashboard op |

## Tests

| Test | What it proves |
|---|---|
| `shared/utils/netBankBalanceDeltas.test.ts` (5) | Signs per kind; edits move only the difference; a cross-account edit moves both; a cascade reverses the parent and its repayments; credit cards, unknown accounts and pre-baseline rows are skipped. **A property test:** 30 runs of 50 random create/edit/delete steps over borrowings, repayments, lends and collections, across two bank accounts (one with a `balanceAsOfDate`), a card and no-account rows. Stored balances always equal `computeBankBalance` |
| `services/ledger/debtBalanceOps.test.ts` (4) | The emitted account and net-worth ops; skips for a credit card, a deleted account and a pre-baseline row |
| `lib/stageMutationOps.test.ts` (1) | `set` with merge stays `set` with merge, so a missing `netWorth` doc is created instead of failing the batch |
| `services/ledger/fetchAccountTypes.test.ts` | Updated for the two new `AccountInfo` fields |

Results:
- `npm test`: 381 files, 5,706 tests, all passing.
- `npm run typecheck:shared`: passes.
- `npx tsc -p tsconfig.json --noEmit`: passes.
- `node scripts/verify-performance-budgets.js`: passes.

**Not run:**
- Device or Spendly Test QA (borrow → repay → delete; lend → collect → delete; split with own share).
- `npm run test:rules`, because the rules are unchanged.

## Known gap, out of scope here

Expense, income, entry, transfer and due-post writes apply their delta **regardless of the account's `balanceAsOfDate`**, but `computeBankBalance` ignores rows dated before it. So a back-dated row still drifts on those paths. The new debt paths honour the baseline.

The proper fix is to pass the row date into `buildAccountBalanceOps` for every writer. That cross-cutting change is proposed as its own ticket.

## Production

These writes are new, so **existing** drift from past borrowings, receivables and split shares stays in stored balances until a reviewed rebuild (`scripts/rebuild-domain-summaries.ts`, dry-run first). That is coordinated with **SPENDLY-500**.
