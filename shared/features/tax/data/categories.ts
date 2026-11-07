/**
 * SPENDLY-289 — fixed metadata for tax categories. Labels are descriptive only;
 * none of this is advice or an eligibility decision.
 */

import type {
  TaxDocumentCategory,
  TaxEntryKind,
  TaxIncomeCategory,
  TaxIncomeHead,
} from "../types";

/** Head each income category is reported under. `null` = counted nowhere. */
export const TAX_INCOME_CATEGORY_HEAD: Record<TaxIncomeCategory, TaxIncomeHead | null> = {
  salary: "salary",
  pension: "salary",
  rental: "house_property",
  interest_savings: "other_sources",
  interest_deposit: "other_sources",
  interest_other: "other_sources",
  dividend: "other_sources",
  professional: "business_profession",
  business: "business_profession",
  capital_gain: "capital_gains",
  gift: "other_sources",
  other: "other_sources",
  not_income: null,
};

export const TAX_INCOME_HEAD_LABELS: Record<TaxIncomeHead, string> = {
  salary: "Salary",
  house_property: "House property",
  business_profession: "Business or profession",
  capital_gains: "Capital gains",
  other_sources: "Other sources",
};

export const TAX_INCOME_CATEGORY_LABELS: Record<TaxIncomeCategory, string> = {
  salary: "Salary",
  pension: "Pension",
  rental: "Rent received",
  interest_savings: "Savings account interest",
  interest_deposit: "Deposit interest",
  interest_other: "Other interest",
  dividend: "Dividend",
  professional: "Freelance or professional",
  business: "Business",
  capital_gain: "Capital gain",
  gift: "Gift received",
  other: "Other income",
  not_income: "Not income",
};

export const TAX_ENTRY_KIND_LABELS: Record<TaxEntryKind, string> = {
  income: "Income",
  form16: "Form 16",
  tds: "TDS certificate",
  ais_value: "AIS / TIS / 26AS value",
  deduction: "Deduction",
  capital_gain: "Capital gain",
  tax_payment: "Tax payment",
};

export const TAX_DOCUMENT_CATEGORY_LABELS: Record<TaxDocumentCategory, string> = {
  form16: "Form 16",
  form16a: "Form 16A",
  ais: "AIS",
  tis: "TIS",
  form26as: "Form 26AS",
  investment_proof: "Investment or deduction proof",
  interest_certificate: "Interest certificate",
  capital_gains_statement: "Capital gains statement",
  tax_payment_receipt: "Tax payment receipt",
  other: "Other",
};
