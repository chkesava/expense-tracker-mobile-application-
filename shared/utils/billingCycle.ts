import {
  billDateForMonth,
  clampBillDay,
  parseLocalDate,
  shiftDateKey,
  toLocalDateKey,
} from "./dates";

/** Coerce Firestore number/string bill days. Returns null when unset/invalid. */
export function normalizeBillGenerationDay(value: unknown): number | null {
  const parsed =
    typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(31, Math.floor(parsed));
}

/** Inclusive calendar window: startKey <= dateKey <= endKey. */
export function isDateKeyInInclusiveRange(
  dateKey: string,
  start: Date,
  end: Date
): boolean {
  const startKey = toLocalDateKey(start);
  const endKey = toLocalDateKey(end);
  return dateKey >= startKey && dateKey <= endKey;
}

/** Half-open calendar window: startKey <= dateKey < endKey. */
export function isDateKeyInHalfOpenRange(
  dateKey: string,
  start: Date,
  end: Date
): boolean {
  const startKey = toLocalDateKey(start);
  const endKey = toLocalDateKey(end);
  return dateKey >= startKey && dateKey < endKey;
}

/** Day after a generation date — the first day of the next statement window. */
function dayAfter(date: Date): Date {
  return parseLocalDate(shiftDateKey(toLocalDateKey(date), 1));
}

/**
 * Latest closed statement as of `asOf`. The statement closes ON the generation
 * day, and the window starts the day after the previous generation day, so
 * consecutive statements never share a date. A card that closes on the 20th
 * bills 21 Jul → 20 Aug.
 */
export function getClosedBillingCycle(billDay: number, asOf: Date = new Date()) {
  const { previousBillDate } = getBillingCycleDates(billDay, asOf);
  const cycleEnd = previousBillDate;
  const cycleStart = dayAfter(
    billDateForMonth(cycleEnd.getFullYear(), cycleEnd.getMonth() - 1, billDay)
  );
  return { cycleStart, cycleEnd };
}

/**
 * Statement window that closes on `cycleEnd` (a generation date): the day after
 * the previous generation date through `cycleEnd`, inclusive.
 */
export function billingCycleEndingOn(cycleEnd: Date, billDay: number) {
  const cycleStart = dayAfter(
    billDateForMonth(cycleEnd.getFullYear(), cycleEnd.getMonth() - 1, billDay)
  );
  return { cycleStart, cycleEnd };
}

/**
 * The still-open (unbilled) window as of `asOf`: day after the last generation
 * date through the next generation date. Spend here has not been statemented.
 */
export function getOpenBillingCycle(billDay: number, asOf: Date = new Date()) {
  const { previousBillDate, nextBillDate } = getBillingCycleDates(billDay, asOf);
  return { cycleStart: dayAfter(previousBillDate), cycleEnd: nextBillDate };
}

export function getBillingCycleDates(billDay: number, asOf: Date = new Date()) {
  const currentMonth = asOf.getMonth();
  const currentYear = asOf.getFullYear();
  const currentDate = asOf.getDate();
  const effectiveBillDay = clampBillDay(currentYear, currentMonth, billDay);

  let previousBillDate: Date;
  let nextBillDate: Date;

  if (currentDate >= effectiveBillDay) {
    previousBillDate = billDateForMonth(currentYear, currentMonth, billDay);
    nextBillDate = billDateForMonth(currentYear, currentMonth + 1, billDay);
  } else {
    previousBillDate = billDateForMonth(currentYear, currentMonth - 1, billDay);
    nextBillDate = billDateForMonth(currentYear, currentMonth, billDay);
  }

  return { previousBillDate, nextBillDate };
}

export function getDaysUntilReset(
  nextBillDate: Date,
  asOf: Date = new Date()
): number {
  return Math.ceil(
    (nextBillDate.getTime() - asOf.getTime()) / (1000 * 3600 * 24)
  );
}
