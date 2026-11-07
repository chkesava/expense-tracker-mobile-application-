/**
 * SPENDLY-289 — builders for stored tax documents. Each one normalises the
 * input, validates it, bumps `revision` and keeps the previous values in a
 * bounded `history`, so a correction is never lost and never silently undone.
 *
 * Firestore timestamps (`createdAt`/`updatedAt`) are added by the write plan
 * (SPENDLY-709), not here: these stay pure.
 */

import { roundMoney } from "@/shared/utils/money";
import {
  TAX_LIMITS,
  TAX_SCHEMA_VERSION,
  type TaxEntry,
  type TaxEntryKind,
  type TaxHistoryEntry,
  type TaxProfile,
  type TaxReview,
  type TaxReviewDecision,
  type TaxSnapshot,
  type TaxSourceRef,
} from "../types";
import { taxEntryDedupeKey } from "./dedupe";
import { isValidTaxIdSegment, taxProfileDocId, taxReviewDocId, taxSnapshotDocId } from "./ids";
import {
  validateTaxEntry,
  validateTaxProfile,
  validateTaxReview,
  validateTaxSnapshot,
  type TaxEntryDraft,
  type TaxIssue,
  type TaxValidationContext,
} from "./validation";

export type TaxBuildResult<T> = { ok: true; value: T } | { ok: false; issues: TaxIssue[] };

/** Money fields per kind, rounded to paise before validation. */
const MONEY_FIELDS: Record<TaxEntryKind, readonly string[]> = {
  income: ["amount"],
  form16: [
    "grossSalary",
    "exemptAllowances",
    "standardDeduction",
    "professionalTax",
    "taxableSalary",
    "tdsDeducted",
  ],
  tds: ["amountPaid", "tdsAmount"],
  ais_value: ["reportedAmount", "tdsAmount"],
  deduction: ["amount"],
  capital_gain: ["costOfAcquisition", "saleValue", "transferExpenses"],
  tax_payment: ["amount"],
};

/** Identifier fields stored upper-case without spaces. */
const ID_FIELDS = ["tan", "isin", "section", "bsrCode", "challanSerial", "cin"] as const;

function cleanText(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function normaliseFields(kind: TaxEntryKind, fields: object): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(fields)) {
    let value = cleanText(raw);
    if (MONEY_FIELDS[kind].includes(key) && typeof value === "number" && Number.isFinite(value)) {
      value = roundMoney(value);
    }
    if ((ID_FIELDS as readonly string[]).includes(key) && typeof value === "string") {
      value = value.replace(/\s+/g, "").toUpperCase();
    }
    // Firestore rejects `undefined`; an absent optional field is simply left out.
    if (value !== undefined) out[key] = value;
  }
  return out;
}

type Primitive = string | number | boolean | null;

function asPrimitive(value: unknown): Primitive {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  // Nested values (a source ref, an id list) are kept as a stable string.
  return JSON.stringify(value);
}

/** Previous values of every changed field, as `fields.x`, `label`, `note`, `documentIds`. */
function changedFields(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, Primitive> {
  const changes: Record<string, Primitive> = {};
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const before = asPrimitive(previous[key]);
    if (before !== asPrimitive(next[key])) changes[key] = before;
  }
  return changes;
}

function flatten(entry: Pick<TaxEntry, "fields" | "label" | "note" | "documentIds">) {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry.fields)) flat[`fields.${key}`] = value;
  flat.label = entry.label;
  flat.note = entry.note;
  flat.documentIds = entry.documentIds?.length ? entry.documentIds : undefined;
  return flat;
}

function withHistory<H>(previous: { history?: H[] } | null | undefined, entry: H): H[] {
  return [...(previous?.history ?? []), entry].slice(-TAX_LIMITS.historyLimit);
}

/**
 * Create (no `previous`) or correct (`previous`) an entry. The year and kind of
 * an entry never change: a fact for another year is a new entry.
 */
export function buildTaxEntry(args: {
  id: string;
  draft: TaxEntryDraft & { duplicateConfirmed?: boolean };
  previous?: TaxEntry | null;
  nowMs: number;
  ctx?: TaxValidationContext;
}): TaxBuildResult<TaxEntry> {
  const { id, draft, previous, nowMs } = args;
  const issues: TaxIssue[] = [];
  if (!isValidTaxIdSegment(id)) issues.push({ field: "id", code: "invalid_format" });
  if (previous && (previous.fy !== draft.fy || previous.kind !== draft.kind)) {
    issues.push({ field: previous.fy !== draft.fy ? "fy" : "kind", code: "not_allowed" });
  }
  if (previous?.deletedAt) issues.push({ field: "deletedAt", code: "not_allowed" });

  const fields =
    draft.fields && typeof draft.fields === "object"
      ? normaliseFields(draft.kind, draft.fields)
      : draft.fields;
  const normalised: TaxEntryDraft = {
    fy: draft.fy,
    kind: draft.kind,
    fields: fields as unknown as TaxEntryDraft["fields"],
    label: cleanText(draft.label) as string | undefined,
    note: cleanText(draft.note) as string | undefined,
    documentIds: draft.documentIds?.length ? [...draft.documentIds] : undefined,
  };
  issues.push(...validateTaxEntry(normalised, args.ctx));
  if (issues.length > 0) return { ok: false, issues };

  const entry: Record<string, unknown> = {
    id,
    fy: normalised.fy,
    kind: normalised.kind,
    fields: normalised.fields,
    dedupeKey: taxEntryDedupeKey(normalised),
    revision: (previous?.revision ?? 0) + 1,
    schemaVersion: TAX_SCHEMA_VERSION,
    createdAtMs: previous?.createdAtMs ?? nowMs,
    updatedAtMs: nowMs,
  };
  if (normalised.label) entry.label = normalised.label;
  if (normalised.note) entry.note = normalised.note;
  if (normalised.documentIds) entry.documentIds = normalised.documentIds;
  if (draft.duplicateConfirmed) entry.duplicateConfirmed = true;
  if (previous) {
    const fieldsBefore = changedFields(flatten(previous), flatten(entry as unknown as TaxEntry));
    const historyEntry: TaxHistoryEntry = {
      revision: previous.revision,
      atMs: previous.updatedAtMs,
      fields: fieldsBefore,
    };
    entry.history = withHistory(previous, historyEntry);
  }
  return { ok: true, value: entry as unknown as TaxEntry };
}

