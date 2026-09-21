import {
  CATEGORY_TAXONOMY,
  V3_PARENT_KEY_ALIASES,
  V3_SUB_KEY_ALIASES,
  type TaxonomyNode,
} from "./categoryTaxonomy";

export const FIRESTORE_WRITE_BATCH_LIMIT = 400;

export function shouldFlushBatch(
  ops: number,
  limit = FIRESTORE_WRITE_BATCH_LIMIT
): boolean {
  return ops >= limit;
}

export type PlannedCategoryDoc = {
  id: string;
  name?: string;
  kind?: string;
  parentId?: string | null;
  isDefault?: boolean;
  isArchived?: boolean;
  isHidden?: boolean;
  semanticKey?: string;
  icon?: string;
  sortOrder?: number;
};

export type TaxonomyWriteOp =
  | {
      op: "create";
      id: string;
      data: {
        name: string;
        kind: "category" | "subcategory";
        parentId: string | null;
        icon?: string;
        semanticKey: string;
        isDefault: true;
        isArchived: false;
        isHidden: boolean;
        sortOrder: number;
      };
    }
  | {
      op: "update";
      id: string;
      data: {
        name: string;
        icon?: string;
        semanticKey: string;
        isHidden: boolean;
        isArchived: false;
        sortOrder: number;
        parentId?: string;
      };
    }
  | { op: "archive"; id: string };

export type TaxonomyUpsertPlan = {
  writes: TaxonomyWriteOp[];
  skippedCustomParentKeys: string[];
};

function isCustomDoc(doc: PlannedCategoryDoc): boolean {
  return doc.isDefault === false;
}

function isDefaultDoc(doc: PlannedCategoryDoc): boolean {
  return !isCustomDoc(doc);
}

function fieldsUnchanged(
  existing: PlannedCategoryDoc,
  next: {
    name: string;
    semanticKey: string;
    isHidden: boolean;
    sortOrder: number;
    icon?: string;
    parentId?: string | null;
  }
): boolean {
  if ((existing.name ?? "") !== next.name) return false;
  if ((existing.semanticKey ?? "") !== next.semanticKey) return false;
  if (!!existing.isHidden !== next.isHidden) return false;
  if ((existing.sortOrder ?? 0) !== next.sortOrder) return false;
  if (existing.isArchived) return false;
  if (next.icon != null && (existing.icon ?? "") !== next.icon) return false;
  if (next.parentId !== undefined && (existing.parentId ?? null) !== next.parentId) {
    return false;
  }
  return true;
}

function parentAliasNames(node: TaxonomyNode): string[] {
  const aliases = V3_PARENT_KEY_ALIASES[node.key] ?? [];
  return [...new Set([node.name, ...aliases])];
}

function matchDefaultParent(
  node: TaxonomyNode,
  defaultParents: PlannedCategoryDoc[],
  claimed: Set<string>
): PlannedCategoryDoc | undefined {
  const byKey = defaultParents.find(
    (doc) => !claimed.has(doc.id) && doc.semanticKey === node.key
  );
  if (byKey) return byKey;

  const names = new Set(parentAliasNames(node).map((n) => n.toLowerCase()));
  return defaultParents.find(
    (doc) => !claimed.has(doc.id) && names.has((doc.name ?? "").toLowerCase())
  );
}

function matchDefaultSub(
  parentKey: string,
  sub: { key: string; name: string },
  defaultSubs: PlannedCategoryDoc[],
  claimed: Set<string>
): PlannedCategoryDoc | undefined {
  const byKey = defaultSubs.find(
    (doc) => !claimed.has(doc.id) && doc.semanticKey === sub.key
  );
  if (byKey) return byKey;

  const aliases = V3_SUB_KEY_ALIASES[parentKey] ?? {};
  const names = new Set<string>([sub.name.toLowerCase()]);
  for (const [oldName, key] of Object.entries(aliases)) {
    if (key === sub.key) names.add(oldName.toLowerCase());
  }
  return defaultSubs.find(
    (doc) => !claimed.has(doc.id) && names.has((doc.name ?? "").toLowerCase())
  );
}

/**
 * True when stored defaults still need creates/renames/archives vs the current taxonomy.
 */
export function taxonomyDocsNeedUpsert(
  existing: PlannedCategoryDoc[],
  taxonomy: TaxonomyNode[] = CATEGORY_TAXONOMY
): boolean {
  return planDefaultTaxonomyUpsert(existing, taxonomy).writes.length > 0;
}

/**
 * Pure v4 upsert planner. Does not touch custom (`isDefault === false`) docs.
 * Create ids are deterministic placeholders (`new:parent:key` / `new:sub:parent:sub`).
 */
