/** Display labels for runway sources (SPENDLY-207). Pure so they can be tested. */

import { LIQUIDITY_INCLUDED_BY_DEFAULT, RUNWAY_ASSUMPTIONS } from "../data/runwayRules";
import type { RunwayLiquidity, RunwayResource, RunwayResourceKind } from "../types/runway";

export const RUNWAY_KIND_LABELS: Record<RunwayResourceKind, string> = {
  bank: "Bank account",
  cash: "Cash",
  wallet: "Wallet",
  other_account: "Other account",
  credit_card: "Credit card",
  fixed_deposit: "Fixed deposit",
  interest_savings: "Interest savings",
  mutual_fund: "Mutual fund",
  demat_cash: "Demat cash",
  stocks: "Stocks",
  epf: "EPF",
  receivable: "Owed to you",
  borrowing: "Loan",
};

export const RUNWAY_LIQUIDITY_LABELS: Record<RunwayLiquidity, string> = {
  liquid: "Spendable",
  near_liquid: "Near-liquid",
  restricted: "Locked / long-term",
  expected_inflow: "Not yet received",
  obligation: "You owe this",
  unknown: "Type not recognised",
};

/** The sentence that explains why a resource is or isn't counted. */
export function runwayReasonText(resource: Pick<RunwayResource, "reasons">): string {
  return resource.reasons.map((code) => RUNWAY_ASSUMPTIONS[code].text).join(" ");
}

/** Whether the switch is editable for this resource right now. */
export function canToggleRunwayResource(resource: Pick<RunwayResource, "overridable" | "reasons">): boolean {
  return resource.overridable && !resource.reasons.includes("currency_unsupported");
}

/** Whether `included` equals the default, so the stored override can be removed. */
export function isRunwayDefault(resource: Pick<RunwayResource, "liquidity">, included: boolean): boolean {
  return LIQUIDITY_INCLUDED_BY_DEFAULT[resource.liquidity] === included;
}
