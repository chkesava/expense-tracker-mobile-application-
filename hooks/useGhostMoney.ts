import { useCallback } from "react";

import { useSettings } from "@/providers/SettingsProvider";
import { ghostMoney } from "@/shared/utils/ghostMoney";

/**
 * Text formatter for amounts that are part of a sentence or label, where an
 * `<Amount ghostable />` element cannot be used. Respects ghost mode.
 */
export function useGhostMoney(currency: string) {
  const { settings } = useSettings();
  const ghost = Boolean(settings?.ghostMode);
  return useCallback(
    (value: number) => ghostMoney(value, currency, ghost),
    [currency, ghost]
  );
}
