import type { MutationOp } from "../types/mutations";
import { isCreditCardAccount } from "./accountKind";
import { buildAccountBalanceOpsWith } from "./balanceMutationsCore";
import type { FieldValueSentinels } from "./firestoreSentinels";
import { baselineAwareBalanceDeltas, type BalanceLeg } from "./ledgerAccountDeltas";

/**
 * SPENDLY-739 (epic SPENDLY-735) — the account-summary ops for a ledger write,
 * without a client SDK import. `services/ledger/journalBalanceOps.ts` (the
 * app) and the server's daily jobs both use it, so a server-posted charge
 * moves balances exactly as the app's own save does.
 */
export type JournalAccountInfo = {
  isCreditCard: boolean;
  oldBalance: number;
  oldOutstanding: number;
  /** SPENDLY-436: true when `balanceInitialized` was missing on the account. */
  needsInitialization: boolean;
  /** SPENDLY-496: false when no account doc was found (e.g. it was deleted). */
  exists: boolean;
  /** SPENDLY-496: the account's baseline; earlier rows sit inside the opening balance. */
  balanceAsOfDate: string | null;
};

/** An account doc's data (or none) as the balance ops need it. */
export function accountInfoFromData(data: Record<string, unknown> | null | undefined, typeName?: string | null): JournalAccountInfo {
  if (!data) {
    return { isCreditCard: false, oldBalance: 0, oldOutstanding: 0, needsInitialization: false, exists: false, balanceAsOfDate: null };
  }
  const isCreditCard = isCreditCardAccount({ typeName, accountTypeId: data.accountTypeId as string | undefined });
  const needsInitialization = data.balanceInitialized !== true;
  return {
    isCreditCard,
    oldBalance: needsInitialization ? ((data.openingBalance as number | undefined) ?? 0) : ((data.currentBalance as number | undefined) ?? 0),
    oldOutstanding: (data.currentOutstanding as number | undefined) ?? 0,
    needsInitialization,
    exists: true,
    balanceAsOfDate: typeof data.balanceAsOfDate === "string" ? data.balanceAsOfDate : null,
  };
}

/**
 * SPENDLY-602/603 — signed, dated legs (`-amount` out of an account, `+amount`
 * in) to `accounts` summary ops. Bank legs dated before the account's
 * `balanceAsOfDate` are dropped, as a full rebuild drops them; card legs move
 * `currentOutstanding`.
 */
export function journalBalanceOpsWith(
  fv: FieldValueSentinels,
  owner: string,
  legs: readonly BalanceLeg[],
  info: ReadonlyMap<string, JournalAccountInfo>,
  today: string
): MutationOp[] {
  const deltas = baselineAwareBalanceDeltas(
    legs,
    (accountId) => {
      const account = info.get(accountId);
      return account ? { isCreditCard: account.isCreditCard, balanceAsOfDate: account.balanceAsOfDate } : undefined;
    },
    today
  );
  return buildAccountBalanceOpsWith(
    fv,
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
