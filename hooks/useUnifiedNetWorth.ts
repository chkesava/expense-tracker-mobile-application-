import { useMemo } from "react";
import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useInvestments } from "@/hooks/useInvestments";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useReceivables } from "@/hooks/useReceivables";
import {
  computeBankBalance,
  computeCreditUsage,
} from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { totalPortfolioValue } from "@/shared/utils/investmentInterest";

export interface UnifiedNetWorthSummary {
  /** Sum of all positive non-credit bank/cash balances */
  liquidBankAssets: number;
  /** Valuations of all active Fixed Deposits / Recurring Deposits */
  investmentsValue: number;
  /** Market valuation of stock / ETF holdings */
  stocksHoldingsValue: number;
  /** Uninvested cash balance in the Demat / Stocks portfolio */
  stocksCashBalance: number;
  /** Total value of Stocks Portfolio (Holdings + Demat Cash Balance) */
  totalStocksValue: number;
  /** Total sum of all financial assets */
  totalAssets: number;
  /** Outstanding credit card dues used in active billing cycle */
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
  /** Loading state across all underlying data providers */
  loading: boolean;
}

export function useUnifiedNetWorth(): UnifiedNetWorthSummary {
  const { accounts, loading: accountsLoading } = useAccounts();
  const { accountTypes, loading: typesLoading } = useAccountTypes();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { entries, loading: entriesLoading } = useAccountEntries();
  const { payments, loading: paymentsLoading } = useAccountPayments();
  const { transfers, loading: transfersLoading } = useAccountTransfers();
  const {
    borrowings,
    repayments: borrowingRepayments,
    portfolio: borrowingPortfolio,
    loading: borrowingsLoading,
  } = useBorrowings();
  const {
    receivables,
    repayments: receivableRepayments,
    portfolio: receivablePortfolio,
    loading: receivablesLoading,
  } = useReceivables();
  const { investments, loading: investmentsLoading } = useInvestments();
  const {
    holdings,
    settings: portfolioSettings,
    loading: portfolioLoading,
  } = usePortfolio();

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

  const summary = useMemo(() => {
    let liquidBankAssets = 0;
    let bankOverdraftLiabilities = 0;
    let creditCardLiabilities = 0;

    accounts.forEach((a) => {
      const typeName = typeMap.get(a.typeId) || "";
      const kind = getAccountKind(typeName);

      if (kind === "credit") {
        const usage = computeCreditUsage(a, expenses, payments);
        creditCardLiabilities += usage.usedThisCycle;
      } else {
        const bal = computeBankBalance(
          a,
          expenses,
          incomes,
          payments,
          entries,
          transfers,
          borrowings,
          borrowingRepayments,
          receivables,
          receivableRepayments
        );
        if (bal > 0) {
          liquidBankAssets += bal;
        } else if (bal < 0) {
          bankOverdraftLiabilities += Math.abs(bal);
        }
      }
    });

    const investmentsValue = totalPortfolioValue(investments);

    let stocksHoldingsValue = 0;
    holdings.forEach((h) => {
      const livePrice = quotes.get(h.yahooSymbol)?.currentPrice ?? h.averageBuyPrice;
      stocksHoldingsValue += h.quantity * livePrice;
    });
    const stocksCashBalance = portfolioSettings?.cashBalance ?? 0;
    const totalStocksValue = stocksHoldingsValue + stocksCashBalance;

    // Borrowings are a liability; receivables are a non-cash asset that offsets
    // cash already debited when the money was lent.
    const borrowingLiabilities = borrowingPortfolio.totalOutstanding;
    const receivableAssets = receivablePortfolio.totalOutstanding;

    const totalLiabilities =
      creditCardLiabilities + bankOverdraftLiabilities + borrowingLiabilities;
    const totalAssets =
      liquidBankAssets + investmentsValue + totalStocksValue + receivableAssets;
    const totalNetWorth = totalAssets - totalLiabilities;

    return {
      liquidBankAssets,
      investmentsValue,
      stocksHoldingsValue,
      stocksCashBalance,
      totalStocksValue,
      totalAssets,
      creditCardLiabilities,
      bankOverdraftLiabilities,
      borrowingLiabilities,
      receivableAssets,
      totalLiabilities,
      totalNetWorth,
    };
  }, [
    accounts,
    typeMap,
    expenses,
    incomes,
    payments,
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
    portfolioSettings,
  ]);

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
    quotesLoading;

  return {
    ...summary,
    loading,
  };
}
