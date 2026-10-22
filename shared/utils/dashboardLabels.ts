/**
 * SPENDLY-572 — short labels for the Visual First dashboard, independent of
 * the user's date-format preference (which still governs full dates
 * elsewhere): the month chip reads "This month" or "Sep 2026", a row date
 * reads "Today", "Yesterday", "16 Oct" or "16 Oct 2025".
 */

import { shiftDateKey } from "./dates";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `YYYY-MM` → "This month" for the current month, otherwise "Sep 2026". */
export function dashboardMonthLabel(month: string, currentMonth: string): string {
  if (month === currentMonth) return "This month";
  const [y, m] = month.split("-").map(Number);
  if (!y || !m || m < 1 || m > 12) return month;
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** `YYYY-MM-DD` relative to today: "Today", "Yesterday", "16 Oct", "16 Oct 2025". */
export function shortRowDate(dateKey: string, todayKey: string): string {
  if (!dateKey) return "";
  if (dateKey === todayKey) return "Today";
  if (dateKey === shiftDateKey(todayKey, -1)) return "Yesterday";
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return dateKey;
  const base = `${d} ${MONTHS_SHORT[m - 1]}`;
  return dateKey.slice(0, 4) === todayKey.slice(0, 4) ? base : `${base} ${y}`;
}
