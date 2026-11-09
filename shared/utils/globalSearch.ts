import { spendingOverviewTargetHref } from "./spendingDrilldown";
import { transactionHref } from "./transactionRef";

export type GlobalSearchResultKind =
  | "action"
  | "screen"
  | "transaction"
  | "account"
  | "category"
  | "merchant"
  | "recurring"
  | "goal";

export interface GlobalSearchResult {
  id: string;
  kind: GlobalSearchResultKind;
  title: string;
  subtitle?: string;
  badge?: string;
  amount?: number;
  currency?: string;
  isIncome?: boolean;
  date?: string;
  href?: string;
  actionId?: string;
  score: number;
}

export interface GlobalSearchGroup {
  kind: GlobalSearchResultKind;
  title: string;
  items: GlobalSearchResult[];
}

export interface GlobalSearchActionItem {
  id: string;
  title: string;
  subtitle?: string;
  keywords?: string[];
}

export interface GlobalSearchScreenItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
  keywords?: string[];
}

export interface GlobalSearchAccountItem {
  id: string;
  name: string;
  institution?: string;
  type?: string;
  balance?: number;
  currency?: string;
}

export interface GlobalSearchCategoryItem {
  name: string;
  subcategories?: string[];
}

export interface GlobalSearchMerchantItem {
  id: string;
  name: string;
  count?: number;
  totalAmount?: number;
  currency?: string;
}

export interface GlobalSearchTransactionItem {
  id: string;
  kind: "expense" | "income";
  amount: number;
  currency?: string;
  date: string;
  note?: string;
  category?: string;
  subcategory?: string;
  merchant?: string;
  source?: string;
  accountName?: string;
  accountId?: string;
  tags?: string[];
}

export interface GlobalSearchRecurringItem {
  id: string;
  name: string;
  amount?: number;
  currency?: string;
  nextDate?: string;
}

export interface GlobalSearchGoalItem {
  id: string;
  name: string;
  targetAmount?: number;
  currentAmount?: number;
  currency?: string;
}

export interface GlobalSearchContext {
  actions?: GlobalSearchActionItem[];
  screens?: GlobalSearchScreenItem[];
  accounts?: GlobalSearchAccountItem[];
  categories?: GlobalSearchCategoryItem[];
  merchants?: GlobalSearchMerchantItem[];
  transactions?: GlobalSearchTransactionItem[];
  recurring?: GlobalSearchRecurringItem[];
  goals?: GlobalSearchGoalItem[];
  currentMonth?: string;
}

export interface GlobalSearchResultsResult {
  groups: GlobalSearchGroup[];
  totalMatches: number;
  totalTransactionMatches: number;
}

export function normalizeSearchTerm(term: string): string {
  return term.trim().toLowerCase();
}

export function tokenizeSearchQuery(query: string): string[] {
  return normalizeSearchTerm(query).split(/\s+/).filter(Boolean);
}

