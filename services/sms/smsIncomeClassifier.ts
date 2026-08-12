/**
 * Phase 12 — classify a credit SMS into an existing income source.
 * Uses INCOME_SOURCES names so ExpenseForm / ledger show the same labels.
 */

export const SMS_INCOME_SOURCES = [
  "Salary",
  "Bank Credit",
  "UPI Received",
  "Refund",
  "Cashback",
  "Interest",
] as const;

export type SmsIncomeSource = (typeof SMS_INCOME_SOURCES)[number];

const SALARY_AMOUNT_HINT = 10_000;

/**
 * Map a credited SMS body to Salary / Bank Credit / UPI / Refund / Cashback / Interest.
 */
export function classifySmsIncomeSource(
  body: string,
  amount?: number
): SmsIncomeSource {
  const text = (body || "").toLowerCase();

  if (/\b(?:salary|payroll|wages|ctc)\b/.test(text)) return "Salary";
  if (/\brefund(?:ed|s)?\b|\breversed\b|\breversal\b|\breimbursement\b/.test(text)) {
    return "Refund";
  }
  if (/\bcash\s*back\b|\breward(?:s)?\b/.test(text)) return "Cashback";
  if (/\binterest\b|\bint\.?\s*(?:cr|credited)\b/.test(text)) return "Interest";
  if (
    /\bupi\b/.test(text) &&
    /\b(?:credited|received|deposited|from)\b/.test(text)
  ) {
    return "UPI Received";
  }
  if (amount != null && amount >= SALARY_AMOUNT_HINT) return "Salary";
  return "Bank Credit";
}
