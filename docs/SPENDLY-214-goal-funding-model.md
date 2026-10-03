# SPENDLY-214: Goal Funding Optimizer model and constraints

**Ticket:** [SPENDLY-214](https://kesavach.atlassian.net/browse/SPENDLY-214) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-214-goal-funding-model`, cut from the epic branch and merged back with approval.
**Scope:** contract only. No UI, no Firestore and no rules change.

---

## 1. Principles
- **Canonical goals stay canonical.** The optimizer reads `FinancialGoal` through `snapshotGoals` (a read-only copy) and never writes a goal, transaction, account or investment.
- **Planning inputs live on the plan, not the goal.** Spendly's goal model has only a target, the current amount and an optional deadline. Everything else belongs to the plan's `GoalPlanInput`, never to the goal:
  - priority;
  - minimum contribution;
  - what the user puts in today;
  - one-time top-ups;
  - growth;
  - start date.
- **User-controlled priority.** `priority` is set only by the user. Without it, no goal is put ahead of another, and the assumption `no_priority_given` says so.
- **Unknown is not zero.** A blank `currentContribution` or an unknown capacity (`monthlyPool: null`) is carried as unknown, and the result says so.

## 2. Contract (`shared/types/goalFunding.ts`)
| Type | Holds |
|---|---|
| `GoalSnapshot` | The goal id, name, target, current amount and target date the scenario was computed against |
| `GoalPlanInput` | `priority?`, `minContribution?`, `currentContribution?` (unknown when blank), `oneTime?` (amount and date), `annualReturnPct?` (only for investment-linked goals; not a guarantee), `startDate?`, `excluded?` |
| `GoalFundingScenario` | `mode` (target-date, fixed-budget, priority or balanced), `monthlyPool` (null = unknown), `allowOverAllocation` (a hypothetical), `inputs` |
| `GoalFundingResult` | Per goal: remaining, months to target, required monthly, current monthly (or null), allocated monthly, gap, projected completion, months ahead or behind, change vs current, status, reasons in words |
| `GoalFundingResultSet` | Engine version, mode, as-of date, pool, totals, unallocated, per-goal results, trade-offs (which goals lose what when one gains), assumption codes |

`GOAL_FUNDING_ENGINE_VERSION = 1` is stored with saved plans (220), so a reopened plan says which engine produced it.

## 3. Constraints (`shared/utils/goalFundingModel.ts`)
- **Amounts:** 0 to 10¹². A growth assumption is 0–30% a year.
- **Priority:** a whole number of 1 or more, each used once.
- **Goals:** each appears once, with at most 50 per plan.
- **Dates:** valid local date keys.

`validateGoalPlanInput` and `validateScenario` return the problems as sentences. `inputsForGoals` keeps the user's entries and adds blank inputs for new goals, dropping inputs for deleted ones.

## 4. Assumptions shown to users
`GOAL_FUNDING_ASSUMPTIONS` has plain text for each of:
- unknown current contribution;
- unknown capacity;
- no surplus;
- growth assumed ("not a guarantee", tax and fees not modelled);
- hypothetical over-allocation;
- no priority given;
- missing target date;
- target date passed.

## 5. Acceptance criteria → tests (`goalFundingModel.test.ts`, 5)
| Criterion | Where |
|---|---|
| Existing goal records remain canonical | `snapshotGoals` copies without mutating; tested |
| Optimizer data is isolated from real contributions | Inputs live on the plan type only; no writer exists in this story |
| Constraints are explicit | §3 and validation tests |
| Priority is user-controlled | Optional, unique, never inferred; tested |
| Inputs and outputs are documented and testable | §2, pure modules |
