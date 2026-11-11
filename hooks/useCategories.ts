import { useCallback, useMemo } from "react";
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  type Firestore,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "@/lib/firestore";
import { noteCategoriesWritten } from "@/lib/categoryRevision";
import { stageMutationOps } from "@/lib/stageMutationOps";
import { dashboardOpsForRelabel, type DashboardRelabel } from "@/shared/utils/dashboardMutations";
import {
  categoryNameKey,
  cleanCategoryName,
  dedupeByNormalizedName,
  isCategoryNameTaken,
  isSubcategoryNameTaken,
  normalizeCategoryName,
  subcategoryNameKey,
} from "@/shared/utils/categoryModel";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { logDirectRead } from "@/lib/firestoreReadDebug";
import { useExpenses } from "@/hooks/useExpenses";
import { useReadModelMode } from "@/hooks/useReadModelSource";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";
import type { Category } from "@/shared/types/expense";
import { noteDirectWrites, trackedBatch, type TrackedBatch } from "@/lib/readModelWriteHooks";

/**
 * SPENDLY-753 — claim the renamed doc's new name-lock key and release its old
 * one (only if it had actually claimed one: a legacy doc predating this
 * change has neither field, and there is nothing to release). Mirrors
 * `buildEditGoal`'s claim/release for `goalNames`. Returns the field to stamp
 * on the category doc itself (`nameKey` for a parent, `subNameKey` for a sub).
 */
function applyCategoryNameLockRename(
  batch: TrackedBatch,
  db: Firestore,
  uid: string,
  cat: Pick<Category, "id" | "kind" | "parentId" | "nameKey" | "subNameKey">,
  trimmed: string
): Partial<Pick<Category, "nameKey" | "subNameKey">> {
  const isSub = cat.kind === "subcategory";
  const newKey = isSub ? subcategoryNameKey(cat.parentId ?? "", trimmed) : categoryNameKey(trimmed);
  const lockCollection = isSub ? "categorySubNames" : "categoryNames";
  const oldKey = isSub ? cat.subNameKey : cat.nameKey;
  if (oldKey && oldKey !== newKey) {
    batch.delete(doc(db, "users", uid, lockCollection, oldKey));
  }
  if (oldKey !== newKey) {
    batch.set(doc(db, "users", uid, lockCollection, newKey), {
      categoryId: cat.id,
      createdAtMs: Date.now(),
    });
  }
  return isSub ? { subNameKey: newKey } : { nameKey: newKey };
}

function isCategoryRenameTaken(
  cat: Pick<Category, "id" | "kind" | "parentId">,
  trimmed: string,
  categories: readonly Pick<Category, "id" | "name" | "kind" | "parentId" | "isArchived">[]
): boolean {
  return cat.kind === "subcategory"
    ? isSubcategoryNameTaken(cat.parentId ?? "", trimmed, categories, cat.id)
    : isCategoryNameTaken(trimmed, categories, cat.id);
}

/** The expense fields a category relabel needs for its dashboard delta. */
type RelabelSource = {
  category?: string;
  subcategory?: string;
  amount?: number;
  month?: string;
  date?: string;
  deletedAt?: unknown;
};

function relabelOf(
  data: RelabelSource,
  after: { category?: string; subcategory?: string }
): DashboardRelabel {
  return {
    amount: Number(data.amount) || 0,
    month: data.month,
    date: data.date,
    deletedAt: data.deletedAt,
    before: { category: data.category, subcategory: data.subcategory },
    after,
  };
}

