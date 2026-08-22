/**
 * The currency the user's own money should be rendered in.
 *
 * `system_settings/global.defaultCurrency` is the *seed* for a new account, not
 * the display truth — screens that read it directly made Settings → Preferences
 * → "Preferred Currency" decorative, since every `<Amount currency={…}>` caller
 * passed the system value explicitly and so never reached `Amount`'s own
 * `settings.currency` fallback.
 *
 * Use this for the signed-in user's balances, budgets, and totals. Do NOT use it
 * for per-record currencies that are stored on the document itself (a split's
 * currency, a public share snapshot) — those belong to the record, not the viewer.
 */

import { useSettings } from "@/providers/SettingsProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";

export function useDisplayCurrency(): string {
  const { settings } = useSettings();
  const { settings: systemSettings } = useSystemSettings();
  return settings.currency || systemSettings.defaultCurrency || "INR";
}
