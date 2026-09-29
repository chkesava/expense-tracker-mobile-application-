/**
 * SPENDLY-313 — pure rules for the Fee & Charges model (shared/types/fee.ts).
 *
 * No Firebase or React imports. Detection (SPENDLY-314), review (315) and every
 * aggregate (316+) go through these helpers so there is exactly one answer to
 * "does this rupee count as a fee".
 */

import { isFeeTypeId, isValidFeeSubtype } from "../data/feeTaxonomy";
import {
  FEE_ROLES,
  type FeeComponents,
  type FeeEvidence,
  type FeeInference,
  type FeeRecord,
  type FeeReview,
  type FeeReviewDecision,
  type FeeReviewHistoryEntry,
  type FeeRole,
  type FeeSourceRef,
  type FeeSourceSnapshot,
  type FeeStatus,
  type FeeTypeId,
} from "../types/fee";
import { roundMoney } from "./money";
import { isTransactionKind } from "./transactionRef";

/** At or above: the engine may present the fee as detected. */
export const FEE_INFERRED_MIN_CONFIDENCE = 0.8;
/** At or above (and below inferred): a candidate for review. Below: nothing. */
export const FEE_CANDIDATE_MIN_CONFIDENCE = 0.4;

/** Paisa tolerance for "components sum to the source amount". */
const AMOUNT_TOLERANCE = 0.005;

export const FEE_REVIEW_ID_SEPARATOR = "__";

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * One review per source transaction. The id is derived, not random, so a
 * second review for the same transaction overwrites the first instead of
 * sitting beside it and counting the fee twice. Firestore rules enforce the
 * same shape.
 */
export function feeReviewDocId(ref: FeeSourceRef): string {
  return `${ref.kind}${FEE_REVIEW_ID_SEPARATOR}${ref.id}`;
}

export function parseFeeReviewDocId(docId: string): FeeSourceRef | null {
  const at = docId.indexOf(FEE_REVIEW_ID_SEPARATOR);
  if (at <= 0) return null;
  const kind = docId.slice(0, at);
  const id = docId.slice(at + FEE_REVIEW_ID_SEPARATOR.length);
  if (!id || !isTransactionKind(kind)) return null;
  return { kind, id };
}

