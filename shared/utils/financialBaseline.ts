import type { Account, AccountEntry, AccountPayment, AccountTransfer, Expense, Income } from "../types/expense";
import type { Borrowing, BorrowingRepayment } from "../types/borrowing";
import type { Receivable, ReceivableRepayment } from "../types/receivable";
import { summarizeBorrowings } from "./borrowingMath";
import { isActiveLedgerRow } from "./ledgerRow";
import { roundMoney } from "./money";
import { composeNetWorth } from "./netWorth";
import { summarizeReceivables } from "./receivableMath";
import { recomputeFinancialState, type FinancialStateInput } from "./reconciliation";
import { computeInvestmentCashBalance } from "../features/portfolio/utils/investmentCash";

/**
 * SPENDLY-503 — the financial correctness baseline for one user.
 *
 * Read-only by construction: a pure function of rows already loaded. Every
 * number comes from the single reference (`recomputeFinancialState`, SPENDLY-499)
 * or the live definitions the app uses (`composeNetWorth`), so this is the
 * reference the SPENDLY-494 read model will later be validated against.
 */

/** Wave 1–3 collections (SPENDLY-494 ADR §10) the baseline counts. */
export const BASELINE_COLLECTIONS = [
  "expenses",
  "incomes",
  "ledgerEvents",
  "accounts",
  "accountTypes",
  "accountTransfers",
  "accountEntries",
  "accountPayments",
  "creditCardBills",
  "categories",
  "borrowings",
  "borrowingRepayments",
  "receivables",
  "receivableRepayments",
  "subscriptions",
  "investments",
  "holdings",
  "portfolioTransactions",
  "investmentCashTransactions",
  "portfolioSettings",
  "epfEstablishments",
  "epfContributions",
  "epfTransfers",
  "epfInterestEntries",
  "epfReconciliations",
] as const;

export type BaselineCollection = (typeof BASELINE_COLLECTIONS)[number];
export type BaselineRows = Record<BaselineCollection, any[]>;

export type CollectionCount = {
  total: number;
  /** Rows the ledger counts. */
  active: number;
  /** Soft-deleted (`deletedAt`) or voided (`voidedAt`) rows: kept, never summed. */
  inactive: number;
};

export type AccountBaseline = {
  accountId: string;
  name: string;
  kind: "bank" | "credit";
  stored: number | null;
  recomputed: number;
  /** recomputed − stored, rounded. Null when nothing is stored. */
  variance: number | null;
  /** "missing": nothing stored yet (e.g. a never-touched account). */
  status: "match" | "variance" | "missing";
};

export type NetWorthTotals = { totalAssets: number; totalLiabilities: number; totalNetWorth: number };

export type UserBaseline = {
  counts: Record<BaselineCollection, CollectionCount>;
  /** Active-row amount sums: collection → month (YYYY-MM) → total. */
  sumsByMonth: Record<string, Record<string, number>>;
  /** Active-row amount sums: collection → accountId → total. */
  sumsByAccount: Record<string, Record<string, number>>;
  accounts: AccountBaseline[];
  cards: { accountId: string; name: string; openBills: number; openAmount: number; amountPaid: number }[];
  epfClosingBalance: number;
  /** `composeNetWorth` on the stored balances, as the app shows it. No market quotes: holdings at average buy price. */
  netWorth: NetWorthTotals;
  /** The same, with every account at its recomputed balance. Differs from `netWorth` only by account variance. */
  netWorthRecomputed: NetWorthTotals;
};

const isInactive = (row: { deletedAt?: unknown; voidedAt?: unknown }) =>
  !isActiveLedgerRow(row as never) || Boolean(row.voidedAt);

function monthOf(row: { month?: string; date?: string; borrowedDate?: string; lentDate?: string }): string {
  if (typeof row.month === "string" && /^\d{4}-\d{2}/.test(row.month)) return row.month.slice(0, 7);
  const date = row.date ?? row.borrowedDate ?? row.lentDate;
  return typeof date === "string" && date.length >= 7 ? date.slice(0, 7) : "unknown";
}

