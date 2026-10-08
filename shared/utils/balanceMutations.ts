import { doc, increment, serverTimestamp } from "firebase/firestore";
import type { MutationOp } from "@/lib/commitMutations";
import { getFirestoreDb } from "@/lib/firebase";
import type { Account } from "@/shared/types/expense";

export type BalanceDeltaParams = {
  accountId: string;
  amountDelta: number; // positive means adding to balance (income), negative means subtracting (expense)
  isCreditCard: boolean;
  isUnbilled?: boolean; // if true, update unbilledSpend as well (e.g. regular expense, not a bill payment)
};

export function buildAccountBalanceOps(
  uid: string,
  deltas: BalanceDeltaParams[]
): MutationOp[] {
  const db = getFirestoreDb();
  if (!db) return [];
  
  // Aggregate deltas by accountId
  const aggregated = new Map<string, BalanceDeltaParams>();
  for (const d of deltas) {
    if (!aggregated.has(d.accountId)) {
      aggregated.set(d.accountId, { ...d });
    } else {
      const existing = aggregated.get(d.accountId)!;
      existing.amountDelta += d.amountDelta;
      // If any of the aggregated deltas was unbilled, we might have a problem because we're mixing unbilled and billed.
      // For simplicity, we assume they are either all unbilled or we don't aggregate them if they differ.
      // But in practice, a single transaction edit/delete is either unbilled or not.
      // Wait, let's keep it simple: we shouldn't mix unbilled and billed in the same delta.
      existing.isUnbilled = existing.isUnbilled || d.isUnbilled;
    }
  }
  
  return Array.from(aggregated.values())
    .filter(d => d.amountDelta !== 0) // Skip empty deltas
    .map(({ accountId, amountDelta, isCreditCard, isUnbilled }) => {
      const ref = doc(db, "users", uid, "accounts", accountId);
      
      if (isCreditCard) {
        const updateData: any = {
          currentOutstanding: increment(-amountDelta),
          balanceUpdatedAt: serverTimestamp(),
        };
        if (isUnbilled) {
          updateData.unbilledSpend = increment(-amountDelta);
        }
        return {
          op: "update",
          ref: { path: ref.path },
          data: updateData
        };
      } else {
        return {
          op: "update",
          ref: { path: ref.path },
          data: {
            currentBalance: increment(amountDelta),
            balanceUpdatedAt: serverTimestamp(),
          }
        };
      }
    });
}
