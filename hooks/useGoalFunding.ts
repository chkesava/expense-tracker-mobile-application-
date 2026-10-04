import { useMemo } from "react";

import { useExpenses } from "@/hooks/useExpenses";
import { useFinancialCalendar } from "@/hooks/useFinancialCalendar";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useIncomes } from "@/hooks/useIncomes";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSettings } from "@/providers/SettingsProvider";
import { todayDateKey } from "@/shared/utils/dates";
import { snapshotGoals } from "@/shared/utils/goalFundingModel";
import { goalFundingCapacityFromSources, planningWindow, type CapacityAdjustment } from "@/shared/utils/goalFundingInputs";
import { buildRunwayBaseline } from "@/shared/utils/runwayBaseline";

/**
 * Everything the Goal Funding Optimizer reads (SPENDLY-219): a read-only
 * snapshot of goals, and funding capacity from the runway baseline plus
 * Financial Calendar commitments for the planning window. Mounted only on
 * the optimizer screen; reads provider data already in memory and writes
 * nothing.
 */
export function useGoalFunding(options?: { plannedMonthly?: number | null; adjustments?: readonly CapacityAdjustment[]; windowMonths?: number }) {
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
  const capacity = useMemo(
    () =>
      goalFundingCapacityFromSources({
        baseline: baseline.projectionBaseline,
        calendarEvents: calendar.events,
        window,
        plannedMonthly: options?.plannedMonthly,
        adjustments: options?.adjustments,
      }),
    [baseline, calendar.events, window, options?.plannedMonthly, options?.adjustments]
  );

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
