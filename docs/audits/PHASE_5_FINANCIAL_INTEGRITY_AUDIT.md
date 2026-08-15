# Phase 5 — Financial Calculations & Data Integrity Audit (2026-08-15)

Scope: financial calculations and data integrity only. No UI redesign; the
only code changes are inside the pure calculation module and its test
suite. Inspected: account balances, income, expenses, transfers, credit
cards, borrowed money, money lent to others, receivables, liabilities, net
worth, recurring transactions, reports, monthly/yearly calculations, date
ranges, and timezone handling — with specific attention to JavaScript
floating-point safety in money math.

**Headline finding**: this codebase is unusually disciplined about money
math already. `shared/utils/borrowingMath.ts`, `receivableMath.ts`, and
`spaceMath.ts` all define and consistently apply a `roundMoney()` helper
(round-to-nearest-cent with an `Number.EPSILON` correction) after every
arithmetic step, and use `<= 0` rather than `=== 0` for settlement checks —
exactly the right defenses against float drift. **`shared/utils/accountBalance.ts`
was the one exception** — it had no `roundMoney()` at all, and one place
used exact `=== 0` equality on a value built from independent floating-point
sums. That's the confirmed bug fixed in this phase.

---

## 1. Calculation Bugs Found & Fixed

### 1.1 [FIXED — Confirmed, reproduced] Credit card bill history could show "partially paid" forever for a bill paid in full, due to float residue

**Where:** [shared/utils/accountBalance.ts](../../shared/utils/accountBalance.ts), `getCreditBillHistory()`.

