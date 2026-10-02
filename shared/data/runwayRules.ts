/**
 * Default Financial Runway rules (SPENDLY-205). Versioned so a later change
 * in classification can be explained against the version a result used.
 *
 * Product decisions (2026-10-02):
 * - Liquid by default: bank, cash and wallet only. FD, mutual funds,
 *   interest-savings and demat cash are near-liquid (shown, excluded unless
 *   the user opts in). EPF and stocks are restricted. Receivables are expected
 *   inflows. Credit cards and borrowings are obligations.
 * - Savings and investment contributions are their own pausable class:
 *   counted in net burn, left out of essential (gross) burn.
 */

import type {
  BurnClass,
  IncomeClass,
  RunwayAssumption,
  RunwayAssumptionCode,
  RunwayLiquidity,
  RunwayMode,
  RunwayResourceKind,
} from "../types/runway";

export const RUNWAY_RULES_VERSION = 1;

export const DEFAULT_RESOURCE_LIQUIDITY: Record<RunwayResourceKind, RunwayLiquidity> = {
  bank: "liquid",
  cash: "liquid",
  wallet: "liquid",
  // Account types are free text; anything not recognised as bank/cash/wallet
  // could be an FD, broker or loan account, so it must not inflate runway.
  other_account: "unknown",
  credit_card: "obligation",
  fixed_deposit: "near_liquid",
  interest_savings: "near_liquid",
  mutual_fund: "near_liquid",
  demat_cash: "near_liquid",
  stocks: "restricted",
  epf: "restricted",
  receivable: "expected_inflow",
  borrowing: "obligation",
};

/** Which liquidity levels are counted by default. Only `liquid`. */
export const LIQUIDITY_INCLUDED_BY_DEFAULT: Record<RunwayLiquidity, boolean> = {
  liquid: true,
  near_liquid: false,
  restricted: false,
  expected_inflow: false,
  obligation: false,
  unknown: false,
};

/**
 * Kinds the user may override (SPENDLY-207 decision, 2026-10-02): liquid
 * accounts can be excluded; near-liquid investments and unrecognised accounts
 * can be included. EPF, stocks, receivables, cards and loans are locked so
 * they can never silently inflate runway. firestore.rules mirrors this list.
 */
export const RUNWAY_OVERRIDABLE_KINDS: readonly RunwayResourceKind[] = [
  "bank",
  "cash",
  "wallet",
  "other_account",
  "fixed_deposit",
  "interest_savings",
  "mutual_fund",
  "demat_cash",
];

/** The reason code recorded for each liquidity level. */
export const LIQUIDITY_REASON: Record<RunwayLiquidity, RunwayAssumptionCode> = {
  liquid: "liquid_by_default",
  near_liquid: "near_liquid_excluded",
  restricted: "restricted_excluded",
  expected_inflow: "expected_inflow_not_cash",
  obligation: "obligation_not_resource",
  unknown: "unknown_kind_excluded",
};

/**
 * Burn class per v4 taxonomy parent key (shared/data/categoryTaxonomy.ts).
 * A test fails if a visible parent has no entry.
 */
export const BURN_CLASS_BY_PARENT: Record<string, BurnClass> = {
  food_groceries: "essential", // eating at home is unavoidable
  home_household: "essential", // rent, utilities, domestic help
  transport_vehicles: "essential", // commuting and fuel
  bills_communication: "essential", // phone and internet
  shopping_clothing: "discretionary", // can be deferred
  health_medical: "essential", // care and medicines
  education: "essential", // fees are committed
  family_children: "essential", // dependants' support
  personal_care: "discretionary", // salon, cosmetics
  entertainment_hobbies: "discretionary",
  travel_holidays: "discretionary",
  finance_loans_insurance: "essential", // taxes and premiums; EMIs/fees overridden below
  investments_savings: "savings_contribution", // pausable, per product decision
  gifts_donations_social: "discretionary",
  pets: "essential", // food and vet care
  work_professional: "discretionary", // often reimbursed
  government_legal: "essential", // statutory fees and fines
  miscellaneous: "discretionary", // unknown spending is treated as avoidable
};

/** Subcategory overrides, keyed `${parentKey}/${subKey}`. */
export const BURN_CLASS_BY_SUBCATEGORY: Record<string, BurnClass> = {
  // Eating out can be cut back.
  "food_groceries/food_delivery": "discretionary",
  "food_groceries/restaurants_dining": "discretionary",
  "food_groceries/cafes_tea": "discretionary",
  "food_groceries/catering": "discretionary",
  // One-time home purchases are deferrable.
  "home_household/furniture": "discretionary",
  "home_household/home_appliances": "discretionary",
  "home_household/home_electronics": "discretionary",
  "transport_vehicles/vehicle_accessories": "discretionary",
  "transport_vehicles/car_wash": "discretionary",
  "bills_communication/ai_tools": "discretionary",
  "bills_communication/domain": "discretionary",
  "bills_communication/hosting": "discretionary",
  "health_medical/gym_membership": "discretionary",
  "health_medical/fitness": "discretionary",
  "health_medical/sports": "discretionary",
  "health_medical/supplements_nutrition": "discretionary",
  "family_children/toys": "discretionary",
  "family_children/family_travel": "discretionary",
  "family_children/family_activities": "discretionary",
  "personal_care/toiletries": "essential",
  "personal_care/personal_hygiene": "essential",
  "pets/grooming": "discretionary",
  "pets/accessories": "discretionary",
  "pets/boarding": "discretionary",
  // A card bill payment settles spending already recorded on the card.
  "finance_loans_insurance/credit_card_payment": "money_movement",
  "finance_loans_insurance/personal_loan_emi": "debt_service",
  "finance_loans_insurance/home_loan_emi": "debt_service",
  "finance_loans_insurance/vehicle_loan_emi": "debt_service",
  "finance_loans_insurance/education_loan_emi": "debt_service",
  "finance_loans_insurance/other_emi": "debt_service",
  "finance_loans_insurance/interest": "debt_service",
  "finance_loans_insurance/bank_charges": "fee",
  "finance_loans_insurance/credit_card_fees": "fee",
  "finance_loans_insurance/atm_fees": "fee",
  "finance_loans_insurance/loan_fees": "fee",
  "finance_loans_insurance/financial_service_fees": "fee",
  "investments_savings/investment_fees": "fee",
  // Moving money between own accounts is not spending.
  "miscellaneous/transfer": "money_movement",
};

