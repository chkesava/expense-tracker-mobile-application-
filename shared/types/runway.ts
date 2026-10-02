/**
 * Financial Runway contract types (SPENDLY-205, epic SPENDLY-204).
 *
 * Runway is a planning estimate: "with my liquid money and expected burn,
 * how long can I keep meeting my commitments?" These types are the shared
 * vocabulary for the engine (206), classification (207), burn baseline (208),
 * calendar projection (209) and UI (210). Nothing here writes data.
 *
 * Documented in docs/SPENDLY-205-runway-contract.md.
 */

/** Every kind of Spendly resource or obligation runway can see. */
export const RUNWAY_RESOURCE_KINDS = [
  "bank",
  "cash",
  "wallet",
  "other_account",
  "credit_card",
  "fixed_deposit",
  "interest_savings",
  "mutual_fund",
  "demat_cash",
  "stocks",
  "epf",
  "receivable",
  "borrowing",
] as const;
export type RunwayResourceKind = (typeof RUNWAY_RESOURCE_KINDS)[number];

/**
 * How available a resource is for near-term spending.
 * - liquid: counted by default.
 * - near_liquid: shown, excluded unless the user opts in (207).
 * - restricted: locked or long-term; excluded.
 * - expected_inflow: money owed to the user; never cash until received.
 * - obligation: money the user owes; never a resource.
 * - unknown: cannot be classified safely; excluded.
 */
export type RunwayLiquidity =
  | "liquid"
  | "near_liquid"
  | "restricted"
  | "expected_inflow"
  | "obligation"
  | "unknown";

/** Whether a value is a recorded fact or something projected/assumed. */
export type RunwayCertainty = "actual" | "expected" | "estimated" | "assumed";

/** Where an input came from, so every number can be traced. */
export interface RunwayProvenance {
  /** Source collection or feature, e.g. "accounts", "investments", "settings". */
  source: string;
  refId?: string;
  /** Local date key (YYYY-MM-DD) the value was true for. */
  asOf: string;
  certainty: RunwayCertainty;
}

export interface RunwayResource {
  kind: RunwayResourceKind;
  refId: string;
  label: string;
  /** Rupee amount in the display currency. Obligations are positive amounts owed. */
  amount: number;
  liquidity: RunwayLiquidity;
  /** Counted in the starting liquid balance. */
  included: boolean;
  /** Why it is included/excluded, from RUNWAY_ASSUMPTION codes. */
  reasons: RunwayAssumptionCode[];
  provenance: RunwayProvenance;
}

/** How an expense is treated when measuring burn. */
export const BURN_CLASSES = [
  "essential",
  "discretionary",
  "savings_contribution",
  "debt_service",
  "fee",
  "money_movement",
] as const;
export type BurnClass = (typeof BURN_CLASSES)[number];

/** How an income row is treated. Refunds offset spending; asset sales are not income. */
export type IncomeClass = "earned" | "refund_offset" | "asset_conversion";

export const RUNWAY_MODES = ["net_burn", "gross_burn", "commitment_projection"] as const;
export type RunwayMode = (typeof RUNWAY_MODES)[number];

export type RunwayThreshold =
  | { kind: "none" }
  | { kind: "amount"; amount: number }
  | { kind: "essential_months"; months: number };

/** Projection horizon in whole months. */
export interface RunwayProjectionPeriod {
  months: number;
}

export type RunwayState =
  /** A finite number of months until the floor is reached. */
  | "finite"
  /** Inflows cover outflows: the balance is not falling. */
  | "not_depleting"
  /** Liquid money is already at or below the floor. */
  | "already_below"
  /** Inputs are missing, so no number is shown. */
  | "insufficient_data";

export interface RunwayResult {
  mode: RunwayMode;
  state: RunwayState;
  /** Months to the floor (1 decimal). Null unless state is "finite" or "already_below" (0). */
  months: number | null;
  /** The floor the runway is measured down to (threshold amount, 0 if none). */
  floor: number;
  /** Monthly figure the division used (net burn or essential outflow). */
  monthlyBurn: number | null;
}

export type RunwayConfidence = "high" | "medium" | "low" | "insufficient";

export type RunwayAssumptionCode =
  | "liquid_by_default"
  | "near_liquid_excluded"
  | "restricted_excluded"
  | "expected_inflow_not_cash"
  | "obligation_not_resource"
  | "unknown_kind_excluded"
  | "currency_unsupported"
  | "overdrawn_counted"
  | "category_mapped_from_legacy"
  | "category_unresolved"
  | "income_source_unrecognised"
  | "short_history"
  | "no_history"
  | "no_liquid_resources"
  | "uncertain_commitments";

export interface RunwayAssumption {
  code: RunwayAssumptionCode;
  text: string;
  /** How much the assumption could move the answer. */
  impact: "low" | "medium" | "high";
}
