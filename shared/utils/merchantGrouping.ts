import type { Expense, Income } from "../types/expense";
import type {
  MerchantOverride,
  MerchantResolution,
  MerchantSourceText,
} from "../types/merchant";
import { expenseSourceText, incomeSourceText } from "./merchantModel";
import { resolveMerchants } from "./merchantResolve";
import { classifyRecurringCadence } from "../../services/recurring/recurringDetector";

export interface MerchantLedgerItem {
  id: string;
  kind: "expense" | "income";
  date: string;
  amount: number;
  category?: string;
  subcategory?: string;
  source: MerchantSourceText;
  resolution: MerchantResolution;
}

export interface MerchantProfileSummary {
  merchantId: string;
  displayName: string;
  category?: string;
  subcategory?: string;
  confidence: MerchantResolution["confidence"];
  transactions: MerchantLedgerItem[];
  totalSpend: number;
  transactionCount: number;
  spendTrend: Array<{ date: string; amount: number }>;
  recurring: ReturnType<typeof classifyRecurringCadence>;
}

export function buildMerchantLedgerItems(
  expenses: readonly Expense[],
  incomes: readonly Income[],
  overrides: readonly MerchantOverride[] = [],
): MerchantLedgerItem[] {
  const sources: Array<{ item: MerchantLedgerItem; source: MerchantSourceText }> = [];
  for (const expense of expenses) {
    if (!expense.id) continue;
    const source = expenseSourceText(expense as Expense & { id: string });
    sources.push({
      source,
      item: {
        id: expense.id,
        kind: "expense",
        date: expense.date,
        amount: expense.amount,
        category: expense.category,
        subcategory: expense.subcategory,
        source,
        resolution: undefined as never,
      },
    });
  }
  for (const income of incomes) {
    if (!income.id) continue;
    const source = incomeSourceText(income as Income & { id: string });
    sources.push({
      source,
      item: {
        id: income.id,
        kind: "income",
        date: income.date,
        amount: income.amount,
        source,
        resolution: undefined as never,
      },
    });
  }
  const resolutions = resolveMerchants(sources.map(({ source }) => source), overrides);
  return sources.map(({ item }, index) => ({ ...item, resolution: resolutions[index]! }));
}

export function merchantProfileId(resolution: MerchantResolution): string {
  return resolution.merchantId ?? `unknown:${resolution.normalized || "empty"}`;
}

export function buildMerchantProfiles(items: readonly MerchantLedgerItem[]): MerchantProfileSummary[] {
  const grouped = new Map<string, MerchantLedgerItem[]>();
  for (const item of items) {
    const id = merchantProfileId(item.resolution);
    const bucket = grouped.get(id) ?? [];
    bucket.push(item);
    grouped.set(id, bucket);
  }
  return [...grouped].map(([merchantId, transactions]) => {
    const first = transactions[0]!;
    const daily = new Map<string, number>();
    for (const transaction of transactions) {
      daily.set(transaction.date, (daily.get(transaction.date) ?? 0) + transaction.amount);
    }
    const dates = [...daily.keys()].sort();
    return {
      merchantId,
      displayName: first.resolution.displayName,
      category: first.resolution.suggestedCategory ?? first.category,
      subcategory: first.resolution.suggestedSubcategory ?? first.subcategory,
      confidence: first.resolution.confidence,
      transactions: [...transactions].sort((a, b) => b.date.localeCompare(a.date)),
      totalSpend: transactions.reduce((sum, transaction) => sum + (transaction.kind === "expense" ? transaction.amount : -transaction.amount), 0),
      transactionCount: transactions.length,
      spendTrend: dates.map((date) => ({ date, amount: daily.get(date)! })),
      recurring: classifyRecurringCadence(dates),
    };
  }).sort((a, b) => b.totalSpend - a.totalSpend || a.displayName.localeCompare(b.displayName));
}

