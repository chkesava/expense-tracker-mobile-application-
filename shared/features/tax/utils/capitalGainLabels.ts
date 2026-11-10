/**
 * SPENDLY-293 — words for capital-gain rows. Kept apart from the engine so the
 * form specs can use them without pulling in portfolio types.
 */

import type { TaxAssetClass, TaxCgTerm } from "../types";
import type { CapitalGainRow, CgAttention, CgTerm } from "./capitalGains";

export const ASSET_CLASS_LABELS: Record<TaxAssetClass, string> = {
  listed_equity: "Listed shares and equity ETFs",
  equity_mutual_fund: "Equity mutual funds",
  debt_mutual_fund: "Debt mutual funds",
  other_securities: "Other securities",
  gold: "Gold",
  property: "Property",
  virtual_digital_asset: "Crypto and other virtual assets",
  other: "Other assets",
};

export const CG_TERM_LABELS: Record<TaxCgTerm, string> = {
  short_term: "Short-term",
  long_term: "Long-term",
};

export const CG_TERM_TITLES: Record<CgTerm, string> = {
  short_term: "Short-term",
  long_term: "Long-term",
  unknown: "Term unknown",
  unsupported: "Not supported",
};

export const CG_ATTENTION_TEXT: Record<CgAttention, string> = {
  cost_missing: "No recorded buy covers this sale, so its cost is unknown. Add the sale yourself with its cost.",
  adjusted: "A split, bonus or cost correction came before this sale, so Spendly can't trace its cost. Add the sale yourself.",
  check_asset_class: "Spendly guessed the asset type. Check it: debt funds are taxed differently.",
  grandfathering: "Bought before 1 Feb 2018: the 31 Jan 2018 price may count as your cost. Check with your broker's statement.",
  intraday: "Bought and sold the same day: intraday trading is business income, not a capital gain.",
};

/** The row's status line: what it means for the totals. */
export function capitalGainStatus(row: CapitalGainRow): { label: string; tone: "success" | "warning" | "muted" } {
  switch (row.status) {
    case "counted":
      return row.origin === "user_entered" ? { label: "You added this", tone: "muted" } : { label: "Confirmed", tone: "success" };
    case "confirm_to_count":
      return { label: "Confirm to count it", tone: "warning" };
    case "check_again":
      return { label: "The trade changed: check again", tone: "warning" };
    case "left_out":
      return { label: "Left out", tone: "muted" };
    case "replaced_by_statement":
      return { label: "Replaced by your statement total", tone: "muted" };
  }
}

/** "Held 1 year 4 months" style, from days. */
export function holdingText(days: number | null): string | null {
  if (days === null) return null;
  if (days < 31) return `Held ${days} day${days === 1 ? "" : "s"}`;
  const months = Math.floor(days / 30.4375);
  const years = Math.floor(months / 12);
  const rest = months % 12;
  if (years === 0) return `Held ${months} month${months === 1 ? "" : "s"}`;
  return `Held ${years} year${years === 1 ? "" : "s"}${rest ? ` ${rest} month${rest === 1 ? "" : "s"}` : ""}`;
}

/** One sale in a list (its lots together): what, when, term, and the gain (`null` if any lot's is unknown). */
export function saleListSummary(rows: readonly CapitalGainRow[], formatDate: (date: string) => string): {
  title: string;
  subtitle: string;
  gain: number | null;
} {
  const first = rows[0];
  const quantity = rows.every((r) => r.quantity !== null) ? rows.reduce((s, r) => s + (r.quantity ?? 0), 0) : null;
  const terms = [...new Set(rows.map((r) => CG_TERM_TITLES[r.term]))];
  const subtitle = [
    quantity === null ? null : `${Math.round(quantity * 1e8) / 1e8} unit${quantity === 1 ? "" : "s"}`,
    `sold ${formatDate(first.soldDate)}`,
    terms.join(" + "),
    rows.length > 1 ? `${rows.length} lots` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const gain = rows.some((r) => r.gain === null) ? null : Math.round(rows.reduce((s, r) => s + (r.gain ?? 0), 0) * 100) / 100;
  return { title: first.assetName, subtitle, gain };
}
