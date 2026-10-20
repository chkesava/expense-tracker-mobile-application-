import type { Firestore } from "firebase/firestore";

import { fetchAccountTypes } from "@/services/ledger/fetchAccountTypes";
import type { MutationOp } from "@/shared/types/mutations";
import { buildAccountBalanceOps } from "@/shared/utils/balanceMutations";
import { todayDateKey } from "@/shared/utils/dates";
import {
  ledgerRowAccountDeltas,
  netBankBalanceDeltas,
  type LedgerRow,
} from "@/shared/utils/ledgerAccountDeltas";

/**
 * SPENDLY-496 — the `accounts.currentBalance` (and net-worth) ops for a
 * borrowing / receivable write that replaces `before` rows with `after` rows.
 *
 * The delta is `netBankBalanceDeltas`, the same mapping `computeBankBalance`
 * uses, so the stored balance moves exactly as a rebuild would. Accounts that
 * no longer exist are skipped: an update against a missing doc would fail the
 * whole batch, and a deleted account has no balance to keep.
 */
export async function debtLedgerBalanceOps(
  db: Firestore,
  owner: string,
  before: LedgerRow[],
  after: LedgerRow[],
  today: string = todayDateKey()
): Promise<MutationOp[]> {
  const accountIds = [...before, ...after].flatMap((row) =>
    ledgerRowAccountDeltas(row).map((d) => d.accountId)
  );
  if (accountIds.length === 0) return [];

  const info = await fetchAccountTypes(db, owner, accountIds);
  const deltas = netBankBalanceDeltas(
    before,
    after,
    (accountId) => {
      const account = info.get(accountId);
      return account?.exists
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
        isCreditCard: false,
        oldBalance: account?.oldBalance,
        oldOutstanding: account?.oldOutstanding,
        needsInitialization: account?.needsInitialization,
      };
    })
  );
}
