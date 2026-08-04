import { PARENT_CATEGORY_NAMES } from "../data/categoryTaxonomy";

/** Top-level category names from the hierarchical taxonomy. */
export const CATEGORIES = PARENT_CATEGORY_NAMES;

/** @deprecated Prefer CATEGORIES; kept for older imports. */
export const LEGACY_FLAT_CATEGORIES = [
  "Food",
  "Rent",
  "Travel",
  "Shopping",
  "Utilities",
  "Entertainment",
  "Electrical",
  "Health",
  "Education",
  "Gifts",
  "Subscriptions",
  "Insurance",
  "Brother Related",
  "EMIS",
  "Other",
] as const;

export const INCOME_SOURCES = [
  "Salary",
  "Freelance",
  "Investment",
  "Gift",
  "Business",
  "Rental",
  "Other",
] as const;

export type CategoryKind = "category" | "subcategory";

export interface Category {
  id: string;
  name: string;
  /** Parent category for subcategories; null/undefined for top-level. */
  parentId?: string | null;
  kind?: CategoryKind;
  icon?: string;
  /** Hex or CSS color for UI accents. */
  color?: string;
  isDefault?: boolean;
  isArchived?: boolean;
  /** Soft-hide from pickers without deleting. */
  isHidden?: boolean;
  isFavorite?: boolean;
  sortOrder?: number;
  createdAt?: unknown;
}

export interface AccountType {
  id: string;
  name: string;
  createdAt?: unknown;
}

export interface Account {
  id: string;
  name: string;
  typeId: string;
  billGenerationDay?: number;
  creditLimit?: number;
  openingBalance?: number;
  balanceInitialized?: boolean;
  balanceAsOfDate?: string;
  createdAt?: unknown;
}

export type AccountKind = "credit" | "bank" | "other";

/** Credit card bill paid from a savings/bank account — not an expense */
export interface AccountPayment {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  note?: string;
  sourceType?: "account" | "external";
  appliedCycleStart?: string;
  appliedCycleEnd?: string;
  createdAt?: unknown;
}

/** Manual account adjustment entry for non-credit account tracking */
export interface AccountEntry {
  id: string;
  accountId: string;
  amount: number;
  direction: "credit" | "debit";
  date: string;
  note?: string;
  createdAt?: unknown;
}

/** A movement of money between two non-credit accounts. It is never income or an expense. */
export interface AccountTransfer {
  id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  date: string;
  month?: string;
  note?: string;
  /** Present when a recurring transfer created this record. */
  subscriptionId?: string;
  recurringTransfer?: boolean;
  createdAt?: unknown;
}

export interface AccountActivity {
  id: string;
  date: string;
  amount: number;
  type: "debit" | "credit";
  note?: string;
  category?: string;
  source?: string;
  linkedExpenseId?: string;
  linkedIncomeId?: string;
  linkedPaymentId?: string;
  linkedAccountEntryId?: string;
  linkedTransferId?: string;
  isBillPayment?: boolean;
  isManualEntry?: boolean;
  isTransfer?: boolean;
  counterpartyName?: string;
  runningBalance?: number;
}

export interface CategoryBudget {
  id: string;
  category: string;
  /** Optional leaf budget; when set, budget applies to Category › Subcategory. */
  subcategory?: string;
  amount: number;
  month: string;
  createdAt?: unknown;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  createdAt?: unknown;
}

export interface CategorizationRule {
  id: string;
  keyword: string;
  category: string;
  subcategory?: string;
  createdAt?: unknown;
}

export interface Expense {
  id?: string;
  amount: number;
  /** Parent category name (e.g. "Food & Dining"). */
  category: string;
  /** Subcategory name (e.g. "Groceries"). */
  subcategory?: string;
  /** Optional free-form tags. */
  tags?: string[];
  note: string;
  date: string;
  month: string;
  time?: string;
  accountId?: string;
  budgetGroupId?: string;
  splitId?: string; // ID of the split this expense belongs to
  tripId?: string | null; // ID of the trip this expense belongs to
  vaultId?: string | null; // ID of the shared vault this expense belongs to
  isRecurring?: boolean;
  isAudited?: boolean;
  createdAt: unknown;
}

export interface Income {
  id?: string;
  amount: number;
  source: string;
  note: string;
  date: string;
  month: string;
  accountId?: string;
  createdAt: unknown;
}
