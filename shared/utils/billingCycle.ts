import { billDateForMonth, clampBillDay, toLocalDateKey } from "./dates";

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

/**
 * Latest closed statement as of `asOf`: previous generation date through this
 * generation date, both inclusive. A card that generates on the 21st bills
 * 21 Jul → 21 Aug, not 1 Aug → 20 Aug.
 */
export function getClosedBillingCycle(billDay: number, asOf: Date = new Date()) {
  const { previousBillDate } = getBillingCycleDates(billDay, asOf);
  const cycleEnd = previousBillDate;
  const cycleStart = billDateForMonth(
    cycleEnd.getFullYear(),
    cycleEnd.getMonth() - 1,
    billDay
  );
  return { cycleStart, cycleEnd };
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

export function getDaysUntilReset(nextBillDate: Date): number {
  return Math.ceil(
    (nextBillDate.getTime() - new Date().getTime()) / (1000 * 3600 * 24)
  );
}
