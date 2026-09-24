/**
 * SPENDLY-113 — how an applied filter is described, in one place.
 *
 * These labels were written inside `TransactionFilters` and rendered as the
 * removable chips above the list. A Journal export has to state which filters
 * produced the file, and a second copy of the wording would drift from the
 * first — the file would claim one thing while the screen showed another.
 *
 * So the chips and the report header now read from the same function. It lives
 * beside `accountActivityFilters.ts` rather than inside it because that file is
 * filter *semantics* and runs on every keystroke through the pipeline; this is
 * presentation, and nothing in the pipeline should have to load it.
 */

import type { AccountActivityFilters } from "./accountActivityFilters";

/** Which facet a chip came from, so removing it clears the right thing. */
export type AccountActivityFilterField = keyof Pick<
  AccountActivityFilters,
  | "kind"
  | "specialKinds"
  | "categories"
  | "counterparties"
  | "accounts"
  | "fromDate"
  | "toDate"
  | "minAmount"
  | "maxAmount"
  | "tags"
  | "statuses"
>;

export interface AccountActivityFilterChip {
  id: string;
  label: string;
  field: AccountActivityFilterField;
  /** The single value to remove, for facets that hold several. */
  value?: string;
}

/**
 * Every applied filter, in the order the chips are shown.
 *
 * The order is load-bearing: it is the on-screen chip order, and the export
 * header lists them the same way so the two can be compared at a glance.
 */
export function describeAccountActivityFilters(
  filters: AccountActivityFilters
): AccountActivityFilterChip[] {
  const chips: AccountActivityFilterChip[] = [];

  if (filters.kind !== "all") {
    chips.push({
      id: "kind",
      label:
        filters.kind === "income"
          ? "Income"
          : filters.kind === "expense"
            ? "Expense"
            : "Transfers",
      field: "kind",
    });
  }
  filters.specialKinds.forEach((value) =>
    chips.push({
      id: `special-${value}`,
      label:
        value === "refunds"
          ? "Refunds & cashback"
          : value === "investments"
            ? "Investments"
            : "Bills & payments",
      field: "specialKinds",
      value,
    })
  );
  filters.accounts.forEach((value) =>
    chips.push({
      id: `account-${value}`,
      // The account a row was posted to. Never "With:" — that is the other
      // side of a movement, which a journal row does not have.
      label: `Account: ${value}`,
      field: "accounts",
      value,
    })
  );
  filters.categories.forEach((value) =>
    chips.push({
      id: `category-${value}`,
      label: `Category: ${value}`,
      field: "categories",
      value,
    })
  );
  filters.counterparties.forEach((value) =>
    chips.push({
      id: `counterparty-${value}`,
      label: `With: ${value}`,
      field: "counterparties",
      value,
    })
  );
  if (filters.fromDate) {
    chips.push({
      id: "from-date",
      label: `From: ${filters.fromDate}`,
      field: "fromDate",
    });
  }
  if (filters.toDate) {
    chips.push({
      id: "to-date",
      label: `To: ${filters.toDate}`,
      field: "toDate",
    });
  }
  if (filters.minAmount) {
    chips.push({
      id: "min-amount",
      label: `Min: ${filters.minAmount}`,
      field: "minAmount",
    });
  }
  if (filters.maxAmount) {
    chips.push({
      id: "max-amount",
      label: `Max: ${filters.maxAmount}`,
      field: "maxAmount",
    });
  }
  filters.tags.forEach((value) =>
    chips.push({
      id: `tag-${value}`,
      label: `Tag: ${value}`,
      field: "tags",
      value,
    })
  );
  filters.statuses.forEach((value) =>
    chips.push({
      id: `status-${value}`,
      label: value === "audited" ? "Audited" : "Not audited",
      field: "statuses",
      value,
    })
  );

  return chips;
}

/** Just the labels, for a report header. Empty when nothing is applied. */
export function accountActivityFilterLabels(
  filters: AccountActivityFilters
): string[] {
  return describeAccountActivityFilters(filters).map((chip) => chip.label);
}
