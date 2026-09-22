import {
  activitySubtypeLabel,
  formatActivityDateLabel,
} from "./activityDisplay";
import {
  normalized,
  type FilterableAccountActivity,
} from "./accountActivityFilters";

/**
 * Reference ids are matched by prefix rather than substring, so a short token
 * cannot sweep in every Firestore document id. Four characters is the shortest
 * prefix that stays useful for a pasted id without matching half the ledger.
 */
const MIN_ID_TOKEN_LENGTH = 4;

function kindTerms(record: FilterableAccountActivity): string[] {
  const terms: string[] = [];
  if (record.kind !== "other") terms.push(record.kind);
  if (record.isRefund) terms.push("refund");
  if (record.isInvestment) terms.push("investment");
  if (record.isBill) terms.push("bill");
  return terms;
}

/**
 * The searchable text for one activity. Deliberately built from the same
 * helpers the row renders with (`activitySubtypeLabel`,
 * `formatActivityDateLabel`) so a user can always find a row by typing what
 * they can see on it.
 *
 * Amounts are deliberately excluded: as text, `12500` contains `1250`, so a
 * substring match would pull unrelated rows in. Numeric tokens are compared
 * against the amount by value instead — see `amountMatchesToken`.
 */
export function buildAccountActivitySearchText(
  record: FilterableAccountActivity
): string {
  const { activity } = record;
  return [
    activity.note,
    record.category,
    record.subcategory,
    activity.source,
    record.counterparty,
    ...record.tags,
    activitySubtypeLabel(activity),
    activity.type,
    activity.date,
    formatActivityDateLabel(activity.date),
    activity.time,
    ...kindTerms(record),
  ]
    .map((part) => normalized(part))
    .filter(Boolean)
    .join(" ");
}

function referenceIds(record: FilterableAccountActivity): string[] {
  const { activity } = record;
  return [
    activity.id,
    activity.linkedExpenseId,
    activity.linkedIncomeId,
    activity.linkedPaymentId,
    activity.linkedAccountEntryId,
    activity.linkedTransferId,
    activity.linkedBorrowingId,
    activity.linkedRepaymentId,
    activity.linkedReceivableId,
    activity.linkedReceivableRepaymentId,
  ]
    .map((id) => normalized(id))
    .filter(Boolean);
}

function idMatchesToken(ids: string[], token: string): boolean {
  if (token.length < MIN_ID_TOKEN_LENGTH) return false;
  return ids.some(
    (id) =>
      id.startsWith(token) ||
      // Activity ids are prefixed (`transfer-out-<docId>`), so a pasted raw
      // document id has to match a segment rather than the whole string.
      id.split("-").some((segment) => segment.startsWith(token))
  );
}

/**
 * True when the token is a number equal to the activity amount, ignoring
 * grouping and trailing zeros, so `1250`, `1,250` and `1250.00` all match.
 */
function amountMatchesToken(amount: number, token: string): boolean {
  const cleaned = token.replace(/[,\s₹]/g, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return false;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return false;
  return Math.abs(amount - value) < 0.005;
}

export function tokenizeAccountActivityQuery(query: string): string[] {
  return normalized(query).split(/\s+/).filter(Boolean);
}

function recordMatchesTokens(
  record: FilterableAccountActivity,
  tokens: string[]
): boolean {
  const haystack = buildAccountActivitySearchText(record);
  const ids = referenceIds(record);
  return tokens.every(
    (token) =>
      haystack.includes(token) ||
      idMatchesToken(ids, token) ||
      amountMatchesToken(record.activity.amount, token)
  );
}

/**
 * Filters activities by a free-text query. Every whitespace-separated token
 * must match somewhere, so `swiggy refund` narrows rather than widens.
 *
 * Purely a filter: order is preserved and nothing is recomputed, so the
 * newest-first ordering and each row's `runningBalance` survive untouched.
 * An empty query returns the same array reference.
 */
export function searchAccountActivities(
  records: FilterableAccountActivity[],
  query: string
): FilterableAccountActivity[] {
  const tokens = tokenizeAccountActivityQuery(query);
  if (tokens.length === 0) return records;
  return records.filter((record) => recordMatchesTokens(record, tokens));
}
