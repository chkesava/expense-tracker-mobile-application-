# Phase 19 — Receivables / Money Lent

Tracks money you lend to other people and the repayments that clear it.

## The rule everything else follows from

Money lent is an **asset conversion, never an expense**. A receivable writes to
`users/{uid}/receivables` and nothing else, so expense reports and category
totals stay correct. A collection writes to
`users/{uid}/receivableRepayments` and never to `users/{uid}/incomes`.

When you lend ₹20,000 from a ₹50,000 bank account:

- Bank balance → ₹30,000
- Receivable asset → ₹20,000
- Net assets still → ₹50,000

`lib/finance/receivables.integration.test.ts` asserts that directly.

## Data model

`shared/types/receivable.ts` holds `Receivable` and `ReceivableRepayment`.
Person is free-text (`personName` + `personType`). Optional `spaceId` can link a
lend into a Spending Space without mixing it into expense spend.

Outstanding and status are denormalized for list filters; `summarizeReceivable`
is authoritative for display. No interest in v1.

## Accounting

`computeBankBalance` gains two trailing optional params:

```ts
- lentOut      // receivables.sourceAccountId
+ collectionsIn // receivableRepayments.receivedAccountId
```

`useUnifiedNetWorth` adds `receivableAssets` to `totalAssets` so lending does
not incorrectly shrink net worth.

## UI

Ledger Hub → **Receivables** tab. Dedicated create/detail modals — ExpenseForm
is untouched.

## Manual Testing Guide

**Commands needed:** none. `npx expo start` hot-reload covers all of it.

1. **Create.** Ledger → Receivables → Record Money Lent. Person *Rahul*,
   amount *20000*, paid from your main bank. Save.
2. **Confirm the debit.** Account balance is 20000 lower. Activity shows
   *Money lent* to Rahul. Expense list does **not** contain the 20000.
3. **Confirm net worth.** Total assets should stay roughly the same as before
   the lend (cash down, receivable asset up).
4. **Partial repayment.** Open the receivable → Record Repayment *10000* into
   an account. Outstanding 10000, status Partially settled. Income list does
   **not** contain the 10000.
5. **Overpayment guard.** Try to repay more than outstanding — rejected.
6. **Full settlement.** Repay the rest → Fully settled, account restored.
7. **Space link (optional).** Create with a Space selected. Open that Space —
   Money Lent section shows the lend separately from expenses.
8. **Regression.** Add a normal expense and income — both unchanged.

## Firebase

Redeploy indexes after pull:

```bash
firebase deploy --only firestore:indexes --project expenseapp-27f94
```
