import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  serverTimestamp,
  type Firestore,
} from "firebase/firestore";
import { CATEGORY_TAXONOMY, mapLegacyExpense } from "@/shared/data/categoryTaxonomy";

const HIERARCHY_FLAG = "categoryHierarchyVersion";
export const CATEGORY_HIERARCHY_VERSION = 1;

const LEGACY_FLAT = new Set([
  "Food",
  "Rent",
  "Travel",
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

function needsLegacyRemap(category: unknown): boolean {
  return typeof category === "string" && LEGACY_FLAT.has(category);
}

/**
 * Seeds Category → Subcategory docs and migrates flat expenses.
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

  if (currentVersion === CATEGORY_HIERARCHY_VERSION) {
    return;
  }

  const categoriesSnap = await getDocs(collection(db, "users", uid, "categories"));
  const existing = categoriesSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as { name?: string; kind?: string; parentId?: string | null }),
  }));

  const hasHierarchy = existing.some(
    (c) => c.kind === "subcategory" || (c.parentId != null && c.parentId !== "")
  );

  const customFlat = existing.filter(
    (c) =>
      c.kind !== "category" &&
      c.kind !== "subcategory" &&
      !CATEGORY_TAXONOMY.some((t) => t.name === c.name)
  );

  if (!hasHierarchy) {
    let batch = writeBatch(db);
    let ops = 0;

    const flush = async () => {
      if (ops === 0) return;
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    };

    for (let i = 0; i < CATEGORY_TAXONOMY.length; i++) {
      const node = CATEGORY_TAXONOMY[i];
      const parentRef = doc(collection(db, "users", uid, "categories"));
      batch.set(parentRef, {
        name: node.name,
        kind: "category",
        parentId: null,
        icon: node.icon,
        isDefault: true,
        isArchived: false,
        sortOrder: i,
        createdAt: serverTimestamp(),
      });
      ops++;
      if (ops >= 400) await flush();

      for (let j = 0; j < node.subcategories.length; j++) {
        const subRef = doc(collection(db, "users", uid, "categories"));
        batch.set(subRef, {
          name: node.subcategories[j],
          kind: "subcategory",
          parentId: parentRef.id,
          isDefault: true,
          isArchived: false,
          sortOrder: j,
          createdAt: serverTimestamp(),
        });
        ops++;
        if (ops >= 400) await flush();
      }
    }

    for (const custom of customFlat) {
      if (!custom.name) continue;
      const parentRef = doc(collection(db, "users", uid, "categories"));
      batch.set(parentRef, {
        name: custom.name,
        kind: "category",
        parentId: null,
        icon: "📦",
        isDefault: false,
        isArchived: false,
        sortOrder: 1000,
        createdAt: serverTimestamp(),
      });
      ops++;
      if (ops >= 400) await flush();

      const subRef = doc(collection(db, "users", uid, "categories"));
      batch.set(subRef, {
        name: "Other",
        kind: "subcategory",
        parentId: parentRef.id,
        isDefault: false,
        isArchived: false,
        sortOrder: 0,
        createdAt: serverTimestamp(),
      });
      ops++;
      if (ops >= 400) await flush();
    }

    for (const old of existing) {
      batch.delete(doc(db, "users", uid, "categories", old.id));
      ops++;
      if (ops >= 400) await flush();
    }

    await flush();
  }

  const expensesSnap = await getDocs(collection(db, "users", uid, "expenses"));
  let batch = writeBatch(db);
  let ops = 0;

  for (const expenseDoc of expensesSnap.docs) {
    const data = expenseDoc.data();
    const hasSub =
      typeof data.subcategory === "string" && data.subcategory.length > 0;

    if (hasSub && !needsLegacyRemap(data.category)) {
      continue;
    }

    const mapped = mapLegacyExpense(
      (data.category as string) || "Other",
      (data.note as string) || ""
    );
    batch.update(expenseDoc.ref, {
      category: mapped.category,
      subcategory: mapped.subcategory,
      tags: Array.isArray(data.tags) ? data.tags : [],
    });
    ops++;

    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();

  await setDoc(
    metaRef,
    { [HIERARCHY_FLAG]: CATEGORY_HIERARCHY_VERSION, migratedAt: serverTimestamp() },
    { merge: true }
  );
}
