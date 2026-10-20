/**
 * How vault and space budget states are presented (SPENDLY-549). Pure, so the
 * mapping is pinned in a test. Every state carries a word as well as a tone,
 * so a status never relies on colour alone.
 */

import type { VaultStats } from "../types/vault";
import type { BudgetProgressTier } from "./spaceMath";

/** Mirrors `ProgressStatus` (components/dashboard/ProgressIndicator). */
export type BudgetStatus = "neutral" | "good" | "watch" | "over";
/** Mirrors the dashboard `Tone` used by `Pill`. */
export type BudgetTone = "muted" | "positive" | "warning" | "negative";

export type BudgetPresentation = { status: BudgetStatus; tone: BudgetTone; label: string };

/** Vaults: `healthy` < 80% < `warning` < 100% ≤ `exceeded` (vaultMath). */
export function vaultBudgetPresentation(status: VaultStats["status"]): BudgetPresentation {
  switch (status) {
    case "healthy":
      return { status: "good", tone: "positive", label: "On track" };
    case "warning":
      return { status: "watch", tone: "warning", label: "Nearly at budget" };
    case "exceeded":
      return { status: "over", tone: "negative", label: "Over budget" };
  }
}

/**
 * Spaces: `safe` < 75% ≤ `warning` < 90% ≤ `danger` < 100% ≤ `over`
 * (spaceMath). `warning` and `danger` share the amber tone; their words keep
 * them apart.
 */
export function spaceBudgetPresentation(tier: BudgetProgressTier): BudgetPresentation {
  switch (tier) {
    case "none":
      return { status: "neutral", tone: "muted", label: "No budget" };
    case "safe":
      return { status: "good", tone: "positive", label: "On track" };
    case "warning":
      return { status: "watch", tone: "warning", label: "Watch spending" };
    case "danger":
      return { status: "watch", tone: "warning", label: "Nearly at budget" };
    case "over":
      return { status: "over", tone: "negative", label: "Over budget" };
  }
}
