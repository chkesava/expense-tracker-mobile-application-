import type {
  AccountActivity,
  AccountEntry,
  Expense,
  Income,
} from "@/shared/types/expense";

export type AccountActivityKind = "all" | "income" | "expense" | "transfers";
export type AccountActivitySpecialKind = "refunds" | "investments" | "bills";
export type AccountActivityStatus = "audited" | "unaudited";

export interface AccountActivityFilters {
  kind: AccountActivityKind;
  specialKinds: AccountActivitySpecialKind[];
  categories: string[];
  counterparties: string[];
  fromDate: string;
  toDate: string;
  minAmount: string;
  maxAmount: string;
  tags: string[];
  statuses: AccountActivityStatus[];
}

export interface FilterableAccountActivity {
  activity: AccountActivity;
  kind: Exclude<AccountActivityKind, "all"> | "other";
  category?: string;
  subcategory?: string;
  counterparty?: string;
  tags: string[];
  status?: AccountActivityStatus;
  isRefund: boolean;
  isInvestment: boolean;
  isBill: boolean;
}

export interface AccountActivityFilterOptions {
  categories: string[];
  counterparties: string[];
  tags: string[];
  statuses: AccountActivityStatus[];
}

export const EMPTY_ACCOUNT_ACTIVITY_FILTERS: AccountActivityFilters = {
  kind: "all",
  specialKinds: [],
  categories: [],
  counterparties: [],
  fromDate: "",
  toDate: "",
  minAmount: "",
  maxAmount: "",
  tags: [],
  statuses: [],
};

export function createEmptyAccountActivityFilters(): AccountActivityFilters {
  return {
    ...EMPTY_ACCOUNT_ACTIVITY_FILTERS,
    specialKinds: [],
    categories: [],
    counterparties: [],
    tags: [],
    statuses: [],
  };
}

function normalized(value?: string): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function isTransferLike(
  activity: AccountActivity,
  entry?: AccountEntry
): boolean {
  return Boolean(
    activity.isTransfer ||
      activity.isBillPayment ||
      activity.isBorrowing ||
      activity.isLoanRepayment ||
      activity.isReceivable ||
      activity.isReceivableRepayment ||
      entry?.transferId ||
      entry?.correlationId
  );
}

function classifyKind(
  activity: AccountActivity,
  entry?: AccountEntry
): FilterableAccountActivity["kind"] {
  if (isTransferLike(activity, entry)) return "transfers";
  if (activity.linkedIncomeId) return "income";
  if (activity.linkedExpenseId) return "expense";
  return "other";
}

function activityIsRefund(
  activity: AccountActivity,
  income?: Income,
  expense?: Expense
): boolean {
  const terms = [
    normalized(activity.source),
    normalized(income?.source),
    normalized(activity.category),
    normalized(expense?.category),
    normalized(expense?.subcategory),
  ].join(" ");
  return Boolean(
    activity.isCashback || includesAny(terms, ["refund", "cashback"])
  );
}

function activityIsInvestment(
  activity: AccountActivity,
  income?: Income,
  expense?: Expense,
  entry?: AccountEntry
): boolean {
  const terms = [
    normalized(activity.source),
    normalized(income?.source),
    normalized(activity.category),
    normalized(expense?.category),
    normalized(expense?.subcategory),
  ].join(" ");
  return Boolean(
    entry?.transferId ||
      entry?.correlationId ||
      includesAny(terms, [
        "investment",
        "mutual fund",
        "stocks",
        "sip",
        "nps",
        "ppf",
      ])
  );
}

function activityIsBill(activity: AccountActivity, expense?: Expense): boolean {
  const terms = [
    normalized(activity.category),
    normalized(expense?.category),
    normalized(expense?.subcategory),
  ].join(" ");
  return Boolean(
    activity.isBillPayment ||
      includesAny(terms, ["bills & communication", " bill", "credit card payment"])
  );
}

