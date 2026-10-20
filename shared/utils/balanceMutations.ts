import { increment, serverTimestamp } from "firebase/firestore";
import type { MutationOp } from "@/shared/types/mutations";
import { roundMoney } from "./money";

export type BalanceDeltaParams = {
  accountId: string;
  amountDelta: number;
  isCreditCard: boolean;
  /** The account's balance prior to this mutation; seeds an uninitialized account. */
  oldBalance?: number;
  /** The account's outstanding liability prior to this mutation. */
  oldOutstanding?: number;
  /**
   * SPENDLY-436: true when the account's materialized summary has never been
   * seeded (`balanceInitialized` missing). `increment()` starts an absent
   * field at 0, so this mutation is about to become this account's new
   * baseline — flag it `needs_reconciliation` instead of silently marking it
   * healthy, so a full-ledger rebuild still gets run for it.
   */
  needsInitialization?: boolean;
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
      existing.needsInitialization = existing.needsInitialization || d.needsInitialization;
    }
  }
  
  const ops: MutationOp[] = [];

  for (const d of aggregated.values()) {
    if (d.amountDelta === 0) continue;

    const ref = { path: `users/${uid}/accounts/${d.accountId}` };
    
    if (d.isCreditCard) {
      const updateData: any = {
        balanceUpdatedAt: serverTimestamp(),
      };
      if (d.needsInitialization) {
        // SPENDLY-436: a bare increment() starts an absent field at 0, which
        // would drop any outstanding this account already carried. Seed from
        // the caller's best-known prior value as a literal instead, and flag
        // it so a full rebuild still reconciles it properly.
        updateData.currentOutstanding = roundMoney((d.oldOutstanding ?? 0) - d.amountDelta);
        updateData.balanceInitialized = true;
        updateData.summaryReconciliationStatus = "needs_reconciliation";
      } else {
        updateData.currentOutstanding = increment(-d.amountDelta);
      }
      ops.push({ op: "update", ref: { path: ref.path }, data: updateData });
    } else {
      const updateData: any = {
        balanceUpdatedAt: serverTimestamp(),
      };
      if (d.needsInitialization) {
        // SPENDLY-436: seed from the caller's best-known prior value
        // (openingBalance) as a literal rather than incrementing an absent
        // field from 0, and flag the account for a full rebuild.
        updateData.currentBalance = roundMoney((d.oldBalance ?? 0) + d.amountDelta);
        updateData.balanceInitialized = true;
        updateData.balanceReconciliationStatus = "needs_reconciliation";
      } else {
        updateData.currentBalance = increment(d.amountDelta);
      }
      ops.push({
        op: "update",
        ref: { path: ref.path },
        data: updateData,
      });
    }
  }

  return ops;
}
