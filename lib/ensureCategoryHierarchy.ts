import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
  type Firestore,
  type WriteBatch,
} from "firebase/firestore";
import {
  CATEGORY_TAXONOMY,
  V1_PARENT_MAP,
  mapToV4Category,
} from "@/shared/data/categoryTaxonomy";
import {
  FIRESTORE_WRITE_BATCH_LIMIT,
  planDefaultTaxonomyUpsert,
  shouldFlushBatch,
  taxonomyDocsNeedUpsert,
  type PlannedCategoryDoc,
} from "@/shared/data/categoryHierarchyPlan";

const HIERARCHY_FLAG = "categoryHierarchyVersion";
export const CATEGORY_HIERARCHY_VERSION = 4;

type CategoryDoc = PlannedCategoryDoc;
const inFlightByUid = new Map<string, Promise<void>>();

function mappedEquals(
  currentCategory: unknown,
  currentSubcategory: unknown,
  mapped: { category: string; subcategory: string }
): boolean {
  return currentCategory === mapped.category && currentSubcategory === mapped.subcategory;
}

/**
 * Seeds Category → Subcategory docs and migrates expenses onto the current taxonomy.
 * Safe to call on every login. Re-runs if stored defaults still drift from the
 * current tree, even when the version stamp is already current.
 */
export async function ensureCategoryHierarchy(
  db: Firestore,
  uid: string
): Promise<void> {
  const pending = inFlightByUid.get(uid);
  if (pending) return pending;
  const work = ensureCategoryHierarchyOnce(db, uid).finally(() => {
    inFlightByUid.delete(uid);
  });
  inFlightByUid.set(uid, work);
  return work;
}

async function ensureCategoryHierarchyOnce(
  db: Firestore,
  uid: string
): Promise<void> {
  const metaRef = doc(db, "users", uid, "meta", "categories");
  const metaSnap = await getDoc(metaRef);
  const currentVersion = metaSnap.exists()
    ? (metaSnap.data()?.[HIERARCHY_FLAG] as number | undefined)
    : undefined;
  const version = currentVersion ?? 0;

  const categoriesSnap = await getDocs(collection(db, "users", uid, "categories"));
  const existing: CategoryDoc[] = categoriesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CategoryDoc, "id">),
  }));
  const needsDocs = taxonomyDocsNeedUpsert(existing);

  const hasHierarchy = existing.some(
    (c) => c.kind === "subcategory" || (c.parentId != null && c.parentId !== "")
  );

  if (version >= CATEGORY_HIERARCHY_VERSION && !needsDocs) {
    return;
  }

  if (version === 0 && existing.length === 0) {
    await upsertDefaultTaxonomy(db, uid, []);
    await stampVersion(db, uid);
    return;
  }

  if (version < 2 && !hasHierarchy) {
    const writer = createBatchWriter(db);
    for (const old of existing) {
      writer.delete(doc(db, "users", uid, "categories", old.id));
      await writer.maybeFlush();
    }
    await writer.flush();
    await upsertDefaultTaxonomy(db, uid, []);
    await remapAllNamedPairsToV4(db, uid);
    await stampVersion(db, uid);
    return;
  }

  await upsertDefaultTaxonomy(db, uid, existing);
  await reparentCustomSubsOntoMappedParents(db, uid);
  await remapAllNamedPairsToV4(db, uid);
  await stampVersion(db, uid);
}

async function stampVersion(db: Firestore, uid: string) {
  await setDoc(
    doc(db, "users", uid, "meta", "categories"),
    { [HIERARCHY_FLAG]: CATEGORY_HIERARCHY_VERSION, migratedAt: serverTimestamp() },
    { merge: true }
  );
}

function createBatchWriter(db: Firestore) {
  let batch: WriteBatch = writeBatch(db);
  let ops = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = writeBatch(db);
    ops = 0;
  };

  const withoutUndefined = (data: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined)
    );

  return {
    set(
      ref: ReturnType<typeof doc>,
      data: Record<string, unknown>,
      merge = false
    ) {
      const payload = withoutUndefined(data);
      if (merge) batch.set(ref, payload, { merge: true });
      else batch.set(ref, payload);
      ops++;
    },
    update(ref: ReturnType<typeof doc>, data: Record<string, unknown>) {
      batch.update(ref, data);
      ops++;
    },
    delete(ref: ReturnType<typeof doc>) {
      batch.delete(ref);
      ops++;
    },
    async maybeFlush() {
      if (shouldFlushBatch(ops, FIRESTORE_WRITE_BATCH_LIMIT)) await flush();
    },
    flush,
  };
}

type BatchWriter = ReturnType<typeof createBatchWriter>;

