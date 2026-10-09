import { computeBankBalance, computeOutstandingCredit } from "./accountBalance";
import { getAccountKind } from "./accountKind";
import type { NetWorthSummary, EpfSummary, DashboardPeriodSummary } from "../types/financialSummary";
import type { Account, Expense, Income, AccountPayment, AccountTransfer, AccountEntry } from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import { composeNetWorth } from "./netWorth";
import { epfPortfolioSummary } from "../features/epf/utils/portfolio";
import type { EpfEstablishment, EpfContribution, EpfTransfer, EpfInterestEntry, EpfReconciliation } from "../features/epf/types";
import { parseLocalDate } from "./dates";

export function calculateAccountBalances(inputs: {
  account: Account;
  typeName: string;
  expenses: Expense[];
  incomes: Income[];
  payments: AccountPayment[];
  transfers: AccountTransfer[];
  entries: AccountEntry[];
  borrowings: Borrowing[];
  borrowingRepayments: BorrowingRepayment[];
  receivables: Receivable[];
  receivableRepayments: ReceivableRepayment[];
  bills: any[];
  today: string;
}): Partial<Account> {
  const kind = getAccountKind(inputs.typeName);
  if (kind === "credit") {
    const res = computeOutstandingCredit(
      inputs.account,
      inputs.expenses,
      inputs.payments,
      inputs.bills,
      inputs.today
    );
    return {
      currentOutstanding: res.totalOutstanding,
      unbilledSpend: res.unbilledSpend,
      availableCredit: res.availableCredit,
    };
  } else {
    const bal = computeBankBalance(
      inputs.account,
      inputs.expenses,
      inputs.incomes,
      inputs.payments,
      inputs.entries,
      inputs.transfers,
      inputs.borrowings,
      inputs.borrowingRepayments,
      inputs.receivables,
      inputs.receivableRepayments,
      inputs.today
    );
    return {
      currentBalance: bal,
    };
  }
}

export function calculateEpfSummary(inputs: {
  establishments: EpfEstablishment[];
  contributions: EpfContribution[];
  transfers: EpfTransfer[];
  interestEntries: EpfInterestEntry[];
  adjustments: EpfReconciliation[];
}): Partial<EpfSummary> {
  const summary = epfPortfolioSummary(inputs);
  return {
    currentBalance: summary.total,
    employeeContributionTotal: summary.employeeShare,
    employerContributionTotal: summary.employerEpfShare,
    interestTotal: summary.interest,
    adjustmentsTotal: summary.adjustments,
    lastCreditPeriod: summary.lastReconciledAt, // Or compute from contributions
  };
}

export function calculateDashboardSummaries(
  expenses: Expense[],
  incomes: Income[]
): Map<string, Partial<DashboardPeriodSummary>> {
  const periods = new Map<string, Partial<DashboardPeriodSummary>>();

  const getPeriod = (dateStr: string) => dateStr.substring(0, 7);

  const initPeriod = (p: string) => {
    if (!periods.has(p)) {
      periods.set(p, {
        period: p,
        totalExpenses: 0,
        totalIncome: 0,
        categoryTotals: {},
        transactionCount: 0,
      });
    }
    return periods.get(p)!;
  };

  for (const e of expenses) {
    if (e.voidedAt) continue;
    const p = getPeriod(e.date);
    const m = initPeriod(p);
    m.totalExpenses! += e.amount;
    m.transactionCount! += 1;
    if (e.category) {
      m.categoryTotals![e.category] = (m.categoryTotals![e.category] || 0) + e.amount;
    }
  }

  for (const i of incomes) {
    if (i.voidedAt) continue;
    const p = getPeriod(i.date);
    const m = initPeriod(p);
    m.totalIncome! += i.amount;
    m.transactionCount! += 1;
  }

  return periods;
}

export function calculateNetWorthSummary(inputs: Parameters<typeof composeNetWorth>[0]): Partial<NetWorthSummary> {
  const nw = composeNetWorth(inputs);
  return {
    netWorth: nw.totalNetWorth,
    totalAssets: nw.totalAssets,
    totalLiabilities: nw.totalLiabilities,
    bankCashTotal: nw.liquidBankAssets,
    investmentCash: nw.stocksCashBalance,
    epfValue: nw.epfValue,
    creditCardLiabilities: nw.creditCardLiabilities,
    bankOverdraftLiabilities: nw.bankOverdraftLiabilities,
    borrowingLiabilities: nw.borrowingLiabilities,
    receivableAssets: nw.receivableAssets,
  };
}

