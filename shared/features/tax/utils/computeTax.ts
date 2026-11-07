/**
 * SPENDLY-295 — an informational income-tax estimate for one regime.
 *
 * Pure and deterministic: the same input and rules always give the same
 * result. Every step is listed with what it was worked out from, and the
 * result carries the rule version it used. Nothing here is advice, and the
 * result is never a final liability or refund.
 *
 * No number is produced when Spendly can't estimate the case (`unsupported`)
 * or a counted figure is unknown (`missing`). Items not counted yet make the
 * estimate `partial`, and they are listed.
 *
 * Order (resident individual):
 *   1. Salary: gross, less exempt allowances and professional tax (old regime
 *      only), less the standard deduction.
 *   2. House property: rent less 30%; old regime less home-loan interest up to
 *      ₹2,00,000 (treated as a self-occupied home, stated).
 *   3. Other sources, and short-term gains taxed at slab rates.
 *   4. Deductions, by section and cap, limited to the income above (they can't
 *      reduce income taxed at special rates).
 *   5. Total income, rounded to ₹10 (s.288A).
 *   6. Unused basic exemption reduces special-rate gains (s.111A, s.112,
 *      s.112A provisos), highest rate first.
 *   7. Tax: slabs on the rest; 20% on s.111A gains; 12.5% on s.112 gains;
 *      12.5% on s.112A gains above ₹1,25,000.
 *   8. Rebate (s.87A), with marginal relief in the new regime; never against
 *      tax at special rates the rules exclude.
 *   9. Surcharge with marginal relief, 4% cess, rounded to ₹10 (s.288B).
 *  10. Less TDS and tax paid: the balance to pay (positive) or refund (negative).
 */

import { roundMoney } from "@/shared/utils/money";
import type { RegimeRules, SpecialRateKind, TaxRegime, TaxRuleSet, TaxSlab } from "../data/taxRules/types";
import type { TaxEstimateInput, TaxGapCode } from "./taxInput";

export type TaxEstimateStatus = "ok" | "partial" | "missing" | "unsupported";

/** Stated with the estimate: what Spendly assumed. */
export type TaxAssumption =
  | "resident"
  | "age_below_60"
  | "home_loan_self_occupied"
  | "home_loan_with_rent"
  | "municipal_tax_not_deducted"
  | "hra_twice"
  | "house_property_loss_not_carried"
  | "savings_interest_not_claimed"
  | "shortfall_highest_rate_first"
  | "marginal_relief_with_special_rates"
  | "no_interest_234"
  | "employer_nps_within_limit"
  | "parents_below_60"
  | "patient_age_from_profile"
  | "rent_paid_limits"
  | "donation_qualifying_amount"
  | "disability_amount"
  | "other_deduction_as_entered"
  | "deductions_not_in_new_regime"
  | "form16_blank_as_zero"
  | "capital_loss_not_carried"
  | "stt_paid"
  | "tds_from_certificates";

export type TaxUnsupportedCode = TaxGapCode | "rules_not_available" | "surcharge_with_special_rates" | "surcharge_on_dividends";

export interface TaxStep {
  key: string;
  label: string;
  amount: number;
  /** How the figure was reached: a section, a cap, a rate. */
  basis?: string;
}

export interface TaxComputation {
  regime: TaxRegime;
  fy: string;
  ruleVersion: string | null;
  status: TaxEstimateStatus;
  unsupported: TaxUnsupportedCode[];
  missing: TaxGapCode[];
  pending: TaxGapCode[];
  assumptions: TaxAssumption[];
  /** The workings, in order. Empty when there is no estimate. */
  steps: TaxStep[];
  /** `null` whenever `status` is `missing` or `unsupported`. */
  totalIncome: number | null;
  liability: number | null;
  taxesPaid: number;
  /** Liability less tax paid: positive to pay, negative a refund. */
  balance: number | null;
}

const money = roundMoney;

export function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Tax on `income` by slabs. */
export function slabTax(income: number, slabs: readonly TaxSlab[]): number {
  let tax = 0;
  let lower = 0;
  for (const slab of slabs) {
    const upper = slab.upTo ?? Infinity;
    if (income > lower) tax += (Math.min(income, upper) - lower) * slab.rate;
    if (income <= upper) break;
    lower = upper;
  }
  return money(tax);
}

