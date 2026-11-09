/**
 * SPENDLY-741 (epic SPENDLY-735: the app only delivers) — the daily net-worth
 * point (`netWorthHistory/{YYYY-MM}`, SPENDLY-568) and the daily portfolio
 * snapshot (`portfolioSnapshots/{date}`, SPENDLY-598), recorded by the server.
 * The app recorded both while the dashboard / Portfolio tab was open, with
 * about 16 listeners and price polling every 60 s (and one Firestore read a
 * minute for the portfolio snapshot). Pure; Firestore and prices are ports.
 *
 * The app's own numbers (shared functions):
 * - net worth: `composeNetWorth` over the stored balances and the secondary
 *   sources (investments, holdings at today's price, investment cash from its
 *   ledger, borrowings/receivables outstanding, Group Funds held, EPF);
 *   `snapshotBlockers` decides when a day must not be recorded (untrusted
 *   balances, Group Funds unknown, out-of-range totals); `netWorthSnapshotWrite`
 *   builds the merge of today's point. A day already recorded is never rewritten.
 * - portfolio: `buildHoldingsWithMetrics` + `buildPortfolioSummary`, created
 *   once a day for a user whose portfolio onboarding is complete.
 *
 * A holding without a price is valued at cost, as the app's headline does
 * (SPENDLY-620).
 */

import type { Holding, InvestmentCashEntry, MarketQuote } from "../../shared/features/portfolio/types";
import { computeInvestmentCashBalance } from "../../shared/features/portfolio/utils/investmentCash";
import { buildHoldingsWithMetrics, buildPortfolioSummary, quoteKeyFor } from "../../shared/features/portfolio/utils/portfolioMetrics";
import type { Account, AccountType } from "../../shared/types/expense";
import type { Borrowing, BorrowingRepayment } from "../../shared/types/borrowing";
import type { Receivable, ReceivableRepayment } from "../../shared/types/receivable";
import { summarizeBorrowings } from "../../shared/utils/borrowingMath";
import { formatDateKey, isValidTimeZone } from "../../shared/utils/dates";
import { isDuressUid } from "../../shared/utils/duress";
import { summarizeGroupFundsHeld } from "../../shared/utils/groupFundMath";
import type { GroupFund } from "../../shared/types/groupFund";
import { composeNetWorth } from "../../shared/utils/netWorth";
import { netWorthSnapshotWrite, snapshotBlockers } from "../../shared/utils/netWorthHistory";
import { summarizeReceivables } from "../../shared/utils/receivableMath";
import {
  applyJobWrites,
  bump,
  newJobSummary,
  recordApply,
  type DailyJobSummary,
  type JobDb,
  type JobPush,
  type JobWrite,
} from "./dailyJobCore";
import type { ReadBudget } from "./pushRunCore";

export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export type SnapshotUserData = {
  timezone?: string;
  accounts: Account[];
  accountTypes: AccountType[];
  investments: Array<Record<string, unknown>>;
  holdings: Holding[];
  cashEntries: InvestmentCashEntry[];
  portfolioSettings: { onboardingComplete?: boolean; cashBaseline?: unknown; cashBalance?: unknown } | null;
  borrowings: Borrowing[];
  borrowingRepayments: BorrowingRepayment[];
  receivables: Receivable[];
  receivableRepayments: ReceivableRepayment[];
  groupFunds: GroupFund[];
  /** `financialSummaries/epf.currentBalance`, or null without a summary. */
  epfBalance: number | null;
};

export type SnapshotDailyPorts = {
  /** Every user with at least one account. */
  listOwners(): Promise<string[]>;
  load(uid: string): Promise<SnapshotUserData>;
  /** The days already recorded in this month's history doc (DD keys), or null if it doesn't exist. */
  recordedDays(uid: string, monthKey: string): Promise<string[] | null>;
  /** Whether today's portfolio snapshot already exists. */
  portfolioSnapshotExists(uid: string, date: string): Promise<boolean>;
  /** Today's price for a holding, or undefined. */
  price(holding: Holding): Promise<number | undefined>;
  db: JobDb;
  stamp: () => unknown;
  nowMs: () => number;
};

function quotesFor(holdings: Holding[], prices: Map<string, number>): Map<string, MarketQuote> {
  const quotes = new Map<string, MarketQuote>();
  for (const h of holdings) {
    const price = prices.get(quoteKeyFor(h));
    if (price === undefined) continue;
    const quote = { symbol: quoteKeyFor(h), currentPrice: price, previousClose: price, dayChange: 0, dayChangePercent: 0 } as MarketQuote;
    quotes.set(quoteKeyFor(h), quote);
    if (h.yahooSymbol) quotes.set(h.yahooSymbol, quote);
  }
  return quotes;
}

