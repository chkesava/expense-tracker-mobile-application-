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
  mapLegacyExpense,
  mapToV2Category,
  V1_PARENT_MAP,
} from "@/shared/data/categoryTaxonomy";

const HIERARCHY_FLAG = "categoryHierarchyVersion";
export const CATEGORY_HIERARCHY_VERSION = 2;

const LEGACY_FLAT = new Set([
  "Food",
  "Rent",
  "Travel",
  "Transport",
  "Accommodation",
  "Shopping",
  "Utilities",
  "Entertainment",
  "Electrical",
  "Health",
  "Education",
  "Gifts",
  "Subscriptions",
  "Insurance",
  "Brother Related",
  "Mother Related",
  "EMIS",
  "Other",
  "Uncategorized",
  "Grocery",
  "Groceries",
  "Petrol",
  "Cool Drinks",
]);

type CategoryDoc = {
  id: string;
  name?: string;
  kind?: string;
  parentId?: string | null;
  isDefault?: boolean;
};

function needsLegacyRemap(category: unknown): boolean {
  return typeof category === "string" && LEGACY_FLAT.has(category);
}

function isCustomDoc(c: CategoryDoc): boolean {
  return c.isDefault === false;
}

function mappedEquals(
  currentCategory: unknown,
  currentSubcategory: unknown,
  mapped: { category: string; subcategory: string }
): boolean {
  return currentCategory === mapped.category && currentSubcategory === mapped.subcategory;
}

/**
 * Seeds Category → Subcategory docs and migrates expenses onto the current taxonomy.
 * Safe to call on every login; no-ops when already at current version.
 */
export async function ensureCategoryHierarchy(
  db: Firestore,
  uid: string
): Promise<void> {
  const metaRef = doc(db, "users", uid, "meta", "categories");
  const metaSnap = await getDoc(metaRef);
  const currentVersion = metaSnap.exists()
    ? (metaSnap.data()?.[HIERARCHY_FLAG] as number | undefined)
    : undefined;

  if ((currentVersion ?? 0) >= CATEGORY_HIERARCHY_VERSION) {
    return;
  }

  const categoriesSnap = await getDocs(collection(db, "users", uid, "categories"));
  const existing: CategoryDoc[] = categoriesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CategoryDoc, "id">),
  }));

  const hasHierarchy = existing.some(
    (c) => c.kind === "subcategory" || (c.parentId != null && c.parentId !== "")
  );

  const writer = createBatchWriter(db);

  if (!hasHierarchy) {
    const customFlat = existing.filter(
      (c) =>
        c.kind !== "category" &&
        c.kind !== "subcategory" &&
        !CATEGORY_TAXONOMY.some((t) => t.name === c.name)
    );

    await seedDefaultTaxonomy(writer, db, uid);
    await seedCustomFlatParents(writer, db, uid, customFlat);
    for (const old of existing) {
      writer.delete(doc(db, "users", uid, "categories", old.id));
    }
    await writer.flush();
  } else {
    const customDocs = existing.filter(isCustomDoc);
    const defaultDocs = existing.filter((c) => !isCustomDoc(c));
    const deletedParentIdToName = new Map<string, string>();
    for (const old of defaultDocs) {
      if (old.kind !== "subcategory" && (old.parentId == null || old.parentId === "")) {
        if (old.name) deletedParentIdToName.set(old.id, old.name);
      }
    }

    const newParentIds = await seedDefaultTaxonomy(writer, db, uid);

    for (const custom of customDocs) {
      if (custom.kind !== "subcategory" || !custom.parentId) continue;
      const oldParentName = deletedParentIdToName.get(custom.parentId);
      if (!oldParentName) continue;
      const mappedParent =
        V1_PARENT_MAP[oldParentName]?.category ??
        (CATEGORY_TAXONOMY.some((t) => t.name === oldParentName) ? oldParentName : null);
      if (!mappedParent) continue;
      const newParentId = newParentIds.get(mappedParent);
      if (!newParentId || newParentId === custom.parentId) continue;
      writer.set(
        doc(db, "users", uid, "categories", custom.id),
        { parentId: newParentId },
        true
      );
    }

    for (const old of defaultDocs) {
      writer.delete(doc(db, "users", uid, "categories", old.id));
    }
    await writer.flush();
  }

  await remapExpenses(db, uid);
  await remapNamedPairs(db, uid, "categoryBudgets");
  await remapNamedPairs(db, uid, "categorizationRules");
  await remapSubscriptions(db, uid);
  await remapTripCategoryBudgets(db, uid);
  await remapDefaultCategorySetting(db, uid);

  await setDoc(
    metaRef,
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

  return {
    set(
      ref: ReturnType<typeof doc>,
      data: Record<string, unknown>,
      merge = false
    ) {
      if (merge) batch.set(ref, data, { merge: true });
      else batch.set(ref, data);
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
      if (ops >= 400) await flush();
    },
    flush,
  };
}

