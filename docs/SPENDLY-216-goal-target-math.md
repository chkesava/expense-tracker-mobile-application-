# SPENDLY-216: Target-date funding calculations and funding-gap analysis

**Ticket:** [SPENDLY-216](https://kesavach.atlassian.net/browse/SPENDLY-216) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-216-goal-target-math`, cut from the epic branch after 215 and merged back with approval.
**Depends on:** 214. Pure logic only: no UI and no writes.

---

## 1. Model (`shared/utils/goalFundingMath.ts`)
- **Contributions:** one per month, on the plan's start day (default: today), clamped to short months. The number made **on or before the target date** comes from the shared schedule helper (`occurrencesBetween`), so month ends and **29 February** behave like everywhere else.
- **Remaining:** target − saved − a one-time top-up, but **only if the top-up is dated on or before the target date**.
- **Required monthly amount:**
  - **without growth:** remaining ÷ number of contributions;
  - **with growth:** an optional annual rate for investment-linked goals, converted to a monthly rate. The saved amount, each contribution and the one-time top-up grow until the target date, and the result is the shortfall divided by the summed growth factors.
- **Rounding:** **up** to the paisa, so following the figure never falls short by rounding. Tested: 100,000 over 12 months needs 8,333.34.
- **Projected completion:** a month-by-month simulation at a given monthly amount, up to 50 years. Null means "not reached".
- **Earlier finish:** `extraToFinishEarlier` is the extra per month needed to finish N months before the target.

## 2. Edge cases
| Case | Behaviour |
|---|---|
| Already funded | Required 0, status `funded`, completion today |
| No target date | Required `null` (no number is invented), status `no_target_date`, but completion is still projected |
| Target date passed | Required = the whole remaining amount (one payment); status `target_date_passed`; it never divides by zero or goes negative |
| No contributions before the date | The same: the full shortfall is due |
| Allocation 0 and not funded | Completion `null`, status `not_fundable` |
| Excluded goal | Status `excluded` and nothing calculated |
| Growth assumption | The reason text says *"an assumption, not a guarantee"*. No "guaranteed" or "will earn" wording (tested) |

## 3. Per-goal analysis
`analyzeGoal(goal, input, today, allocated?)` returns the 214 `GoalFundingResult`:
- remaining;
- months to target;
- required and allocated amounts;
- **gap** (allocated − required);
- projected completion and **months ahead or behind**;
- **change vs current** (null when the current contribution is unknown);
- status;
- reasons in words.

Without an allocation it uses the user's current contribution. 217 passes scenario allocations in.

## 4. Acceptance criteria → tests (`goalFundingMath.test.ts`, 12)
| Criterion | Test |
|---|---|
| Required contribution is deterministic | Repeated calls give equal results, with and without growth |
| Date boundaries handled correctly | Inclusive target day, the day before, a 31st clamped to 29 Feb 2028, reversed ranges |
| Funded and completed goals handled | "handles funded…" and analysis status tests |
| Past target dates handled safely | Full remaining, no division by zero |
| Growth assumptions are explicit | Reason text; following the grown requirement actually reaches the target |
| No guaranteed-return wording | Asserted on the reasons |
| Reconciles to target and balance | remaining = target − saved; required × contributions = remaining |
| Goal data not modified | Snapshot is unchanged after analysis |
