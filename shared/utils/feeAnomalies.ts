/**
 * SPENDLY-319 — fee anomaly, duplicate and reversal signals.
 *
 * Read-only by construction: this module derives signals from resolved fee
 * records and never proposes, let alone performs, a change to a source
 * transaction. A signal a user thinks is wrong is dismissed (or marked
 * resolved) through `users/{uid}/feeSignalDismissals`, keyed by the signal's
 * deterministic id — so a dismissal sticks until the evidence changes, and
 * new evidence produces a new id and can surface again.
 *
 * Reversals only reduce fee totals when the relationship is supported: the
 * engine paired it with a specific fee, or the user confirmed it (313/314).
 * The `unmatched_credit` signal points at credits that are therefore not
 * reducing anything.
 */

import type { FeeRecord, FeeTypeId } from "../types/fee";
import { daysBetweenDateKeys } from "./dates";
import { attributeFeeRecords } from "./feeDashboard";
import { countsTowardFeeTotals, feeComponentTotals, feeReviewDocId } from "./feeModel";
import { roundMoney } from "./money";

export const FEE_SIGNAL_KINDS = [
  "possible_duplicate",
  "unusual_amount",
  "repeated_penalty",
  "reversed",
  "partly_reversed",
  "unmatched_credit",
  "needs_attention",
] as const;

export type FeeSignalKind = (typeof FEE_SIGNAL_KINDS)[number];
export type FeeSignalSeverity = "info" | "attention";

export interface FeeSignal {
  /** Deterministic from kind + records; a valid Firestore document id. */
  id: string;
  kind: FeeSignalKind;
  severity: FeeSignalSeverity;
  title: string;
  /** Plain-language explanation built from the linked records. */
  detail: string;
  /** Records this signal rests on; the first is the one to open. */
  recordKeys: string[];
  date: string;
}

/** Records kept on one signal (and in its id). Mirrored by firestore.rules. */
export const FEE_SIGNAL_MAX_RECORDS = 12;

/** Charges this close together with the same amount look like a double charge. */
const DUPLICATE_WINDOW_DAYS = 3;
/** Latest charge this many times the usual one (and ₹50 more) is unusual. */
const UNUSUAL_FACTOR = 1.5;
const UNUSUAL_MIN_DELTA = 50;
const PENALTY_WINDOW_DAYS = 180;

const PENALTY_TYPES: ReadonlySet<FeeTypeId> = new Set(["late_payment", "min_balance", "cheque"]);
const PENALTY_SUBTYPES: ReadonlySet<string> = new Set(["penal_charge", "bounce", "over_limit"]);

export function feeSignalId(kind: FeeSignalKind, recordKeys: readonly string[]): string {
  return `${kind}--${[...recordKeys].sort().join("--")}`;
}

function signal(
  kind: FeeSignalKind,
  severity: FeeSignalSeverity,
  title: string,
  detail: string,
  records: readonly FeeRecord[]
): FeeSignal {
  // Capped so the id stays a short, valid Firestore document id.
  const keys = records.slice(0, FEE_SIGNAL_MAX_RECORDS).map((r) => r.key);
  const latest = records.reduce((d, r) => (r.source.date > d ? r.source.date : d), records[0].source.date);
  return { id: feeSignalId(kind, keys), kind, severity, title, detail, recordKeys: keys, date: latest };
}

function charge(record: FeeRecord): number {
  return roundMoney(record.components.fee + record.components.tax);
}

function byDate(a: FeeRecord, b: FeeRecord): number {
  return a.source.date < b.source.date ? -1 : a.source.date > b.source.date ? 1 : a.key.localeCompare(b.key);
}

function money(value: number): string {
  return `₹${roundMoney(value).toLocaleString("en-IN")}`;
}

