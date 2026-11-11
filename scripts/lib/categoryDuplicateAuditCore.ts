/**
 * SPENDLY-753 — the read-only Firestore ↔ Supabase category audit the ticket
 * requires before any dedup decision. Pure; Admin SDK / Supabase client
 * wiring lives in scripts/categoryDuplicateAudit.ts. Nothing here writes.
 *
 * Duplicate grouping reuses shared/utils/categoryModel.ts's normalization and
 * canonical-doc choice, so the proposed repair mapping agrees with what the
 * picker already shows as the one surviving row (SPENDLY-753 area C).
 */

import { dedupeByNormalizedName, normalizeCategoryName } from "../../shared/utils/categoryModel";

export type CategoryAuditDoc = {
  id: string;
  name: string;
  kind?: string;
  parentId?: string | null;
  semanticKey?: string;
  isDefault?: boolean;
  isArchived?: boolean;
  isHidden?: boolean;
  createdAt?: unknown;
};

export type DuplicateGroup = {
  key: string;
  name: string;
  /** Present only for a subcategory group. */
  parentId?: string;
  ids: string[];
};

export type CountsByStatus = {
  active: number;
  archived: number;
  hidden: number;
  default: number;
  custom: number;
};

export type CategoryAuditReport = {
  uid: string;
  firestore: { total: number; parents: number; subcategories: number; byStatus: CountsByStatus };
  supabase: { total: number; parents: number; subcategories: number; byStatus: CountsByStatus };
  duplicateParents: DuplicateGroup[];
  duplicateSubcategories: DuplicateGroup[];
  /** Firestore doc ids with no matching Supabase row. */
  missingFromSupabase: string[];
  /** Supabase row ids with no matching Firestore doc. */
  missingFromFirestore: string[];
  /** A doc whose kind/parentId/semanticKey looks inconsistent. */
  inconsistentMetadata: { id: string; issues: string[] }[];
};

function isParent(doc: Pick<CategoryAuditDoc, "kind" | "parentId">): boolean {
  return (doc.kind ?? "category") === "category" && !doc.parentId;
}

function countsByStatus(docs: readonly CategoryAuditDoc[]): CountsByStatus {
  return {
    active: docs.filter((d) => !d.isArchived).length,
    archived: docs.filter((d) => d.isArchived).length,
    hidden: docs.filter((d) => d.isHidden).length,
    default: docs.filter((d) => d.isDefault).length,
    custom: docs.filter((d) => !d.isDefault).length,
  };
}

function summarize(docs: readonly CategoryAuditDoc[]) {
  return {
    total: docs.length,
    parents: docs.filter(isParent).length,
    subcategories: docs.filter((d) => !isParent(d)).length,
    byStatus: countsByStatus(docs),
  };
}

/** Duplicate groups among ACTIVE docs only — archived records don't block a name. */
function duplicateGroups(docs: readonly CategoryAuditDoc[], scopeKey: (d: CategoryAuditDoc) => string): DuplicateGroup[] {
  const active = docs.filter((d) => !d.isArchived);
  const byGroup = new Map<string, CategoryAuditDoc[]>();
  for (const doc of active) {
    const key = `${scopeKey(doc)}::${normalizeCategoryName(doc.name ?? "")}`;
    const list = byGroup.get(key) ?? [];
    list.push(doc);
    byGroup.set(key, list);
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, list] of byGroup) {
    if (list.length < 2) continue;
    groups.push({
      key,
      name: list[0].name,
      parentId: list[0].parentId ?? undefined,
      ids: list.map((d) => d.id),
    });
  }
  return groups;
}

function metadataIssues(doc: CategoryAuditDoc): string[] {
  const issues: string[] = [];
  if (doc.kind !== "category" && doc.kind !== "subcategory" && doc.kind !== undefined) issues.push(`unknown kind "${doc.kind}"`);
  if ((doc.kind ?? "category") === "subcategory" && !doc.parentId) issues.push("subcategory with no parentId");
  if ((doc.kind ?? "category") === "category" && doc.parentId) issues.push("category with a parentId");
  if (doc.isDefault && !doc.semanticKey) issues.push("default doc with no semanticKey");
  return issues;
}

export function auditCategories(
  uid: string,
  firestoreDocs: readonly CategoryAuditDoc[],
  supabaseDocs: readonly CategoryAuditDoc[]
): CategoryAuditReport {
  const firestoreIds = new Set(firestoreDocs.map((d) => d.id));
  const supabaseIds = new Set(supabaseDocs.map((d) => d.id));
  return {
    uid,
    firestore: summarize(firestoreDocs),
    supabase: summarize(supabaseDocs),
    duplicateParents: duplicateGroups(
      firestoreDocs.filter(isParent),
      () => "parent"
    ),
    duplicateSubcategories: duplicateGroups(
      firestoreDocs.filter((d) => !isParent(d)),
      (d) => d.parentId ?? ""
    ),
    missingFromSupabase: firestoreDocs.filter((d) => !supabaseIds.has(d.id)).map((d) => d.id),
    missingFromFirestore: supabaseDocs.filter((d) => !firestoreIds.has(d.id)).map((d) => d.id),
    inconsistentMetadata: firestoreDocs
      .map((d) => ({ id: d.id, issues: metadataIssues(d) }))
      .filter((r) => r.issues.length > 0),
  };
}

export type RepairMapping = {
  key: string;
  name: string;
  parentId?: string;
  /** The doc this group's duplicates would be merged into — never chosen or applied here. */
  canonicalId: string;
  /** Every other doc in the group; a follow-up repair ticket decides what happens to them. */
  duplicateIds: string[];
};

/**
 * Read-only: which doc each duplicate group would keep, using the exact same
 * rule the picker's defensive dedupe already applies (prefer default, else
 * oldest, else lowest id) — never executed, never mutates anything.
 */
export function planDuplicateRepair(
  groups: readonly { ids: string[] }[],
  docsById: ReadonlyMap<string, CategoryAuditDoc>
): RepairMapping[] {
  return groups.map((group) => {
    const docs = group.ids.map((id) => docsById.get(id)).filter((d): d is CategoryAuditDoc => !!d);
    const winner = dedupeByNormalizedName(docs, () => "all")[0] ?? docs[0];
    const canonicalId = winner?.id ?? group.ids[0];
    return {
      key: winner ? normalizeCategoryName(winner.name ?? "") : "",
      name: winner?.name ?? "",
      parentId: winner?.parentId ?? undefined,
      canonicalId,
      duplicateIds: group.ids.filter((id) => id !== canonicalId),
    };
  });
}
