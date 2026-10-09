import { buildNetWorthOps } from "./netWorthMutations";
import { increment, serverTimestamp } from "firebase/firestore";
import type { MutationOp } from "@/shared/types/mutations";

export type InvestmentSummaryDelta = {
  investmentCashDelta?: number;
  investedValueDelta?: number;
  realisedPnLDelta?: number;
  holdingCountDelta?: number;
  fdPrincipalDelta?: number;
};

/**
 * Builds the `MutationOp` array to batch update the global Investments summary document.
 */
export function buildInvestmentSummaryOps(
  uid: string,
  deltas: InvestmentSummaryDelta
): MutationOp[] {

  if (
    !deltas.investmentCashDelta &&
    !deltas.investedValueDelta &&
    !deltas.realisedPnLDelta &&
    !deltas.holdingCountDelta &&
    !deltas.fdPrincipalDelta
  ) {
    return [];
  }

  const updateData: any = {
    calculatedAt: serverTimestamp(),
  };

  if (deltas.investmentCashDelta) updateData.investmentCash = increment(deltas.investmentCashDelta);
  if (deltas.investedValueDelta) updateData.investedValue = increment(deltas.investedValueDelta);
  if (deltas.realisedPnLDelta) updateData.realisedPnL = increment(deltas.realisedPnLDelta);
  if (deltas.holdingCountDelta) updateData.holdingCount = increment(deltas.holdingCountDelta);
  if (deltas.fdPrincipalDelta) updateData.fdPrincipalTotal = increment(deltas.fdPrincipalDelta);

  const ref = { path: `users/${uid}/financialSummaries/${"investments"}` };
  
  const ops: MutationOp[] = [
    {
      op: "set",
      ref: { path: ref.path },
      data: updateData,
      merge: true,
    }
  ];

  if (deltas.investmentCashDelta || deltas.fdPrincipalDelta) {
    ops.push(...buildNetWorthOps(uid, {
      investmentCash: deltas.investmentCashDelta,
      fixedDepositTotal: deltas.fdPrincipalDelta,
    }));
  }

  return ops;
}
