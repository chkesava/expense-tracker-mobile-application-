import { suggestCategoryFromNote } from "../data/categoryTaxonomy";
import { monthFromDateKey } from "./dates";
import type { StatementLine } from "./statementParse";

export const STATEMENT_REVIEW_TAG = "statement-review";
export const STATEMENT_REVIEW_FALLBACK_CATEGORY = "Shopping";
export const STATEMENT_REVIEW_FALLBACK_SUBCATEGORY = "Other Shopping";

export type StatementExpenseDraft = {
  amount: number;
  category: string;
  subcategory: string;
  date: string;
  month: string;
  accountId: string;
  note: string;
  tags: string[];
};

export function categoryFromStatementLine(line: StatementLine): {
  category: string;
  subcategory: string;
} {
  const suggestion = suggestCategoryFromNote(line.merchant);
  return {
    category: suggestion?.category ?? STATEMENT_REVIEW_FALLBACK_CATEGORY,
    subcategory: suggestion?.subcategory ?? STATEMENT_REVIEW_FALLBACK_SUBCATEGORY,
  };
}

/** Draft for createExpense — never written until the user taps Add. */
export function expenseDraftFromStatementLine(
  line: StatementLine,
  accountId: string
): StatementExpenseDraft {
  const { category, subcategory } = categoryFromStatementLine(line);
  return {
    amount: line.amount,
    category,
    subcategory,
    date: line.date,
    month: monthFromDateKey(line.date),
    accountId,
    note: line.merchant,
    tags: [STATEMENT_REVIEW_TAG],
  };
}
