/**
 * Module-level mirror of the user's currency + number-format preferences, kept
 * in sync by `SettingsProvider` (the same pattern `lib/haptics.ts` uses for the
 * haptics toggle).
 *
 * Exists for code that formats money outside the React tree — notification copy,
 * background SMS handling — where threading `settings` through six layers of
 * service calls would be worse than a synced singleton. UI code inside the tree
 * should keep reading `useSettings()` directly.
 */

import type { NumberFormatStyle } from "./formatCurrency";

let displayCurrency = "INR";
let displayNumberFormat: NumberFormatStyle = "auto";

export function setDisplayCurrencyPreferences(prefs: {
  currency?: string;
  numberFormat?: NumberFormatStyle;
}): void {
  if (prefs.currency) displayCurrency = prefs.currency;
  if (prefs.numberFormat) displayNumberFormat = prefs.numberFormat;
}

export function getDisplayCurrency(): string {
  return displayCurrency;
}

export function getDisplayNumberFormat(): NumberFormatStyle {
  return displayNumberFormat;
}

/** Reset to defaults — used on sign-out and by tests. */
export function resetDisplayCurrencyPreferences(): void {
  displayCurrency = "INR";
  displayNumberFormat = "auto";
}