export function detectFeeSignals(records: readonly FeeRecord[], today: string): FeeSignal[] {
  const out: FeeSignal[] = [];
  const counted = records.filter(countsTowardFeeTotals);
  const fees = counted.filter((r) => r.role === "fee").sort(byDate);

  // Group counted fees by family + account (same grouping as patterns).
  const groups = new Map<string, FeeRecord[]>();
  for (const item of attributeFeeRecords(records)) {
    if (item.record.role !== "fee" || !item.feeType) continue;
    const id = `${item.feeType}|${item.accountId ?? item.provider}`;
    const list = groups.get(id);
    if (list) list.push(item.record);
    else groups.set(id, [item.record]);
  }

  // 1. Possible duplicates: same family, account and amount within a few days.
  for (const list of groups.values()) {
    const sorted = [...list].sort(byDate);
    const used = new Set<string>();
    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].key)) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        const gap = daysBetweenDateKeys(sorted[i].source.date, sorted[j].source.date);
        if (gap > DUPLICATE_WINDOW_DAYS) break;
        if (used.has(sorted[j].key)) continue;
        if (Math.abs(charge(sorted[i]) - charge(sorted[j])) > 0.01) continue;
        used.add(sorted[i].key);
        used.add(sorted[j].key);
        out.push(
          signal(
            "possible_duplicate",
            "attention",
            "Possible double charge",
            `${money(charge(sorted[j]))} was charged on ${sorted[i].source.date} and again on ${sorted[j].source.date} for the same kind of fee on the same account. It may be a genuine repeat — check with your statement.`,
            [sorted[j], sorted[i]]
          )
        );
        break;
      }
    }
  }

  // 2. Unusual amount: latest charge well above the usual for that fee.
  for (const list of groups.values()) {
    const sorted = [...list].sort(byDate);
    if (sorted.length < 4) continue;
    const latest = sorted[sorted.length - 1];
    const prior = sorted.slice(0, -1).map(charge).sort((a, b) => a - b);
    const usual = prior[Math.floor(prior.length / 2)];
    const now = charge(latest);
    if (usual > 0 && now >= usual * UNUSUAL_FACTOR && now - usual >= UNUSUAL_MIN_DELTA) {
      out.push(
        signal(
          "unusual_amount",
          "attention",
          "Higher than usual",
          `This charge of ${money(now)} is more than the usual ${money(usual)} for this fee, based on ${prior.length} earlier charges.`,
          [latest, ...sorted.slice(-4, -1).reverse()]
        )
      );
    }
  }

  // 3. Repeated penalties in the last six months.
  for (const list of groups.values()) {
    const penalties = list
      .filter((r) => (r.feeType && PENALTY_TYPES.has(r.feeType)) || (r.subtype && PENALTY_SUBTYPES.has(r.subtype)))
      .filter((r) => {
        const d = daysBetweenDateKeys(r.source.date, today);
        return d >= 0 && d <= PENALTY_WINDOW_DAYS;
      })
      .sort(byDate)
      .reverse();
    if (penalties.length >= 2) {
      const total = feeComponentTotals(penalties);
      out.push(
        signal(
          "repeated_penalty",
          "attention",
          "Repeated penalty",
          `Charged ${penalties.length} times in the last 6 months, ${money(total.fee + total.tax)} in total.`,
          penalties
        )
      );
    }
  }

  // 4. Reversal outcomes for each fee.
  const childrenByParent = new Map<string, FeeRecord[]>();
  for (const r of counted) {
    if ((r.role !== "reversal" && r.role !== "refund") || !r.linkedTo) continue;
    const key = feeReviewDocId(r.linkedTo);
    const list = childrenByParent.get(key);
    if (list) list.push(r);
    else childrenByParent.set(key, [r]);
  }
  for (const fee of fees) {
    const credits = childrenByParent.get(fee.key);
    if (!credits) continue;
    const back = roundMoney(credits.reduce((s, c) => s + c.components.fee + c.components.tax, 0));
    const charged = charge(fee);
    const full = back + 0.01 >= charged;
    out.push(
      signal(
        full ? "reversed" : "partly_reversed",
        "info",
        full ? "Fee reversed" : "Fee partly reversed",
        full
          ? `The ${money(charged)} charge from ${fee.source.date} was given back, so it no longer counts in your fee totals.`
          : `${money(back)} of the ${money(charged)} charge from ${fee.source.date} was given back; ${money(charged - back)} still counts.`,
        [fee, ...credits.sort(byDate)]
      )
    );
  }

  // 5. Credits that look like a reversal but are not tied to any fee.
  for (const r of records) {
    if ((r.role === "reversal" || r.role === "refund") && !countsTowardFeeTotals(r)) {
      out.push(
        signal(
          "unmatched_credit",
          "attention",
          "Reversal not matched",
          `This ${money(r.source.amount)} credit looks like a fee being given back, but Spendly couldn't match it to a fee, so it isn't reducing your totals. Link it to the fee it belongs to.`,
          [r]
        )
      );
    }
  }

  // 6. Records whose classification conflicts or broke.
  for (const r of records) {
    if (r.status !== "uncertain" || r.role === "reversal" || r.role === "refund") continue;
    if (r.uncertainReason !== "conflicting_signals" && r.uncertainReason !== "broken_link" && r.uncertainReason !== "source_changed") continue;
    const why =
      r.uncertainReason === "source_changed"
        ? "The transaction changed after you reviewed it."
        : r.uncertainReason === "broken_link"
          ? "The fee it belongs to is no longer a confirmed fee."
          : "The details point different ways.";
    out.push(signal("needs_attention", "attention", "Needs a look", `${why} It isn't counted until you review it.`, [r]));
  }

  const rank = (s: FeeSignal) => (s.severity === "attention" ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id)));
}

export interface FeeSignalDismissal {
  id: string;
  kind: FeeSignalKind;
  resolution: "dismissed" | "resolved";
  recordKeys: string[];
  note?: string;
  atMs: number;
}

/** Signals minus the ones the user dismissed or resolved. */
export function activeFeeSignals(signals: readonly FeeSignal[], dismissals: readonly Pick<FeeSignalDismissal, "id">[]): FeeSignal[] {
  const gone = new Set(dismissals.map((d) => d.id));
  return signals.filter((s) => !gone.has(s.id));
}

export function signalsForRecord(signals: readonly FeeSignal[], key: string): FeeSignal[] {
  return signals.filter((s) => s.recordKeys.includes(key));
}
