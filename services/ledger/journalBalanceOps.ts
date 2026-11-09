import { increment, serverTimestamp } from "@/lib/firestore";
import type { MutationOp } from "@/shared/types/mutations";
import { todayDateKey } from "@/shared/utils/dates";
import { journalBalanceOpsWith } from "@/shared/utils/journalBalanceOpsCore";
import type { BalanceLeg } from "@/shared/utils/ledgerAccountDeltas";

import type { AccountInfo } from "./fetchAccountTypes";

/**
 * SPENDLY-602/603 — the `accounts` summary ops for a ledger write, given its
 * signed, dated legs (`-amount` for money out of an account, `+amount` for
 * money in, reversed for whatever an edit or delete takes away).
 *
 * Bank legs dated before the account's `balanceAsOfDate` are dropped, as a
 * full rebuild drops them; card legs move `currentOutstanding` as before.
 * SPENDLY-739: the logic is `journalBalanceOpsWith` (shared, no client
 * import), which the server's daily jobs use too.
 */
export function journalBalanceOps(
  owner: string,
  legs: readonly BalanceLeg[],
  info: Map<string, AccountInfo>,
  today: string = todayDateKey()
): MutationOp[] {
  return journalBalanceOpsWith({ increment, serverTimestamp }, owner, legs, info, today);
}
