import { useMemo } from "react";

import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useReceivables } from "@/hooks/useReceivables";
import {
  buildAccountActivities,
  partialLedgerBoundary,
} from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";

/**
 * One account's full activity ledger (every kind, newest first, with running
 * balance for non-credit accounts). Shared by Account detail and Transaction
 * Details so both read the same derived rows from the same live data.
 */
export function useAccountActivities(accountId: string | null | undefined) {
  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { expenses, loading: expensesLoading, complete: expensesComplete } =
    useExpenses();
  const { incomes, complete: incomesComplete } = useIncomes();
  const ledgerComplete = expensesComplete && incomesComplete;
  const loadedFrom = useMemo(
    () =>
      ledgerComplete
        ? undefined
        : partialLedgerBoundary([
            { dates: expenses.map((e) => e.date), complete: expensesComplete },
            { dates: incomes.map((i) => i.date), complete: incomesComplete },
          ]),
    [ledgerComplete, expenses, incomes, expensesComplete, incomesComplete]
  );
  const { entries } = useAccountEntries();
  const { payments } = useAccountPayments();
  const { transfers } = useAccountTransfers();
  const { borrowings, repayments: borrowingRepayments } = useBorrowings();
  const { receivables, repayments: receivableRepayments } = useReceivables();

  const account = useMemo(
    () => (accountId ? accounts.find((a) => a.id === accountId) : undefined),
    [accounts, accountId]
  );

  const accountNameById = useMemo(() => {
    const map: Record<string, string> = {};
    accounts.forEach((a) => {
      map[a.id] = a.name;
    });
    return map;
  }, [accounts]);

  const typeName = useMemo(() => {
    if (!account) return "";
    return accountTypes.find((t) => t.id === account.typeId)?.name || "Account";
  }, [account, accountTypes]);

  const activities = useMemo(() => {
    if (!account) return [];
    return buildAccountActivities(
      account,
      typeName,
      expenses,
      incomes,
      payments,
      entries,
      transfers,
      accountNameById,
      { borrowings, borrowingRepayments },
      { receivables, receivableRepayments },
      { ledgerComplete, loadedFrom }
    );
  }, [
    account,
    typeName,
    expenses,
    incomes,
    payments,
    entries,
    transfers,
    accountNameById,
    borrowings,
    borrowingRepayments,
    receivables,
    receivableRepayments,
    ledgerComplete,
    loadedFrom,
  ]);

  return {
    account,
    typeName,
    isCreditCard: account ? getAccountKind(typeName) === "credit" : false,
    accountNameById,
    activities,
    /** False while older ledger pages are not loaded: history is partial. */
    ledgerComplete,
    /** With a partial ledger, rows on or before this date may have gaps. */
    loadedFrom,
    loading: accountsLoading || expensesLoading,
  };
}
