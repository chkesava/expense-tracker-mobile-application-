import { doc, type Firestore, type WriteBatch } from "firebase/firestore";

import type { MutationOp } from "@/shared/types/mutations";

/**
 * Stages {@link MutationOp}s (balance / net-worth / summary ops) on a raw
 * batch, honouring each op's kind and `merge` flag.
 *
 * SPENDLY-496: callers used to force every op through `batch.update`, which
 * fails the whole batch when a set-merge target such as
 * `financialSummaries/netWorth` does not exist yet. Moved here from
 * services/portfolio/investmentCash.ts (SPENDLY-523) so splits share it.
 */
export function stageMutationOps(batch: WriteBatch, db: Firestore, ops: MutationOp[]): void {
  for (const op of ops) {
    const ref = doc(db, op.ref.path);
    if (op.op === "update") batch.update(ref, op.data as Record<string, unknown>);
    else if (op.op === "set") batch.set(ref, op.data, op.merge ? { merge: true } : {});
    else batch.delete(ref);
  }
}
