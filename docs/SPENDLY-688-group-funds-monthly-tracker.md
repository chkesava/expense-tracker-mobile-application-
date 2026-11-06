# SPENDLY-688: Group Funds S6, monthly collection tracker, reconciliation, QA and read budget

**Epic:** SPENDLY-678 (`docs/SPENDLY-678-group-funds.md`).

**Branch:** `feature/SPENDLY-688-group-funds-monthly-tracker`, cut from the epic branch.

## Monthly tracking: derived, never scheduled
- **No cron and no GitHub Action.** A month is not a document. "Who paid in October" is worked out when October is opened, from October's events (`period`).
- **Why:** every month, past ones included, is always there, and nothing scheduled can be missed or run twice.
- **The "for month" field** (a contribution counts toward a month that isn't the payment date's) shipped in S5 as "Counts for".

## Model
- **`GroupFund.startPeriod`:** the first month the fund collects for. Older funds fall back to their creation month (`fundStartPeriod`). Months before it never show as pending.
- **`GroupFundMember.joinedPeriod` / `leftPeriod`:** a member owes from `joinedPeriod` (or the fund's start) up to, but not including, `leftPeriod` (`memberOwesIn`).
  - Archiving a member in the form sets `leftPeriod` to next month, so they owe through the current month; restoring clears it.
  - A member archived before these fields existed owes nothing, as before.
  - Validation: both must be `YYYY-MM`, and `leftPeriod` must be after `joinedPeriod` (`member_months_invalid`).
- **`memberContributionStatus`** now respects the start month and the join and leave months.
- **`groupFundMonthSummary(fund, monthEvents, period)`:** for each monthly purpose with an expected amount, gives:
  - each owing member as paid, partial or unpaid;
  - the expected total;
  - the amount collected toward what was expected (an overpayment doesn't hide someone else's due);
  - the pending total and the number paid.
- **`reconcileHeldByAccount(funds, balances)`:** held money per account across all funds, against the stored balance, with any shortfall.

## Rules
`groupFunds` accepts `startPeriod` (`optionalYm`) on create and on a config edit. Members and purposes stay lists, as before. Covered by:
- the contract test;
- 2 new emulator tests (stored and edited; a bad month is rejected).

## Reads
- **Month view (`hooks/useGroupFundMonth.ts`):** one query for the whole month, `groupFundEvents where fundId == f and period == M`, with `limit(500)`.
  - It uses equality filters only, so **no composite index** is needed. The planned `(fundId, period)` index was dropped.
  - Under `firestore` it is a live listener. Under `readModel.groupFundHistory = "supabase"` it reads `group_fund_events` by `fund_id` and `period` (`readGroupFundMonth`, Supabase backend and loopback), re-reads when the fund's version changes, and falls back to the listener.
- **Reconciliation:** uses data already loaded (funds and accounts), with no extra reads.

## UI (fund screen)
- **This month:**
  - A month stepper, from the fund's start month to the current month.
  - Under each monthly purpose: "N of M paid · collected X of Y · Z pending".
  - Each member is shown as **Paid / Partly paid / Not paid**, with received and due amounts.
  - Tapping someone who still owes opens Add contribution, pre-filled with that member, purpose, month and the amount due.
- **Where the money is:** this fund's money in each account, against the account's balance.
  - If the money recorded as held in an account (across all funds) is more than its balance, a warning says so.
  - Money not in a tracked account (opening money with no account) is listed separately.
- **Fund form:**
  - "Collection starts" month.
  - Each member's "Owes from" month (new members added later default to this month).
  - "Owed until" shown for archived members.

## QA (AC12): `shared/utils/groupFunds.qa.test.ts`
The ticket's own month: 10 members paying ₹6,000 and ₹100 into HDFC or cash, with one paying only half. The suite covers:
- collection (each account rises exactly once; the account ledger rebuild agrees);
- split purposes;
- multiple accounts;
- partial collection in the month view;
- a payout after a cash-to-bank move;
- reversal (the original kept, a second undo refused);
- a purpose transfer (no account changes);
- retry and idempotency (the same submit gives the same documents);
- net-worth exclusion (unchanged net worth; "unknown" flagged);
- analytics regression (no expense, income, summary, budget, transfer or ledger-event writes; account month income and spending stay at 0).

Storage-level guarantees are referenced from their own suites: replay refused (rules), ack-dropped replay (`commitMutations`), and deterministic batches (store).

## Read budget (AC13): `lib/groupFundReads.test.ts`
These are source-level guards:
- The Money hub list reads funds only, never events.
- History is one 25-row window plus cursor pages.
- The month view is one bounded query for all members, with no read per row.
- Every store query is bounded and attributed to the read meter.

## Tests run
- Full `npm test`: 7,828 passed. The only failure is the known `lib/readModelLocal/store.test.ts`, which can't load because `fake-indexeddb` is missing.
- Rules: 641 passed, run against the running emulator.
- `typecheck:shared` passes. `tsc` shows only the two known missing-package errors.
- The running Expo web bundle contains the new screens.

## Review
Local Expo web with the emulator (already running). The emulator reloaded the rules on its own.
