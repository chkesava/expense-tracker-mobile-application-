import { increment, serverTimestamp } from "firebase/firestore";
import type { MutationOp } from "@/shared/types/mutations";
import { buildNetWorthOps } from "./netWorthMutations";

export type BalanceDeltaParams = {
  accountId: string;
  amountDelta: number;
  isCreditCard: boolean;
  isUnbilled?: boolean;
  /** The account's balance prior to this mutation. Required for accurate net worth delta calculation if balance crosses zero. */
  oldBalance?: number;
  /** The account's outstanding liability prior to this mutation. */
  oldOutstanding?: number;
};

export function buildAccountBalanceOps(
  uid: string,
  deltas: BalanceDeltaParams[]
): MutationOp[] {
  
  const aggregated = new Map<string, BalanceDeltaParams>();
  for (const d of deltas) {
    if (!aggregated.has(d.accountId)) {
      aggregated.set(d.accountId, { ...d });
    } else {
      const existing = aggregated.get(d.accountId)!;
      existing.amountDelta += d.amountDelta;
      existing.isUnbilled = existing.isUnbilled || d.isUnbilled;
    }
  }
  
  const ops: MutationOp[] = [];
  
  let totalBankCashDelta = 0;
  let totalOverdraftDelta = 0;
  let totalCreditCardDelta = 0;

  for (const d of aggregated.values()) {
    if (d.amountDelta === 0) continue;

    const ref = { path: `users/${uid}/accounts/${d.accountId}` };
    
    if (d.isCreditCard) {
      const updateData: any = {
        currentOutstanding: increment(-d.amountDelta),
        balanceUpdatedAt: serverTimestamp(),
      };
      if (d.isUnbilled) {
        updateData.unbilledSpend = increment(-d.amountDelta);
      }
      ops.push({ op: "update", ref: { path: ref.path }, data: updateData });

      // In Spendly, a positive credit card delta (e.g. paying bill) reduces liability.
      // So outstanding goes down by amountDelta. Thus liability goes down by amountDelta.
      // Actually wait, amountDelta is the change in "balance". 
      // For credit cards, if you spend 100, amountDelta is -100.
      // currentOutstanding gets increment(-(-100)) = +100.
      // So liability increases by 100.
      totalCreditCardDelta += -d.amountDelta;
    } else {
      ops.push({
        op: "update",
        ref: { path: ref.path },
        data: {
          currentBalance: increment(d.amountDelta),
          balanceUpdatedAt: serverTimestamp(),
        }
      });

      // Compute Net Worth Deltas for Bank Accounts
      const oldBal = d.oldBalance ?? 0;
      const newBal = oldBal + d.amountDelta;

      if (oldBal >= 0 && newBal >= 0) {
        totalBankCashDelta += d.amountDelta;
      } else if (oldBal <= 0 && newBal <= 0) {
        totalOverdraftDelta += Math.abs(newBal) - Math.abs(oldBal);
      } else if (oldBal > 0 && newBal < 0) {
        totalBankCashDelta += -oldBal;
        totalOverdraftDelta += Math.abs(newBal);
      } else if (oldBal < 0 && newBal > 0) {
        totalOverdraftDelta += -Math.abs(oldBal);
        totalBankCashDelta += newBal;
      }
    }
  }

  // Push the net worth ops
  if (totalBankCashDelta !== 0 || totalOverdraftDelta !== 0 || totalCreditCardDelta !== 0) {
    const nwOps = buildNetWorthOps(uid, {
      bankCashTotal: totalBankCashDelta,
      bankOverdraftLiabilities: totalOverdraftDelta,
      creditCardLiabilities: totalCreditCardDelta,
    });
    ops.push(...nwOps);
  }

  return ops;
}
