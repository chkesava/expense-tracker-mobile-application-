import { doc, increment, serverTimestamp } from "firebase/firestore";
import type { MutationOp } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { NetWorthSummary } from "@/shared/types/financialSummary";

export type NetWorthDelta = {
  bankCashTotal?: number;
  fixedDepositTotal?: number;
  investmentCash?: number;
  epfValue?: number;
  receivableAssets?: number;

  creditCardLiabilities?: number;
  bankOverdraftLiabilities?: number;
  borrowingLiabilities?: number;
};

/**
 * Builds the `MutationOp` array to batch update the global Net Worth summary document.
 * Using FieldValue.increment() allows the client to atomically adjust the totals without 
 * needing to fetch the document or relying on Cloud Functions (Spark plan constraint).
 */
export function buildNetWorthOps(
  uid: string,
  deltas: NetWorthDelta
): MutationOp[] {
  const db = getFirestoreDb();
  if (!db) return [];

  // Compute the total asset change
  const assetDelta =
    (deltas.bankCashTotal || 0) +
    (deltas.fixedDepositTotal || 0) +
    (deltas.investmentCash || 0) +
    (deltas.epfValue || 0) +
    (deltas.receivableAssets || 0);

  // Compute the total liability change (positive values mean MORE liability)
  const liabilityDelta =
    (deltas.creditCardLiabilities || 0) +
    (deltas.bankOverdraftLiabilities || 0) +
    (deltas.borrowingLiabilities || 0);

  // Net worth increases when assets increase, or when liabilities DECREASE
  const netWorthDelta = assetDelta - liabilityDelta;

  // If there's literally no change, we can return empty ops
  if (assetDelta === 0 && liabilityDelta === 0 && netWorthDelta === 0) {
    return [];
  }

  const updateData: any = {
    calculatedAt: serverTimestamp(),
  };

  if (assetDelta !== 0) updateData.totalAssets = increment(assetDelta);
  if (liabilityDelta !== 0) updateData.totalLiabilities = increment(liabilityDelta);
  if (netWorthDelta !== 0) updateData.netWorth = increment(netWorthDelta);

  if (deltas.bankCashTotal) updateData.bankCashTotal = increment(deltas.bankCashTotal);
  if (deltas.fixedDepositTotal) updateData.fixedDepositTotal = increment(deltas.fixedDepositTotal);
  if (deltas.investmentCash) updateData.investmentCash = increment(deltas.investmentCash);
  if (deltas.epfValue) updateData.epfValue = increment(deltas.epfValue);
  if (deltas.receivableAssets) updateData.receivableAssets = increment(deltas.receivableAssets);
  
  if (deltas.creditCardLiabilities) updateData.creditCardLiabilities = increment(deltas.creditCardLiabilities);
  if (deltas.bankOverdraftLiabilities) updateData.bankOverdraftLiabilities = increment(deltas.bankOverdraftLiabilities);
  if (deltas.borrowingLiabilities) updateData.borrowingLiabilities = increment(deltas.borrowingLiabilities);

  // Use { merge: true } or "set" op with merge because the document might not exist on a brand new account
  const ref = doc(db, "users", uid, "financialSummaries", "netWorth");
  
  return [
    {
      op: "set",
      ref: { path: ref.path },
      data: updateData,
      merge: true,
    }
  ];
}
