# SPENDLY-215: Available funding capacity and goal affordability engine

**Ticket:** [SPENDLY-215](https://kesavach.atlassian.net/browse/SPENDLY-215) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-215-goal-funding-capacity`, cut from the epic branch after 214.
**Depends on:** 214, the runway baseline (208, PR #212) and calendar events (178, PR #213). Pure logic only: no UI and no writes.

---

## 1. Formula (`shared/utils/goalFundingCapacity.ts`)
```
capacity per month = typical earned income
                   − typical everyday outflow   (essentials + discretionary + loan repayments + fees)
                   − scheduled commitments ÷ months in the planning window
```

| Line | Comes from |
|---|---|
| Typical earned income | Runway **projection baseline** (208): recorded income history. Refunds and asset sales are excluded |
| Typical everyday outflow | The same baseline. It **leaves out expenses posted by still-active recurring items**, so those are counted once, below |
| Scheduled commitments | Financial Calendar events (178) in the window, from these sources: subscriptions, EMIs, loan due dates. Open only (scheduled, expected or overdue) |

**Planned override:** if the user types a planned monthly savings amount, it **replaces** the calculation, and the result says so (`usesPlannedOverride`).

## 2. Double counting avoided
- **Money already going to savings** (the SIP, FD and savings classes) is **not subtracted**. It's money that can fund goals, so it's shown separately as `alreadyToSavingsMonthly` instead of being counted twice.
- **Card bill payments aren't subtracted:** card spending is already in the baseline's outflow.
- **Recurring items are counted once:** they're removed from the history baseline (208's projection baseline) and added back once from the calendar.
- **Also not subtracted:**
  - **SIP runs:** they're savings, the pool being planned.
  - **Reminders:** neutral notes, not money.

## 3. Honest edge cases
- **Negative or zero:** the status is `negative` or `zero` with the figure shown. It's never clamped to zero.
- **Unknown:**
  - With no history and no planned amount, `monthly` is `null` with status `unknown`. It's never treated as zero.
  - Commitments without an amount are listed in `commitmentsWithoutAmount`, not treated as zero.
- **Uncertain inflows:** money owed to you is listed in `notCountedInflows` and doesn't raise capacity.

**Window:** the planning window is measured in average months (30.4375 days), at least one. One-time commitments, such as a loan due date, are spread over it.

## 4. Acceptance criteria → tests (`goalFundingCapacity.test.ts`, 7)
| Criterion | Test |
|---|---|
| Capacity traces to source inputs | Line-by-line `parts`, each with its source; commitment events attached |
| Existing goal contributions aren't double counted | "does not double count money already going to savings" |
| Upcoming commitments reduce capacity | Commitments line; only open subscriptions, EMIs and loans |
| Negative and zero surplus handled | Status test |
| Unknown amounts aren't treated as zero | `null` capacity; commitments without amounts listed |
| Reconciles with canonical data | End-to-end test: real expenses, incomes and a rent subscription → runway baseline + calendar → 35,000, with savings shown as 5,000 |
| Doesn't mutate records | The same test checks the inputs are unchanged |
| Edge cases unit-tested | All of the above |
