import { useMemo } from "react";

import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useFinancialCalendar } from "@/hooks/useFinancialCalendar";
import { useIncomes } from "@/hooks/useIncomes";
import { useRunwaySettings } from "@/hooks/useRunwaySettings";
import { useRunwaySources } from "@/hooks/useRunwaySources";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSettings } from "@/providers/SettingsProvider";
import { shiftDateKey, todayDateKey } from "@/shared/utils/dates";
import { buildRunwayModel } from "@/shared/utils/runwayModel";

/**
 * Everything the runway screen shows (SPENDLY-210). Reads existing data only;
 * the pipeline itself is the pure `buildRunwayModel`.
 */
export function useRunway() {
  const { settings: appSettings } = useSettings();
  const today = todayDateKey(appSettings.timezone);
  const displayCurrency = useDisplayCurrency();
  const { uid, sources, loading: sourcesLoading, error: sourcesError, retry: retrySources } = useRunwaySources();
  const { settings, loading: settingsLoading, error: settingsError, retry: retrySettings } = useRunwaySettings();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { subscriptions, loading: subscriptionsLoading } = useSubscriptions();
  const { bills } = useCreditCardBills();

  const calendarRange = useMemo(
    () => ({ from: today, to: shiftDateKey(today, (settings.projectionMonths || 12) * 31) }),
    [today, settings.projectionMonths]
  );
  const { events: calendarEvents, loadState: calendarState } = useFinancialCalendar(calendarRange, { includeCancelled: false });

  const model = useMemo(
    () => buildRunwayModel({ sources, expenses, incomes, subscriptions, bills, calendarEvents, today, displayCurrency, settings }),
    [sources, expenses, incomes, subscriptions, bills, calendarEvents, today, displayCurrency, settings]
  );

  return {
    uid,
    model,
    sources,
    settings,
    today,
    displayCurrency,
    timezone: appSettings.timezone,
    // Raw inputs, for consumers that derive more from the same data (What If, SPENDLY-387).
    expenses,
    incomes,
    subscriptions,
    bills,
    loading: sourcesLoading || settingsLoading || expensesLoading || incomesLoading || subscriptionsLoading || calendarState === "loading",
    error: sourcesError ?? settingsError,
    retry: () => {
      retrySources();
      retrySettings();
    },
  };
}
