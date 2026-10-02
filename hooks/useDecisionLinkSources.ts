import { useMemo } from "react";

import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useBorrowingsContext, useReceivablesContext } from "@/providers/BorrowingsReceivablesProvider";
import { useAccountsContext, useExpensesContext, useIncomesContext } from "@/providers/FinanceDataProvider";
import type { DecisionLinkSources } from "@/shared/utils/decisionLinks";

/**
 * Everything a decision can link to (SPENDLY-366), straight from the app-wide
 * providers that already hold it — no new listeners, no copies.
 */
export function useDecisionLinkSources(): DecisionLinkSources {
  const { expenses, expensesComplete, financeError } = useExpensesContext();
  const { incomes, incomesComplete } = useIncomesContext();
  const { accounts, accountsLoading, payments, paymentsLoading, transfers, transfersLoading, entries, entriesLoading } = useAccountsContext();
  const borrowingsCtx = useBorrowingsContext();
  const receivablesCtx = useReceivablesContext();
  const { goals, loading: goalsLoading, error: goalsError } = useFinancialGoals();
  const { subscriptions, loading: subsLoading, error: subsError } = useSubscriptions();

  return useMemo(
    () => ({
      expenses,
      incomes,
      payments,
      transfers,
      entries,
      accounts,
      borrowings: borrowingsCtx.borrowings,
      receivables: receivablesCtx.receivables,
      goals,
      subscriptions,
      ready: {
        transaction: expensesComplete && incomesComplete && !paymentsLoading && !transfersLoading && !entriesLoading,
        account: !accountsLoading,
        borrowing: !borrowingsCtx.loading,
        receivable: !receivablesCtx.loading,
        goal: !goalsLoading,
        subscription: !subsLoading,
      },
      failed: {
        transaction: Boolean(financeError),
        account: Boolean(financeError),
        borrowing: Boolean(borrowingsCtx.error),
        receivable: Boolean(receivablesCtx.error),
        goal: Boolean(goalsError),
        subscription: Boolean(subsError),
      },
    }),
    [
      expenses, incomes, payments, transfers, entries, accounts, borrowingsCtx, receivablesCtx, goals, subscriptions,
      expensesComplete, incomesComplete, paymentsLoading, transfersLoading, entriesLoading, accountsLoading,
      goalsLoading, subsLoading, financeError, goalsError, subsError,
    ]
  );
}
