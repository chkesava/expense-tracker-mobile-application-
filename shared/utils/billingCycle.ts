import { billDateForMonth, clampBillDay } from "./dates";

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
