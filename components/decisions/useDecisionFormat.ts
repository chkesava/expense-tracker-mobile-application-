import { useCallback } from "react";

import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";

/**
 * SPENDLY-547: one formatter pair for every Money Decisions screen.
 *
 * - `money` uses the display currency and respects ghost mode. Decision
 *   amounts are user-typed and carry no currency of their own (the stored
 *   `"inr"` unit only means "money"), so several views used to hardcode INR.
 * - `date` takes a `YYYY-MM-DD` key or epoch milliseconds and follows the
 *   user's date format. Timestamps were shown as UTC `toISOString()` slices,
 *   which could also be a day off in the user's own timezone.
 */
export function useDecisionFormat() {
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { settings } = useSettings();
  const dateFormat = settings?.dateFormat;
  const date = useCallback(
    (value: string | number) => formatDisplayDate(typeof value === "number" ? new Date(value) : value, dateFormat),
    [dateFormat]
  );
  return { currency, money, date };
}
