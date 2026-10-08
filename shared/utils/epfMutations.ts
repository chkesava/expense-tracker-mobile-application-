import { doc, increment, serverTimestamp } from "firebase/firestore";
import type { MutationOp } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";

export type EpfSummaryDelta = {
  employeeContributionDelta?: number;
  employerContributionDelta?: number;
  interestDelta?: number;
  adjustmentDelta?: number;
  /** Pass the month string (YYYY-MM) if this operation creates/updates a contribution. */
  creditPeriod?: string;
};

/**
 * Builds the `MutationOp` array to batch update the global EPF summary document.
 */
export function buildEpfSummaryOps(
  uid: string,
  deltas: EpfSummaryDelta
): MutationOp[] {
  const db = getFirestoreDb();
  if (!db) return [];

  const empDelta = deltas.employeeContributionDelta || 0;
  const emrDelta = deltas.employerContributionDelta || 0;
  const intDelta = deltas.interestDelta || 0;
  const adjDelta = deltas.adjustmentDelta || 0;
  const totalDelta = empDelta + emrDelta + intDelta + adjDelta;

  if (totalDelta === 0 && !deltas.creditPeriod) {
    return [];
  }

  const updateData: any = {
    calculatedAt: serverTimestamp(),
  };

  if (totalDelta !== 0) updateData.currentBalance = increment(totalDelta);
  if (empDelta !== 0) updateData.employeeContributionTotal = increment(empDelta);
  if (emrDelta !== 0) updateData.employerContributionTotal = increment(emrDelta);
  if (intDelta !== 0) updateData.interestTotal = increment(intDelta);
  if (adjDelta !== 0) updateData.adjustmentsTotal = increment(adjDelta);
  
  // Note: we can't reliably "max()" the creditPeriod with increment without Cloud Functions.
  // In practice, since this is for summary purposes, we just overwrite it if provided.
  if (deltas.creditPeriod) {
    updateData.lastCreditPeriod = deltas.creditPeriod;
  }

  const ref = doc(db, "users", uid, "financialSummaries", "epf");
  
  const ops: MutationOp[] = [
    {
      op: "set",
      ref: { path: ref.path },
      data: updateData,
      merge: true,
    }
  ];

  if (totalDelta !== 0) {
    const { buildNetWorthOps } = require("./netWorthMutations");
    ops.push(...buildNetWorthOps(uid, { epfValue: totalDelta }));
  }

  return ops;
}