export function enrichAccountActivities(
  activities: AccountActivity[],
  expenses: Expense[],
  incomes: Income[],
  entries: AccountEntry[]
): FilterableAccountActivity[] {
  const expenseById = new Map(
    expenses.flatMap((expense) => (expense.id ? [[expense.id, expense] as const] : []))
  );
  const incomeById = new Map(
    incomes.flatMap((income) => (income.id ? [[income.id, income] as const] : []))
  );
  const entryById = new Map(entries.map((entry) => [entry.id, entry] as const));

  return activities.map((activity) => {
    const expense = activity.linkedExpenseId
      ? expenseById.get(activity.linkedExpenseId)
      : undefined;
    const income = activity.linkedIncomeId
      ? incomeById.get(activity.linkedIncomeId)
      : undefined;
    const entry = activity.linkedAccountEntryId
      ? entryById.get(activity.linkedAccountEntryId)
      : undefined;

    return {
      activity,
      kind: classifyKind(activity, entry),
      category: expense?.category ?? activity.category,
      subcategory: expense?.subcategory,
      counterparty: activity.counterpartyName?.trim() || undefined,
      tags: expense?.tags?.filter(Boolean) ?? [],
      status: expense
        ? expense.isAudited
          ? "audited"
          : "unaudited"
        : undefined,
      isRefund: activityIsRefund(activity, income, expense),
      isInvestment: activityIsInvestment(activity, income, expense, entry),
      isBill: activityIsBill(activity, expense),
    };
  });
}

function selectedSpecialMatches(
  record: FilterableAccountActivity,
  selected: AccountActivitySpecialKind[]
): boolean {
  if (selected.length === 0) return true;
  return selected.some((kind) => {
    if (kind === "refunds") return record.isRefund;
    if (kind === "investments") return record.isInvestment;
    return record.isBill;
  });
}

function parseAmount(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function applyAccountActivityFilters(
  records: FilterableAccountActivity[],
  filters: AccountActivityFilters
): FilterableAccountActivity[] {
  const minAmount = parseAmount(filters.minAmount);
  const maxAmount = parseAmount(filters.maxAmount);

  return records.filter((record) => {
    const { activity } = record;
    if (filters.kind !== "all" && record.kind !== filters.kind) return false;
    if (!selectedSpecialMatches(record, filters.specialKinds)) return false;
    if (
      filters.categories.length > 0 &&
      (!record.category || !filters.categories.includes(record.category))
    ) {
      return false;
    }
    if (
      filters.counterparties.length > 0 &&
      (!record.counterparty ||
        !filters.counterparties.includes(record.counterparty))
    ) {
      return false;
    }
    if (filters.fromDate && activity.date < filters.fromDate) return false;
    if (filters.toDate && activity.date > filters.toDate) return false;
    if (minAmount !== undefined && activity.amount < minAmount) return false;
    if (maxAmount !== undefined && activity.amount > maxAmount) return false;
    if (
      filters.tags.length > 0 &&
      !filters.tags.some((tag) => record.tags.includes(tag))
    ) {
      return false;
    }
    if (
      filters.statuses.length > 0 &&
      (!record.status || !filters.statuses.includes(record.status))
    ) {
      return false;
    }
    return true;
  });
}

function uniqueSorted(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))]
    .sort((a, b) => a.localeCompare(b));
}

export function getAccountActivityFilterOptions(
  records: FilterableAccountActivity[]
): AccountActivityFilterOptions {
  return {
    categories: uniqueSorted(records.map((record) => record.category)),
    counterparties: uniqueSorted(records.map((record) => record.counterparty)),
    tags: uniqueSorted(records.flatMap((record) => record.tags)),
    statuses: [...new Set(
      records
        .map((record) => record.status)
        .filter((status): status is AccountActivityStatus => Boolean(status))
    )],
  };
}

export function countActiveAccountActivityFilters(
  filters: AccountActivityFilters
): number {
  return (
    (filters.kind === "all" ? 0 : 1) +
    filters.specialKinds.length +
    filters.categories.length +
    filters.counterparties.length +
    (filters.fromDate ? 1 : 0) +
    (filters.toDate ? 1 : 0) +
    (filters.minAmount ? 1 : 0) +
    (filters.maxAmount ? 1 : 0) +
    filters.tags.length +
    filters.statuses.length
  );
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function getAccountActivityFilterValidationError(
  filters: AccountActivityFilters
): string | null {
  if (filters.fromDate && !isIsoDate(filters.fromDate)) {
    return "From date must use YYYY-MM-DD.";
  }
  if (filters.toDate && !isIsoDate(filters.toDate)) {
    return "To date must use YYYY-MM-DD.";
  }
  if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) {
    return "From date cannot be after To date.";
  }

  const min = parseAmount(filters.minAmount);
  const max = parseAmount(filters.maxAmount);
  if (filters.minAmount && (min === undefined || min < 0)) {
    return "Minimum amount must be zero or more.";
  }
  if (filters.maxAmount && (max === undefined || max < 0)) {
    return "Maximum amount must be zero or more.";
  }
  if (min !== undefined && max !== undefined && min > max) {
    return "Minimum amount cannot exceed maximum amount.";
  }
  return null;
}
