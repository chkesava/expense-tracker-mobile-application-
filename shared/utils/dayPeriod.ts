/**
 * SPENDLY-566 — the dashboard's time of day. One table of start hours drives
 * the greeting and the hero background; change a boundary here and both follow.
 * Hours are the device's local clock (`Date#getHours`), not the ledger timezone.
 */

export type DayPeriod = "morning" | "afternoon" | "evening" | "night";

/** Start hour (0–23) of each period, ascending. Night wraps past midnight. */
export const DAY_PERIODS: readonly { period: DayPeriod; startHour: number }[] = [
  { period: "morning", startHour: 5 },
  { period: "afternoon", startHour: 12 },
  { period: "evening", startHour: 17 },
  { period: "night", startHour: 21 },
] as const;

const GREETINGS: Record<DayPeriod, string> = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Good night",
};

export function dayPeriodForHour(hour: number): DayPeriod {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  let current: DayPeriod = DAY_PERIODS[DAY_PERIODS.length - 1].period;
  for (const { period, startHour } of DAY_PERIODS) {
    if (h >= startHour) current = period;
  }
  return current;
}

export function dayPeriodAt(date: Date): DayPeriod {
  return dayPeriodForHour(date.getHours());
}

export function greetingFor(period: DayPeriod): string {
  return GREETINGS[period];
}

/** Milliseconds from `date` until the next period boundary (always > 0). */
export function msUntilNextPeriod(date: Date): number {
  const hour = date.getHours();
  const next =
    DAY_PERIODS.find(({ startHour }) => startHour > hour) ?? DAY_PERIODS[0];
  const boundary = new Date(date);
  boundary.setHours(next.startHour, 0, 0, 0);
  if (boundary.getTime() <= date.getTime()) boundary.setDate(boundary.getDate() + 1);
  return boundary.getTime() - date.getTime();
}
