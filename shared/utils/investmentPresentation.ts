import type { InvestmentKind, InvestmentStatus } from "../types/investment";

/**
 * Display helpers for the Investments (deposits) tab, SPENDLY-542.
 * Presentation only: valuation stays in `getInvestmentValuation`.
 */

export function investmentKindLabel(kind: InvestmentKind): string {
  switch (kind) {
    case "fixed_deposit":
      return "Fixed Deposit";
    case "interest_savings":
      return "Interest Savings";
    default:
      return "Mutual Fund";
  }
}

/** Gain as a percentage of principal, or null when there is no principal. */
export function investmentReturnPercent(
  gain: number,
  principal: number
): number | null {
  if (!(principal > 0)) return null;
  return (gain / principal) * 100;
}

/**
 * "+3.2%", "-1.5%" or "0.0%". The sign is always explicit for a non-zero
 * value, and a value that rounds to zero never reads "-0.0%".
 */
export function formatSignedPercent(value: number, digits = 1): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? "+" : "-"}${Math.abs(rounded).toFixed(digits)}%`;
}

/** Status label and tone for the deposit pill. "matured" is not "active". */
export function investmentStatusDisplay(status: InvestmentStatus): {
  label: string;
  tone: "positive" | "info" | "muted";
} {
  if (status === "active") return { label: "Active", tone: "positive" };
  if (status === "matured") return { label: "Matured", tone: "info" };
  return { label: "Closed", tone: "muted" };
}