export function sameFeeSource(a?: FeeSourceRef, b?: FeeSourceRef): boolean {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export const ZERO_FEE_COMPONENTS: Readonly<FeeComponents> = Object.freeze({
  principal: 0,
  fee: 0,
  tax: 0,
  interest: 0,
});

export function feeComponentsTotal(c: FeeComponents): number {
  return roundMoney(c.principal + c.fee + c.tax + c.interest);
}

export function feeComponentsMatchAmount(c: FeeComponents, amount: number): boolean {
  return Math.abs(feeComponentsTotal(c) - roundMoney(amount)) < AMOUNT_TOLERANCE;
}

/** The whole amount allocated to the part a role implies. */
export function defaultFeeComponents(role: FeeRole, amount: number): FeeComponents {
  const value = roundMoney(amount);
  switch (role) {
    case "fee":
    case "reversal":
    case "refund":
      return { ...ZERO_FEE_COMPONENTS, fee: value };
    case "tax_on_fee":
      return { ...ZERO_FEE_COMPONENTS, tax: value };
    case "interest":
      return { ...ZERO_FEE_COMPONENTS, interest: value };
    case "not_fee":
      return { ...ZERO_FEE_COMPONENTS, principal: value };
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type FeeClassificationIssue =
  | "negative_component"
  | "components_do_not_sum"
  | "role_component_mismatch"
  | "direction_mismatch"
  | "fee_type_required"
  | "unknown_fee_type"
  | "invalid_subtype"
  | "link_required"
  | "self_link";

export interface FeeClassificationInput {
  role: FeeRole;
  feeType?: FeeTypeId;
  subtype?: string;
  components: FeeComponents;
  linkedTo?: FeeSourceRef;
}

const DEBIT_ROLES: ReadonlySet<FeeRole> = new Set(["fee", "tax_on_fee", "interest"]);
const CREDIT_ROLES: ReadonlySet<FeeRole> = new Set(["reversal", "refund"]);

/**
 * Structural checks every classification must pass, whoever produced it.
 * An empty list means the classification is internally consistent with its
 * source transaction.
 */
export function validateFeeClassification(
  input: FeeClassificationInput,
  source: Pick<FeeSourceSnapshot, "ref" | "amount" | "direction">
): FeeClassificationIssue[] {
  const issues: FeeClassificationIssue[] = [];
  const { role, feeType, subtype, components: c, linkedTo } = input;

  if ([c.principal, c.fee, c.tax, c.interest].some((v) => !Number.isFinite(v) || v < 0)) {
    issues.push("negative_component");
  }
  if (!feeComponentsMatchAmount(c, source.amount)) {
    issues.push("components_do_not_sum");
  }

  const shapeOk = (() => {
    switch (role) {
      case "fee":
        return c.fee > 0 && c.interest === 0;
      case "tax_on_fee":
        return c.tax > 0 && c.fee === 0 && c.principal === 0 && c.interest === 0;
      case "interest":
        return c.interest > 0 && c.fee === 0;
      case "reversal":
      case "refund":
        return c.principal === 0 && c.fee + c.tax + c.interest > 0;
      case "not_fee":
        return c.fee === 0 && c.tax === 0 && c.interest === 0;
    }
  })();
  if (!shapeOk) issues.push("role_component_mismatch");

  if (DEBIT_ROLES.has(role) && source.direction !== "debit") issues.push("direction_mismatch");
  if (CREDIT_ROLES.has(role) && source.direction !== "credit") issues.push("direction_mismatch");

  if (feeType !== undefined && !isFeeTypeId(feeType)) {
    issues.push("unknown_fee_type");
  } else if (feeType !== undefined && !isValidFeeSubtype(feeType, subtype)) {
    issues.push("invalid_subtype");
  }
  if (role === "fee" && feeType === undefined) issues.push("fee_type_required");
  // GST-on-fee only makes sense against a named fee; otherwise it would be an
  // orphan charge that no fee type can carry.
  if (role === "tax_on_fee" && !linkedTo) issues.push("link_required");
  // A credit must say what it gives back — the fee it pairs with, or at least
  // the fee family — before it may reduce any total.
  if (CREDIT_ROLES.has(role) && !linkedTo && feeType === undefined) {
    issues.push("link_required");
  }
  if (linkedTo && sameFeeSource(linkedTo, source.ref)) issues.push("self_link");

  return issues;
}

// ---------------------------------------------------------------------------
// Resolution: user review always beats inference
// ---------------------------------------------------------------------------

export function feeStatusForConfidence(confidence: number): FeeStatus | null {
  if (confidence >= FEE_INFERRED_MIN_CONFIDENCE) return "inferred";
  if (confidence >= FEE_CANDIDATE_MIN_CONFIDENCE) return "uncertain";
  return null;
}

function reviewLinkedRef(review: FeeReview): FeeSourceRef | undefined {
  if (!review.linkedKind || !review.linkedId) return undefined;
  return { kind: review.linkedKind, id: review.linkedId };
}

function userEvidence(review: FeeReview): FeeEvidence {
  const detail =
    review.decision === "not_fee"
      ? "You marked this as not a fee."
      : review.decision === "confirm"
        ? "You confirmed this classification."
        : "You corrected this classification.";
  return { signal: "user", ruleId: `user.${review.decision}`, detail, weight: 1 };
}

/**
 * Fold the engine's reading and the user's decision for one transaction into
 * the record the app displays and sums. Returns null when neither says
 * anything worth showing.
 *
 * Precedence:
 *   1. A review wins outright — role, type, split and link all come from it —
 *      unless the source amount changed after the review was made, in which
 *      case the record drops to `uncertain / source_changed` so it is neither
 *      counted nor silently re-inferred.
 *   2. Otherwise the inference, gated by confidence. Below the candidate
 *      threshold there is no record at all.
 */
export function resolveFeeRecord(args: {
  source: FeeSourceSnapshot;
  inference?: FeeInference | null;
  review?: FeeReview | null;
}): FeeRecord | null {
  const { source, inference, review } = args;
  const key = feeReviewDocId(source.ref);
  const inferredEvidence = inference?.evidence ?? [];
  const ruleIds = [...new Set(inferredEvidence.map((e) => e.ruleId))];

  if (review) {
    const role = review.decision === "not_fee" ? "not_fee" : review.role;
    const components =
      review.decision === "not_fee"
        ? defaultFeeComponents("not_fee", source.amount)
        : review.components;
    // "Not a fee" survives an amount edit: nothing is split, so nothing can go
    // stale, and re-queueing it would nag about a decision already made.
    const stale =
      review.decision !== "not_fee" &&
      Math.abs(roundMoney(review.sourceAmount) - roundMoney(source.amount)) >= AMOUNT_TOLERANCE;
    const status: FeeStatus = stale
      ? "uncertain"
      : review.decision === "confirm"
        ? "confirmed"
        : "user_corrected";
    return {
      key,
      source,
      role,
      feeType: role === "not_fee" ? undefined : review.feeType,
      subtype: role === "not_fee" ? undefined : review.subtype,
      components,
      linkedTo: role === "not_fee" ? undefined : reviewLinkedRef(review),
      status,
      uncertainReason: stale ? "source_changed" : undefined,
      confidence: 1,
      evidence: [userEvidence(review), ...inferredEvidence],
      provenance: {
        origin: "user",
        engineVersion: review.engineVersion ?? inference?.engineVersion,
        ruleIds,
        reviewId: review.id,
        reviewRevision: review.revision,
        reviewedAtMs: review.updatedAtMs,
      },
    };
  }

  if (!inference) return null;
  const byConfidence = feeStatusForConfidence(inference.confidence);
  if (!byConfidence) return null;
  const issues = validateFeeClassification(inference, source);
  const uncertainReason =
    inference.uncertainReason ??
    (issues.length > 0 ? "conflicting_signals" : byConfidence === "uncertain" ? "ambiguous" : undefined);

  return {
    key,
    source,
    role: inference.role,
    feeType: inference.feeType,
    subtype: inference.subtype,
    components: inference.components,
    linkedTo: inference.linkedTo,
    status: uncertainReason ? "uncertain" : "inferred",
    uncertainReason,
    confidence: inference.confidence,
    evidence: inferredEvidence,
    provenance: { origin: "rule", engineVersion: inference.engineVersion, ruleIds },
  };
}

/** Roles whose link must point at a counted `fee` record. */
const LINKED_ROLES: ReadonlySet<FeeRole> = new Set(["tax_on_fee", "reversal", "refund"]);

/**
 * Link integrity across a set of resolved records. A tax/reversal/refund that
 * names a fee which is absent, not a fee, or itself uncertain drops to
 * `uncertain / broken_link`: GST can then never float free as an unrelated
 * charge, and a credit can never cancel a fee nobody has established.
 * Records are also de-duplicated by key (last wins) so one transaction can
 * never appear twice.
 */
export function reconcileFeeLinks(records: readonly FeeRecord[]): FeeRecord[] {
  const byKey = new Map<string, FeeRecord>();
  for (const record of records) byKey.set(record.key, record);

  const result: FeeRecord[] = [];
  for (const record of byKey.values()) {
    if (!record.linkedTo || !LINKED_ROLES.has(record.role) || record.status === "uncertain") {
      result.push(record);
      continue;
    }
    const target = byKey.get(feeReviewDocId(record.linkedTo));
    const ok = target && target.role === "fee" && countsTowardFeeTotals(target);
    result.push(ok ? record : { ...record, status: "uncertain", uncertainReason: "broken_link" });
  }
  return result;
}

/** Candidates never count; neither does anything classified as not a fee. */
export function countsTowardFeeTotals(record: Pick<FeeRecord, "status" | "role">): boolean {
  return record.status !== "uncertain" && record.role !== "not_fee";
}

export function needsFeeReview(record: Pick<FeeRecord, "status">): boolean {
  return record.status === "uncertain";
}

// ---------------------------------------------------------------------------
// Totals — the one sum every fee surface must reconcile to
// ---------------------------------------------------------------------------

export interface FeeComponentTotals {
  fee: number;
  tax: number;
  interest: number;
  reversedFee: number;
  reversedTax: number;
  reversedInterest: number;
  /** fee − reversedFee */
  netFee: number;
  /** tax − reversedTax */
  netTax: number;
  /** interest − reversedInterest */
  netInterest: number;
  /** Records summed. */
  count: number;
}

/**
 * Sums counted records only. Principal is never read, so no ordinary spend
 * can leak into a fee figure; `tax_on_fee` lands in `tax`, never in `fee`.
 */
export function feeComponentTotals(records: readonly FeeRecord[]): FeeComponentTotals {
  const seen = new Set<string>();
  const t = { fee: 0, tax: 0, interest: 0, reversedFee: 0, reversedTax: 0, reversedInterest: 0, count: 0 };
  for (const record of records) {
    if (seen.has(record.key) || !countsTowardFeeTotals(record)) continue;
    seen.add(record.key);
    const c = record.components;
    if (record.role === "reversal" || record.role === "refund") {
      t.reversedFee += c.fee;
      t.reversedTax += c.tax;
      t.reversedInterest += c.interest;
    } else {
      t.fee += c.fee;
      t.tax += c.tax;
      t.interest += c.interest;
    }
    t.count += 1;
  }
  return {
    fee: roundMoney(t.fee),
    tax: roundMoney(t.tax),
    interest: roundMoney(t.interest),
    reversedFee: roundMoney(t.reversedFee),
    reversedTax: roundMoney(t.reversedTax),
    reversedInterest: roundMoney(t.reversedInterest),
    netFee: roundMoney(t.fee - t.reversedFee),
    netTax: roundMoney(t.tax - t.reversedTax),
    netInterest: roundMoney(t.interest - t.reversedInterest),
    count: t.count,
  };
}

// ---------------------------------------------------------------------------
// Building a review document
// ---------------------------------------------------------------------------

export type BuildFeeReviewResult =
  | { ok: true; review: Omit<FeeReview, "id">; docId: string }
  | { ok: false; issues: FeeClassificationIssue[] };

/**
 * The only way a `feeReviews` document should be produced. Validates the
 * classification against the source and carries provenance forward from the
 * inference and any previous revision.
 */
export function buildFeeReview(args: {
  source: FeeSourceSnapshot;
  decision: FeeReviewDecision;
  classification: FeeClassificationInput;
  inference?: FeeInference | null;
  previous?: FeeReview | null;
  note?: string;
  nowMs: number;
}): BuildFeeReviewResult {
  const { source, decision, inference, previous, nowMs } = args;
  const classification: FeeClassificationInput =
    decision === "not_fee"
      ? { role: "not_fee", components: defaultFeeComponents("not_fee", source.amount) }
      : args.classification;

  const issues = validateFeeClassification(classification, source);
  if (issues.length > 0) return { ok: false, issues };

  const note = args.note?.trim();
  const review: Omit<FeeReview, "id"> = {
    sourceKind: source.ref.kind,
    sourceId: source.ref.id,
    decision,
    role: classification.role,
    components: {
      principal: roundMoney(classification.components.principal),
      fee: roundMoney(classification.components.fee),
      tax: roundMoney(classification.components.tax),
      interest: roundMoney(classification.components.interest),
    },
    sourceAmount: roundMoney(source.amount),
    revision: (previous?.revision ?? 0) + 1,
    createdAtMs: previous?.createdAtMs ?? nowMs,
    updatedAtMs: nowMs,
  };
  if (classification.feeType) review.feeType = classification.feeType;
  if (classification.subtype) review.subtype = classification.subtype;
  if (classification.linkedTo) {
    review.linkedKind = classification.linkedTo.kind;
    review.linkedId = classification.linkedTo.id;
  }
  if (inference) {
    review.inferredRole = inference.role;
    if (inference.feeType) review.inferredFeeType = inference.feeType;
    review.inferredConfidence = inference.confidence;
    review.engineVersion = inference.engineVersion;
  }
  if (note) review.note = note.slice(0, 500);
  if (previous) {
    const history = [...(previous.history ?? []), historyEntryOf(previous)];
    review.history = history.slice(-FEE_REVIEW_HISTORY_LIMIT);
  }

  return { ok: true, review, docId: feeReviewDocId(source.ref) };
}

/** Earlier states kept on a review document. Mirrored by firestore.rules. */
export const FEE_REVIEW_HISTORY_LIMIT = 20;

function historyEntryOf(review: FeeReview): FeeReviewHistoryEntry {
  const entry: FeeReviewHistoryEntry = {
    revision: review.revision,
    decision: review.decision,
    role: review.role,
    components: review.components,
    atMs: review.updatedAtMs,
  };
  if (review.feeType) entry.feeType = review.feeType;
  if (review.subtype) entry.subtype = review.subtype;
  if (review.linkedKind && review.linkedId) {
    entry.linkedKind = review.linkedKind;
    entry.linkedId = review.linkedId;
  }
  return entry;
}

export function isFeeRole(value: unknown): value is FeeRole {
  return typeof value === "string" && (FEE_ROLES as readonly string[]).includes(value);
}
