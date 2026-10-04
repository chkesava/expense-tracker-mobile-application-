import { useMemo } from "react";

import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useEpfNetWorth } from "@/hooks/useEpfNetWorth";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useInvestments } from "@/hooks/useInvestments";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useReceivables } from "@/hooks/useReceivables";
import { useRunwayOverrides } from "@/hooks/useRunwayOverrides";
import { useSettings } from "@/providers/SettingsProvider";
import { todayDateKey } from "@/shared/utils/dates";
import { buildRunwaySources } from "@/shared/utils/runwaySources";

/**
 * Every runway source, classified with the user's overrides (SPENDLY-207).
 * Gathers the same inputs as `useUnifiedNetWorth` so amounts reconcile with
 * the net-worth figures; the arithmetic lives in shared/utils/runwaySources.
 */
export function useRunwaySources() {
  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes, loading: typesLoading } = useAccountTypes();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { entries, loading: entriesLoading } = useAccountEntries();
  const { payments, loading: paymentsLoading } = useAccountPayments();
  const { transfers, loading: transfersLoading } = useAccountTransfers();
  const { borrowings, repayments: borrowingRepayments, portfolio: borrowingPortfolio, loading: borrowingsLoading } = useBorrowings();
  const { bills, loading: billsLoading } = useCreditCardBills();
  const { receivables, repayments: receivableRepayments, portfolio: receivablePortfolio, loading: receivablesLoading } = useReceivables();
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);
  const { investments, loading: investmentsLoading } = useInvestments();
  const { holdings, cashBalance: investmentCashBalance, loading: portfolioLoading } = usePortfolio({ includeSecondary: false });
  const { epfValue, epfUnreconciledCount, loading: epfLoading } = useEpfNetWorth();
  const { uid, overrides, loading: overridesLoading, error, retry } = useRunwayOverrides();

  const symbolRequests = useMemo(() => holdings.map((h) => ({ symbol: h.yahooSymbol, instrumentType: h.instrumentType })), [holdings]);
  const { quotes, isLoading: quotesLoading } = useMarketQuotes(symbolRequests);

  const typeMap = useMemo(() => new Map(accountTypes.map((t) => [t.id, t.name])), [accountTypes]);

  const sources = useMemo(
    () =>
      buildRunwaySources({
        accounts,
        typeMap,
        expenses,
        incomes,
        payments,
        bills,
        entries,
        transfers,
        borrowings,
        borrowingRepayments,
        receivables,
        receivableRepayments,
        borrowingOutstanding: borrowingPortfolio.totalOutstanding,
        receivableOutstanding: receivablePortfolio.totalOutstanding,
        investments,
        holdings,
        quotes,
        investmentCashBalance,
        epfValue,
        epfUnreconciledCount,
        today,
        displayCurrency: settings.currency,
        overrides,
      }),
    [
      accounts,
      typeMap,
      expenses,
      incomes,
      payments,
      bills,
      entries,
      transfers,
      borrowings,
      borrowingRepayments,
      borrowingPortfolio,
      receivables,
      receivableRepayments,
      receivablePortfolio,
      investments,
      holdings,
      quotes,
      investmentCashBalance,
      epfValue,
      epfUnreconciledCount,
      today,
      settings.currency,
      overrides,
    ]
  );

  const loading =
    accountsLoading ||
    typesLoading ||
    expensesLoading ||
    incomesLoading ||
    entriesLoading ||
    paymentsLoading ||
    transfersLoading ||
    borrowingsLoading ||
    receivablesLoading ||
    investmentsLoading ||
    portfolioLoading ||
    quotesLoading ||
    billsLoading ||
    epfLoading ||
    overridesLoading;

  return { uid, sources, loading, error, retry };
}
