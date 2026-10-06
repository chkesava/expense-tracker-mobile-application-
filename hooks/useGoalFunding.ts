import { useMemo } from "react";

import { useExpenses } from "@/hooks/useExpenses";
import { useFinancialCalendar } from "@/hooks/useFinancialCalendar";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useIncomes } from "@/hooks/useIncomes";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSettings } from "@/providers/SettingsProvider";
import { todayDateKey } from "@/shared/utils/dates";
import { snapshotGoals } from "@/shared/utils/goalFundingModel";
import { goalFundingCapacityFromSources, planningWindow, whatIfToCapacityAdjustments, type CapacityAdjustment } from "@/shared/utils/goalFundingInputs";
import { buildRunwayBaseline } from "@/shared/utils/runwayBaseline";
import type { WhatIfScenario } from "@/shared/utils/whatIfScenarios";

/**
 * Everything the Goal Funding Optimizer reads (SPENDLY-219): a read-only
 * snapshot of goals, and funding capacity from the runway baseline plus
 * Financial Calendar commitments for the planning window. Mounted only on
 * the optimizer screen; reads provider data already in memory and writes
 * nothing.
 */
export function useGoalFunding(options?: {
  plannedMonthly?: number | null;
  adjustments?: readonly CapacityAdjustment[];
  scenario?: WhatIfScenario | null;
  windowMonths?: number;
}) {
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);
  const { goals, loading: goalsLoading, error: goalsError } = useFinancialGoals();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { subscriptions } = useSubscriptions();
  const window = useMemo(() => planningWindow(today, options?.windowMonths), [today, options?.windowMonths]);
  const calendar = useFinancialCalendar(window);

  const baseline = useMemo(
    () => buildRunwayBaseline({ expenses, incomes, subscriptions, today, windowMonths: 6, method: "average" }),
    [expenses, incomes, subscriptions, today]
  );
  const snapshot = useMemo(() => snapshotGoals(goals), [goals]);

  const capacity = useMemo(() => {
    let adjs = options?.adjustments ? [...options.adjustments] : [];
    if (options?.scenario) {
      adjs = adjs.concat(whatIfToCapacityAdjustments(options.scenario.adjustments, calendar.events, window.from ? (options?.windowMonths ?? 3) : 3));
    }
    return goalFundingCapacityFromSources({
      baseline: baseline.projectionBaseline,
      calendarEvents: calendar.events,
      window,
      plannedMonthly: options?.plannedMonthly,
      adjustments: adjs.length > 0 ? adjs : undefined,
    });
  }, [baseline, calendar.events, window, options?.plannedMonthly, options?.adjustments, options?.scenario, options?.windowMonths]);

  return {
    today,
    window,
    goals: snapshot,
    capacity,
    historyMonths: baseline.monthsOfHistory,
    calendarState: calendar.loadState,
    loading: goalsLoading || expensesLoading || incomesLoading,
    error: goalsError,
  };
}
