/**
 * SPENDLY-295 — FY 2025-26 (AY 2026-27), Income-tax Act, 1961, as amended by
 * the Finance Act, 2025. Resident individuals only.
 *
 * Checked on 2026-11-07 against:
 * - incometax.gov.in, "Salaried Individuals for AY 2026-27": slabs (both
 *   regimes, by age), s.87A limits, surcharge table and the 15% cap on
 *   ss.111A/112/112A and dividends, cess, 80C/80CCD(1B)/80D/80TTA/80TTB/24(b)
 *   limits, 80CCD(2) at 14% in the new regime.
 * - incometax.gov.in, ITR-2 validation rules AY 2026-27 v1.0: STCG u/s 111A at
 *   20%, LTCG at 12.5%; no s.87A rebate above ₹12,00,000 "subject to marginal
 *   relief" (rule 484); old-regime rebate at most ₹12,500 (rule 485);
 *   professional tax at most ₹5,000 (rule 37); standard deduction at most
 *   ₹75,000 (new regime).
 * - incometaxindia.gov.in, s.112A: 12.5% on long-term gains above ₹1,25,000
 *   for transfers from 23 July 2024.
 * - Standard deduction ₹50,000 (old) / ₹75,000 (new), s.16(ia) and
 *   s.115BAC(1A)(ii).
 * - s.87A proviso (Finance Act 2025): the rebate does not reduce tax on income
 *   charged at special rates (ss.111A, 112, 112A).
 *
 * Never edit figures in place: a correction is a new rule set with a new
 * `ruleVersion`, so stored snapshots keep the version they used.
 */

import type { TaxRuleSet } from "./types";

const OLD_80C = { kind: "group", section: "80C / 80CCC / 80CCD(1)", group: "80CCE" } as const;