function basicExemption(slabs: readonly TaxSlab[]): number {
  return slabs[0].rate === 0 ? (slabs[0].upTo ?? 0) : 0;
}

function push<T>(list: T[], value: T): void {
  if (!list.includes(value)) list.push(value);
}

const rupees = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const percent = (r: number) => `${Math.round(r * 1000) / 10}%`;

function empty(
  regime: TaxRegime,
  input: TaxEstimateInput,
  rules: TaxRuleSet | null,
  status: "missing" | "unsupported",
  unsupported: TaxUnsupportedCode[],
  assumptions: TaxAssumption[]
): TaxComputation {
  return {
    regime,
    fy: input.fy,
    ruleVersion: rules?.ruleVersion ?? null,
    status,
    unsupported,
    missing: [...input.gaps.missing],
    pending: [...input.gaps.pending],
    assumptions,
    steps: [],
    totalIncome: null,
    liability: null,
    taxesPaid: paidTotal(input),
    balance: null,
  };
}

function paidTotal(input: TaxEstimateInput): number {
  const p = input.taxesPaid;
  return money(p.tds + p.advanceTax + p.selfAssessment + p.other);
}

/** Deductions allowed in this regime, by section, limited by their caps. */
function allowedDeductions(
  input: TaxEstimateInput,
  rules: TaxRuleSet,
  regime: RegimeRules,
  senior: boolean,
  assumptions: TaxAssumption[],
  regimeName: TaxRegime
): { key: string; label: string; amount: number; basis: string }[] {
  const out: { key: string; label: string; amount: number; basis: string }[] = [];
  const groups = new Map<string, number>();
  let notAllowed = false;
  for (const [category, entered] of Object.entries(input.deductions).sort(([a], [b]) => a.localeCompare(b))) {
    if (entered <= 0) continue;
    const rule = regime.deductions[category];
    if (!rule) {
      notAllowed = true;
      continue;
    }
    if (rule.kind === "group") {
      groups.set(rule.group, (groups.get(rule.group) ?? 0) + entered);
      continue;
    }
    if (rule.assumption) push(assumptions, rule.assumption as TaxAssumption);
    if (rule.kind === "as_entered") {
      out.push({ key: `deduction.${category}`, label: `Deduction ${rule.section}`, amount: money(entered), basis: "as entered" });
    } else {
      const cap = senior && rule.seniorCap ? rule.seniorCap : rule.cap;
      out.push({
        key: `deduction.${category}`,
        label: `Deduction ${rule.section}`,
        amount: money(Math.min(entered, cap)),
        basis: `${rupees(entered)} entered, up to ${rupees(cap)}`,
      });
    }
  }
  for (const [group, entered] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const g = rules.deductionGroups[group];
    out.push({ key: `deduction.${group}`, label: `Deduction ${g.section}`, amount: money(Math.min(entered, g.cap)), basis: `${rupees(entered)} entered, up to ${rupees(g.cap)} together` });
  }
  if (regimeName === "old") {
    // s.80TTA (below 60) on savings interest; s.80TTB (60 or older) on savings and deposit interest.
    const os = input.otherSources;
    if (input.savingsInterestClaim > 0) {
      const ttb = senior;
      const cap = ttb ? rules.savingsInterest.ttbCap : rules.savingsInterest.ttaCap;
      const interest = ttb ? os.savingsInterest + os.depositInterest : os.savingsInterest;
      const amount = money(Math.min(input.savingsInterestClaim, cap, interest));
      out.push({ key: "deduction.savings_interest", label: ttb ? "Deduction 80TTB" : "Deduction 80TTA", amount, basis: `up to ${rupees(cap)} and the interest counted` });
    } else if (os.savingsInterest > 0) {
      push(assumptions, "savings_interest_not_claimed");
    }
  } else if (input.savingsInterestClaim > 0 || Object.keys(input.deductions).some((c) => !regime.deductions[c])) {
    notAllowed = true;
  }
  if (notAllowed && regimeName === "new") push(assumptions, "deductions_not_in_new_regime");
  return out.filter((d) => d.amount > 0);
}