function amountOf(row: Record<string, unknown>): number | null {
  for (const key of ["amount", "principalAmount", "originalAmount"]) {
    if (typeof row[key] === "number") return row[key] as number;
  }
  return null;
}

function accountOf(row: Record<string, unknown>): string | null {
  for (const key of ["accountId", "fromAccountId", "creditedAccountId", "sourceAccountId", "paymentAccountId", "receivedAccountId"]) {
    if (typeof row[key] === "string" && row[key]) return row[key] as string;
  }
  return null;
}

/** Collections whose rows carry money worth summing. */
const SUMMED: BaselineCollection[] = [
  "expenses",
  "incomes",
  "accountTransfers",
  "accountEntries",
  "accountPayments",
  "borrowings",
  "borrowingRepayments",
  "receivables",
  "receivableRepayments",
  "investmentCashTransactions",
];

export function buildUserBaseline(rows: BaselineRows, today: string): UserBaseline {
  const counts = {} as Record<BaselineCollection, CollectionCount>;
  for (const col of BASELINE_COLLECTIONS) {
    const list = rows[col] ?? [];
    const inactive = list.filter(isInactive).length;
    counts[col] = { total: list.length, active: list.length - inactive, inactive };
  }

  const sumsByMonth: UserBaseline["sumsByMonth"] = {};
  const sumsByAccount: UserBaseline["sumsByAccount"] = {};
  for (const col of SUMMED) {
    for (const row of rows[col] ?? []) {
      if (isInactive(row)) continue;
      const amount = amountOf(row);
      if (amount == null) continue;
      const month = monthOf(row);
      sumsByMonth[col] ??= {};
      sumsByMonth[col][month] = roundMoney((sumsByMonth[col][month] ?? 0) + amount);
      const accountId = accountOf(row);
      if (accountId) {
        sumsByAccount[col] ??= {};
        sumsByAccount[col][accountId] = roundMoney((sumsByAccount[col][accountId] ?? 0) + amount);
      }
    }
  }

  const input: FinancialStateInput = {
    accounts: rows.accounts as Account[],
    accountTypes: rows.accountTypes,
    expenses: rows.expenses as Expense[],
    incomes: rows.incomes as Income[],
    payments: rows.accountPayments as AccountPayment[],
    entries: rows.accountEntries as AccountEntry[],
    transfers: rows.accountTransfers as AccountTransfer[],
    borrowings: rows.borrowings as Borrowing[],
    borrowingRepayments: rows.borrowingRepayments as BorrowingRepayment[],
    receivables: rows.receivables as Receivable[],
    receivableRepayments: rows.receivableRepayments as ReceivableRepayment[],
    bills: rows.creditCardBills,
    epfEstablishments: rows.epfEstablishments,
    epfContributions: rows.epfContributions,
    epfTransfers: rows.epfTransfers,
    epfInterestEntries: rows.epfInterestEntries,
    epfReconciliations: rows.epfReconciliations,
  };
  const state = recomputeFinancialState(input, today);

  const accountsById = new Map(input.accounts.map((a) => [a.id, a]));
  const accounts: AccountBaseline[] = state.accounts.map((plan) => {
    const account = accountsById.get(plan.accountId) as unknown as Record<string, unknown>;
    const field = plan.kind === "credit" ? "currentOutstanding" : "currentBalance";
    const stored = typeof account?.[field] === "number" ? (account[field] as number) : null;
    const recomputed = plan.set[field] as number;
    const variance = stored == null ? null : roundMoney(recomputed - stored);
    return {
      accountId: plan.accountId,
      name: String(account?.name ?? ""),
      kind: plan.kind,
      stored,
      recomputed,
      variance,
      status: stored == null ? "missing" : variance === 0 ? "match" : "variance",
    };
  });

  const cards = accounts
    .filter((a) => a.kind === "credit")
    .map((card) => {
      const open = (rows.creditCardBills ?? []).filter(
        (bill: any) => bill.accountId === card.accountId && bill.status !== "PAID" && bill.status !== "CANCELLED"
      );
      return {
        accountId: card.accountId,
        name: card.name,
        openBills: open.length,
        openAmount: roundMoney(open.reduce((s: number, b: any) => s + (Number(b.remainingAmount) || 0), 0)),
        amountPaid: roundMoney(open.reduce((s: number, b: any) => s + (Number(b.amountPaid) || 0), 0)),
      };
    });

  const settings = (rows.portfolioSettings ?? [])[0];
  const investmentCashBalance = settings?.cashBaseline
    ? computeInvestmentCashBalance(settings.cashBaseline, rows.investmentCashTransactions ?? [])
    : Number(settings?.cashBalance ?? 0);
  const netWorthOf = (accountRows: Account[]): NetWorthTotals => {
    const nw = composeNetWorth({
      accounts: accountRows,
      typeMap: new Map(input.accountTypes.map((t) => [t.id, t.name ?? ""])),
      expenses: input.expenses,
      incomes: input.incomes,
      payments: input.payments,
      bills: input.bills,
      entries: input.entries,
      transfers: input.transfers,
      borrowings: input.borrowings,
      borrowingRepayments: input.borrowingRepayments,
      receivables: input.receivables,
      receivableRepayments: input.receivableRepayments,
      borrowingOutstanding: summarizeBorrowings(input.borrowings, input.borrowingRepayments, today).totalOutstanding,
      receivableOutstanding: summarizeReceivables(input.receivables, input.receivableRepayments, today).totalOutstanding,
      investments: rows.investments ?? [],
      holdings: rows.holdings ?? [],
      quotes: new Map(),
      investmentCashBalance,
      epfValue: state.epf.currentBalance ?? 0,
      epfUnreconciledCount: 0,
      today,
    });
    return {
      totalAssets: roundMoney(nw.totalAssets),
      totalLiabilities: roundMoney(nw.totalLiabilities),
      totalNetWorth: roundMoney(nw.totalNetWorth),
    };
  };
  const recomputedAccounts = input.accounts.map((account) => {
    const plan = state.accounts.find((p) => p.accountId === account.id);
    return plan ? ({ ...account, ...plan.set } as Account) : account;
  });

  return {
    counts,
    sumsByMonth,
    sumsByAccount,
    accounts,
    cards,
    epfClosingBalance: state.epf.currentBalance ?? 0,
    netWorth: netWorthOf(input.accounts),
    netWorthRecomputed: netWorthOf(recomputedAccounts),
  };
}

