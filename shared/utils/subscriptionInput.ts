import type { SubscriptionFrequency } from "@/shared/types/subscription";

/** Raw form values from the recurring form, before coercion. */
export type SubscriptionFormValues = {
  name: string;
  amount: string;
  type: "subscription" | "emi" | "transfer";
  frequency: SubscriptionFrequency;
  dayOfMonth: string;
  intervalDays: string;
  startMonth: string;
  startYear: string;
  endMonth: string;
  endYear: string;
  accountId: string;
  toAccountId: string;
};

export type SubscriptionValidationResult =
  | {
      ok: true;
      /** Which field the value belongs to, already coerced. */
      name: string;
      amount: number;
      effectiveFrequency: SubscriptionFrequency;
      dayOfMonth: number;
      intervalDays: number;
      /** `YYYY-MM`, or undefined when the item starts from whenever it was created. */
      startKey: string | undefined;
    }
  | { ok: false; field: SubscriptionField; message: string };

/** Which step of the form owns the problem, so a wizard can jump back to it. */
export type SubscriptionField =
  | "name"
  | "amount"
  | "dayOfMonth"
  | "intervalDays"
  | "start"
  | "end"
  | "accounts";

/**
 * Guard the recurring form (SPENDLY-140).
 *
 * Pulled out of the modal so it can be tested without rendering: the component
 * has no tests, and its save payload drives auto-posting, so a bad value here
 * becomes a wrong charge rather than a wrong-looking form.
 *
 * `dayOfMonth` deliberately accepts 1-31 for every month. The auto-poster
 * clamps to the real month length at post time, so day 31 already means "the
 * last day" for existing items; rejecting it here would block those users from
 * saving unrelated edits.
 */
export function validateSubscriptionInput(
  values: SubscriptionFormValues
): SubscriptionValidationResult {
  const name = values.name.trim();
  if (!name) {
    return { ok: false, field: "name", message: "Please enter a recurring name." };
  }

  const amount = parseFloat(values.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, field: "amount", message: "Please enter a valid amount." };
  }

  // An EMI is monthly by definition; the form hides the frequency control for it.
  const effectiveFrequency: SubscriptionFrequency =
    values.type === "emi" ? "monthly" : values.frequency;

  const dayOfMonth = parseInt(values.dayOfMonth, 10);
  if (effectiveFrequency === "monthly") {
    if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return {
        ok: false,
        field: "dayOfMonth",
        message: "Day of month must be between 1 and 31.",
      };
    }
  }

  const intervalDays = parseInt(values.intervalDays, 10);
  if (effectiveFrequency === "every_n_days") {
    if (!Number.isFinite(intervalDays) || intervalDays < 1 || intervalDays > 365) {
      return {
        ok: false,
        field: "intervalDays",
        message: "Repeat every N days must be between 1 and 365.",
      };
    }
  }

  const startMonthRaw = values.startMonth.trim();
  const startYearRaw = values.startYear.trim();
  const numStartMonth = parseInt(startMonthRaw, 10);
  const numStartYear = parseInt(startYearRaw, 10);
  // Only monthly items carry a first-debit month; an every-N-days item has no
  // month concept and must not be given a startMonth.
  const hasStart =
    effectiveFrequency === "monthly" && !!startMonthRaw && !!startYearRaw;

  if (hasStart) {
    if (
      !Number.isFinite(numStartMonth) ||
      numStartMonth < 1 ||
      numStartMonth > 12 ||
      !Number.isFinite(numStartYear) ||
      numStartYear < 2000 ||
      numStartYear > 2100
    ) {
      return {
        ok: false,
        field: "start",
        message: "First debit month must be 1-12 with a valid year.",
      };
    }
  } else if (
    effectiveFrequency === "monthly" &&
    (startMonthRaw || startYearRaw)
  ) {
    return {
      ok: false,
      field: "start",
      message: "Enter both the first debit month and year.",
    };
  }

  const startKey = hasStart
    ? `${numStartYear}-${String(numStartMonth).padStart(2, "0")}`
    : undefined;

  if (values.type === "emi" && values.endMonth.trim() && values.endYear.trim()) {
    const numEndMonth = parseInt(values.endMonth, 10);
    const numEndYear = parseInt(values.endYear, 10);
    if (
      !Number.isFinite(numEndMonth) ||
      numEndMonth < 1 ||
      numEndMonth > 12 ||
      !Number.isFinite(numEndYear) ||
      numEndYear < 2000 ||
      numEndYear > 2100
    ) {
      return {
        ok: false,
        field: "end",
        message: "Final term must be a month 1-12 with a valid year.",
      };
    }
    const endKey = `${numEndYear}-${String(numEndMonth).padStart(2, "0")}`;
    if (startKey && endKey < startKey) {
      return {
        ok: false,
        field: "end",
        message: "The final term cannot be before the first debit.",
      };
    }
  }

  if (
    values.type === "transfer" &&
    values.accountId &&
    values.toAccountId &&
    values.accountId === values.toAccountId
  ) {
    return {
      ok: false,
      field: "accounts",
      message: "Source and destination accounts must be different.",
    };
  }

  return {
    ok: true,
    name,
    amount,
    effectiveFrequency,
    dayOfMonth,
    intervalDays,
    startKey,
  };
}
