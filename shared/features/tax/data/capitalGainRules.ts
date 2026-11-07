/**
 * SPENDLY-293 — holding periods that make a capital asset long-term, by the
 * date the asset was sold. Classification only: no rates, no exemptions, no
 * indexation (SPENDLY-295 owns those, with their own sources).
 *
 * Sources (checked 2026-11-07):
 * - Income-tax Act, 1961, s.2(42A), as amended by the Finance (No. 2) Act, 2024
 *   with effect from 23 July 2024: listed securities and units of
 *   equity-oriented funds are long-term when held for more than 12 months;
 *   other capital assets when held for more than 24 months.
 *   https://www.incometaxindia.gov.in/w/introduction-8
 *   https://bcajonline.org/journal/important-amendments-by-the-finance-no-2-act-2024-capital-gains/
 * - Before 23 July 2024: 12 months for listed securities and equity-oriented
 *   fund units; 24 months for unlisted shares and immovable property; 36
 *   months for other assets (including debt funds and gold).
 * - s.50AA: units of a specified mutual fund (debt-oriented) acquired on or
 *   after 1 April 2023 give short-term gains whatever the holding period.
 *
 * Virtual digital assets have their own regime and no long/short split; they
 * are shown as unsupported for the estimate.
 *
 * A change here changes every classification: it needs a new rule id, a test,
 * and an update to docs/SPENDLY-293-capital-gains.md.
 */

import type { TaxAssetClass } from "../types";

export interface HoldingPeriodRule {
  id: string;
  /** Sale dates this rule covers, inclusive. `null` = open. */
  soldFrom: string | null;
  soldTo: string | null;
  /** Months that must be *exceeded* for long-term; `null` = never long-term here (unsupported). */
  months: Record<TaxAssetClass, number | null>;
}

export const HOLDING_PERIOD_RULES: readonly HoldingPeriodRule[] = [
  {
    id: "s2-42A-pre-2024-07-23",
    soldFrom: null,
    soldTo: "2024-07-22",
    months: {
      listed_equity: 12,
      equity_mutual_fund: 12,
      debt_mutual_fund: 36,
      other_securities: 36,
      gold: 36,
      property: 24,
      virtual_digital_asset: null,
      other: 36,
    },
  },
  {
    id: "s2-42A-from-2024-07-23",
    soldFrom: "2024-07-23",
    soldTo: null,
    months: {
      listed_equity: 12,
      equity_mutual_fund: 12,
      debt_mutual_fund: 24,
      other_securities: 24,
      gold: 24,
      property: 24,
      virtual_digital_asset: null,
      other: 24,
    },
  },
];

/** s.50AA: debt fund units bought from this date are short-term regardless of holding. */
export const SPECIFIED_FUND_DEEMED_SHORT_FROM = "2023-04-01";

/**
 * Listed equity bought before this date may use its fair market value on
 * 31 January 2018 as cost (grandfathering). Spendly doesn't have that value,
 * so such rows are flagged for the user to check.
 */
export const GRANDFATHERING_ACQUIRED_BEFORE = "2018-02-01";

export function holdingPeriodRuleFor(soldDate: string): HoldingPeriodRule | null {
  return (
    HOLDING_PERIOD_RULES.find(
      (r) => (r.soldFrom === null || soldDate >= r.soldFrom) && (r.soldTo === null || soldDate <= r.soldTo)
    ) ?? null
  );
}
