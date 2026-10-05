import { useMemo } from "react";

import { useRunway } from "@/hooks/useRunway";
import type { RunwayThreshold } from "@/shared/types/runway";
import type { WhatIfBaselineSnapshot } from "@/shared/types/whatIf";
import { thresholdFromSettings } from "@/shared/utils/runwaySettings";
import { buildWhatIfBaselineSnapshot } from "@/shared/utils/whatIfBaseline";

/**
 * Today's What-If starting point (SPENDLY-387), derived from the same data as
 * Financial Runway. Read-only; nothing is persisted.
 */
export function useWhatIfBaseline(): {
  uid: string | undefined;
  baseline: WhatIfBaselineSnapshot;
  threshold: RunwayThreshold;
  today: string;
  displayCurrency: string;
  hasAccounts: boolean;
  loading: boolean;
  error: ReturnType<typeof useRunway>["error"];
  retry: () => void;
} {
  const runway = useRunway();
  const { model, sources, settings, today, displayCurrency, timezone, expenses, incomes, subscriptions, bills } = runway;

  const baseline = useMemo(
    () =>
      buildWhatIfBaselineSnapshot({
        today,
        currency: displayCurrency,
        timezone,
        liquid: sources.resources.length ? sources.liquidTotal : null,
        runwayBaseline: model.baseline,
        subscriptions,
        bills,
        expenses,
        incomes,
      }),
    [today, displayCurrency, timezone, sources, model.baseline, subscriptions, bills, expenses, incomes]
  );
  const threshold = useMemo(() => thresholdFromSettings(settings), [settings]);

  return {
    uid: runway.uid,
    baseline,
    threshold,
    today,
    displayCurrency,
    hasAccounts: sources.resources.length > 0,
    loading: runway.loading,
    error: runway.error,
    retry: runway.retry,
  };
}