/** Soft delete (R1.3): the entry stays for the audit trail and drops out of every total. */
export function softDeleteTaxEntry(
  previous: TaxEntry,
  now: { ms: number; iso: string }
): TaxBuildResult<TaxEntry> {
  if (previous.deletedAt) return { ok: false, issues: [{ field: "deletedAt", code: "not_allowed" }] };
  const historyEntry: TaxHistoryEntry = {
    revision: previous.revision,
    atMs: previous.updatedAtMs,
    fields: { deletedAt: null },
  };
  return {
    ok: true,
    value: {
      ...previous,
      deletedAt: now.iso,
      revision: previous.revision + 1,
      updatedAtMs: now.ms,
      history: withHistory(previous, historyEntry),
    },
  };
}

/** The user's decision about one derived item (or checklist item). Same id every time. */
export function buildTaxReview(args: {
  fy: string;
  source: TaxSourceRef;
  decision: TaxReviewDecision;
  /** The derived value the user is looking at; `null` for checklist items. */
  sourceAmount: number | null;
  category?: string;
  replacedBy?: string;
  engineVersion?: number;
  note?: string;
  previous?: TaxReview | null;
  nowMs: number;
}): TaxBuildResult<TaxReview> {
  const { previous, nowMs } = args;
  const note = cleanText(args.note) as string | undefined;
  const review: Omit<TaxReview, "id"> = {
    fy: args.fy,
    sourceKind: args.source.kind,
    sourceId: args.source.id,
    decision: args.decision,
    sourceAmount: args.sourceAmount === null ? null : roundMoney(args.sourceAmount),
    revision: (previous?.revision ?? 0) + 1,
    schemaVersion: TAX_SCHEMA_VERSION,
    createdAtMs: previous?.createdAtMs ?? nowMs,
    updatedAtMs: nowMs,
  };
  if (args.category !== undefined) review.category = args.category;
  if (args.replacedBy !== undefined) review.replacedBy = args.replacedBy;
  if (args.engineVersion !== undefined) review.engineVersion = args.engineVersion;
  if (note) review.note = note;
  if (previous) {
    review.history = withHistory(previous, {
      revision: previous.revision,
      atMs: previous.updatedAtMs,
      decision: previous.decision,
      ...(previous.category !== undefined ? { category: previous.category } : {}),
      ...(previous.replacedBy !== undefined ? { replacedBy: previous.replacedBy } : {}),
    });
  }
  const issues = validateTaxReview(review);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { id: taxReviewDocId(args.fy, args.source), ...review } };
}

export function buildTaxProfile(args: {
  draft: Pick<
    TaxProfile,
    "fy" | "residentialStatus" | "ageBand" | "employerCount" | "regimeNote" | "note"
  >;
  previous?: TaxProfile | null;
  nowMs: number;
}): TaxBuildResult<TaxProfile> {
  const { draft, previous, nowMs } = args;
  const profile: Omit<TaxProfile, "id"> = {
    fy: draft.fy,
    residentialStatus: draft.residentialStatus,
    ageBand: draft.ageBand,
    schemaVersion: TAX_SCHEMA_VERSION,
    createdAtMs: previous?.createdAtMs ?? nowMs,
    updatedAtMs: nowMs,
  };
  if (draft.employerCount !== undefined) profile.employerCount = draft.employerCount;
  if (draft.regimeNote !== undefined) profile.regimeNote = draft.regimeNote;
  const note = cleanText(draft.note) as string | undefined;
  if (note) profile.note = note;
  const issues = validateTaxProfile(profile);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { id: taxProfileDocId(draft.fy), ...profile } };
}

/** A frozen calculation. Never rebuilt or updated: a new rule version means a new snapshot. */
export function buildTaxSnapshot(
  args: Omit<TaxSnapshot, "id" | "schemaVersion">
): TaxBuildResult<TaxSnapshot> {
  const createdAtMs = Math.trunc(args.createdAtMs);
  const snapshot: TaxSnapshot = {
    ...args,
    id: taxSnapshotDocId(args.fy, createdAtMs),
    outputs: { ...args.outputs },
    schemaVersion: TAX_SCHEMA_VERSION,
    createdAtMs,
  };
  const issues = validateTaxSnapshot(snapshot);
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: snapshot };
}