export const FY2025_26_RULES: TaxRuleSet = {
  ruleVersion: "ITA1961-FY2025-26-r1",
  fy: "2025-26",
  law: "ITA1961",
  effectiveFrom: "2025-04-01",
  effectiveTo: "2026-03-31",
  sources: [
    { label: "Income Tax Department: Salaried individuals for AY 2026-27", url: "https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1", checked: "2026-11-07" },
    { label: "CBDT: ITR-2 validation rules, AY 2026-27 v1.0", url: "https://www.incometax.gov.in/iec/foportal/sites/default/files/2026-05/CBDT__e-Filing_ITR%202_Validation%20Rules_AY%202026-27_V1.0.pdf", checked: "2026-11-07" },
    { label: "Income Tax Department: Section 112A", url: "https://www.incometaxindia.gov.in/w/section-112a-65", checked: "2026-11-07" },
  ],
  regimes: {
    new: {
      slabs: {
        below_60: [
          { upTo: 400_000, rate: 0 },
          { upTo: 800_000, rate: 0.05 },
          { upTo: 1_200_000, rate: 0.1 },
          { upTo: 1_600_000, rate: 0.15 },
          { upTo: 2_000_000, rate: 0.2 },
          { upTo: 2_400_000, rate: 0.25 },
          { upTo: null, rate: 0.3 },
        ],
        // The new regime has one table for every age.
        "60_to_79": [
          { upTo: 400_000, rate: 0 },
          { upTo: 800_000, rate: 0.05 },
          { upTo: 1_200_000, rate: 0.1 },
          { upTo: 1_600_000, rate: 0.15 },
          { upTo: 2_000_000, rate: 0.2 },
          { upTo: 2_400_000, rate: 0.25 },
          { upTo: null, rate: 0.3 },
        ],
        "80_plus": [
          { upTo: 400_000, rate: 0 },
          { upTo: 800_000, rate: 0.05 },
          { upTo: 1_200_000, rate: 0.1 },
          { upTo: 1_600_000, rate: 0.15 },
          { upTo: 2_000_000, rate: 0.2 },
          { upTo: 2_400_000, rate: 0.25 },
          { upTo: null, rate: 0.3 },
        ],
      },
      standardDeduction: 75_000,
      rebate: { maxTotalIncome: 1_200_000, maxRebate: 60_000, marginalRelief: true, notAgainst: ["stcg_111a", "ltcg_112", "ltcg_112a"] },
      surcharge: [
        { above: 5_000_000, rate: 0.1 },
        { above: 10_000_000, rate: 0.15 },
        { above: 20_000_000, rate: 0.25 },
      ],
      salaryExemptions: false,
      professionalTaxCap: null,
      selfOccupiedInterestCap: null,
      deductions: {
        nps_employer: { kind: "as_entered", section: "80CCD(2)", assumption: "employer_nps_within_limit" },
      },
    },
    old: {
      slabs: {
        below_60: [
          { upTo: 250_000, rate: 0 },
          { upTo: 500_000, rate: 0.05 },
          { upTo: 1_000_000, rate: 0.2 },
          { upTo: null, rate: 0.3 },
        ],
        "60_to_79": [
          { upTo: 300_000, rate: 0 },
          { upTo: 500_000, rate: 0.05 },
          { upTo: 1_000_000, rate: 0.2 },
          { upTo: null, rate: 0.3 },
        ],
        "80_plus": [
          { upTo: 500_000, rate: 0 },
          { upTo: 1_000_000, rate: 0.2 },
          { upTo: null, rate: 0.3 },
        ],
      },
      standardDeduction: 50_000,
      // The rebate may reduce tax on s.111A gains in the old regime, but not on s.112A gains.
      rebate: { maxTotalIncome: 500_000, maxRebate: 12_500, marginalRelief: false, notAgainst: ["ltcg_112a"] },
      surcharge: [
        { above: 5_000_000, rate: 0.1 },
        { above: 10_000_000, rate: 0.15 },
        { above: 20_000_000, rate: 0.25 },
        { above: 50_000_000, rate: 0.37 },
      ],
      salaryExemptions: true,
      professionalTaxCap: 5_000,
      selfOccupiedInterestCap: 200_000,
      deductions: {
        epf_employee: OLD_80C,
        ppf: OLD_80C,
        elss: OLD_80C,
        life_insurance: OLD_80C,
        tax_saver_fd: OLD_80C,
        nsc: OLD_80C,
        sukanya: OLD_80C,
        tuition_fees: OLD_80C,
        home_loan_principal: OLD_80C,
        other_80c: OLD_80C,
        nps_self: OLD_80C,
        nps_additional: { kind: "cap", section: "80CCD(1B)", cap: 50_000 },
        nps_employer: { kind: "as_entered", section: "80CCD(2)", assumption: "employer_nps_within_limit" },
        health_self: { kind: "cap", section: "80D", cap: 25_000, seniorCap: 50_000 },
        health_parents: { kind: "cap", section: "80D", cap: 25_000, assumption: "parents_below_60" },
        preventive_checkup: { kind: "cap", section: "80D", cap: 5_000 },
        medical_treatment: { kind: "cap", section: "80DDB", cap: 40_000, seniorCap: 100_000, assumption: "patient_age_from_profile" },
        education_loan_interest: { kind: "as_entered", section: "80E" },
        ev_loan_interest: { kind: "cap", section: "80EEB", cap: 150_000 },
        rent_paid_no_hra: { kind: "cap", section: "80GG", cap: 60_000, assumption: "rent_paid_limits" },
        donations: { kind: "as_entered", section: "80G", assumption: "donation_qualifying_amount" },
        disability_self: { kind: "cap", section: "80U", cap: 125_000, assumption: "disability_amount" },
        disability_dependant: { kind: "cap", section: "80DD", cap: 125_000, assumption: "disability_amount" },
        other: { kind: "as_entered", section: "Other", assumption: "other_deduction_as_entered" },
      },
    },
  },
  deductionGroups: { "80CCE": { section: "80C / 80CCC / 80CCD(1)", cap: 150_000 } },
  cess: 0.04,
  capitalGains: {
    stcg111aRate: 0.2,
    ltcg112Rate: 0.125,
    ltcg112aRate: 0.125,
    ltcg112aExemption: 125_000,
    specialSurchargeCap: 0.15,
  },
  houseProperty: { standardDeductionRate: 0.3 },
  savingsInterest: { ttaCap: 10_000, ttbCap: 50_000 },
  roundTo: 10,
};
