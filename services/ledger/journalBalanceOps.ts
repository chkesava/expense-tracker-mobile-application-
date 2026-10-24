import type { MutationOp } from "@/shared/types/mutations";
import { buildAccountBalanceOps } from "@/shared/utils/balanceMutations";
import { todayDateKey } from "@/shared/utils/dates";
import {
  baselineAwareBalanceDeltas,
  type BalanceLeg,
} from "@/shared/utils/ledgerAccountDeltas";

import type { AccountInfo } from "./fetchAccountTypes";

/**
 * SPENDLY-602/603 — the `accounts` summary ops for a ledger write, given its
 * signed, dated legs (`-amount` for money out of an account, `+amount` for
 * money in, reversed for whatever an edit or delete takes away).
 *
 * Bank legs dated before the account's `balanceAsOfDate` are dropped, as a
 * full rebuild drops them; card legs move `currentOutstanding` as before.
 */
export function journalBalanceOps(
  owner: string,
  legs: readonly BalanceLeg[],
  info: Map<string, AccountInfo>,
  today: string = todayDateKey()
): MutationOp[] {
  const deltas = baselineAwareBalanceDeltas(
    legs,
    (accountId) => {
      const account = info.get(accountId);
      return account
        ? { isCreditCard: account.isCreditCard, balanceAsOfDate: account.balanceAsOfDate }
        : undefined;
    },
    today
  );
  return buildAccountBalanceOps(
    owner,
    deltas.map((d) => {
      const account = info.get(d.accountId);
      return {
        accountId: d.accountId,
        amountDelta: d.amountDelta,
        isCreditCard: d.isCreditCard ?? account?.isCreditCard ?? false,
        oldBalance: account?.oldBalance,
        oldOutstanding: account?.oldOutstanding,
        needsInitialization: account?.needsInitialization,
      };
    })
  );
}
