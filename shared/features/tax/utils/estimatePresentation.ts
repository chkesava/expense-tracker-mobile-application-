/**
 * SPENDLY-295 — words for the estimate: what each gap and assumption means
 * for the user, and where to fix it. Every estimate is labelled
 * informational; nothing here is advice.
 */

import type { TaxAssumption, TaxComputation, TaxUnsupportedCode } from "./computeTax";
import type { TaxRegimeComparison } from "./compareRegimes";
import type { TaxGapCode } from "./taxInput";

export const ESTIMATE_LABEL = "Informational estimate";

export const ESTIMATE_DISCLAIMER =
  "An estimate from the figures in Spendly, not your final tax or refund, and not advice. Check it against your Form 16, AIS and the return before you file.";

/** Screen to fix a gap on, relative to `/tax/{fy}`. */
export type GapFix = "income" | "tds" | "deductions" | "capital-gains" | "payments" | "profile" | null;

const GAPS: Record<TaxGapCode | Exclude<TaxUnsupportedCode, TaxGapCode>, { text: string; fix: GapFix }> = {
  residency: { text: "Spendly estimates tax for residents only. Non-residents and RNORs are taxed differently.", fix: "profile" },
  business_income: { text: "Business or professional income isn't estimated yet.", fix: "income" },
  capital_gain_as_income: { text: "A capital gain is entered as income. Add it on the capital-gains screen instead, with its dates.", fix: "income" },
  virtual_digital_assets: { text: "Crypto and other virtual assets have their own rules, which Spendly doesn't estimate.", fix: "capital-gains" },
  property_indexation: { text: "Land or a building bought before 23 July 2024 can be taxed at 20% with indexation instead of 12.5%. Spendly doesn't make that choice.", fix: "capital-gains" },
  capital_loss_setoff: { text: "Setting capital losses against gains of another kind isn't estimated yet.", fix: "capital-gains" },
  rules_not_available: { text: "The tax rules for this year aren't in Spendly yet.", fix: null },
  surcharge_with_special_rates: { text: "Surcharge on incomes above ₹50 lakh with capital gains isn't estimated yet.", fix: null },
  surcharge_on_dividends: { text: "Surcharge on dividends above ₹2 crore isn't estimated yet.", fix: null },
  income_months_not_loaded: { text: "Some months of income haven't loaded yet.", fix: "income" },
  income_value_unknown: { text: "A counted income has no amount.", fix: "income" },
  deduction_value_unknown: { text: "A counted deduction has no amount.", fix: "deductions" },
  capital_gain_cost_unknown: { text: "A counted sale has no cost, so its gain is unknown.", fix: "capital-gains" },
  capital_gain_term_unknown: { text: "A counted sale has no buy date, so Spendly can't tell short- from long-term.", fix: "capital-gains" },
  profile_residency: { text: "Your residential status isn't set: estimated as a resident.", fix: "profile" },
  profile_age: { text: "Your age band isn't set: estimated as below 60.", fix: "profile" },
  income_to_confirm: { text: "Some income isn't counted until you confirm it.", fix: "income" },
  income_needs_review: { text: "Some income needs another look.", fix: "income" },
  income_overlap: { text: "Some income may be counted twice: from Spendly and from what you added.", fix: "income" },
  salary_twice: { text: "Salary is on a Form 16 and also added as income: it may be counted twice.", fix: "income" },
  deductions_to_confirm: { text: "Deductions waiting for you to confirm you're eligible aren't counted.", fix: "deductions" },
  deduction_overlap: { text: "A deduction may be counted twice.", fix: "deductions" },
  capital_gains_to_confirm: { text: "Sales from your portfolio aren't counted until you confirm them.", fix: "capital-gains" },
  capital_gains_check: { text: "Some counted sales need a look (asset type, grandfathering or same-day trades).", fix: "capital-gains" },
  no_salary_record: { text: "Spendly sees salary credits but no Form 16 or gross salary. Salary isn't in this estimate.", fix: "tds" },
};

export function gapText(code: TaxGapCode | TaxUnsupportedCode): { text: string; fix: GapFix } {
  return GAPS[code];
}

const ASSUMPTIONS: Record<TaxAssumption, string> = {
  resident: "You're a resident.",
  age_below_60: "You're below 60.",
  home_loan_self_occupied: "Home-loan interest is for a home you live in (old regime only, up to ₹2,00,000).",
  home_loan_with_rent: "You also receive rent: if the loan is for the rented home, its interest is treated differently.",
  municipal_tax_not_deducted: "No municipal tax is deducted from rent.",
  hra_twice: "HRA is on your Form 16 and also entered as a deduction: check it isn't counted twice.",
  house_property_loss_not_carried: "A house-property loss isn't carried forward here.",
  savings_interest_not_claimed: "Savings interest has no 80TTA/80TTB claim: add one on Deductions if it applies.",
  shortfall_highest_rate_first: "Unused basic exemption is set against the highest-rate gains first.",
  marginal_relief_with_special_rates: "Marginal relief near ₹12 lakh with capital gains: check this against the official utility.",
  no_interest_234: "No interest for late or short advance tax (s.234A/B/C) is included.",
  employer_nps_within_limit: "Employer NPS is within its limit (14% of salary in the new regime; 10% or 14% in the old).",
  parents_below_60: "Parents' health insurance is limited to ₹25,000 (₹50,000 if a parent is 60 or older).",
  patient_age_from_profile: "Medical-treatment limit uses your age band.",
  rent_paid_limits: "Rent paid without HRA is limited to ₹60,000; other limits may apply.",
  donation_qualifying_amount: "Donations are counted as you entered them: enter the deductible amount.",
  disability_amount: "Disability deduction limited to ₹1,25,000 (₹75,000 unless severe).",
  other_deduction_as_entered: "Other deductions are counted as you entered them.",
  deductions_not_in_new_regime: "Most deductions don't apply in the new regime; only employer NPS is counted.",
  form16_blank_as_zero: "Form 16 fields you left empty are taken as zero.",
  capital_loss_not_carried: "Capital losses aren't carried forward here.",
  stt_paid: "Short-term equity sales paid STT (s.111A).",
  tds_from_certificates: "TDS is taken from your Form 16 and certificates, not your 26AS.",
};

export function assumptionText(code: TaxAssumption): string {
  return ASSUMPTIONS[code];
}

export function estimateStatusLabel(c: TaxComputation): { label: string; tone: "success" | "warning" | "muted" } {
  switch (c.status) {
    case "ok":
      return { label: ESTIMATE_LABEL, tone: "success" };
    case "partial":
      return { label: `${ESTIMATE_LABEL}, with items to check`, tone: "warning" };
    case "missing":
      return { label: "Can't estimate yet: some figures are unknown", tone: "warning" };
    case "unsupported":
      return { label: "Spendly can't estimate this case", tone: "muted" };
  }
}

/** One sentence comparing the regimes, never a recommendation. */
export function comparisonSentence(c: TaxRegimeComparison, format: (n: number) => string): string | null {
  if (c.lower === null || c.difference === null) return null;
  if (c.lower === "same") return "On these figures, both regimes give the same estimated tax.";
  const name = c.lower === "new" ? "new" : "old";
  return `On these figures, the ${name} regime gives ${format(c.difference)} less estimated tax. Whether you can choose it, and which suits you, depends on your situation.`;
}