/** Markdown section for one user; `label` is a hashed uid, never the uid. */
export function renderBaselineMarkdown(label: string, baseline: UserBaseline): string {
  const lines: string[] = [`### User ${label}`, ""];
  const nonEmpty = Object.entries(baseline.counts).filter(([, c]) => c.total > 0);
  if (nonEmpty.length) {
    lines.push("| Collection | Total | Active | Deleted/voided |", "|---|---|---|---|");
    for (const [col, c] of nonEmpty) lines.push(`| ${col} | ${c.total} | ${c.active} | ${c.inactive} |`);
    lines.push("");
  }
  if (baseline.accounts.length) {
    lines.push("| Account | Kind | Stored | Recomputed | Variance | Status |", "|---|---|---|---|---|---|");
    for (const a of baseline.accounts) {
      lines.push(`| ${a.name || "(unnamed)"} | ${a.kind} | ${a.stored ?? "—"} | ${a.recomputed} | ${a.variance ?? "—"} | ${a.status} |`);
    }
    lines.push("");
  }
  lines.push(
    `EPF closing balance: ${baseline.epfClosingBalance} · Net worth (no quotes): ${baseline.netWorth.totalNetWorth} ` +
      `(assets ${baseline.netWorth.totalAssets}, liabilities ${baseline.netWorth.totalLiabilities})`,
    ""
  );
  return lines.join("\n");
}