export function planDefaultTaxonomyUpsert(
  existing: PlannedCategoryDoc[],
  taxonomy: TaxonomyNode[] = CATEGORY_TAXONOMY
): TaxonomyUpsertPlan {
  const writes: TaxonomyWriteOp[] = [];
  const skippedCustomParentKeys: string[] = [];
  const keepIds = new Set<string>();
  const claimedParents = new Set<string>();
  const customParents = existing.filter(
    (doc) =>
      isCustomDoc(doc) &&
      (doc.kind ?? "category") !== "subcategory" &&
      (doc.parentId == null || doc.parentId === "")
  );
  const customParentNames = new Set(
    customParents.map((doc) => (doc.name ?? "").trim().toLowerCase()).filter(Boolean)
  );
  const defaultParents = existing.filter(
    (doc) =>
      isDefaultDoc(doc) &&
      (doc.kind ?? "category") !== "subcategory" &&
      (doc.parentId == null || doc.parentId === "")
  );

  for (let i = 0; i < taxonomy.length; i++) {
    const node = taxonomy[i];
    if (customParentNames.has(node.name.toLowerCase())) {
      skippedCustomParentKeys.push(node.key);
      continue;
    }

    const matched = matchDefaultParent(node, defaultParents, claimedParents);
    const parentId = matched?.id ?? `new:parent:${node.key}`;
    if (matched) claimedParents.add(matched.id);
    keepIds.add(parentId);

    const parentData = {
      name: node.name,
      icon: node.icon,
      semanticKey: node.key,
      isHidden: !!node.hidden,
      sortOrder: i,
    };

    if (!matched) {
      writes.push({
        op: "create",
        id: parentId,
        data: {
          ...parentData,
          kind: "category",
          parentId: null,
          isDefault: true,
          isArchived: false,
        },
      });
    } else if (!fieldsUnchanged(matched, parentData)) {
      writes.push({
        op: "update",
        id: matched.id,
        data: { ...parentData, isArchived: false },
      });
    }

    const defaultSubs = existing.filter(
      (doc) =>
        isDefaultDoc(doc) &&
        doc.kind === "subcategory" &&
        doc.parentId === (matched?.id ?? "__none__")
    );
    const claimedSubs = new Set<string>();

    for (let j = 0; j < node.subcategories.length; j++) {
      const sub = node.subcategories[j];
      const matchedSub = matched
        ? matchDefaultSub(node.key, sub, defaultSubs, claimedSubs)
        : undefined;
      const subId = matchedSub?.id ?? `new:sub:${node.key}:${sub.key}`;
      if (matchedSub) claimedSubs.add(matchedSub.id);
      keepIds.add(subId);

      const subData = {
        name: sub.name,
        semanticKey: sub.key,
        isHidden: false,
        sortOrder: j,
        parentId,
      };

      if (!matchedSub) {
        writes.push({
          op: "create",
          id: subId,
          data: {
            ...subData,
            kind: "subcategory",
            isDefault: true,
            isArchived: false,
          },
        });
      } else if (!fieldsUnchanged(matchedSub, subData)) {
        writes.push({
          op: "update",
          id: matchedSub.id,
          data: { ...subData, isArchived: false },
        });
      }
    }
  }

  for (const doc of existing) {
    if (!isDefaultDoc(doc) || doc.isArchived) continue;
    if (keepIds.has(doc.id)) continue;
    writes.push({ op: "archive", id: doc.id });
  }

  return { writes, skippedCustomParentKeys };
}

export function applyTaxonomyWrites(
  existing: PlannedCategoryDoc[],
  plan: TaxonomyUpsertPlan
): PlannedCategoryDoc[] {
  const byId = new Map(existing.map((doc) => [doc.id, { ...doc }]));
  for (const write of plan.writes) {
    if (write.op === "create") {
      byId.set(write.id, {
        id: write.id,
        ...write.data,
      });
    } else if (write.op === "update") {
      const current = byId.get(write.id);
      if (!current) continue;
      byId.set(write.id, { ...current, ...write.data });
    } else {
      const current = byId.get(write.id);
      if (!current) continue;
      byId.set(write.id, { ...current, isArchived: true });
    }
  }
  return [...byId.values()];
}

export function countExpenseRemaps(
  expenses: Array<{ category?: string; subcategory?: string }>,
  mapPair: (
    category: string,
    subcategory?: string
  ) => { category: string; subcategory: string } | null
): number {
  let count = 0;
  for (const expense of expenses) {
    const category = expense.category || "";
    if (!category) continue;
    const mapped = mapPair(category, expense.subcategory);
    if (!mapped) continue;
    if (mapped.category === expense.category && mapped.subcategory === (expense.subcategory ?? "")) {
      continue;
    }
    count += 1;
  }
  return count;
}
