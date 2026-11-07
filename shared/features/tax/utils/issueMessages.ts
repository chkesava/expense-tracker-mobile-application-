/**
 * SPENDLY-290 — validation issues (SPENDLY-289) as user copy. The field part
 * names what to fix; the code part says what is wrong with it.
 */

import type { TaxIssue, TaxIssueCode } from "./validation";

const FIELD_NAMES: Record<string, string> = {
  "fields.amount": "Amount",
  "fields.category": "Category",
  "fields.date": "Date",
  "fields.payer": "Paid by",
  note: "Note",
  label: "Name",
  fy: "Year",
};

const CODE_TEXT: Record<TaxIssueCode, string> = {
  required: "is needed",
  invalid_year: "isn't a valid financial year",
  invalid_date: "isn't a real date",
  date_outside_year: "must be inside this financial year",
  date_before_year: "can't be before this financial year",
  date_in_future: "can't be in the future",
  date_order: "is in the wrong order",
  invalid_amount: "must be a rupee amount with at most 2 decimals",
  amount_not_positive: "must be more than zero",
  invalid_quantity: "must be more than zero",
  invalid_format: "isn't in the right format",
  invalid_option: "isn't one of the choices",
  too_long: "is too long",
  too_many: "has too many items",
  not_allowed: "can't be changed here",
  not_owner: "doesn't belong to you",
};

export function taxIssueMessage(issue: TaxIssue | undefined): string {
  if (!issue) return "Check the details and try again.";
  const field = FIELD_NAMES[issue.field] ?? "This value";
  return `${field} ${CODE_TEXT[issue.code]}.`;
}
