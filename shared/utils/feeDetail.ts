/**
 * SPENDLY-317 — what the fee detail screen shows, derived purely.
 *
 * The detail's "effect on your fee totals" is `feeComponentTotals` over this
 * record and the counted records linked to it — the same function the
 * dashboard sums with (SPENDLY-316) — so the two can never disagree.
 */

import type { Account } from "../types/expense";
import type { FeeRecord } from "../types/fee";
import {
  countsTowardFeeTotals,
  feeComponentTotals,
  feeReviewDocId,
  type FeeComponentTotals,
} from "./feeModel";
import { uncertainReasonText } from "./feeReviewForm";

export interface FeeDetail {
  record: FeeRecord;
  /** The fee this GST row / reversal / refund belongs to. */
  parent?: FeeRecord;
  /** GST rows, reversals and refunds that point at this record. */
  children: FeeRecord[];
  counted: boolean;
  countedReason: string;
  /** Net effect on fee totals of this record plus its counted children. */
  effect: FeeComponentTotals;
  parts: Array<{ key: "principal" | "fee" | "tax" | "interest"; label: string; value: number }>;
}

const PART_LABELS = {
  principal: "Purchase (not a fee)",
  fee: "Fee",
  tax: "GST / tax on the fee",
  interest: "Interest",
} as const;

export function buildFeeDetail(key: string, records: readonly FeeRecord[]): FeeDetail | null {
  const record = records.find((r) => r.key === key);
  if (!record) return null;
  const parent = record.linkedTo ? records.find((r) => r.key === feeReviewDocId(record.linkedTo!)) : undefined;
  const children = records
    .filter((r) => r.linkedTo && feeReviewDocId(r.linkedTo) === record.key)
    .sort((a, b) => (a.source.date < b.source.date ? -1 : a.source.date > b.source.date ? 1 : a.key.localeCompare(b.key)));
  const counted = countsTowardFeeTotals(record);

  let countedReason: string;
  if (record.role === "not_fee") countedReason = "Not counted — marked as not a fee.";
  else if (!counted) countedReason = `Not counted yet — ${uncertainReasonText(record.uncertainReason)?.toLowerCase() ?? "it needs your review."}`;
  else if (record.role === "interest") countedReason = "Counted as interest, separately from fees.";
  else if (record.role === "tax_on_fee") countedReason = "Counted as GST on the linked fee.";
  else if (record.role === "reversal" || record.role === "refund") countedReason = "Reduces your fee totals.";
  else countedReason = "Counted in your fee totals.";

  const effect = feeComponentTotals([record, ...children].filter(countsTowardFeeTotals));
  const parts = (Object.keys(PART_LABELS) as Array<keyof typeof PART_LABELS>)
    .map((k) => ({ key: k, label: PART_LABELS[k], value: record.components[k] }))
    .filter((p) => p.value !== 0);

  return { record, parent, children, counted, countedReason, effect, parts };
}

/**
 * "HDFC Savings ••1234". Only ever the last four digits: a full account or
 * card number is never rendered on a fee screen.
 */
export function maskedAccountLabel(
  account?: Pick<Account, "name" | "displayName" | "last4" | "accountNumber"> | null
): string | undefined {
  if (!account) return undefined;
  const name = (account.displayName || account.name || "").trim();
  const digits = (account.last4 || account.accountNumber || "").replace(/\D/g, "").slice(-4);
  if (!name && !digits) return undefined;
  return digits ? `${name}${name ? " " : ""}••${digits}` : name;
}

export function feeProvenanceText(record: FeeRecord): string {
  const p = record.provenance;
  if (p.origin === "user") {
    const when = p.reviewedAtMs ? new Date(p.reviewedAtMs).toISOString().slice(0, 10) : undefined;
    return `Reviewed by you${when ? ` on ${when}` : ""}${p.reviewRevision ? ` (revision ${p.reviewRevision})` : ""}.`;
  }
  return `Detected by Spendly${p.engineVersion ? ` (rules v${p.engineVersion})` : ""} with ${Math.round(record.confidence * 100)}% confidence.`;
}

export function feeDetailHref(key: string): `/fees/${string}` {
  return `/fees/${encodeURIComponent(key)}`;
}

/** The fee record behind a ledger transaction, if Spendly has one. */
export function feeRecordForTransaction(
  records: readonly FeeRecord[],
  ref: { kind: string; id: string }
): FeeRecord | undefined {
  const key = `${ref.kind}__${ref.id}`;
  return records.find((r) => r.key === key);
}
