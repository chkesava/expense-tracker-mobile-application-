# SPENDLY-219: Financial Calendar and What-If inputs for goal funding

**Ticket:** [SPENDLY-219](https://kesavach.atlassian.net/browse/SPENDLY-219) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-219-goal-funding-calendar`, cut from the epic branch after 217.

**Status:** split by decision (2026-10-03).
- **The Financial Calendar part is done here.**
- **The What-If part is on hold for SPENDLY-195.** Only its hook point exists.
- 219 stays In Progress until What-If lands.

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

## 2. What-If hook (on hold for SPENDLY-195)
`CapacityAdjustment { id, label, monthlyDelta, source: "what_if" | "user" }` is the contract the What-If Simulator will feed. `applyCapacityAdjustments`:
- adds the deltas on top of the **real** capacity and keeps `baseMonthly` alongside;
- sets **`hypothetical: true`**, so the UI labels the figure a what-if;
- ignores zero or invalid deltas, and never adjusts **unknown** capacity;
- can push capacity negative, and says so;
- never writes anything, and never changes the real figure.

Until SPENDLY-195 exists, only adjustments the user types in a plan (220) use this.

## 3. Acceptance criteria
| Criterion | Status |
|---|---|
| Calendar data is used without duplicate records | Done: events are read through the 178 query (deduped); nothing is written |
| What-If assumptions stay hypothetical | Hook done: `hypothetical` flag, base figure kept. **What-If itself waits for SPENDLY-195** |
| Changes in commitments update available funding | Done and tested (EMI added, then paused) |
| Scenario results stay isolated | Done: pure functions, no writes |
| Cancelled and completed events handled | Done and tested |
| Unknown and uncertain inputs shown | Done: amountless commitments listed; unknown capacity stays null |
| No real record modified | Done and tested |

**Tests:** `goalFundingInputs.test.ts`, 7 tests.
