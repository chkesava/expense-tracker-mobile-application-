/**
 * Human month labels for `YYYY-MM` keys — KAN-73.
 *
 * This existed four times inside `components/epf/`, and not identically: three
 * copies used short month names and `EpfCurrentMonthCard` used long ones, so
 * the same month rendered two different ways in one feature. It lived there
 * because `vitest.config.ts` does not run `components/**`, and there was
 * nowhere tested to put it.
 */

const SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export type MonthLabelStyle = "short" | "long";

/**
 * `"2026-09"` → `"Sep 2026"` (or `"September 2026"`).
 *
 * An unparseable key is returned unchanged rather than rendered as
 * `"undefined 2026"` — the original copies all had this fallback and it is
 * worth keeping: a malformed month should look wrong, not look plausible.
 */
export function monthLabel(month: string, style: MonthLabelStyle = "short"): string {
  const names = style === "long" ? LONG : SHORT;
  const index = Number(month.slice(5, 7)) - 1;
  const name = names[index];
  if (!name) return month;
  return `${name} ${month.slice(0, 4)}`;
}
