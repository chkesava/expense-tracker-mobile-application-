import { isValidDateKey } from "./dates";

/** Raw form values from the manual statement form, before coercion. */
export type CreditCardBillFormValues = {
  accountId: string;
  statementAmount: string;
  minimumDue: string;
  statementDate: string;
  dueDate: string;
  periodStart?: string;
  periodEnd?: string;
};

export type CreditCardBillValidationResult =
  | { ok: true; statementAmount: number; minimumDueAmount: number }
  | { ok: false; message: string };

function parseAmount(raw: string): number | null {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

/**
 * Guard the manual statement form. Statements entered by hand feed the same
 * ledger as generated ones, so a statement dated in the future, a window that
 * runs past its own close date, or a `NaN` amount would corrupt the card's
 * position rather than just looking odd.
 *
 * `today` is the user's calendar day — a statement closes ON its statement date,
 * so a date after today describes a statement that has not been cut yet and
 * cannot be owed.
 */
export function validateCreditCardBillInput(
  values: CreditCardBillFormValues,
  today: string
): CreditCardBillValidationResult {
  if (!values.accountId.trim()) {
    return { ok: false, message: "Select the credit card this statement is for" };
  }

  const statementAmount = parseAmount(values.statementAmount);
  if (statementAmount == null || statementAmount <= 0) {
    return { ok: false, message: "Enter a statement amount greater than 0" };
  }

  const minimumRaw = (values.minimumDue || "").trim();
  const minimumDueAmount = minimumRaw ? parseAmount(minimumRaw) : 0;
  if (minimumDueAmount == null || minimumDueAmount < 0) {
    return { ok: false, message: "Minimum due must be a positive amount" };
  }
  if (minimumDueAmount > statementAmount) {
    return {
      ok: false,
      message: "Minimum due cannot be more than the statement amount",
    };
  }

  const statementDate = values.statementDate.trim();
  if (!isValidDateKey(statementDate)) {
    return { ok: false, message: "Statement date must be a real date (YYYY-MM-DD)" };
  }
  if (statementDate > today) {
    return {
      ok: false,
      message: "Statement date can't be in the future — a statement closes on its date",
    };
  }

  const dueDate = values.dueDate.trim();
  if (!isValidDateKey(dueDate)) {
    return { ok: false, message: "Due date must be a real date (YYYY-MM-DD)" };
  }
  if (dueDate < statementDate) {
    return { ok: false, message: "Due date can't be before the statement date" };
  }

  const periodStart = (values.periodStart || "").trim();
  const periodEnd = (values.periodEnd || "").trim();
  if (periodStart && !isValidDateKey(periodStart)) {
    return { ok: false, message: "Billing period start must be a real date (YYYY-MM-DD)" };
  }
  if (periodEnd && !isValidDateKey(periodEnd)) {
    return { ok: false, message: "Billing period end must be a real date (YYYY-MM-DD)" };
  }
  if (periodStart && periodEnd && periodStart > periodEnd) {
    return { ok: false, message: "Billing period start must come before its end" };
  }
  // The window a statement bills cannot extend past the day it closed, or the
  // ledger would bill spend that belongs to the next statement.
  if (periodEnd && periodEnd > statementDate) {
    return {
      ok: false,
      message: "Billing period can't end after the statement date",
    };
  }
  if (periodStart && periodStart > statementDate) {
    return {
      ok: false,
      message: "Billing period can't start after the statement date",
    };
  }

  return { ok: true, statementAmount, minimumDueAmount };
}
