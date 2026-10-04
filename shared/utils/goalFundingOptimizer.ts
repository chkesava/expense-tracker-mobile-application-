/**
 * Multi-goal allocation modes (SPENDLY-217).
 *
 * Splits one monthly pool across goals in four planning methods. These are
 * ways of looking at a plan, not advice about what matters more — the user's
 * priority is the only ordering ever applied, and it's never inferred.
 *
 * - target_date: each goal gets what it needs to finish on time. If that
 *   exceeds the pool (and over-allocation isn't allowed), every goal is scaled
 *   down by the same proportion and the shortfall is shown.
 * - fixed_budget: minimums first, then the rest of the pool in proportion to
 *   what each goal still needs.
 * - priority: minimums first, then goals in the user's order, each up to its
 *   requirement. Goals without a priority share what's left evenly (balanced).
 * - balanced: minimums first, then raise every goal to the same share of its
 *   requirement (water-filling), so the biggest proportional gaps close first.
 *
 * Guarantees: deterministic (ties by goal id), never more than the pool unless
 * `allowOverAllocation`, allocations never exceed a goal's requirement in the
 * budget modes (any surplus is shown as unallocated), and goals are never
 * modified.
 */

import {
  GOAL_FUNDING_ENGINE_VERSION,
  type GoalFundingAssumptionCode,
  type GoalFundingResultSet,
  type GoalFundingScenario,
  type GoalFundingTradeOff,
  type GoalPlanInput,
  type GoalSnapshot,
} from "../types/goalFunding";
import { analyzeGoal, requiredMonthly } from "./goalFundingMath";
import { roundMoney } from "./money";

const floorMoney = (v: number) => Math.floor(Math.round(v * 1e6) / 1e4) / 100;

interface Slot {
  goalId: string;
  required: number; // 0 when unknown (no target date) or funded
  min: number;
  priority?: number;
}

/** Spread `amount` over slots in proportion to `weight`, each capped at `cap`. Returns allocations. */
function proportional(amount: number, slots: Slot[], weight: (s: Slot) => number, cap: (s: Slot) => number): Map<string, number> {
  const out = new Map<string, number>();
  let remaining = amount;
  let open = slots.filter((s) => cap(s) > 0 && weight(s) > 0);
  // Re-spread whatever capped goals can't take (at most slots.length rounds).
  for (let round = 0; round < slots.length + 1 && remaining > 1e-9 && open.length; round++) {
    const total = open.reduce((t, s) => t + weight(s), 0);
    const next: Slot[] = [];
    let used = 0;
    for (const s of open) {
      const already = out.get(s.goalId) ?? 0;
      const share = (remaining * weight(s)) / total;
      const take = Math.min(share, cap(s) - already);
      out.set(s.goalId, already + take);
      used += take;
      if (already + take < cap(s) - 1e-9) next.push(s);
    }
    remaining -= used;
    if (next.length === open.length) break;
    open = next;
  }
  return out;
}

/** Raise every slot to the same fraction t of its requirement (above its minimum) until `amount` is used. */
function waterFill(amount: number, slots: Slot[], base: Map<string, number>): Map<string, number> {
  const alloc = (t: number) => slots.map((s) => Math.max(base.get(s.goalId) ?? 0, Math.min(s.required, t * s.required)));
  const sum = (t: number) => alloc(t).reduce((a, b) => a + b, 0);
  const baseSum = slots.reduce((t, s) => t + (base.get(s.goalId) ?? 0), 0);
  const out = new Map(base);
  if (sum(1) <= baseSum + amount) {
    slots.forEach((s, i) => out.set(s.goalId, alloc(1)[i]));
    return out;
  }
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (sum(mid) <= baseSum + amount) lo = mid;
    else hi = mid;
  }
  slots.forEach((s, i) => out.set(s.goalId, alloc(lo)[i]));
  return out;
}

