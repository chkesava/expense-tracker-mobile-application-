/**
 * Portfolio writes with no snapshot listeners — SPENDLY-18.
 *
 * `usePortfolio()` subscribes to holdings, cash, orders, snapshots, … Transfer
 * Funds in the app shell only needs deposit/withdraw. Calling the data hook from
 * a permanently mounted modal kept nine Firestore listeners alive on every
 * screen, including when investments were disabled.
 */

import { useCallback } from "react";

import { getFirestoreDb } from "@/lib/firebase";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import {
  ensureCashBaseline,
  readAvailableInvestmentCash,
  recordInvestmentCashEntry,
  transferInvestmentCashWithBank,
} from "@/services/portfolio/investmentCash";

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export type PortfolioCashWriteOptions = {
  date?: string;
  entryId?: string;
  accountId?: string;
  accountEntryId?: string;
  /** Caller shows its own success toast (Transfer Funds / Manage Stock Cash). */
  quiet?: boolean;
};

export function usePortfolioMutations() {
  const { user } = useAuth();
  const db = getFirestoreDb();

  /**
   * Money arriving from a bank account.
   *
   * A ledger entry rather than a read-modify-write of the scalar, and it keeps
   * the date the user picked — the old path overwrote it with today's, so a
   * back-dated transfer landed on the wrong day.
   */
  const depositCash = useCallback(
    async (amount: number, note?: string, options?: PortfolioCashWriteOptions) => {
      if (!user || !db || !(amount > 0)) return false;
      try {
        await ensureCashBaseline(user.uid, 0);
        const date = options?.date ?? todayKey();
        const result = options?.accountId
          ? await transferInvestmentCashWithBank(user.uid, {
              type: "TOP_UP",
              amount,
              date,
              note: note || "Cash deposit to Stocks Demat",
              accountId: options.accountId,
              entryId: options.entryId,
              accountEntryId: options.accountEntryId,
            })
          : await recordInvestmentCashEntry(
              user.uid,
              {
                type: "TOP_UP",
                amount,
                direction: "credit",
                date,
                note: note || "Cash deposit to Stocks Demat",
              },
              options?.entryId
            );
        if (!options?.quiet) {
          toast.success(writeSavedMessage(result.outcome, "Cash deposited to Stocks Demat"));
        }
        return true;
      } catch (error) {
        logError("portfolio.depositCash", error);
        toast.error(friendlyErrorMessage(error, "Failed to deposit cash"));
        return false;
      }
    },
    [db, user]
  );

  /** Money returning to a bank account. Guarded against overdrawing the wallet. */
  const withdrawCash = useCallback(
    async (amount: number, note?: string, options?: PortfolioCashWriteOptions) => {
      if (!user || !db || !(amount > 0)) return false;
      try {
        const available = await readAvailableInvestmentCash(user.uid);
        if (amount > available) {
          toast.error("Insufficient cash balance");
          return false;
        }
        await ensureCashBaseline(user.uid, 0);
        const date = options?.date ?? todayKey();
        const result = options?.accountId
          ? await transferInvestmentCashWithBank(user.uid, {
              type: "WITHDRAWAL",
              amount,
              date,
              note: note || "Cash withdrawal from Stocks Demat",
              accountId: options.accountId,
              entryId: options.entryId,
              accountEntryId: options.accountEntryId,
            })
          : await recordInvestmentCashEntry(
              user.uid,
              {
                type: "WITHDRAWAL",
                amount,
                direction: "debit",
                date,
                note: note || "Cash withdrawal from Stocks Demat",
              },
              options?.entryId
            );
        if (!options?.quiet) {
          toast.success(writeSavedMessage(result.outcome, "Cash withdrawn from Stocks Demat"));
        }
        return true;
      } catch (error) {
        logError("portfolio.withdrawCash", error);
        toast.error(friendlyErrorMessage(error, "Couldn't withdraw the cash."));
        return false;
      }
    },
    [db, user]
  );

  return { depositCash, withdrawCash };
}
