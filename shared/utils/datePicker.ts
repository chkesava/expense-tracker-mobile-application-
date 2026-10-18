/**
 * Date picker model (SPENDLY-557). Pure: the month grid, the min/max limits
 * and the screen-reader sentences for `components/common/DatePickerSheet`.
 * Values are `YYYY-MM-DD` keys and months are `YYYY-MM`, the same strings the
 * forms already store, so nothing about saved data changes.
 */

import { monthTitle, longDateLabel } from "./calendarMonth";
import { monthGridRange } from "./calendarQuery";
import { isValidDateKey, orderedWeekdays, shiftDateKey, shiftMonthKey, type FirstDayOfWeek } from "./dates";

export interface PickerDayCell {
  date: string;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  /** Outside `min`/`max`: shown, but can't be picked. */
  disabled: boolean;
  accessibilityLabel: string;
}

export interface PickerLimits {
  min?: string;
  max?: string;
}

/** Only well-formed limits count; an empty or partial string is "no limit". */
function limits({ min, max }: PickerLimits): { min?: string; max?: string } {
  return { min: min && isValidDateKey(min) ? min : undefined, max: max && isValidDateKey(max) ? max : undefined };
}

export function isDateAllowed(date: string, range: PickerLimits): boolean {
  const { min, max } = limits(range);
  return (!min || date >= min) && (!max || date <= max);
}

/** Whole weeks covering `month`, in the user's first day of week. */
export function pickerMonthGrid(
  month: string,
  firstDay: FirstDayOfWeek,
  opts: { selected?: string; today: string } & PickerLimits
): { weekdays: string[]; weeks: PickerDayCell[][] } {
  const range = monthGridRange(month, firstDay);
  const weeks: PickerDayCell[][] = [];
  let week: PickerDayCell[] = [];
  for (let date = range.from; date <= range.to; date = shiftDateKey(date, 1)) {
    const isToday = date === opts.today;
    const isSelected = date === opts.selected;
    const disabled = !isDateAllowed(date, opts);
    const label = [longDateLabel(date), isToday ? "today" : null, isSelected ? "selected" : null, disabled ? "unavailable" : null].filter(Boolean).join(", ");
    week.push({ date, day: Number(date.slice(8, 10)), inMonth: date.slice(0, 7) === month, isToday, isSelected, disabled, accessibilityLabel: label });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }
  return { weekdays: orderedWeekdays(firstDay).map((w) => w.label), weeks };
}

/** The month to open on: the value's, else today's, kept inside the limits. */
export function initialPickerMonth(value: string | undefined, today: string, range: PickerLimits = {}): string {
  const { min, max } = limits(range);
  const start = value && isValidDateKey(value) ? value : today;
  if (min && start < min) return min.slice(0, 7);
  if (max && start > max) return max.slice(0, 7);
  return start.slice(0, 7);
}

/** Whether moving `delta` months still shows at least one allowed day. */
export function canShiftMonth(month: string, delta: number, range: PickerLimits = {}): boolean {
  const { min, max } = limits(range);
  const next = shiftMonthKey(month, delta);
  if (min && next < min.slice(0, 7)) return false;
  if (max && next > max.slice(0, 7)) return false;
  return true;
}

/** Years offered by the year jump: ±`span` around today, narrowed by the limits. */
export function yearsInRange(today: string, range: PickerLimits = {}, span = 50): number[] {
  const { min, max } = limits(range);
  const now = Number(today.slice(0, 4));
  const from = min ? Number(min.slice(0, 4)) : now - span;
  const to = max ? Number(max.slice(0, 4)) : now + span;
  const years: number[] = [];
  for (let y = from; y <= to; y++) years.push(y);
  return years;
}

/** Whether any day of `month` (YYYY-MM) is allowed — for the month jump. */
export function isMonthAllowed(month: string, range: PickerLimits): boolean {
  const { min, max } = limits(range);
  return (!min || month >= min.slice(0, 7)) && (!max || month <= max.slice(0, 7));
}

export { monthTitle as pickerMonthTitle };