async function upsertDefaultTaxonomy(
  db: Firestore,
  uid: string,
  existing: CategoryDoc[]
): Promise<void> {
  const plan = planDefaultTaxonomyUpsert(existing, CATEGORY_TAXONOMY);
  const allocated = new Map<string, string>();
  const writer = createBatchWriter(db);

  const resolveId = (id: string) => {
    if (!id.startsWith("new:")) return id;
    const already = allocated.get(id);
    if (already) return already;
    const next = doc(collection(db, "users", uid, "categories")).id;
    allocated.set(id, next);
    return next;
  };

  for (const write of plan.writes) {
    if (write.op === "create") {
      const id = resolveId(write.id);
      const parentId =
        write.data.parentId == null ? null : resolveId(write.data.parentId);
      writer.set(doc(db, "users", uid, "categories", id), {
        name: write.data.name,
        kind: write.data.kind,
        parentId,
        icon: write.data.icon ?? null,
        semanticKey: write.data.semanticKey,
        isDefault: true,
        isArchived: false,
        isHidden: write.data.isHidden,
        sortOrder: write.data.sortOrder,
        createdAt: serverTimestamp(),
      });
    } else if (write.op === "update") {
      const parentId =
        write.data.parentId == null || write.data.parentId === undefined
          ? undefined
          : resolveId(write.data.parentId);
      writer.set(
        doc(db, "users", uid, "categories", write.id),
        {
          name: write.data.name,
          semanticKey: write.data.semanticKey,
          isHidden: write.data.isHidden,
          isArchived: false,
          sortOrder: write.data.sortOrder,
          ...(write.data.icon !== undefined ? { icon: write.data.icon } : {}),
          ...(parentId !== undefined ? { parentId } : {}),
        },
        true
      );
    } else {
      writer.set(
        doc(db, "users", uid, "categories", write.id),
        { isArchived: true },
        true
      );
    }
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function reparentCustomSubsOntoMappedParents(db: Firestore, uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "categories"));
  const docs: CategoryDoc[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CategoryDoc, "id">),
  }));
  const byId = new Map(docs.map((d) => [d.id, d]));
  const defaultParentsByName = new Map<string, string>();
  for (const item of docs) {
    if (item.isDefault === false) continue;
    if (item.kind === "subcategory") continue;
    if (item.parentId) continue;
    if (item.isArchived) continue;
    if (item.name) defaultParentsByName.set(item.name, item.id);
  }

  const writer = createBatchWriter(db);
  for (const item of docs) {
    if (item.isDefault !== false || item.kind !== "subcategory" || !item.parentId) continue;
    const parent = byId.get(item.parentId);
    if (parent && !parent.isArchived) continue;
    const oldName = parent?.name ?? "";
    const mappedParent =
      mapToV4Category(oldName, undefined)?.category ??
      V1_PARENT_MAP[oldName]?.category ??
      oldName;
    const newParentId = defaultParentsByName.get(mappedParent);
    if (!newParentId || newParentId === item.parentId) continue;
    writer.set(
      doc(db, "users", uid, "categories", item.id),
      { parentId: newParentId },
      true
    );
    await writer.maybeFlush();
  }
  await writer.flush();
}

async function remapAllNamedPairsToV4(db: Firestore, uid: string) {
  await remapExpenses(db, uid);
  await remapNamedPairs(db, uid, "categoryBudgets");
  await remapNamedPairs(db, uid, "categorizationRules");
  await remapSubscriptions(db, uid);
  await remapTripCategoryBudgets(db, uid);
  await remapDefaultCategorySetting(db, uid);
}

async function remapExpenses(db: Firestore, uid: string) {
  const expensesSnap = await getDocs(collection(db, "users", uid, "expenses"));
  const writer = createBatchWriter(db);

  for (const expenseDoc of expensesSnap.docs) {
    const data = expenseDoc.data();
    const mapped = mapToV4Category(
      (data.category as string) || "Miscellaneous",
      typeof data.subcategory === "string" ? data.subcategory : "",
      (data.note as string) || ""
    );
    if (!mapped) continue;
    if (mappedEquals(data.category, data.subcategory, mapped)) continue;

    writer.update(expenseDoc.ref, {
      category: mapped.category,
      subcategory: mapped.subcategory,
      tags: Array.isArray(data.tags) ? data.tags : [],
    });
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function remapNamedPairs(
  db: Firestore,
  uid: string,
  subcollection: "categoryBudgets" | "categorizationRules"
) {
  const snap = await getDocs(collection(db, "users", uid, subcollection));
  const writer = createBatchWriter(db);

  for (const row of snap.docs) {
    const data = row.data();
    const category = typeof data.category === "string" ? data.category : "";
    if (!category) continue;
    const subcategory =
      typeof data.subcategory === "string" ? data.subcategory : undefined;
    const mapped = mapToV4Category(category, subcategory);
    if (!mapped) continue;
    if (mappedEquals(data.category, data.subcategory ?? "", mapped)) continue;

    writer.update(row.ref, {
      category: mapped.category,
      subcategory: mapped.subcategory,
    });
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function remapSubscriptions(db: Firestore, uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "subscriptions"));
  const writer = createBatchWriter(db);

  for (const row of snap.docs) {
    const data = row.data();
    const category = typeof data.category === "string" ? data.category : "";
    if (!category) continue;
    const mapped = mapToV4Category(category, undefined);
    if (!mapped) continue;
    if (mapped.category === category) continue;
    writer.update(row.ref, { category: mapped.category });
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function remapTripCategoryBudgets(db: Firestore, uid: string) {
  const snap = await getDocs(collection(db, "users", uid, "trips"));
  const writer = createBatchWriter(db);

  for (const row of snap.docs) {
    const data = row.data();
    const budgets = data.categoryBudgets;
    if (!Array.isArray(budgets) || budgets.length === 0) continue;

    let changed = false;
    const next = budgets.map((item: { category?: string; limit?: number }) => {
      if (typeof item?.category !== "string") return item;
      const mapped = mapToV4Category(item.category, undefined);
      if (!mapped || mapped.category === item.category) return item;
      changed = true;
      return { ...item, category: mapped.category };
    });

    if (!changed) continue;
    writer.update(row.ref, { categoryBudgets: next });
    await writer.maybeFlush();
  }

  await writer.flush();
}

async function remapDefaultCategorySetting(db: Firestore, uid: string) {
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;

  const current = userSnap.data()?.defaultCategory;
  if (typeof current !== "string" || !current.trim()) return;

  const mapped = mapToV4Category(current, undefined);
  if (!mapped || mapped.category === current) return;

  await setDoc(userRef, { defaultCategory: mapped.category }, { merge: true });
}