export function computeTax(input: TaxEstimateInput, rules: TaxRuleSet | null, regimeName: TaxRegime): TaxComputation {
  const assumptions: TaxAssumption[] = [];
  if (!rules || rules.fy !== input.fy) return empty(regimeName, input, rules, "unsupported", ["rules_not_available"], assumptions);
  if (input.gaps.unsupported.length > 0) return empty(regimeName, input, rules, "unsupported", [...input.gaps.unsupported], assumptions);
  if (input.gaps.missing.length > 0) return empty(regimeName, input, rules, "missing", [], assumptions);

  const regime = rules.regimes[regimeName];
  if (input.residentialStatus === "unknown") push(assumptions, "resident");
  if (input.ageBand === "unknown") push(assumptions, "age_below_60");
  for (const note of input.notes) push(assumptions, note);
  push(assumptions, "no_interest_234");
  const age = input.ageBand === "unknown" ? "below_60" : input.ageBand;
  const senior = age !== "below_60";
  const slabs = regime.slabs[age];
  const steps: TaxStep[] = [];
  const step = (key: string, label: string, amount: number, basis?: string) =>
    steps.push({ key, label, amount: money(amount), ...(basis ? { basis } : {}) });

  // 1. Salary
  const s = input.salary;
  let salaryIncome = 0;
  if (s.gross > 0) {
    step("salary.gross", "Gross salary and pension", s.gross);
    let remaining = s.gross;
    if (regime.salaryExemptions) {
      const exempt = Math.min(remaining, s.exemptAllowances + s.hraExemption);
      if (s.exemptAllowances > 0 && s.hraExemption > 0) push(assumptions, "hra_twice");
      if (exempt > 0) {
        step("salary.exempt", "Exempt allowances (incl. HRA)", -exempt, "s.10, as on Form 16 or entered");
        remaining -= exempt;
      }
    }
    const standard = Math.min(regime.standardDeduction, remaining);
    step("salary.standardDeduction", "Standard deduction", -standard, `s.16(ia), up to ${rupees(regime.standardDeduction)}`);
    remaining -= standard;
    if (regime.professionalTaxCap !== null && s.professionalTax > 0) {
      const pt = Math.min(s.professionalTax, regime.professionalTaxCap, remaining);
      step("salary.professionalTax", "Professional tax", -pt, `s.16(iii), up to ${rupees(regime.professionalTaxCap)}`);
      remaining -= pt;
    }
    salaryIncome = money(remaining);
    step("salary.income", "Income from salary", salaryIncome);
  }

  // 2. House property
  let hpIncome = 0;
  if (input.rent > 0 || input.homeLoanInterest > 0) {
    if (input.rent > 0) {
      push(assumptions, "municipal_tax_not_deducted");
      const std = input.rent * rules.houseProperty.standardDeductionRate;
      step("hp.rent", "Rent received", input.rent);
      step("hp.standardDeduction", "Standard deduction on rent", -std, `s.24(a), ${percent(rules.houseProperty.standardDeductionRate)}`);
      hpIncome = input.rent - std;
    }
    if (input.homeLoanInterest > 0) {
      push(assumptions, "home_loan_self_occupied");
      if (input.rent > 0) push(assumptions, "home_loan_with_rent");
      if (regime.selfOccupiedInterestCap !== null) {
        const interest = Math.min(input.homeLoanInterest, regime.selfOccupiedInterestCap);
        step("hp.interest", "Home loan interest", -interest, `s.24(b), up to ${rupees(regime.selfOccupiedInterestCap)}`);
        hpIncome -= interest;
      }
    }
    hpIncome = money(hpIncome);
    step("hp.income", "Income from house property", hpIncome);
  }

  // 3. Other sources and slab-rate short-term gains
  const os = input.otherSources;
  const osIncome = money(os.savingsInterest + os.depositInterest + os.dividends + os.other);
  if (osIncome > 0) step("os.income", "Income from other sources", osIncome, "interest, dividends and other income counted");
  const cg = input.capitalGains;
  if (cg.stcgSlab > 0) step("cg.stcgSlab", "Short-term gains at slab rates", cg.stcgSlab);

  let normalGross = salaryIncome + hpIncome + osIncome + cg.stcgSlab;
  if (normalGross < 0) {
    push(assumptions, "house_property_loss_not_carried");
    normalGross = 0;
  }
  const special = { stcg_111a: cg.stcg111a, ltcg_112: cg.ltcg112, ltcg_112a: cg.ltcg112a };
  if (special.stcg_111a > 0) step("cg.stcg111a", "Short-term gains on equity", special.stcg_111a, "s.111A");
  if (special.ltcg_112a > 0) step("cg.ltcg112a", "Long-term gains on equity", special.ltcg_112a, "s.112A");
  if (special.ltcg_112 > 0) step("cg.ltcg112", "Other long-term gains", special.ltcg_112, "s.112");
  const specialTotal = special.stcg_111a + special.ltcg_112 + special.ltcg_112a;
  step("gti", "Gross total income", normalGross + specialTotal);

  // 4. Deductions, limited to income at slab rates
  const deductions = allowedDeductions(input, rules, regime, senior, assumptions, regimeName);
  let deductionTotal = 0;
  for (const d of deductions) deductionTotal += d.amount;
  const usable = Math.min(deductionTotal, normalGross);
  for (const d of deductions) step(d.key, d.label, -d.amount, d.basis);
  if (usable < deductionTotal) step("deduction.limit", "Deductions above income at slab rates", deductionTotal - usable, "can't reduce special-rate gains");

  // 5. Total income (s.288A)
  const normalIncome = roundToNearest(Math.max(0, normalGross - usable), rules.roundTo);
  const totalIncome = money(normalIncome + specialTotal);
  step("totalIncome", "Total income", totalIncome, `rounded to ₹${rules.roundTo}`);

  // 6. Unused basic exemption against special-rate gains, highest rate first
  const cgr = rules.capitalGains;
  const taxable = {
    stcg_111a: special.stcg_111a,
    ltcg_112: special.ltcg_112,
    ltcg_112a: Math.max(0, special.ltcg_112a - cgr.ltcg112aExemption),
  };
  if (special.ltcg_112a > 0) step("cg.ltcg112aExemption", "Exempt equity gains", -Math.min(special.ltcg_112a, cgr.ltcg112aExemption), `s.112A, first ${rupees(cgr.ltcg112aExemption)}`);
  let shortfall = Math.max(0, basicExemption(slabs) - normalIncome);
  if (shortfall > 0 && specialTotal > 0) {
    push(assumptions, "shortfall_highest_rate_first");
    for (const kind of ["stcg_111a", "ltcg_112", "ltcg_112a"] as const) {
      const used = Math.min(shortfall, taxable[kind]);
      if (used <= 0) continue;
      taxable[kind] -= used;
      shortfall -= used;
      step(`cg.shortfall.${kind}`, "Unused basic exemption", -used, "proviso to s.111A / 112 / 112A");
    }
  }

  // 7. Tax
  const normalTax = slabTax(normalIncome, slabs);
  step("tax.slab", "Tax at slab rates", normalTax, `on ${rupees(normalIncome)}`);
  const specialTax: Record<SpecialRateKind, number> = {
    stcg_111a: money(taxable.stcg_111a * cgr.stcg111aRate),
    ltcg_112: money(taxable.ltcg_112 * cgr.ltcg112Rate),
    ltcg_112a: money(taxable.ltcg_112a * cgr.ltcg112aRate),
  };
  if (specialTax.stcg_111a > 0) step("tax.stcg111a", "Tax on short-term equity gains", specialTax.stcg_111a, `${percent(cgr.stcg111aRate)} of ${rupees(taxable.stcg_111a)}`);
  if (specialTax.ltcg_112a > 0) step("tax.ltcg112a", "Tax on long-term equity gains", specialTax.ltcg_112a, `${percent(cgr.ltcg112aRate)} of ${rupees(taxable.ltcg_112a)}`);
  if (specialTax.ltcg_112 > 0) step("tax.ltcg112", "Tax on other long-term gains", specialTax.ltcg_112, `${percent(cgr.ltcg112Rate)} of ${rupees(taxable.ltcg_112)}`);
  const specialTaxTotal = specialTax.stcg_111a + specialTax.ltcg_112 + specialTax.ltcg_112a;
  const tax = money(normalTax + specialTaxTotal);

  // 8. Rebate (residents)
  let rebate = 0;
  const r = regime.rebate;
  const rebatable = money(normalTax + (Object.keys(specialTax) as SpecialRateKind[]).filter((k) => !r.notAgainst.includes(k)).reduce((sum, k) => sum + specialTax[k], 0));
  if (totalIncome <= r.maxTotalIncome) {
    rebate = Math.min(rebatable, r.maxRebate);
    if (rebate > 0) step("tax.rebate", "Rebate", -rebate, `s.87A, total income up to ${rupees(r.maxTotalIncome)}`);
  } else if (r.marginalRelief) {
    // Tax on slab income may not exceed the income above the limit.
    const excess = totalIncome - r.maxTotalIncome;
    if (rebatable > excess) {
      rebate = money(rebatable - excess);
      if (specialTotal > 0) push(assumptions, "marginal_relief_with_special_rates");
      step("tax.rebate", "Rebate (marginal relief)", -rebate, `s.87A: tax limited to the ${rupees(excess)} above ${rupees(r.maxTotalIncome)}`);
    }
  }
  const afterRebate = money(tax - rebate);

  // 9. Surcharge with marginal relief, then cess
  let surcharge = 0;
  const band = [...regime.surcharge].reverse().find((b) => totalIncome > b.above);
  if (band) {
    if (specialTotal > 0) return empty(regimeName, input, rules, "unsupported", ["surcharge_with_special_rates"], assumptions);
    if (os.dividends > 0 && band.rate > cgr.specialSurchargeCap) {
      return empty(regimeName, input, rules, "unsupported", ["surcharge_on_dividends"], assumptions);
    }
    surcharge = afterRebate * band.rate;
    // Tax + surcharge may not exceed the tax at the threshold plus the income above it.
    const below = [...regime.surcharge].reverse().find((b) => b.above < band.above);
    const atThreshold = slabTax(band.above, slabs) * (1 + (below?.rate ?? 0));
    const ceiling = atThreshold + (totalIncome - band.above);
    if (afterRebate + surcharge > ceiling) surcharge = Math.max(0, ceiling - afterRebate);
    surcharge = money(surcharge);
    step("tax.surcharge", "Surcharge", surcharge, `${percent(band.rate)} above ${rupees(band.above)}, with marginal relief`);
  }
  const cess = money((afterRebate + surcharge) * rules.cess);
  if (cess > 0) step("tax.cess", "Health and education cess", cess, percent(rules.cess));
  const liability = roundToNearest(afterRebate + surcharge + cess, rules.roundTo);
  step("liability", "Estimated tax for the year", liability, `rounded to ₹${rules.roundTo}`);

  // 10. Tax already paid
  const p = input.taxesPaid;
  if (p.tds > 0) step("paid.tds", "TDS", -p.tds);
  if (p.advanceTax > 0) step("paid.advance", "Advance tax", -p.advanceTax);
  if (p.selfAssessment > 0) step("paid.selfAssessment", "Self-assessment tax", -p.selfAssessment);
  if (p.other > 0) step("paid.other", "Other tax paid", -p.other);
  const taxesPaid = paidTotal(input);
  const balance = money(liability - taxesPaid);
  step("balance", balance >= 0 ? "Estimated tax still to pay" : "Estimated refund", Math.abs(balance));

  return {
    regime: regimeName,
    fy: input.fy,
    ruleVersion: rules.ruleVersion,
    status: input.gaps.pending.length > 0 ? "partial" : "ok",
    unsupported: [],
    missing: [],
    pending: [...input.gaps.pending],
    assumptions,
    steps,
    totalIncome,
    liability,
    taxesPaid,
    balance,
  };
}
