/**
 * SPENDLY-292 — deduction categories the user can claim, with descriptive
 * metadata only. No caps, rates or regime rules here: those are versioned
 * tax rules for the calculation (SPENDLY-295), sourced and cited there.
 *
 * Section labels are given for the Income-tax Act, 1961 (FY ≤ 2025-26) only.
 * The Income-tax Act, 2025 renumbers them; until its numbers are checked
 * against the official text, a 2025-Act year shows no section number rather
 * than a guessed one (`deductionSectionLabel`).
 *
 * Ids are persisted (`taxEntries.fields.category`): append only, never rename.
 */

import type { TaxLaw } from "../types";

export const DEDUCTION_GROUPS = [
  "investments",
  "pension",
  "health",
  "loans",
  "housing",
  "donations",
  "interest",
  "disability",
  "other",
] as const;
export type DeductionGroup = (typeof DEDUCTION_GROUPS)[number];

export const DEDUCTION_GROUP_LABELS: Record<DeductionGroup, string> = {
  investments: "Tax-saving investments and payments",
  pension: "Pension (NPS)",
  health: "Health insurance and medical",
  loans: "Loan interest",
  housing: "Rent and housing",
  donations: "Donations",
  interest: "Interest earned",
  disability: "Disability",
  other: "Other",
};

export interface DeductionCategory {
  id: string;
  label: string;
  group: DeductionGroup;
  /** Section under the 1961 Act; `null` under the 2025 Act until verified. */
  section1961: string;
  /**
   * Whether a claim depends on conditions only the user can know (who is
   * covered, ages, ownership, receipts…). Such a claim stays "confirm you're
   * eligible" until the user confirms it.
   */
  eligibilitySensitive: boolean;
  hint?: string;
}

const c = (
  id: string,
  label: string,
  group: DeductionGroup,
  section1961: string,
  eligibilitySensitive: boolean,
  hint?: string
): DeductionCategory => ({ id, label, group, section1961, eligibilitySensitive, ...(hint ? { hint } : {}) });

export const DEDUCTION_CATEGORIES: readonly DeductionCategory[] = [
  c("epf_employee", "EPF (your share)", "investments", "80C", false, "Spendly can work this out from your EPF records."),
  c("ppf", "PPF", "investments", "80C", false),
  c("elss", "ELSS mutual funds", "investments", "80C", false),
  c("life_insurance", "Life insurance premium", "investments", "80C", true),
  c("tax_saver_fd", "Tax-saver fixed deposit", "investments", "80C", false),
  c("nsc", "NSC", "investments", "80C", false),
  c("sukanya", "Sukanya Samriddhi", "investments", "80C", false),
  c("tuition_fees", "Children's tuition fees", "investments", "80C", true),
  c("home_loan_principal", "Home loan principal", "investments", "80C", true),
  c("other_80c", "Other investment or payment", "investments", "80C", true),
  c("nps_self", "NPS (your contribution)", "pension", "80CCD(1)", false),
  c("nps_additional", "NPS (additional contribution)", "pension", "80CCD(1B)", false),
  c("nps_employer", "NPS (employer's contribution)", "pension", "80CCD(2)", false, "Usually shown on Form 16."),
  c("health_self", "Health insurance: you and family", "health", "80D", true),
  c("health_parents", "Health insurance: parents", "health", "80D", true),
  c("preventive_checkup", "Preventive health check-up", "health", "80D", true),
  c("medical_treatment", "Treatment of specified illness", "health", "80DDB", true),
  c("education_loan_interest", "Education loan interest", "loans", "80E", true),
  c("ev_loan_interest", "Electric vehicle loan interest", "loans", "80EEB", true),
  c("home_loan_interest", "Home loan interest", "housing", "24(b)", true),
  c("hra_exemption", "HRA exemption", "housing", "10(13A)", true, "Usually shown on Form 16."),
  c("rent_paid_no_hra", "Rent paid without HRA", "housing", "80GG", true),
  c("donations", "Donations", "donations", "80G", true, "Keep the receipt with the donee's details."),
  c("savings_interest", "Interest on savings", "interest", "80TTA / 80TTB", true, "Which section applies depends on your age."),
  c("disability_self", "Disability (yourself)", "disability", "80U", true),
  c("disability_dependant", "Disability (a dependant)", "disability", "80DD", true),
  c("other", "Other deduction", "other", "—", true),
];

const BY_ID = new Map(DEDUCTION_CATEGORIES.map((cat) => [cat.id, cat]));

export function deductionCategory(id: string): DeductionCategory | undefined {
  return BY_ID.get(id);
}

/** "Section 80C" under the 1961 Act; a plain pointer to the form under the 2025 Act. */
export function deductionSectionLabel(id: string, law: TaxLaw | null): string | null {
  const cat = BY_ID.get(id);
  if (!cat || cat.section1961 === "—") return null;
  return law === "ITA2025" ? "Section: see your return form" : `Section ${cat.section1961}`;
}