export function amountMatchesToken(amount: number, token: string): boolean {
  const cleaned = token.replace(/[,\s₹$€£]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return false;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return false;
  return Math.abs(amount - value) < 0.005;
}

function calculateScore(
  title: string,
  haystack: string,
  query: string,
  tokens: string[],
  baseScore: number
): number {
  const normTitle = normalizeSearchTerm(title);
  let score = baseScore;

  if (normTitle === query) {
    score += 60;
  } else if (normTitle.startsWith(query)) {
    score += 40;
  } else if (tokens.length > 0 && normTitle.startsWith(tokens[0])) {
    score += 25;
  } else if (normTitle.includes(query)) {
    score += 15;
  } else {
    // Matches somewhere in haystack
    score += 5;
  }

  return score;
}

function itemMatchesTokens(
  haystack: string,
  tokens: string[],
  amount?: number
): boolean {
  if (tokens.length === 0) return true;
  return tokens.every(
    (tok) =>
      haystack.includes(tok) ||
      (amount !== undefined && amountMatchesToken(amount, tok))
  );
}

const KIND_GROUP_TITLES: Record<GlobalSearchResultKind, string> = {
  action: "Actions",
  screen: "Screens & Navigation",
  account: "Accounts & Cards",
  category: "Categories",
  merchant: "Merchants",
  transaction: "Transactions",
  recurring: "Recurring & Bills",
  goal: "Save Goals",
};

const KIND_ORDER: GlobalSearchResultKind[] = [
  "action",
  "screen",
  "account",
  "category",
  "merchant",
  "transaction",
  "recurring",
  "goal",
];

const DEFAULT_GROUP_LIMITS: Partial<Record<GlobalSearchResultKind, number>> = {
  action: 4,
  screen: 4,
  account: 4,
  category: 4,
  merchant: 4,
  transaction: 6,
  recurring: 3,
  goal: 3,
};

export function searchGlobalItems(
  query: string,
  context: GlobalSearchContext,
  options?: {
    groupLimits?: Partial<Record<GlobalSearchResultKind, number>>;
  }
): GlobalSearchResultsResult {
  const normQuery = normalizeSearchTerm(query);
  const tokens = tokenizeSearchQuery(query);

  if (tokens.length === 0) {
    return {
      groups: [],
      totalMatches: 0,
      totalTransactionMatches: 0,
    };
  }

  const limits = { ...DEFAULT_GROUP_LIMITS, ...options?.groupLimits };
  const groupItemsMap: Partial<Record<GlobalSearchResultKind, GlobalSearchResult[]>> = {};

  let totalMatches = 0;
  let totalTransactionMatches = 0;

  // 1. Actions
  if (context.actions) {
    const matchedActions: GlobalSearchResult[] = [];
    for (const act of context.actions) {
      const haystack = [
        act.title,
        act.subtitle ?? "",
        ...(act.keywords ?? []),
      ]
        .map(normalizeSearchTerm)
        .join(" ");

      if (itemMatchesTokens(haystack, tokens)) {
        const score = calculateScore(act.title, haystack, normQuery, tokens, 100);
        matchedActions.push({
          id: `action-${act.id}`,
          kind: "action",
          title: act.title,
          subtitle: act.subtitle,
          actionId: act.id,
          score,
        });
      }
    }
    if (matchedActions.length > 0) {
      matchedActions.sort((a, b) => b.score - a.score);
      groupItemsMap.action = matchedActions;
      totalMatches += matchedActions.length;
    }
  }

  // 2. Screens
  if (context.screens) {
    const matchedScreens: GlobalSearchResult[] = [];
    for (const scr of context.screens) {
      const haystack = [
        scr.title,
        scr.subtitle ?? "",
        ...(scr.keywords ?? []),
      ]
        .map(normalizeSearchTerm)
        .join(" ");

      if (itemMatchesTokens(haystack, tokens)) {
        const score = calculateScore(scr.title, haystack, normQuery, tokens, 95);
        matchedScreens.push({
          id: `screen-${scr.id}`,
          kind: "screen",
          title: scr.title,
          subtitle: scr.subtitle,
          href: scr.href,
          score,
        });
      }
    }
    if (matchedScreens.length > 0) {
      matchedScreens.sort((a, b) => b.score - a.score);
      groupItemsMap.screen = matchedScreens;
      totalMatches += matchedScreens.length;
    }
  }

  // 3. Accounts
  if (context.accounts) {
    const matchedAccounts: GlobalSearchResult[] = [];
    for (const acc of context.accounts) {
      const haystack = [
        acc.name,
        acc.institution ?? "",
        acc.type ?? "",
      ]
        .map(normalizeSearchTerm)
        .join(" ");

      if (itemMatchesTokens(haystack, tokens, acc.balance)) {
        const score = calculateScore(acc.name, haystack, normQuery, tokens, 90);
        matchedAccounts.push({
          id: `acc-${acc.id}`,
          kind: "account",
          title: acc.name,
          subtitle: acc.institution || acc.type,
          amount: acc.balance,
          currency: acc.currency,
          href: `/accounts/${encodeURIComponent(acc.id)}`,
          score,
        });
      }
    }
    if (matchedAccounts.length > 0) {
      matchedAccounts.sort((a, b) => b.score - a.score);
      groupItemsMap.account = matchedAccounts;
      totalMatches += matchedAccounts.length;
    }
  }

  // 4. Categories & Subcategories
  if (context.categories) {
    const matchedCategories: GlobalSearchResult[] = [];
    const month = context.currentMonth || "";
    for (const cat of context.categories) {
      // Check category name
      const catHaystack = normalizeSearchTerm(cat.name);
      if (itemMatchesTokens(catHaystack, tokens)) {
        const score = calculateScore(cat.name, catHaystack, normQuery, tokens, 85);
        matchedCategories.push({
          id: `cat-${cat.name}`,
          kind: "category",
          title: cat.name,
          subtitle: "Category overview",
          href: spendingOverviewTargetHref(cat.name, month, false),
          score,
        });
      }

      // Check subcategories
      if (cat.subcategories) {
        for (const sub of cat.subcategories) {
          const subHaystack = [cat.name, sub].map(normalizeSearchTerm).join(" ");
          if (itemMatchesTokens(subHaystack, tokens)) {
            const score = calculateScore(sub, subHaystack, normQuery, tokens, 80);
            matchedCategories.push({
              id: `cat-${cat.name}-${sub}`,
              kind: "category",
              title: `${sub}`,
              subtitle: `Subcategory in ${cat.name}`,
              href: `/spending/${encodeURIComponent(cat.name)}/${encodeURIComponent(sub)}${month ? `?month=${month}` : ""}`,
              score,
            });
          }
        }
      }
    }
    if (matchedCategories.length > 0) {
      matchedCategories.sort((a, b) => b.score - a.score);
      groupItemsMap.category = matchedCategories;
      totalMatches += matchedCategories.length;
    }
  }

  // 5. Merchants
  if (context.merchants) {
    const matchedMerchants: GlobalSearchResult[] = [];
    for (const merch of context.merchants) {
      const haystack = normalizeSearchTerm(merch.name);
      if (itemMatchesTokens(haystack, tokens)) {
        const score = calculateScore(merch.name, haystack, normQuery, tokens, 75);
        matchedMerchants.push({
          id: `merchant-${merch.id}`,
          kind: "merchant",
          title: merch.name,
          subtitle: merch.count !== undefined ? `${merch.count} transactions` : "Merchant",
          amount: merch.totalAmount,
          currency: merch.currency,
          href: `/merchants/${encodeURIComponent(merch.id)}`,
          score,
        });
      }
    }
    if (matchedMerchants.length > 0) {
      matchedMerchants.sort((a, b) => b.score - a.score);
      groupItemsMap.merchant = matchedMerchants;
      totalMatches += matchedMerchants.length;
    }
  }

  // 6. Transactions
  if (context.transactions) {
    const matchedTransactions: GlobalSearchResult[] = [];
    for (const tx of context.transactions) {
      const haystack = [
        tx.merchant ?? "",
        tx.note ?? "",
        tx.category ?? "",
        tx.subcategory ?? "",
        tx.source ?? "",
        tx.accountName ?? "",
        ...(tx.tags ?? []),
      ]
        .map(normalizeSearchTerm)
        .join(" ");

      if (itemMatchesTokens(haystack, tokens, tx.amount)) {
        const title = tx.merchant || tx.note || tx.category || "Transaction";
        const score = calculateScore(title, haystack, normQuery, tokens, 70);
        matchedTransactions.push({
          id: `tx-${tx.id}`,
          kind: "transaction",
          title,
          subtitle: [tx.date, tx.accountName, tx.category].filter(Boolean).join(" · "),
          amount: tx.amount,
          currency: tx.currency,
          isIncome: tx.kind === "income",
          date: tx.date,
          href: transactionHref({ kind: tx.kind, id: tx.id }, tx.accountId),
          score,
        });
      }
    }
    totalTransactionMatches = matchedTransactions.length;
    totalMatches += matchedTransactions.length;
    if (matchedTransactions.length > 0) {
      // Sort by score first, then newest date
      matchedTransactions.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.date ?? "").localeCompare(a.date ?? "");
      });
      groupItemsMap.transaction = matchedTransactions;
    }
  }

  // 7. Recurring
  if (context.recurring) {
    const matchedRecurring: GlobalSearchResult[] = [];
    for (const rec of context.recurring) {
      const haystack = normalizeSearchTerm(rec.name);
      if (itemMatchesTokens(haystack, tokens, rec.amount)) {
        const score = calculateScore(rec.name, haystack, normQuery, tokens, 65);
        matchedRecurring.push({
          id: `rec-${rec.id}`,
          kind: "recurring",
          title: rec.name,
          subtitle: rec.nextDate ? `Next: ${rec.nextDate}` : "Recurring bill",
          amount: rec.amount,
          currency: rec.currency,
          href: `/recurring/${encodeURIComponent(rec.id)}`,
          score,
        });
      }
    }
    if (matchedRecurring.length > 0) {
      matchedRecurring.sort((a, b) => b.score - a.score);
      groupItemsMap.recurring = matchedRecurring;
      totalMatches += matchedRecurring.length;
    }
  }

  // 8. Goals
  if (context.goals) {
    const matchedGoals: GlobalSearchResult[] = [];
    for (const goal of context.goals) {
      const haystack = normalizeSearchTerm(goal.name);
      if (itemMatchesTokens(haystack, tokens, goal.targetAmount)) {
        const score = calculateScore(goal.name, haystack, normQuery, tokens, 60);
        matchedGoals.push({
          id: `goal-${goal.id}`,
          kind: "goal",
          title: goal.name,
          subtitle: goal.targetAmount !== undefined ? `Target: ${goal.targetAmount}` : "Save Goal",
          amount: goal.currentAmount,
          currency: goal.currency,
          href: `/goals/${encodeURIComponent(goal.id)}`,
          score,
        });
      }
    }
    if (matchedGoals.length > 0) {
      matchedGoals.sort((a, b) => b.score - a.score);
      groupItemsMap.goal = matchedGoals;
      totalMatches += matchedGoals.length;
    }
  }

  // Construct groups according to KIND_ORDER and apply group limits
  const groups: GlobalSearchGroup[] = [];
  for (const kind of KIND_ORDER) {
    const items = groupItemsMap[kind];
    if (items && items.length > 0) {
      const limit = limits[kind] ?? 4;
      groups.push({
        kind,
        title: KIND_GROUP_TITLES[kind],
        items: items.slice(0, limit),
      });
    }
  }

  return {
    groups,
    totalMatches,
    totalTransactionMatches,
  };
}

/** Recent searches array management */
export function addRecentSearch(
  existing: string[],
  term: string,
  max: number = 8
): string[] {
  const clean = term.trim();
  if (!clean) return existing;
  const filtered = existing.filter(
    (item) => item.toLowerCase() !== clean.toLowerCase()
  );
  return [clean, ...filtered].slice(0, max);
}

export function removeRecentSearch(
  existing: string[],
  term: string
): string[] {
  const clean = term.trim().toLowerCase();
  return existing.filter((item) => item.toLowerCase() !== clean);
}