/** Today's net-worth totals and portfolio summary, as the app computes them. */
export function computeSnapshots(data: SnapshotUserData, prices: Map<string, number>, today: string) {
  const quotes = quotesFor(data.holdings, prices);
  const settings = data.portfolioSettings;
  const cashBalance = !settings?.cashBaseline
    ? Number(settings?.cashBalance ?? 0)
    : computeInvestmentCashBalance(settings.cashBaseline as never, data.cashEntries);
  const typeMap = new Map(data.accountTypes.map((t) => [t.id, t.name]));
  const totals = composeNetWorth({
    accounts: data.accounts,
    typeMap,
    // The totals come from stored balances; the ledger only feeds a display flag.
    expenses: [],
    incomes: [],
    payments: [],
    bills: [],
    entries: [],
    transfers: [],
    borrowings: data.borrowings,
    borrowingRepayments: data.borrowingRepayments,
    receivables: data.receivables,
    receivableRepayments: data.receivableRepayments,
    borrowingOutstanding: summarizeBorrowings(data.borrowings, data.borrowingRepayments, today).totalOutstanding,
    receivableOutstanding: summarizeReceivables(data.receivables, data.receivableRepayments, today).totalOutstanding,
    investments: data.investments as never,
    holdings: data.holdings,
    quotes,
    investmentCashBalance: cashBalance,
    epfValue: data.epfBalance ?? 0,
    epfUnreconciledCount: 0,
    groupFundHeld: summarizeGroupFundsHeld(data.groupFunds).held,
    today,
    expensesComplete: true,
    incomesComplete: true,
  } as never);
  const blockers = snapshotBlockers({
    isDuress: false,
    isOnline: true,
    loading: false,
    secondaryLoading: false,
    untrustedBalanceAccounts: totals.untrustedBalanceAccounts,
    groupFundsHeldUnknown: totals.groupFundsHeldUnknown,
    totalNetWorth: totals.totalNetWorth,
    totalAssets: totals.totalAssets,
    totalLiabilities: totals.totalLiabilities,
  });
  const portfolio = buildPortfolioSummary(buildHoldingsWithMetrics(data.holdings, quotes), cashBalance);
  return { totals, blockers, portfolio };
}

export async function runSnapshotDaily(opts: {
  ports: SnapshotDailyPorts;
  now: Date;
  dryRun: boolean;
  budget: ReadBudget;
  push: JobPush | null;
  log: (line: string) => void;
}): Promise<DailyJobSummary> {
  const { ports, now, budget } = opts;
  const summary = newJobSummary("snapshot-daily", opts.dryRun);
  for (const uid of await ports.listOwners()) {
    if (budget.exhausted()) break;
    summary.usersSeen += 1;
    if (isDuressUid(uid)) {
      summary.duressSkipped += 1;
      continue;
    }
    const data = await ports.load(uid);
    const timezone = data.timezone || DEFAULT_TIME_ZONE;
    if (!isValidTimeZone(timezone)) {
      bump(summary, "invalidTimeZone");
      continue;
    }
    const today = formatDateKey(now, timezone);
    const monthKey = today.slice(0, 7);
    const recorded = await ports.recordedDays(uid, monthKey);
    const day = today.slice(8, 10);
    const netWorthDue = !(recorded ?? []).includes(day);
    const portfolioDue = !!data.portfolioSettings?.onboardingComplete && !(await ports.portfolioSnapshotExists(uid, today));
    if (!netWorthDue && !portfolioDue) {
      bump(summary, "alreadyRecorded");
      continue;
    }

    const prices = new Map<string, number>();
    for (const h of data.holdings) {
      const p = await ports.price(h);
      if (p !== undefined) prices.set(quoteKeyFor(h), p);
    }
    const { totals, blockers, portfolio } = computeSnapshots(data, prices, today);

    const writes: JobWrite[] = [];
    if (netWorthDue) {
      if (blockers.length) {
        for (const b of blockers) bump(summary, `netWorthBlocked_${b}`);
      } else {
        const { data: point } = netWorthSnapshotWrite({
          todayKey: today,
          totalNetWorth: totals.totalNetWorth,
          totalAssets: totals.totalAssets,
          totalLiabilities: totals.totalLiabilities,
          nowMs: ports.nowMs(),
          monthDocExists: recorded !== null,
        });
        writes.push({ kind: "set", path: `users/${uid}/netWorthHistory/${monthKey}`, data: point as Record<string, unknown>, merge: true });
      }
    }
    if (portfolioDue) {
      writes.push({
        kind: "create",
        path: `users/${uid}/portfolioSnapshots/${today}`,
        data: {
          portfolioValue: portfolio.portfolioValue,
          investedValue: portfolio.totalInvested,
          profit: portfolio.overallGainLoss,
          profitPercent: portfolio.overallGainLossPercent,
          netWorth: portfolio.portfolioValue + portfolio.cashBalance,
          date: today,
        },
      });
    }
    if (!writes.length) continue;
    const result = await applyJobWrites({ db: ports.db, uid, writes, dryRun: opts.dryRun, stamp: ports.stamp, push: opts.push, log: opts.log });
    recordApply(summary, result, "snapshot user");
    if (result.status === "written" || result.status === "dry-run") {
      if (writes.some((w) => w.path.includes("/netWorthHistory/"))) bump(summary, "netWorthRecorded");
      if (portfolioDue) bump(summary, "portfolioRecorded");
    }
    if (result.status === "conflict") bump(summary, "conflicts");
  }
  return summary;
}

