import type { Borrowing } from "@/shared/types/borrowing";
import type { BorrowingSummary } from "@/shared/utils/borrowingMath";
import { toLocalDateKey } from "@/shared/utils/dates";

export type BorrowingStatusFilter =
  | "all"
  | "outstanding"
  | "ACTIVE"
  | "PARTIALLY_SETTLED"
  | "OVERDUE"
  | "FULLY_SETTLED";

export type BorrowingDateFilter = "all" | "thisMonth" | "last6Months" | "thisYear";

export type BorrowingInterestFilter = "all" | "NONE" | "SIMPLE";

export type BorrowingFilterState = {
  status: BorrowingStatusFilter;
  lenderType: string;
  date: BorrowingDateFilter;
  interest: BorrowingInterestFilter;
};

export const EMPTY_BORROWING_FILTERS: BorrowingFilterState = {
  status: "all",
  lenderType: "all",
  date: "all",
  interest: "all",
};

export function countActiveBorrowingFilters(filters: BorrowingFilterState): number {
  let count = 0;
  if (filters.status !== "all") count += 1;
  if (filters.lenderType !== "all") count += 1;
  if (filters.date !== "all") count += 1;
  if (filters.interest !== "all") count += 1;
  return count;
}

export function borrowingDateCutoff(
  filter: BorrowingDateFilter,
  today: string
): string | null {
  if (filter === "all") return null;
  const [year, month] = today.split("-").map(Number);

  if (filter === "thisMonth") return `${today.slice(0, 7)}-01`;
  if (filter === "thisYear") return `${year}-01-01`;

  const start = new Date(year, month - 1 - 5, 1);
  return toLocalDateKey(start);
}

/**
 * The single filter predicate for the Borrowings list (SPENDLY-139).
 *
 * Lives here rather than beside the list so the filter sheet's "Show N" count
 * and the rendered list are the same computation — a separately-derived count
 * would drift the moment either side gained a dimension.
 *
 * Status is matched against the *derived* summary, not `borrowing.status`:
 * overdue and partially-settled are computed from repayments, so the stored
 * field lags.
 */
export function matchesBorrowingFilters(input: {
  borrowing: Borrowing;
  summary: BorrowingSummary | undefined;
  filters: BorrowingFilterState;
  query: string;
  today: string;
}): boolean {
  const { borrowing, summary, filters, query, today } = input;

  if (!borrowing.id) return false;
  if (!summary) return false;

  if (filters.status === "outstanding") {
    if (summary.totalOutstanding <= 0) return false;
  } else if (filters.status !== "all" && summary.status !== filters.status) {
    return false;
  }

  if (filters.lenderType !== "all" && borrowing.lenderType !== filters.lenderType) {
    return false;
  }

  if (filters.interest !== "all" && borrowing.interestType !== filters.interest) {
    return false;
  }

  const cutoff = borrowingDateCutoff(filters.date, today);
  if (cutoff && borrowing.borrowedDate < cutoff) return false;

  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    borrowing.lenderName.toLowerCase().includes(q) ||
    (borrowing.note ?? "").toLowerCase().includes(q)
  );
}
