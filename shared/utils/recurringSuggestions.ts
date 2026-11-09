/**
 * SPENDLY-744 (epic SPENDLY-735) — recurring-merchant suggestions, detected by
 * the server's recurring-weekly job and stored at
 * users/{uid}/recurringSuggestions/{id}. The app reads them into its review
 * queue; it never detects or writes them. Pure.
 */

export const RECURRING_SUGGESTIONS_COLLECTION = "recurringSuggestions";

/** The stored fields of a suggestion (a detected pattern), as the job writes them. */
export const RECURRING_SUGGESTION_FIELDS = [
  "key",
  "merchant",
  "amount",
  "category",
  "subcategory",
  "accountId",
  "occurrences",
  "dates",
  "dayOfMonth",
  "frequency",
  "intervalDays",
] as const;

export type StoredRecurringSuggestion = {
  key: string;
  merchant: string;
  amount: number;
  category: string;
  subcategory?: string | null;
  accountId?: string | null;
  occurrences: number;
  dates: string[];
  dayOfMonth: number;
  frequency: string;
  intervalDays?: number | null;
};

/** A Firestore-safe document id for a pattern key (`merchant|amount`): no "/" allowed. */
export function recurringSuggestionId(key: string): string {
  return key.replace(/\//g, "_").slice(0, 700);
}

/** The document a pattern is stored as (undefined fields become null). */
export function recurringSuggestionDoc(pattern: Record<string, unknown>): StoredRecurringSuggestion {
  const doc: Record<string, unknown> = {};
  for (const field of RECURRING_SUGGESTION_FIELDS) doc[field] = pattern[field] === undefined ? null : pattern[field];
  return doc as StoredRecurringSuggestion;
}

/** Back from a stored document to the pattern shape the review queue uses. */
export function patternFromSuggestionDoc(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const field of RECURRING_SUGGESTION_FIELDS) if (data[field] !== null && data[field] !== undefined) out[field] = data[field];
  return out as Omit<StoredRecurringSuggestion, "subcategory" | "accountId" | "intervalDays"> & {
    subcategory?: string;
    accountId?: string;
    intervalDays?: number;
  };
}

/** Whether two stored suggestions say the same thing (no rewrite needed). */
export function sameSuggestion(a: Record<string, unknown> | undefined, b: StoredRecurringSuggestion): boolean {
  if (!a) return false;
  return RECURRING_SUGGESTION_FIELDS.every((f) => JSON.stringify(a[f] ?? null) === JSON.stringify(b[f] ?? null));
}
