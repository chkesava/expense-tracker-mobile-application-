/**
 * CSV import must keep holding ids stable (SPENDLY-37).
 *
 * `overwriteHoldings` used to delete every doc and `addDoc` replacements. Cash
 * PURCHASE rows kept the old `holdingId`, so "Delete and refund" silently
 * disappeared. Matching on yahoo/symbol and updating in place is what keeps
 * those ledger rows attached.
 *
 * Pure and Firestore-free so vitest can cover the matching rules.
 */

import { roundMoney } from "@/shared/utils/money";
import type { Holding, InvestmentCashEntry } from "@/shared/features/portfolio/types";
import { holdingPurchaseAmount, netHoldingCashOutlay } from "./investmentCash";

export type HoldingOverwriteInput = Omit<Holding, "id" | "createdAt" | "updatedAt">;

export type HoldingOverwriteUpdate = {
  id: string;
  holding: HoldingOverwriteInput;
  quantityDelta: number;
  costDelta: number;
  /**
   * True when this holding already has in-app cash and the CSV cost basis moved.
   * External/CSV-only positions never invent cash (KAN-77).
   */
  adjustCash: boolean;
};

export type HoldingOverwritePlan = {
  update: HoldingOverwriteUpdate[];
  create: HoldingOverwriteInput[];
  deleteIds: string[];
};

export function holdingMatchKey(holding: {
  yahooSymbol?: string;
  symbol: string;
  exchange?: string;
}): string {
  const yahoo = holding.yahooSymbol?.trim().toUpperCase();
  if (yahoo) return `yahoo:${yahoo}`;
  return `sym:${String(holding.exchange ?? "").toUpperCase()}:${holding.symbol.trim().toUpperCase()}`;
}

export function planHoldingOverwrite(
  existing: Array<
    Pick<Holding, "id" | "symbol" | "yahooSymbol" | "exchange" | "quantity" | "averageBuyPrice">
  >,
  next: HoldingOverwriteInput[],
  cashEntries: InvestmentCashEntry[] = []
): HoldingOverwritePlan {
  const remaining = new Map(existing.map((holding) => [holdingMatchKey(holding), holding]));
  const update: HoldingOverwriteUpdate[] = [];
  const create: HoldingOverwriteInput[] = [];

  for (const holding of next) {
    const key = holdingMatchKey(holding);
    const match = remaining.get(key);
    if (!match) {
      create.push(holding);
      continue;
    }
    remaining.delete(key);
    const costDelta = roundMoney(
      holdingPurchaseAmount(holding.quantity, holding.averageBuyPrice) -
        holdingPurchaseAmount(match.quantity, match.averageBuyPrice)
    );
    update.push({
      id: match.id,
      holding,
      quantityDelta: roundMoney((Number(holding.quantity) || 0) - (Number(match.quantity) || 0)),
      costDelta,
      adjustCash: Math.abs(costDelta) > 0 && netHoldingCashOutlay(cashEntries, match.id) > 0,
    });
  }

  return {
    update,
    create,
    deleteIds: [...remaining.values()].map((holding) => holding.id),
  };
}
