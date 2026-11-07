/**
 * SPENDLY-709 — stored tax documents back into typed values, from either
 * source (a Firestore snapshot or a read-model row's `doc`). A document that
 * isn't one of ours (wrong year, unknown kind, no fields) is dropped rather
 * than guessed at, and logged by the caller's count.
 */

import {
  TAX_DOCUMENT_CATEGORIES,
  TAX_ENTRY_KINDS,
  TAX_REVIEW_DECISIONS,
  type FinancialYearKey,
  type TaxDocument,
  type TaxEntry,
  type TaxProfile,
  type TaxReview,
  type TaxSnapshot,
} from "../types";
import { isTaxSourceKind, isValidTaxIdSegment } from "./ids";
import { isFinancialYearKey } from "./taxYear";

type Data = Record<string, unknown>;

function isMap(value: unknown): value is Data {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function oneOf(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value);
}

/** Drop the Firestore timestamps; the app works from `createdAtMs`/`updatedAtMs`. */
function body(data: Data): Data {
  const { createdAt: _c, updatedAt: _u, id: _id, ...rest } = data;
  return rest;
}

function base(id: string, data: Data, fy?: FinancialYearKey): Data | null {
  if (!isValidTaxIdSegment(id) || !isMap(data) || !isFinancialYearKey(data.fy)) return null;
  if (fy !== undefined && data.fy !== fy) return null;
  return body(data);
}

export function taxEntryFromDoc(id: string, data: Data, fy?: FinancialYearKey): TaxEntry | null {
  const d = base(id, data, fy);
  if (!d || !oneOf(TAX_ENTRY_KINDS, d.kind) || !isMap(d.fields)) return null;
  return { ...d, id } as unknown as TaxEntry;
}

export function taxReviewFromDoc(id: string, data: Data, fy?: FinancialYearKey): TaxReview | null {
  const d = base(id, data, fy);
  if (!d || !isTaxSourceKind(d.sourceKind) || !oneOf(TAX_REVIEW_DECISIONS, d.decision)) return null;
  return { ...d, id } as unknown as TaxReview;
}

export function taxProfileFromDoc(id: string, data: Data): TaxProfile | null {
  const d = base(id, data);
  if (!d || d.fy !== id) return null;
  return { ...d, id } as unknown as TaxProfile;
}

export function taxDocumentFromDoc(id: string, data: Data, fy?: FinancialYearKey): TaxDocument | null {
  const d = base(id, data, fy);
  if (!d || !oneOf(TAX_DOCUMENT_CATEGORIES, d.category) || typeof d.storagePath !== "string") return null;
  return { ...d, id } as unknown as TaxDocument;
}

export function taxSnapshotFromDoc(id: string, data: Data, fy?: FinancialYearKey): TaxSnapshot | null {
  const d = base(id, data, fy);
  if (!d || !isMap(d.outputs)) return null;
  return { ...d, id } as unknown as TaxSnapshot;
}

/** Oldest first, then by id, so lists don't jump between renders. */
export function sortByCreated<T extends { id: string; createdAtMs: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.createdAtMs - b.createdAtMs || a.id.localeCompare(b.id));
}

/** Rows of one year (the read-model copy holds every year). */
export function inTaxYear(fy: FinancialYearKey) {
  return (doc: { data: Data }) => doc.data.fy === fy;
}
