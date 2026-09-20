/**
 * Phase 12 — classify a credit SMS into an existing income source.
 * Uses INCOME_SOURCES names so ExpenseForm / ledger show the same labels.
 */

export const SMS_INCOME_SOURCES = [
  "Salary",
  "Bonus",
  "Freelance",
  "Business Income",
  "Rental Income",
  "Interest",
  "Dividend",
  "Cashback",
  "Refund",
  "Reimbursement",
  "Gift Received",
  "Pension",
  "Government Benefit",
  "Investment Proceeds",
  "Other Income",
] as const;

export type SmsIncomeSource = (typeof SMS_INCOME_SOURCES)[number];

const SALARY_AMOUNT_HINT = 10_000;

/**
 * Map a credited SMS body to an INCOME_SOURCES label.
 */
export function classifySmsIncomeSource(
  body: string,
  amount?: number
): SmsIncomeSource {
  const text = (body || "").toLowerCase();

  if (/\b(?:salary|payroll|wages|ctc)\b/.test(text)) return "Salary";
  if (/\breimburs(?:e|ed|ement)\b/.test(text)) return "Reimbursement";
  if (/\brefund(?:ed|s)?\b|\breversed\b|\breversal\b/.test(text)) {
    return "Refund";
  }
  if (/\bcash\s*back\b|\breward(?:s)?\b/.test(text)) return "Cashback";
  if (/\binterest\b|\bint\.?\s*(?:cr|credited)\b/.test(text)) return "Interest";
  if (/\bdividend\b/.test(text)) return "Dividend";
  if (/\bbonus\b/.test(text)) return "Bonus";
  if (/\bfreelance\b/.test(text)) return "Freelance";
  if (/\brent(?:al)?\s+income\b|\brent\s+received\b/.test(text)) {
    return "Rental Income";
  }
  if (
    /\bupi\b/.test(text) &&
    /\b(?:credited|received|deposited|from)\b/.test(text)
  ) {
    return "Other Income";
  }
  if (amount != null && amount >= SALARY_AMOUNT_HINT) return "Salary";
  return "Other Income";
}
