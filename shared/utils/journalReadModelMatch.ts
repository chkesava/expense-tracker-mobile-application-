import type { AccountActivityFilters } from "./accountActivityFilters";

/**
 * SPENDLY-512 — the parts of a Journal filter SQL can check, as necessary
 * conditions: every row the screen's own filter keeps also satisfies these,
 * so fetching all matches from the read model makes a filtered Journal
 * complete. The screen still applies its full filter (kind, tags, status,
 * search…) to what is loaded, so what it shows doesn't change.
 *
 * Null when the filter has no category, account or amount condition (plain
 * browsing keeps paging), or when an account filter names no known account
 * (nothing could match).
 */
export type JournalMatchConditions = {
  categories?: string[];
  accountIds?: string[];
  minAmount?: number;
  maxAmount?: number;
  fromDate?: string;
  toDate?: string;
};

const amount = (value: string) => {
  if (!value.trim()) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

export function journalMatchFromFilters(
  filters: Pick<AccountActivityFilters, "categories" | "accounts" | "minAmount" | "maxAmount">,
  dateScope: { fromDate: string; toDate: string },
  accounts: { id?: string; name?: string }[]
): JournalMatchConditions | null {
  const minAmount = amount(filters.minAmount);
  const maxAmount = amount(filters.maxAmount);
  const hasCondition = filters.categories.length > 0 || filters.accounts.length > 0 || minAmount !== undefined || maxAmount !== undefined;
  if (!hasCondition) return null;

  let accountIds: string[] | undefined;
  if (filters.accounts.length > 0) {
    // The filter holds display names; two accounts can share one.
    accountIds = accounts.filter((a) => a.id && a.name && filters.accounts.includes(a.name)).map((a) => a.id!);
    if (accountIds.length === 0) return null;
  }
  return {
    ...(filters.categories.length > 0 ? { categories: [...filters.categories] } : {}),
    ...(accountIds ? { accountIds } : {}),
    ...(minAmount !== undefined ? { minAmount } : {}),
    ...(maxAmount !== undefined ? { maxAmount } : {}),
    ...(dateScope.fromDate ? { fromDate: dateScope.fromDate } : {}),
    ...(dateScope.toDate ? { toDate: dateScope.toDate } : {}),
  };
}
