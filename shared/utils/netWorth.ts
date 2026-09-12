/**
 * The net-worth roll-up — KAN-73.
 *
 * Lifted verbatim out of the `useMemo` in `hooks/useUnifiedNetWorth.ts`, which
 * `vitest.config.ts` never ran. It is the number on the dashboard for every
 * Spendly user, and KAN-71 changed it by adding `epfValue` to `totalAssets` —
 * so it is also the one place EPF altered existing Investment behaviour, and it
 * had no test at all.
 *
 * The hook keeps the listeners, the account-type map and the memo; this owns
 * the arithmetic.
 */

import type {
  Account,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  Expense,
  Income,
} from "@/shared/types/expense";
import type { Borrowing, BorrowingRepayment } from "@/shared/types/borrowing";
import type { Receivable, ReceivableRepayment } from "@/shared/types/receivable";
import type { Investment } from "@/shared/types/investment";
import type { Holding } from "@/shared/features/portfolio/types";
import {
  computeBankBalance,
  computeOutstandingCredit,
  type OpenCreditBillSlice,
} from "@/shared/utils/accountBalance";
import { getAccountKind } from "@/shared/utils/accountKind";
import { totalPortfolioValue } from "@/shared/utils/investmentInterest";

/** Only the part of a market quote the roll-up reads. */
export interface QuoteLike {
  currentPrice: number;
}

export interface NetWorthInputs {
  accounts: Account[];
  /** Account type id → type name. The kind is derived from the name. */
  typeMap: Map<string, string>;
  expenses: Expense[];
  incomes: Income[];
  payments: AccountPayment[];
  bills: OpenCreditBillSlice[];
  entries: AccountEntry[];
  transfers: AccountTransfer[];
  borrowings: Borrowing[];
  borrowingRepayments: BorrowingRepayment[];
  receivables: Receivable[];
  receivableRepayments: ReceivableRepayment[];
  /** `portfolio.totalOutstanding` from `useBorrowings` — a liability. */
  borrowingOutstanding: number;
  /** `portfolio.totalOutstanding` from `useReceivables` — a non-cash asset. */
  receivableOutstanding: number;
  investments: Investment[];
  holdings: Holding[];
  quotes: Map<string, QuoteLike>;
  /** Derived from the cash ledger, not the stored scalar (KAN-77). */
  investmentCashBalance: number;
  /** EPF across every establishment under the user's UAN (KAN-71). */
  epfValue: number;
  /** Credited EPF months not yet confirmed against a passbook. */
  epfUnreconciledCount: number;
  /** `YYYY-MM-DD` in the user's configured timezone. */
  today: string;
}

export interface NetWorthTotals {
  liquidBankAssets: number;
  investmentsValue: number;
  epfValue: number;
  epfUnreconciledCount: number;
  stocksHoldingsValue: number;
  stocksCashBalance: number;
  totalStocksValue: number;
  totalAssets: number;
  creditCardLiabilities: number;
  bankOverdraftLiabilities: number;
  borrowingLiabilities: number;
  receivableAssets: number;
  totalLiabilities: number;
  totalNetWorth: number;
}

export function composeNetWorth(inputs: NetWorthInputs): NetWorthTotals {
  const {
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
    borrowingOutstanding,
    receivableOutstanding,
    investments,
    holdings,
    quotes,
    investmentCashBalance,
    epfValue,
    epfUnreconciledCount,
    today,
  } = inputs;

  let liquidBankAssets = 0;
  let bankOverdraftLiabilities = 0;
  let creditCardLiabilities = 0;

  accounts.forEach((a) => {
    const typeName = typeMap.get(a.typeId) || "";
    const kind = getAccountKind(typeName);

    if (kind === "credit") {
      const usage = computeOutstandingCredit(a, expenses, payments, bills, today);
      creditCardLiabilities += usage.totalOutstanding;
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
  // Derived from the cash ledger, not the stored scalar — the scalar could still
  // be carrying money a holding purchase had already spent (KAN-77).
  const stocksCashBalance = investmentCashBalance;
  const totalStocksValue = stocksHoldingsValue + stocksCashBalance;

  // Borrowings are a liability; receivables are a non-cash asset that offsets
  // cash already debited when the money was lent.
  const borrowingLiabilities = borrowingOutstanding;
  const receivableAssets = receivableOutstanding;

  const totalLiabilities =
    creditCardLiabilities + bankOverdraftLiabilities + borrowingLiabilities;
  const totalAssets =
    liquidBankAssets + investmentsValue + totalStocksValue + receivableAssets + epfValue;
  const totalNetWorth = totalAssets - totalLiabilities;

  return {
    liquidBankAssets,
    investmentsValue,
    epfValue,
    epfUnreconciledCount,
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
}