/** Which burn classes each mode counts as outflow. */
export const BURN_CLASSES_IN_MODE: Record<RunwayMode, readonly BurnClass[]> = {
  net_burn: ["essential", "discretionary", "savings_contribution", "debt_service", "fee"],
  gross_burn: ["essential", "debt_service", "fee"],
  commitment_projection: ["essential", "discretionary", "savings_contribution", "debt_service", "fee"],
};

/** Income source (INCOME_SOURCES) → how runway treats it. */
export const INCOME_CLASS_BY_SOURCE: Record<string, IncomeClass> = {
  Salary: "earned",
  Bonus: "earned",
  Freelance: "earned",
  "Business Income": "earned",
  "Rental Income": "earned",
  Interest: "earned",
  Dividend: "earned",
  "Gift Received": "earned",
  Pension: "earned",
  "Government Benefit": "earned",
  "Other Income": "earned",
  // Money coming back for spending already recorded.
  Cashback: "refund_offset",
  Refund: "refund_offset",
  Reimbursement: "refund_offset",
  // Selling an investment converts an asset; it is not recurring income.
  "Investment Proceeds": "asset_conversion",
};

export const RUNWAY_MODE_INFO: Record<RunwayMode, { label: string; formula: string }> = {
  net_burn: {
    label: "Net burn",
    formula: "(liquid money − floor) ÷ (average monthly outflow − average monthly earned income)",
  },
  gross_burn: {
    label: "Essential (gross) burn",
    formula: "(liquid money − floor) ÷ average monthly essential outflow (essentials, EMIs, fees)",
  },
  commitment_projection: {
    label: "Commitment-aware projection",
    formula:
      "Month by month: opening balance + expected inflows − expected outflows − known commitments; runway ends in the first month the balance falls below the floor",
  },
};

export const RUNWAY_ASSUMPTIONS: Record<RunwayAssumptionCode, RunwayAssumption> = {
  liquid_by_default: { code: "liquid_by_default", text: "Bank, cash and wallet balances count as spendable.", impact: "low" },
  near_liquid_excluded: {
    code: "near_liquid_excluded",
    text: "Fixed deposits, mutual funds and demat cash are shown but not counted unless you include them.",
    impact: "medium",
  },
  restricted_excluded: { code: "restricted_excluded", text: "EPF and stocks are long-term and not counted.", impact: "low" },
  expected_inflow_not_cash: {
    code: "expected_inflow_not_cash",
    text: "Money others owe you is not counted until it is received.",
    impact: "medium",
  },
  obligation_not_resource: {
    code: "obligation_not_resource",
    text: "Credit cards and loans are amounts you owe, never spendable money.",
    impact: "low",
  },
  unknown_kind_excluded: {
    code: "unknown_kind_excluded",
    text: "An account whose type isn't recognised as bank, cash or wallet is not counted.",
    impact: "high",
  },
  currency_unsupported: {
    code: "currency_unsupported",
    text: "Accounts in another currency are not counted; runway uses your display currency only.",
    impact: "high",
  },
  overdrawn_counted: { code: "overdrawn_counted", text: "An overdrawn balance reduces your liquid money.", impact: "medium" },
  user_included: { code: "user_included", text: "You chose to count this toward runway.", impact: "medium" },
  user_excluded: { code: "user_excluded", text: "You chose not to count this toward runway.", impact: "medium" },
  category_mapped_from_legacy: {
    code: "category_mapped_from_legacy",
    text: "Some older categories were mapped to the current list to classify them.",
    impact: "low",
  },
  category_unresolved: {
    code: "category_unresolved",
    text: "Some spending has an unrecognised category and is treated as discretionary.",
    impact: "medium",
  },
  income_source_unrecognised: {
    code: "income_source_unrecognised",
    text: "Some income has an unrecognised source and is treated as earned income.",
    impact: "medium",
  },
  short_history: { code: "short_history", text: "Less than three months of history; averages may move a lot.", impact: "high" },
  no_history: { code: "no_history", text: "There isn't a full month of history yet.", impact: "high" },
  no_liquid_resources: { code: "no_liquid_resources", text: "No spendable balance is counted.", impact: "high" },
  uncertain_commitments: {
    code: "uncertain_commitments",
    text: "Some upcoming commitments have uncertain amounts or dates.",
    impact: "medium",
  },
};

export const RUNWAY_PROJECTION_LIMITS = { minMonths: 1, maxMonths: 24, defaultMonths: 12 } as const;