**What the bug was:** `billedAmount` (sum of that cycle's expenses) and
`paidAmount` (sum of that cycle's payments) were computed as raw
`reduce((sum, x) => sum + x.amount, 0)` with no rounding anywhere in this
file (unlike `borrowingMath.ts`/`receivableMath.ts`, which round after every
sum). The bill's status was then derived with an **exact** equality check:
`outstandingAmount === 0 ? "paid" : ...`, where `outstandingAmount =
Math.max(0, billedAmount - paidAmount)`.

JavaScript floats don't represent most decimals exactly — the textbook case
is `0.1 + 0.2 === 0.30000000000000004`, not `0.3`. If a cycle's expenses sum
to a value like that (billed) and the user pays exactly the nominal total in
one payment (paid = `0.3`), the subtraction `billedAmount - paidAmount`
lands on a tiny non-zero residue (`5.55e-17` in that example) instead of
exactly `0`. Since the status check used `=== 0`, that residue made the bill
permanently show as **"partiallyPaid" even though it was paid in full to the
cent** — there's no way for the user to ever clear it from that screen,
since any amount they pay is compared the same way.

**Failure scenario, concretely:** a user has three small purchases on a
credit card that happen to sum to a float-imprecise total (this is common —
almost any set of everyday amounts can trigger it depending on the exact
decimal bit patterns), pays their statement in full, and the bill history
still lists that cycle as partially paid, with an "outstanding amount" that
displays as `₹0.00` (since the UI rounds for display) but never satisfies
the internal `=== 0` check that would flip the status to fully paid. This
would also incorrectly affect anything gating on `"paid"` status (e.g. not
sending a payment reminder for a bill that's actually settled), and shows up
in `computeCreditUsage()`'s `usedThisCycle`/`availableCredit` too, though
those weren't compared with `===` directly in this file — round them
anyway, both because a downstream consumer might do that comparison later,
and because credit-limit math should carry the same precision guarantees as
every other balance in this file.

**Fix applied:** Added the same `roundMoney()` helper already used
elsewhere in this codebase (round-to-nearest-cent with epsilon correction)
to `accountBalance.ts`, and applied it to every computed monetary value in
the file: `computeBankBalance`'s return value, `computeCreditUsage`'s
`expenseTotal`/`paidThisCycle`/`usedThisCycle`/`availableCredit`,
`getCreditBillHistory`'s `billedAmount`/`paidAmount`/`outstandingAmount`,
the per-activity `runningBalance` accumulator in `buildAccountActivities`,
and the arithmetic in `previewBalanceAfterTransaction`/
`previewBalanceAfterBillPayment` (used by the add/edit expense flows to
preview "what will my balance be"). Also changed `outstandingAmount === 0`
to `outstandingAmount <= 0`, matching the safer pattern already used in
`borrowingMath.ts`/`receivableMath.ts`, as defense in depth alongside the
rounding fix.

**Verified as a real regression, not a theoretical one:** before writing
the fix, I confirmed `0.1 + 0.2 !== 0.3` reproduces in this exact code path
(two card expenses of `0.1` and `0.2`, one payment of `0.3`), then
temporarily reverted the fix and re-ran the new test — it failed with
`expected 'partiallyPaid' to be 'paid'`, exactly as predicted, before the
fix was restored.

---

## 2. Areas Verified Correct (No Bugs Found)

- **Transfers never inflate income/expense/net worth.** Transfers between
  the user's own accounts live in a completely separate `AccountTransfer[]`
  array from `Expense[]`/`Income[]`. Every monthly/yearly aggregation
  (`dashboard.tsx`'s `monthlyExpenses`/`monthlyIncomes`, `monthlyComparison.ts`,
  `monthSummary.ts`) filters only the `expenses`/`incomes` arrays — transfers
  are structurally impossible to double-count as income or expense because
  they're never in those arrays to begin with. `computeBankBalance` applies
  `transfersOut`/`transfersIn` as pure cash movements between accounts, which
  cancel out to zero net worth impact across the two accounts involved
  (verified by the existing test `"moves money between accounts without
  treating it as income or an expense"`).
- **Borrowing/lending net worth accounting is correct.** Traced through the
  full model: borrowing money credits the receiving account's cash balance
  (`computeBankBalance`'s `borrowedIn`) *and* creates an equal liability
  (`borrowingLiabilities` in `useUnifiedNetWorth`) — net worth impact is
  exactly zero at the moment of borrowing, as it should be (you're not
  richer for taking a loan). Repaying a loan reduces cash and reduces the
  liability by the same principal amount — also net-zero, except for accrued
  interest, which correctly *does* reduce net worth over time even before
  any cash changes hands (`computeAccruedInterest` growing
  `outstandingInterest`). Lending money to someone converts cash into a
  receivable asset (net-zero); collecting a receivable converts it back to
  cash (also net-zero). No double-counting found anywhere in this chain.
- **Credit card liabilities don't leak into bank cash.** A credit card
  expense only affects that card's own `usedThisCycle` — it never touches
  any bank account's `computeBankBalance` — until the bill is paid, at which
  point the payment is a proper `billPaymentsOut` deduction from the paying
  bank account. Confirmed by reading both `dashboard.tsx`'s `totalBalance`
  computation and `useUnifiedNetWorth.ts`'s per-account-kind branching.
- **Month-end and leap-year date math already has dedicated test
  coverage** in `shared/utils/borrowingMath.test.ts` (`elapsedMonths("2026-01-31",
  "2026-02-28")` confirms Jan 31 correctly clamps to Feb 28 for interest
  accrual across a shorter month) — no gap found here.
- **`shared/utils/dates.ts`'s `parseLocalDate`** deliberately avoids the
  classic `new Date("2024-01-15")` UTC-shift bug (parsing a bare date string
  with the native `Date` constructor interprets it as UTC midnight, which
  can silently roll to the previous/next day depending on the device's
  timezone offset) by manually splitting the date key and constructing a
  local-time `Date` from the components. This is correct and deliberate,
  confirmed by reading the implementation and its doc comment.
- **`borrowingMath.ts`/`receivableMath.ts`'s settlement/status logic** was
  reviewed in full and found already float-safe: every derived total is
  passed through `roundMoney()`, and every "is this settled" check uses
  `<= 0` rather than `=== 0`. No changes needed.
- **Zero-amount and large-amount handling**: traced through
  `computeBankBalance` with a zero-amount expense (correctly a no-op on the
  balance) and with 7-figure amounts (correctly preserved to the cent,
  verified in the new tests below) — no overflow or precision-loss issue at
  the magnitudes this app would realistically see (JS's `number` type is an
  IEEE-754 double, exact for integers up to 2^53 and for cent-denominated
  values well beyond any realistic personal-finance amount).

## 3. Files Changed

| File | Change |
|---|---|
| [shared/utils/accountBalance.ts](../../shared/utils/accountBalance.ts) | Added `roundMoney()`; applied it to every computed balance/usage/history value; changed one `=== 0` status check to `<= 0` |
| [shared/utils/accountBalance.test.ts](../../shared/utils/accountBalance.test.ts) | Added a new `"floating-point safety in money math"` test suite (7 tests) |

No other files were touched — the bug and its fix were fully contained to
this one calculation module.

## 4. Tests Added

Seven new tests in `shared/utils/accountBalance.test.ts`, covering the edge
cases the task called out specifically:

1. **Decimal precision** — `0.1 + 0.2` summed as two expenses lands on an
   exact `0.7` balance, not `0.7000000000000001`-style noise.
2. **Zero amount** — a zero-amount expense leaves the balance unchanged.
3. **Large amounts** — a 7-figure opening balance minus a 7-figure expense
   with cents resolves to the exact expected cent value.
4. **Edited transaction** — `previewBalanceAfterTransaction` correctly
   excludes the original row (by id) and re-applies a new decimal amount,
   the same pattern the edit-expense modal uses for its live preview.
5. **Deleted transaction** — confirms a deleted expense's effect disappears
   from `computeBankBalance` once it's no longer in the input array (how the
   app models deletion — the row is simply omitted going forward).
6. **The confirmed bug, as a regression test** — two credit card expenses of
   `0.1` and `0.2`, paid off with one `0.3` payment, must resolve to `"paid"`
   with `outstandingAmount === 0`. This test was verified to fail against
   the pre-fix code (see §1.1) before being confirmed passing against the
   fix.
7. **Credit usage with decimals** — `computeCreditUsage` on three decimal
   charges resolves to the exact expected `usedThisCycle`/`availableCredit`.

## 5. Verification

| Check | Command | Result |
|---|---|---|
| TypeScript | `npx tsc -p tsconfig.json --noEmit` | **Passed.** No type errors. |
| ESLint | *(still not configured — see [Phase 1](PHASE_1_ARCHITECTURE_AUDIT.md))* | **Not run — nothing configured.** |
| Full test suite | `npx vitest run` | **Passed.** 84 test files, 567 tests (up from 560 in Phase 4 — the 7 new tests above). |

## 6. Remaining Risks

- **Billing-cycle "today" uses device-local time, not the user's configured
  `settings.timezone`.** `shared/utils/billingCycle.ts`'s `getBillingCycleDates()`
  calls raw `new Date()` for "today" when deciding which credit card billing
  cycle is current, while other parts of the app (e.g. `dashboard.tsx`'s
  month grouping) explicitly thread a user-configurable `settings.timezone`
  through `formatDateKey()`. If a user's app-configured timezone differs
  from their device's actual timezone (e.g. while traveling), an expense
  made right at a billing-cycle boundary could be attributed to the wrong
  cycle. This is a real inconsistency, but fixing it correctly requires
  deciding whether billing cycles should ever follow anything other than the
  device's real clock (a product decision, not a pure bug), and would touch
  every caller of `getBillingCycleDates()`/`computeCreditUsage()`/
  `getCreditBillHistory()`. Not changed in this phase to avoid a
  half-migrated, inconsistent state; flagged for a dedicated decision.
- **`AccountPayment.appliedCycleStart`/`appliedCycleEnd` fallback matching.**
  When a payment has neither field set, `paymentBelongsToCycle()` falls back
  to comparing the payment's own date against the cycle's date range. This
  can attribute a payment made exactly on a cycle's close date to the
  *next* cycle rather than the one that just closed (discovered while
  writing the regression test in §1.1, which had to set explicit
  `appliedCycleStart`/`appliedCycleEnd` to get deterministic behavior). In
  the live app, `addPayment`/`addExternalPayment` always set these fields
  explicitly (confirmed in `providers/FinanceDataProvider.tsx`), so this
  fallback path is a legacy/best-effort matcher for older data without those
  fields, not a currently-reachable bug for new payments — but it's worth
  being aware of if old, untagged payment records exist.
- **This phase's audit focused on the core balance/liability/receivable
  math** (`accountBalance.ts`, `borrowingMath.ts`, `receivableMath.ts`,
  `monthlyComparison.ts`, `monthSummary.ts`, `dates.ts`, `billingCycle.ts`,
  `creditCardBillStatus.ts`, `creditCardBillValidate.ts`) and the net-worth
  aggregation in `useUnifiedNetWorth.ts`/`dashboard.tsx`. It did not do a
  line-by-line pass over every remaining calculation file in `shared/utils/`
  (e.g. `splitMath.ts`, `investmentInterest.ts`, `weeklySummary.ts`,
  `subscriptionProcessor.ts`) — those have their own existing unit tests
  (per the test suite catalogued in [Phase 1](PHASE_1_ARCHITECTURE_AUDIT.md))
  and weren't flagged by anything in this pass, but weren't independently
  re-derived from scratch the way `accountBalance.ts` was.
