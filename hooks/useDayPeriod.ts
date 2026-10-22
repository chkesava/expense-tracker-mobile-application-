import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { dayPeriodAt, msUntilNextPeriod, type DayPeriod } from "@/shared/utils/dayPeriod";

/**
 * SPENDLY-566 — the current time of day on the device's clock. Re-checks when
 * the app comes back to the foreground and once at the next boundary, so a
 * dashboard left open across 17:00 still turns to evening. State only changes
 * when the period does, so nothing re-renders in between.
 */
export function useDayPeriod(): DayPeriod {
  const [period, setPeriod] = useState<DayPeriod>(() => dayPeriodAt(new Date()));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const sync = () => {
      const now = new Date();
      setPeriod(dayPeriodAt(now));
      if (timer) clearTimeout(timer);
      // A second of slack so the timer never lands just before the boundary.
      timer = setTimeout(sync, msUntilNextPeriod(now) + 1000);
    };

    sync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });

    return () => {
      subscription.remove();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return period;
}
