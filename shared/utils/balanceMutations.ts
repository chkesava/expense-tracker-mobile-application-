import { increment, serverTimestamp } from "@/lib/firestore";
import type { MutationOp } from "@/shared/types/mutations";

import { buildAccountBalanceOpsWith, type BalanceDeltaParams } from "./balanceMutationsCore";

export type { BalanceDeltaParams } from "./balanceMutationsCore";

/** The app's builder: the client SDK's sentinels (logic in balanceMutationsCore, SPENDLY-739). */
export function buildAccountBalanceOps(uid: string, deltas: BalanceDeltaParams[]): MutationOp[] {
  return buildAccountBalanceOpsWith({ increment, serverTimestamp }, uid, deltas);
}
