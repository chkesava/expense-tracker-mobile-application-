# Phase 17 — Borrowings / Loans

Tracks money you have borrowed, from a bank or from your brother, and the
repayments that clear it.

## The rule everything else follows from

Borrowed money is a **liability, never income**. A borrowing writes to
`users/{uid}/borrowings` and nothing else, so `users/{uid}/incomes` is
untouched and every existing income report, monthly summary and analytics
screen keeps producing exactly the number it produced before. A repayment is
likewise **not an ordinary expense** — it lives in
`users/{uid}/borrowingRepayments`, so it never lands in a category budget or a
spending chart.

`lib/finance/borrowings.integration.test.ts` asserts both directly rather than
leaving them as documentation.

## Data model

`shared/types/borrowing.ts` holds two records.

A `Borrowing` carries the lender (`lenderType` plus a free-text `lenderName`),
`principalAmount`, the interest configuration, `borrowedDate`, an optional
`dueDate`, and the account the cash landed in via `creditedAccountId`.

Interest is described by three explicit fields so nothing is inferred:

- `interestType` — `NONE` or `SIMPLE`.
- `interestFrequency` — `MONTHLY`, `ANNUAL`, `ONE_TIME` or `NONE`. `ONE_TIME`
  charges the rate once regardless of how long the borrowing stays open.
- `interestBasis` — `ORIGINAL_PRINCIPAL` charges every period on the amount
  first borrowed; `OUTSTANDING_PRINCIPAL` charges only on what is still owed,
  splitting the timeline at each repayment.

`outstandingPrincipal`, `accruedInterest`, `totalOutstanding` and `status` are
also stored on the document, but only so lists can filter and sort in Firestore.
Anything shown to the user is recomputed by the pure engine — the same
denormalization tradeoff `Trip.spentAmount` already makes.

A `BorrowingRepayment` stores the `amount` together with the
`principalComponent` / `interestComponent` split computed at the time it was
recorded, so the ledger stays deterministic even if the interest rate is edited
later.

## The math engine

`shared/utils/borrowingMath.ts` is pure: no Firebase, no React Native, fully
unit tested in `shared/utils/borrowingMath.test.ts`.

`summarizeBorrowing(borrowing, repayments, asOfDate)` is the authoritative view.
It returns principal paid and outstanding, interest accrued and paid, totals,
the derived status and the settled date.

Status derivation resolves in this order: a manual `CLOSED` always wins because
it is a deliberate user decision; zero outstanding is `FULLY_SETTLED`; past the
due date is `OVERDUE`; any repayment at all is `PARTIALLY_SETTLED`; otherwise
`ACTIVE`.

`allocateRepayment` clears **interest before principal**, the conventional
order. `validateRepayment` rejects a payment larger than the outstanding total
unless the caller explicitly opts into overpayment, which is what stops a
fat-fingered amount from silently creating a negative balance.

## Account balances

`computeBankBalance` gained two optional trailing parameters, both defaulting to
an empty array, so every existing caller and test compiles unchanged:

```ts
opening + incomes - expenses - billPayments + entries - transfersOut
        + transfersIn + borrowedIn - repaymentsOut
```

`borrowedIn` counts borrowings whose `creditedAccountId` is this account;
`repaymentsOut` counts repayments whose `paymentAccountId` is this account. Both
respect the account's `balanceAsOfDate` baseline exactly like every other term.

`buildAccountActivities` takes a new optional `liabilities` argument and emits a
credit row per incoming borrowing and a debit row per outgoing repayment,
tagged with `isBorrowing` / `isLoanRepayment` and linked by `linkedBorrowingId`
/ `linkedRepaymentId`.

`useUnifiedNetWorth` adds `borrowingLiabilities` to the liability side. The
borrowed cash already sits inside the bank balance on the asset side, so
counting the outstanding amount as a liability is what makes net worth honest.

## UI

A new **Borrowings** tab in the Ledger Hub. `ExpenseForm` is not touched by this
phase at all — `CreateBorrowingModal` is its own dedicated form.

- `BorrowingsList` — portfolio cards for Total Borrowed, Outstanding, Interest
  and Repaid, plus search and status / lender-type / date filters.
- `BorrowingCard` — lender, principal, outstanding and a progress bar.
- `BorrowingDetailModal` — the principal and interest breakdown, repayment
  history, and add repayment / edit / delete.

## Manual Testing Guide

**Commands needed:** none. `npx expo start` hot-reload covers all of it.

1. **Create a borrowing.** Ledger Hub → **Borrowings** → **+**. Lender type
   *Friend*, name *Ravi*, amount *20000*, no interest, borrowed today, credited
   to your main bank account. Save.
2. **Confirm the credit.** Open that account. The balance is **20000 higher**
   and the activity feed shows a green *Money borrowed* row from Ravi.
3. **Confirm it is not income.** Go to the income list and any income report for
   this month. The 20000 must appear **nowhere**. This is the check that
   matters most.
4. **Partial repayment.** Back in Borrowings, open the borrowing, add a
   repayment of *8000* paid from the same account. Outstanding drops to 12000,
   status becomes *Partially settled*, and the account balance drops by 8000
   with a *Loan repayment* debit row in its feed.
5. **Confirm it is not an expense.** Check the expense list and this month's
   category spending. The 8000 must not appear as an expense anywhere.
6. **Overpayment guard.** Try to repay *99999*. It is rejected with a message
   naming the outstanding amount, and nothing is written.
7. **Full settlement.** Repay the remaining *12000*. Status flips to *Fully
   settled*, outstanding shows 0, the settled date is today, and the account is
   back to the balance it had before step 1.
8. **Interest.** Create a second borrowing of *10000* at *1% monthly* on
   outstanding principal, back-dated two months. Its detail screen shows roughly
   *200* accrued interest. Repay *1200* — the split shows 200 interest and 1000
   principal, leaving 9000 principal.
9. **Overdue.** Create a borrowing with a due date in the past and no
   repayments. It shows as *Overdue* and is counted in the overdue filter.
10. **Delete cascade.** Delete a borrowing that has repayments. It disappears,
    its repayments go with it, and the account balance returns to what it was
    before the borrowing existed.
11. **Regression sweep.** Add a normal expense and a normal income. Both behave
    exactly as before, and the dashboard total balance reflects the borrowing
    credit alongside them.
