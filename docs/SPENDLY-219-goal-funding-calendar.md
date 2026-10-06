# SPENDLY-219: Financial Calendar and What-If inputs for goal funding

**Ticket:** [SPENDLY-219](https://kesavach.atlassian.net/browse/SPENDLY-219) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-219-what-if-goal-funding`, cut from the epic branch `feature/SPENDLY-213-goal-funding-completion`.

**Status:** Completed.
- **The Financial Calendar part** was completed previously.
- **The What-If part** is now complete (uses `whatIfToCapacityAdjustments` and Firebase efficiency SPENDLY-406 lazy loading).

---

## 1. Financial Calendar input (built)
- **`planningWindow(today, months = 3)`:** from today to the day before the same date N months later. Month ends are clamped, so 30 Nov + 3 months ends on 27 Feb, and leap years work.
- **`goalFundingCapacityFromSources`** builds capacity from canonical data only:
  - the runway **projection baseline** (208);
  - **Financial Calendar events** for the window (178);
  - the result goes through the 215 rules.
- **Calendar rules:**
  - only open subscriptions, EMIs and loan due dates count;
  - **cancelled and completed** items are excluded;
  - commitments **without an amount** are listed, not treated as zero;
  - **money owed to you** is not counted.
- **`useGoalFunding()`:** the screen hook (218 uses it). It reads data already in memory:
  - goals as a read-only snapshot;
  - expenses, income and recurring items for the baseline;
  - the calendar for the window;
  - it returns the goals, the capacity, months of history and the calendar's load state.

  It mounts only on the optimizer screen and **writes nothing**.

**Changes in commitments update funding automatically,** because the capacity is computed from live data. Tested: adding an EMI lowers capacity by its monthly share; pausing it restores capacity.

## 2. What-If inputs (built)
- `whatIfToCapacityAdjustments` maps a What-If scenario's adjustments to `CapacityAdjustment` records natively understood by `goalFundingCapacityFromSources`.
- Adding/changing commitments, removing calendar events, or altering income/expenses all correctly alter the `monthlyDelta`.
- The Goal Funding Optimizer now includes a **What-If Scenario Picker**.
- **Firebase Efficiency (SPENDLY-406):** The `useWhatIfScenarios` listener is only mounted when the picker sheet is opened, meaning zero pre-fetching occurs on the Optimizer screen until requested.
- When applied, the capacity changes are strictly hypothetical and do not alter actual goal definitions.

## 3. Acceptance criteria
| Criterion | Status |
|---|---|
| Calendar data is used without duplicate records | Done: events are read through the 178 query (deduped); nothing is written |
| What-If assumptions stay hypothetical | Done: `hypothetical` flag used, base figure kept, UI explicitly marks scenario |
| Changes in commitments update available funding | Done |
| Scenario results stay isolated | Done: pure functions, no writes |
| Cancelled and completed events handled | Done and tested |
| Unknown and uncertain inputs shown | Done: amountless commitments listed; unknown capacity stays null |
| No real record modified | Done and tested |

**Tests:** `goalFundingInputs.test.ts` updated.