export function runGoalFundingScenario(input: { goals: readonly GoalSnapshot[]; scenario: GoalFundingScenario; today: string }): GoalFundingResultSet {
  const { scenario, today } = input;
  const inputs = new Map(scenario.inputs.map((i) => [i.goalId, i]));
  const inputFor = (g: GoalSnapshot): GoalPlanInput => inputs.get(g.goalId) ?? { goalId: g.goalId };
  const goals = [...input.goals].sort((a, b) => a.goalId.localeCompare(b.goalId));
  const assumptions = new Set<GoalFundingAssumptionCode>();

  const active = goals.filter((g) => !inputFor(g).excluded);
  const slots: Slot[] = active.map((g) => {
    const i = inputFor(g);
    const req = g.currentAmount >= g.targetAmount ? 0 : requiredMonthly(g, i, today).amount;
    if (!g.targetDate) assumptions.add("target_date_missing");
    else if (g.targetDate < today && g.currentAmount < g.targetAmount) assumptions.add("target_date_passed");
    if (i.annualReturnPct) assumptions.add("growth_assumed");
    if (i.currentContribution === undefined) assumptions.add("current_contribution_unknown");
    return { goalId: g.goalId, required: req ?? 0, min: Math.max(0, i.minContribution ?? 0), priority: i.priority };
  });

  const pool = scenario.monthlyPool;
  if (pool === null) assumptions.add("capacity_unknown");
  else if (pool <= 0) assumptions.add("capacity_non_positive");
  const budget = Math.max(0, pool ?? 0);
  const totalRequired = roundMoney(slots.reduce((t, s) => t + Math.max(s.required, s.min), 0));

  // Minimums first in every budget mode (scaled down if they alone exceed the pool).
  const minTotal = slots.reduce((t, s) => t + s.min, 0);
  const minScale = !scenario.allowOverAllocation && minTotal > budget ? (minTotal > 0 ? budget / minTotal : 0) : 1;
  const base = new Map(slots.map((s) => [s.goalId, s.min * minScale]));
  const afterMins = Math.max(0, budget - minTotal * minScale);

  let alloc: Map<string, number>;
  switch (scenario.mode) {
    case "target_date": {
      const need = new Map(slots.map((s) => [s.goalId, Math.max(s.required, s.min)]));
      const sum = [...need.values()].reduce((a, b) => a + b, 0);
      if (scenario.allowOverAllocation || pool === null || sum <= budget) alloc = need;
      else alloc = new Map([...need].map(([id, v]) => [id, sum > 0 ? (v * budget) / sum : 0]));
      break;
    }
    case "fixed_budget": {
      const cap = (s: Slot) => Math.max(0, s.required - (base.get(s.goalId) ?? 0));
      const extra = proportional(afterMins, slots, cap, cap);
      alloc = new Map(slots.map((s) => [s.goalId, (base.get(s.goalId) ?? 0) + (extra.get(s.goalId) ?? 0)]));
      break;
    }
    case "priority": {
      alloc = new Map(base);
      let left = afterMins;
      const ranked = slots.filter((s) => s.priority !== undefined).sort((a, b) => a.priority! - b.priority! || a.goalId.localeCompare(b.goalId));
      if (!ranked.length) assumptions.add("no_priority_given");
      for (const s of ranked) {
        const take = Math.min(left, Math.max(0, s.required - (alloc.get(s.goalId) ?? 0)));
        alloc.set(s.goalId, (alloc.get(s.goalId) ?? 0) + take);
        left -= take;
      }
      const unranked = slots.filter((s) => s.priority === undefined);
      if (unranked.length && left > 0) alloc = new Map([...alloc, ...waterFill(left, unranked, alloc)]);
      break;
    }
    case "balanced":
    default:
      alloc = waterFill(afterMins, slots, base);
  }

  // Round down to the paisa so the total never exceeds the pool by rounding.
  const rounded = new Map([...alloc].map(([id, v]) => [id, floorMoney(v)]));
  const totalAllocated = roundMoney([...rounded.values()].reduce((a, b) => a + b, 0));
  if (scenario.allowOverAllocation && pool !== null && totalAllocated > budget) assumptions.add("over_allocation_hypothetical");

  const results = goals.map((g) => analyzeGoal(g, inputFor(g), today, rounded.get(g.goalId) ?? 0));

  // Trade-offs: when one goal gets more than today, show which goals get less.
  const tradeOffs: GoalFundingTradeOff[] = [];
  const up = results.filter((r) => r.changeVsCurrent !== null && r.changeVsCurrent > 0);
  const down = results.filter((r) => r.changeVsCurrent !== null && r.changeVsCurrent < 0);
  for (const r of up) if (down.length) tradeOffs.push({ goalId: r.goalId, affects: down.map((d) => ({ goalId: d.goalId, monthly: -(d.changeVsCurrent as number) })) });

  return {
    engineVersion: GOAL_FUNDING_ENGINE_VERSION,
    mode: scenario.mode,
    asOf: today,
    monthlyPool: pool,
    totalRequired,
    totalAllocated,
    unallocated: pool === null ? null : roundMoney(pool - totalAllocated),
    goals: results,
    tradeOffs,
    assumptions: [...assumptions].sort(),
  };
}