export const useCategories = () => {
  const { user } = useAuth();
  const uid = user?.uid;
  const {
    categories,
    categoriesLoading: loading,
    categoriesError: error,
    retryCategories: retry,
    budgets,
    budgetsLoading,
  } = useExpenseReferenceData();
  const { expenses, complete: expensesComplete } = useExpenses();
  // SPENDLY-674 (R4.3a): these writers rewrite expenses and categories from
  // the lists on screen. From the on-device copy, they read Firestore instead:
  // the expenses through the existing query path, the categories once per write.
  const categoriesMode = useReadModelMode("categories");
  const expensesMode = useReadModelMode("expenses");
  const expensesInMemory = expensesComplete && expensesMode !== "supabase";
  const categoriesForWrite = async (db: Firestore): Promise<Category[]> => {
    if (categoriesMode !== "supabase" || !uid) return categories;
    // SPENDLY-753: no `limit` — a truncated read here risks an incomplete
    // rename/merge/delete (R4.3a: verify on Firestore before writing).
    const snap = await getDocs(query(collection(db, "users", uid, "categories")));
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Category));
  };

  const parentCategories = useMemo(() => {
    const active = categories
      .filter((c) => (c.kind ?? "category") === "category" && !c.parentId)
      .filter((c) => !c.isArchived);
    // SPENDLY-753: legacy duplicate parent docs (same name, different ids)
    // collapse to one canonical row. No Firestore doc is touched.
    return dedupeByNormalizedName(active, (c) => normalizeCategoryName(c.name)).sort((a, b) => {
      if (!!b.isFavorite !== !a.isFavorite) return a.isFavorite ? -1 : 1;
      return (
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
        a.name.localeCompare(b.name)
      );
    });
  }, [categories]);

  /** Parents shown in expense pickers (excludes hidden and income sink). */
  const visibleParents = useMemo(
    () =>
      parentCategories.filter(
        (c) => !c.isHidden && c.name !== "Income"
      ),
    [parentCategories]
  );

  const favoriteParents = useMemo(
    () => visibleParents.filter((c) => c.isFavorite),
    [visibleParents]
  );

  const getSubcategories = useCallback(
    (parentIdOrName: string, opts?: { includeHidden?: boolean }) => {
      // SPENDLY-753: resolve by id first (legacy references may point at a
      // duplicate), then fold in every OTHER active parent doc sharing that
      // normalized name — a prior exact-id/name lookup could silently land
      // on the "wrong" duplicate and show only its (possibly empty) subs.
      const byId = categories.find(
        (c) => c.id === parentIdOrName && (c.kind ?? "category") === "category"
      );
      const targetKey = normalizeCategoryName(byId ? byId.name : parentIdOrName);
      const parentIds = new Set(
        categories
          .filter((c) => (c.kind ?? "category") === "category" && !c.isArchived)
          .filter((c) => normalizeCategoryName(c.name) === targetKey)
          .map((c) => c.id)
      );
      if (parentIds.size === 0) return [];

      const subs = categories.filter(
        (c) =>
          c.kind === "subcategory" &&
          c.parentId != null &&
          parentIds.has(c.parentId) &&
          !c.isArchived &&
          (opts?.includeHidden || !c.isHidden)
      );

      return dedupeByNormalizedName(subs, (s) => normalizeCategoryName(s.name))
        .sort((a, b) => {
          if (!!b.isFavorite !== !a.isFavorite) return a.isFavorite ? -1 : 1;
          return (
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            a.name.localeCompare(b.name)
          );
        });
    },
    [categories]
  );

  const patchCategory = async (id: string, data: Partial<Category>) => {
    const db = getFirestoreDb();
    if (!uid || !db) return;
    // SPENDLY-660: start the write, then announce it (see noteCategoriesWritten).
    const write = updateDoc(doc(db, "users", uid, "categories", id), {
      ...data,
      updatedAt: serverTimestamp(),
    });
    noteCategoriesWritten(db, uid, [id]);
    await write;
  };

  const addCategory = async (
    name: string,
    options?: { createDefaultSub?: boolean; icon?: string; color?: string }
  ) => {
    const db = getFirestoreDb();
    const cleaned = cleanCategoryName(name);
    if (!uid || !db || !cleaned) return;
    if (isCategoryNameTaken(cleaned, categories)) {
      toast.error("That category already exists");
      return;
    }
    try {
      // SPENDLY-753: the category doc and its categoryNames/{nameKey} lock
      // land in one batch. A concurrent/retried duplicate name fails the
      // whole batch (the lock create is rejected as an update by rules) —
      // this check is just a fast local pre-check for a clear toast.
      const parentRef = doc(collection(db, "users", uid, "categories"));
      const nameKey = categoryNameKey(cleaned);
      let batch = trackedBatch(writeBatch(db));
      batch.set(parentRef, {
        name: cleaned,
        kind: "category",
        parentId: null,
        icon: options?.icon || "📦",
        color: options?.color || "#64748b",
        isDefault: false,
        isArchived: false,
        isHidden: false,
        isFavorite: false,
        sortOrder: 1000,
        nameKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, "users", uid, "categoryNames", nameKey), {
        categoryId: parentRef.id,
        createdAtMs: Date.now(),
      });
      const ids = [parentRef.id];

      if (options?.createDefaultSub !== false) {
        const subRef = doc(collection(db, "users", uid, "categories"));
        const subNameKey = subcategoryNameKey(parentRef.id, "Other");
        ids.push(subRef.id);
        batch.set(subRef, {
          name: "Other",
          kind: "subcategory",
          parentId: parentRef.id,
          isDefault: false,
          isArchived: false,
          isHidden: false,
          isFavorite: false,
          sortOrder: 0,
          subNameKey,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        batch.set(doc(db, "users", uid, "categorySubNames", subNameKey), {
          categoryId: subRef.id,
          createdAtMs: Date.now(),
        });
      }
      // SPENDLY-660: announce before awaiting, same ordering guarantee as before.
      noteCategoriesWritten(db, uid, ids);
      await batch.commit();

      toast.success("Category added");
      return parentRef.id;
    } catch (err) {
      logError("categories.addCategory", err);
      toast.error(
        isCategoryNameTaken(cleaned, categories) ? "That category already exists" : "Failed to add category"
      );
    }
  };

  const addSubcategory = async (parentId: string, name: string) => {
    const db = getFirestoreDb();
    const cleaned = cleanCategoryName(name);
    if (!uid || !db || !cleaned || !parentId) return;
    if (isSubcategoryNameTaken(parentId, cleaned, categories)) {
      toast.error("That subcategory already exists");
      return;
    }
    try {
      const subRef = doc(collection(db, "users", uid, "categories"));
      const subNameKey = subcategoryNameKey(parentId, cleaned);
      const batch = trackedBatch(writeBatch(db));
      batch.set(subRef, {
        name: cleaned,
        kind: "subcategory",
        parentId,
        isDefault: false,
        isArchived: false,
        isHidden: false,
        isFavorite: false,
        sortOrder: 100,
        subNameKey,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(doc(db, "users", uid, "categorySubNames", subNameKey), {
        categoryId: subRef.id,
        createdAtMs: Date.now(),
      });
      noteCategoriesWritten(db, uid, [subRef.id]);
      await batch.commit();
      toast.success("Subcategory added");
    } catch (err) {
      logError("categories.addSubcategory", err);
      toast.error(
        isSubcategoryNameTaken(parentId, cleaned, categories) ? "That subcategory already exists" : "Failed to add subcategory"
      );
    }
  };

  const updateCategory = async (id: string, newName: string) => {
    const db = getFirestoreDb();
    const trimmed = cleanCategoryName(newName);
    if (!uid || !db || !trimmed) return;
    const all = await categoriesForWrite(db);
    const cat = all.find((c) => c.id === id);
    if (!cat) return;
    if (cat.name !== trimmed && isCategoryRenameTaken(cat, trimmed, all)) {
      toast.error("That name already exists");
      return;
    }
    try {
      const batch = trackedBatch(writeBatch(db));
      const lockField = applyCategoryNameLockRename(batch, db, uid, cat, trimmed);
      batch.update(doc(db, "users", uid, "categories", id), {
        name: trimmed,
        updatedAt: serverTimestamp(),
        ...lockField,
      });
      noteCategoriesWritten(db, uid, [id]);
      await batch.commit();
      toast.success("Category updated");
    } catch (err) {
      logError("categories.updateCategory", err);
      toast.error(isCategoryRenameTaken(cat, trimmed, all) ? "That name already exists" : "Failed to update category");
    }
  };

  /** Rename and rewrite matching expense category/subcategory strings. */
  const renameCategory = async (
    id: string,
    newName: string,
    rewriteExpenses = true
  ) => {
    const db = getFirestoreDb();
    const trimmed = cleanCategoryName(newName);
    if (!uid || !db || !trimmed) return;
    const all = await categoriesForWrite(db);
    const cat = all.find((c) => c.id === id);
    if (!cat) return;
    const oldName = cat.name;
    if (oldName === trimmed) return;
    if (isCategoryRenameTaken(cat, trimmed, all)) {
      toast.error("That name already exists");
      return;
    }

    try {
      const renameBatch = trackedBatch(writeBatch(db));
      const lockField = applyCategoryNameLockRename(renameBatch, db, uid, cat, trimmed);
      renameBatch.update(doc(db, "users", uid, "categories", id), {
        name: trimmed,
        updatedAt: serverTimestamp(),
        ...lockField,
      });
      noteCategoriesWritten(db, uid, [id]);
      await renameBatch.commit();

      if (rewriteExpenses) {
        // SPENDLY-98: only skip the read when the in-memory ledger is the
        // whole history. On the staged page this rewrote 300 rows and left
        // every older expense on the old category name — silently, and with
        // no later pass to repair it.
        const rows = expensesInMemory
          ? expenses.map((expense) => ({
              id: expense.id,
              data: expense,
            }))
          : await (async () => {
              const q =
                cat.kind === "subcategory"
                  ? query(
                      collection(db, "users", uid, "expenses"),
                      where("subcategory", "==", oldName)
                    )
                  : query(
                      collection(db, "users", uid, "expenses"),
                      where("category", "==", oldName)
                    );
              const snap = await getDocs(q);
              logDirectRead(`users/${uid}/expenses`, snap.docs.length, "server", {
                feature: "categories",
                queryShape: cat.kind === "subcategory" ? "where(subcategory)" : "where(category)",
              });
              return snap.docs.map((expenseDoc) => ({
                id: expenseDoc.id,
                data: expenseDoc.data() as {
                  category?: string;
                  subcategory?: string;
                },
              }));
            })();
        let batch = trackedBatch(writeBatch(db));
        let ops = 0;
        // SPENDLY-563: the month's dashboard keys move with the expenses, in
        // the same batch as the chunk they belong to.
        let relabels: DashboardRelabel[] = [];
        const flush = async () => {
          if (ops === 0) return;
          stageMutationOps(batch, db, dashboardOpsForRelabel(uid, relabels));
          await batch.commit();
          noteDirectWrites(uid, batch.writtenPaths());
          batch = trackedBatch(writeBatch(db));
          ops = 0;
          relabels = [];
        };

        for (const row of rows) {
          if (!row.id) continue;
          const data = row.data as RelabelSource;
          const ref = doc(db, "users", uid, "expenses", row.id);
          if (cat.kind === "subcategory") {
            const parent = all.find((c) => c.id === cat.parentId);
            if (
              parent &&
              data.category === parent.name &&
              data.subcategory === oldName
            ) {
              batch.update(ref, { subcategory: trimmed, updatedAt: serverTimestamp() });
              relabels.push(relabelOf(data, { category: data.category, subcategory: trimmed }));
              ops++;
            }
          } else if (data.category === oldName) {
            batch.update(ref, { category: trimmed, updatedAt: serverTimestamp() });
            relabels.push(relabelOf(data, { category: trimmed, subcategory: data.subcategory }));
            ops++;
          }
          if (ops >= 400) await flush();
        }
        await flush();
      }

      toast.success("Renamed");
    } catch (err) {
      logError("categories.renameCategory", err);
      toast.error("Failed to rename category");
    }
  };

  const setCategoryHidden = async (id: string, isHidden: boolean) => {
    try {
      await patchCategory(id, { isHidden });
      toast.success(isHidden ? "Hidden from picker" : "Shown in picker");
    } catch (err) {
      logError("categories.updateVisibility", err);
      toast.error("Failed to update visibility");
    }
  };

  const setCategoryFavorite = async (id: string, isFavorite: boolean) => {
    try {
      await patchCategory(id, { isFavorite });
    } catch (err) {
      logError("categories.updateFavorite", err);
      toast.error("Failed to update favorite");
    }
  };

  const setCategoryStyle = async (
    id: string,
    style: { icon?: string; color?: string }
  ) => {
    try {
      await patchCategory(id, style);
      toast.success("Style updated");
    } catch (err) {
      logError("categories.updateStyle", err);
      toast.error("Failed to update style");
    }
  };

  const archiveCategory = async (id: string, isArchived = true) => {
    const db = getFirestoreDb();
    if (!uid || !db) return;
    try {
      // SPENDLY-753: archiving releases the name lock (clearing the field the
      // lock's delete rule checks, in the same batch) so the name is
      // immediately free for a new active category/subcategory. Restoring
      // doesn't reclaim one — a later edit/add will claim fresh.
      const cat = isArchived ? (await categoriesForWrite(db)).find((c) => c.id === id) : undefined;
      const batch = trackedBatch(writeBatch(db));
      const lockFieldClear: Record<string, unknown> = {};
      if (cat) {
        const isSub = cat.kind === "subcategory";
        const lockKey = isSub ? cat.subNameKey : cat.nameKey;
        if (lockKey) {
          batch.delete(doc(db, "users", uid, isSub ? "categorySubNames" : "categoryNames", lockKey));
          lockFieldClear[isSub ? "subNameKey" : "nameKey"] = deleteField();
        }
      }
      batch.update(doc(db, "users", uid, "categories", id), { ...lockFieldClear, isArchived, updatedAt: serverTimestamp() });
      noteCategoriesWritten(db, uid, [id]);
      await batch.commit();
      toast.success(isArchived ? "Category archived" : "Category restored");
    } catch (err) {
      logError("categories.updateCategoryStatus", err);
      toast.error("Failed to update category status");
    }
  };

  const deleteCategory = async (id: string) => {
    const db = getFirestoreDb();
    if (!uid || !db) return;
    try {
      const children = (await categoriesForWrite(db)).filter((c) => c.parentId === id);
      const writes = children.map((c) =>
        deleteDoc(doc(db, "users", uid, "categories", c.id))
      );
      writes.push(deleteDoc(doc(db, "users", uid, "categories", id)));
      noteCategoriesWritten(db, uid, [...children.map((c) => c.id), id]);
      await Promise.all(writes);
      toast.success("Category deleted");
    } catch (err) {
      logError("categories.deleteCategory", err);
      toast.error("Failed to delete category");
    }
  };

  /**
   * Merge source parent into target parent:
   * - Moves expenses from source → target (subcategory kept or set to Other)
   * - Moves source subcategories under target (renames on conflict)
   * - Deletes source parent
   */
  const mergeCategories = async (sourceId: string, targetId: string) => {
    const db = getFirestoreDb();
    if (!uid || !db || sourceId === targetId) return;
    const current = await categoriesForWrite(db);
    const source = current.find((c) => c.id === sourceId);
    const target = current.find((c) => c.id === targetId);
    if (!source || !target) {
      toast.error("Invalid merge selection");
      return;
    }
    if (source.kind === "subcategory" || target.kind === "subcategory") {
      toast.error("Merge only supports top-level categories");
      return;
    }

    try {
      const sourceSubs = current.filter((c) => c.parentId === sourceId);
      const targetSubs = current.filter((c) => c.parentId === targetId);
      const targetSubNames = new Set(
        targetSubs.map((s) => s.name.toLowerCase())
      );

      let batch = trackedBatch(writeBatch(db));
      let ops = 0;
      // SPENDLY-563: moved expenses carry their dashboard amounts with them,
      // staged into the same batch as the chunk they were moved in.
      let relabels: DashboardRelabel[] = [];
      const flush = async () => {
        if (ops === 0) return;
        stageMutationOps(batch, db, dashboardOpsForRelabel(uid, relabels));
        await batch.commit();
        noteDirectWrites(uid, batch.writtenPaths());
        batch = trackedBatch(writeBatch(db));
        ops = 0;
        relabels = [];
      };

      for (const sub of sourceSubs) {
        let name = sub.name;
        if (targetSubNames.has(name.toLowerCase())) {
          name = `${name} (from ${source.name})`;
        }
        batch.update(doc(db, "users", uid, "categories", sub.id), {
          parentId: targetId,
          name,
          updatedAt: serverTimestamp(),
        });
        ops++;
        if (ops >= 400) await flush();
      }

      // SPENDLY-98: same completeness rule as the rename path above.
      const expenseRows = expensesInMemory
        ? expenses.map((expense) => ({
            id: expense.id,
            data: expense,
          }))
        : await (async () => {
            const snap = await getDocs(
              query(
                collection(db, "users", uid, "expenses"),
                where("category", "==", source.name)
              )
            );
            logDirectRead(`users/${uid}/expenses`, snap.docs.length, "server", {
              feature: "categories-merge",
              queryShape: "where(category)",
            });
            return snap.docs.map((expenseDoc) => ({
              id: expenseDoc.id,
              data: expenseDoc.data() as {
                category?: string;
                subcategory?: string;
              },
            }));
          })();
      for (const row of expenseRows) {
        if (!row.id) continue;
        const data = row.data as RelabelSource;
        if (data.category === source.name) {
          const oldSub = (data.subcategory as string) || "Other";
          const conflict = targetSubNames.has(oldSub.toLowerCase());
          const subcategory = conflict ? `${oldSub} (from ${source.name})` : oldSub;
          batch.update(doc(db, "users", uid, "expenses", row.id), {
            category: target.name,
            subcategory,
            updatedAt: serverTimestamp(),
          });
          relabels.push(relabelOf(data, { category: target.name, subcategory }));
          ops++;
          if (ops >= 400) await flush();
        }
      }

      const budgetRows = !budgetsLoading
        ? budgets
        : await (async () => {
            const snap = await getDocs(
              query(
                collection(db, "users", uid, "categoryBudgets"),
                where("category", "==", source.name)
              )
            );
            logDirectRead(`users/${uid}/categoryBudgets`, snap.docs.length, "server", {
              feature: "categories-merge",
              queryShape: "where(category)",
            });
            return snap.docs.map((b) => ({
              id: b.id,
              ...(b.data() as { category?: string }),
            }));
          })();
      for (const b of budgetRows) {
        if (b.category === source.name) {
          batch.update(doc(db, "users", uid, "categoryBudgets", b.id), {
            category: target.name,
          });
          ops++;
          if (ops >= 400) await flush();
        }
      }

      batch.delete(doc(db, "users", uid, "categories", sourceId));
      ops++;
      await flush();
      // SPENDLY-660: after the last batch, which holds the delete. Offline,
      // other screens see the merge once it reaches the server.
      noteCategoriesWritten(db, uid, [...sourceSubs.map((s) => s.id), sourceId]);

      toast.success(`Merged “${source.name}” into “${target.name}”`);
    } catch (err) {
      logError("categories.merge", err);
      toast.error("Merge failed");
    }
  };

  return {
    error,
    retry,
    categories,
    parentCategories,
    visibleParents,
    favoriteParents,
    getSubcategories,
    loading,
    addCategory,
    addSubcategory,
    updateCategory,
    renameCategory,
    setCategoryHidden,
    setCategoryFavorite,
    setCategoryStyle,
    archiveCategory,
    deleteCategory,
    mergeCategories,
  };
};
