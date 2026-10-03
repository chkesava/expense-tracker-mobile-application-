# SPENDLY-217: Multi-goal allocation optimization modes

**Ticket:** [SPENDLY-217](https://kesavach.atlassian.net/browse/SPENDLY-217) (Story)
**Epic:** [SPENDLY-213](https://kesavach.atlassian.net/browse/SPENDLY-213). See the [epic record](SPENDLY-213-goal-funding-optimizer.md).
**Branch:** `feature/SPENDLY-217-goal-allocation-modes`, cut from the epic branch after 216 and merged back with approval.
**Depends on:** 215 (capacity, used as the pool) and 216 (per-goal maths). Pure logic only: no UI and no writes.

---

## 1. Modes (`runGoalFundingScenario` in `shared/utils/goalFundingOptimizer.ts`)
These are **planning methods, not advice**. The only ordering ever applied is the user's own priority.

| Mode | How the pool is split |
|---|---|
| **Target date** | Each goal gets what it needs to finish on time (216). If that's more than the pool, **every goal is scaled by the same proportion** and the gap is shown. With `allowOverAllocation` the full requirements are kept as a labelled hypothetical |
| **Fixed budget** | Minimums first, then the rest **in proportion to what each goal still needs**. No goal gets more than it needs; any extra is shown as unallocated |
| **Priority** | Minimums first, then goals **in the user's order**, each up to its requirement. Goals without a priority **share the remainder evenly** (balanced), so an order is never invented; `no_priority_given` is raised when nobody is ranked |
| **Balanced** | Minimums first, then every goal is raised to the **same share of its requirement** (water-filling), so the biggest proportional gaps close first |

**Minimums:** when they alone exceed the pool, they're scaled down proportionally, unless over-allocation is allowed.

## 2. Guarantees
- **Deterministic:** goals are sorted by id, and ties are broken by id. The same inputs give the same result in any input order (tested).
- **Never over the pool:**
  - in every budget mode, including awkward pools (0, 1, 999.99, 33,333.33) with conflicting minimums and priorities (tested);
  - allocations are rounded **down** to the paisa;
  - `allowOverAllocation` is the only exception, and it adds the `over_allocation_hypothetical` assumption.
- **Capacity edge cases:**
  - **Zero or negative pool:** nothing is allocated, with `capacity_non_positive`.
  - **Unknown pool (null):** nothing is allocated in the budget modes, `unallocated: null`, with `capacity_unknown`.
- **Unallocated money** is always shown: pool − allocated.
- **Trade-offs:** whenever a goal gets more than the user puts in today, the goals getting less are listed with the amount. This is only possible when current contributions are known.
- **Funded, excluded and undated goals** take part without breaking the split. Undated goals have no requirement, so they're only funded through minimums.
- **Isolation:** goals are never modified (tested). Results reuse `analyzeGoal` (216) for gap, completion and status per goal.

**Performance:** 50 goals × 20 recalculations run well within budget, which covers slider-style recalculation.

## 3. Acceptance criteria → tests (`goalFundingOptimizer.test.ts`, 15)
| Criterion | Test |
|---|---|
| Several goals evaluated together | Every test (3–5 goals) |
| Total allocation can't exceed the pool unless over-allocation is allowed | "never exceeds the pool in any budget mode"; target-date scaling and over-allocation tests |
| Priority constraints respected | "fills goals in the user's order"; minimum tests |
| Trade-offs visible | "shows trade-offs against the current plan" |
| Unallocated funding shown | Fixed-budget surplus; target-date leftover |
| Allocation is deterministic; same inputs, same result | "is deterministic and order-independent" |
| The optimizer doesn't decide what matters more | Unranked goals are treated equally; `no_priority_given` |
