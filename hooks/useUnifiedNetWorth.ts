import { useEffect, useMemo, useState } from "react";
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
import { useSettings } from "@/providers/SettingsProvider";
import { todayDateKey } from "@/shared/utils/dates";
import { composeNetWorth } from "@/shared/utils/netWorth";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";

export interface UnifiedNetWorthSummary {
  /** Sum of all positive non-credit bank/cash balances */
  liquidBankAssets: number;
  /** Valuations of all active Fixed Deposits / Recurring Deposits */
  investmentsValue: number;
  /**
   * EPF balance across every establishment under the user's UAN (KAN-71).
   *
   * Real money the user owns, so it counts toward assets — but Spendly derives
   * it from what the user recorded, not from EPFO. `epfUnreconciledCount` says
   * how much of it is still a projection, and the UI labels it accordingly.
   */
  epfValue: number;
  /** Credited EPF months not yet confirmed against a passbook. */
  epfUnreconciledCount: number;
  /** Market valuation of stock / ETF holdings */
  stocksHoldingsValue: number;
  /** Uninvested cash balance in the Demat / Stocks portfolio */
  stocksCashBalance: number;
  /** Total value of Stocks Portfolio (Holdings + Demat Cash Balance) */
  totalStocksValue: number;
  /** Total sum of all financial assets */
  totalAssets: number;
  /** Outstanding credit card dues (unpaid statements plus new charges) */
  creditCardLiabilities: number;
  /** Any negative bank account overdrafts */
  bankOverdraftLiabilities: number;
  /** Outstanding principal plus accrued interest across all borrowings */
  borrowingLiabilities: number;
  /** Outstanding money lent to others (non-cash asset) */
  receivableAssets: number;
  /** Total sum of all financial liabilities (Credit cards + Overdrafts + Borrowings) */
  totalLiabilities: number;
  /** Net Worth = Total Assets - Total Liabilities */
  totalNetWorth: number;
  /** Loading state across core data providers */
  loading: boolean;
  /** True when secondary providers (stocks, EPF, loans) are still hydrating */
  secondaryLoading?: boolean;
  /**
   * SPENDLY-413: true when a non-credit account with no `balanceAsOfDate`
   * baseline exists while the ledger is only a staged page, not the whole
   * history — the liquid total may be understated/overstated. Transparency
   * flag only; the totals themselves are unchanged.
   */
  liquidBalanceMayBePartial: boolean;
}

export interface UseUnifiedNetWorthOptions {
  /**
   * If true, liquid bank balance from accounts renders immediately,
   * while secondary providers (loans, cards, stocks, EPF) defer their
   * listener attachments until after startup idle.
   */
  progressive?: boolean;
}

export function useUnifiedNetWorth(
  options?: UseUnifiedNetWorthOptions
): UnifiedNetWorthSummary {
  const isProgressive = Boolean(options?.progressive);
  const [secondaryReady, setSecondaryReady] = useState(!isProgressive);

  useEffect(() => {
    if (!isProgressive) return;
    return scheduleIdleWork(() => setSecondaryReady(true));
  }, [isProgressive]);

  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes, loading: typesLoading } = useAccountTypes();
  const {
    expenses,
    loading: expensesLoading,
    complete: expensesComplete,
  } = useExpenses();
  const {
    incomes,
    loading: incomesLoading,
    complete: incomesComplete,
  } = useIncomes();
  const { entries, loading: entriesLoading } = useAccountEntries();
  const { payments, loading: paymentsLoading } = useAccountPayments();
  const { transfers, loading: transfersLoading } = useAccountTransfers();
  const {
    borrowings,
    repayments: borrowingRepayments,
    portfolio: borrowingPortfolio,
    loading: borrowingsLoading,
  } = useBorrowings({ enabled: secondaryReady });
  const { bills, loading: billsLoading } = useCreditCardBills({
    enabled: secondaryReady,
  });
  const {
    receivables,
    repayments: receivableRepayments,
    portfolio: receivablePortfolio,
    loading: receivablesLoading,
  } = useReceivables({ enabled: secondaryReady });
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);
  const { investments, loading: investmentsLoading } = useInvestments({
    enabled: secondaryReady,
  });
  const {
    holdings,
    cashBalance: investmentCashBalance,
    loading: portfolioLoading,
  } = usePortfolio({ includeSecondary: false });
  // Profile-gated: a user with no EPF profile pays for one small doc listener
  // and nothing else, so the dashboard is unchanged for them.
  const {
    epfValue,
    epfUnreconciledCount,
    loading: epfLoading,
  } = useEpfNetWorth();

  const symbolRequests = useMemo(
    () =>
      holdings.map((h) => ({
        symbol: h.yahooSymbol,
        instrumentType: h.instrumentType,
      })),
    [holdings]
  );
  const { quotes, isLoading: quotesLoading } = useMarketQuotes(symbolRequests);

  const typeMap = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  const summary = useMemo(
    () =>
      composeNetWorth({
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
        expensesComplete,
        incomesComplete,
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
      expensesComplete,
      incomesComplete,
    ]
  );

  const coreLoading =
    accountsLoading ||
    typesLoading ||
    expensesLoading ||
    incomesLoading ||
    entriesLoading ||
    paymentsLoading ||
    transfersLoading;

  const secondaryLoading =
    !secondaryReady ||
    borrowingsLoading ||
    receivablesLoading ||
    investmentsLoading ||
    portfolioLoading ||
    quotesLoading ||
    billsLoading ||
    epfLoading;

  const loading = isProgressive ? coreLoading : coreLoading || secondaryLoading;

  return {
    ...summary,
    loading,
    secondaryLoading,
  };
}