type BatchWriter = ReturnType<typeof createBatchWriter>;

async function seedDefaultTaxonomy(
  writer: BatchWriter,
  db: Firestore,
  uid: string
): Promise<Map<string, string>> {
  const parentIds = new Map<string, string>();

  for (let i = 0; i < CATEGORY_TAXONOMY.length; i++) {
    const node = CATEGORY_TAXONOMY[i];
    const parentRef = doc(collection(db, "users", uid, "categories"));
    parentIds.set(node.name, parentRef.id);
    writer.set(parentRef, {
      name: node.name,
      kind: "category",
      parentId: null,
      icon: node.icon,
      isDefault: true,
      isArchived: false,
      sortOrder: i,
      createdAt: serverTimestamp(),
    });
    await writer.maybeFlush();

    for (let j = 0; j < node.subcategories.length; j++) {
      const subRef = doc(collection(db, "users", uid, "categories"));
      writer.set(subRef, {
        name: node.subcategories[j],
        kind: "subcategory",
        parentId: parentRef.id,
        isDefault: true,
        isArchived: false,
        sortOrder: j,
        createdAt: serverTimestamp(),
      });
      await writer.maybeFlush();
    }
  }

  return parentIds;
}

async function seedCustomFlatParents(
  writer: BatchWriter,
  db: Firestore,
  uid: string,
  customFlat: CategoryDoc[]
) {
  for (const custom of customFlat) {
    if (!custom.name) continue;
    const parentRef = doc(collection(db, "users", uid, "categories"));
    writer.set(parentRef, {
      name: custom.name,
      kind: "category",
      parentId: null,
      icon: "📦",
      isDefault: false,
      isArchived: false,
      sortOrder: 1000,
      createdAt: serverTimestamp(),
    });
    await writer.maybeFlush();

    const subRef = doc(collection(db, "users", uid, "categories"));
    writer.set(subRef, {
      name: "Other",
      kind: "subcategory",
      parentId: parentRef.id,
      isDefault: false,
      isArchived: false,
      sortOrder: 0,
      createdAt: serverTimestamp(),
    });
    await writer.maybeFlush();
  }
}

async function remapExpenses(db: Firestore, uid: string) {
  const expensesSnap = await getDocs(collection(db, "users", uid, "expenses"));
  const writer = createBatchWriter(db);

  for (const expenseDoc of expensesSnap.docs) {
    const data = expenseDoc.data();
    const category = (data.category as string) || "Other";
    const subcategory =
      typeof data.subcategory === "string" ? data.subcategory : "";
    const hasSub = subcategory.length > 0;

    let mapped = hasSub ? mapToV2Category(category, subcategory) : null;
    if (!mapped) {
      if (hasSub && !needsLegacyRemap(category) && mapToV2Category(category, undefined) == null) {
        continue;
      }
      mapped = mapLegacyExpense(category, (data.note as string) || "");
    }

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
    const mapped = mapToV2Category(category, subcategory);
    if (!mapped) continue;
    if (mappedEquals(data.category, data.subcategory ?? "", mapped)) continue;

    writer.update(row.ref, {
      category: mapped.category,
      ...(mapped.subcategory ? { subcategory: mapped.subcategory } : {}),
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
    const mapped = mapToV2Category(category, undefined);
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
      const mapped = mapToV2Category(item.category, undefined);
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

  const mapped = mapToV2Category(current, undefined);
  if (!mapped || mapped.category === current) return;

  await setDoc(userRef, { defaultCategory: mapped.category }, { merge: true });
}
