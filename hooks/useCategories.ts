import { useCallback, useMemo } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useExpenses } from "@/hooks/useExpenses";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";
import type { Category } from "@/shared/types/expense";

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
  const { expenses, loading: expensesLoading } = useExpenses();

  const parentCategories = useMemo(
    () =>
      categories
        .filter((c) => (c.kind ?? "category") === "category" && !c.parentId)
        .filter((c) => !c.isArchived)
        .sort((a, b) => {
          if (!!b.isFavorite !== !a.isFavorite) return a.isFavorite ? -1 : 1;
          return (
            (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
            a.name.localeCompare(b.name)
          );
        }),
    [categories]
  );

  /** Parents shown in expense pickers (excludes hidden). */
  const visibleParents = useMemo(
    () => parentCategories.filter((c) => !c.isHidden),
    [parentCategories]
  );

  const favoriteParents = useMemo(
    () => visibleParents.filter((c) => c.isFavorite),
    [visibleParents]
  );

  const getSubcategories = useCallback(
    (parentIdOrName: string, opts?: { includeHidden?: boolean }) => {
      const parent =
        categories.find((c) => c.id === parentIdOrName) ||
        categories.find(
          (c) =>
            c.name === parentIdOrName &&
            (c.kind ?? "category") === "category"
        );

      if (!parent) return [];

      return categories
        .filter(
          (c) =>
            c.kind === "subcategory" &&
            c.parentId === parent.id &&
            !c.isArchived &&
            (opts?.includeHidden || !c.isHidden)
        )
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
    await updateDoc(doc(db, "users", uid, "categories", id), data);
  };

  const addCategory = async (
    name: string,
    options?: { createDefaultSub?: boolean; icon?: string; color?: string }
  ) => {
    const db = getFirestoreDb();
    if (!uid || !db || !name.trim()) return;
    try {
      const parentRef = await addDoc(
        collection(db, "users", uid, "categories"),
        {
          name: name.trim(),
          kind: "category",
          parentId: null,
          icon: options?.icon || "📦",
          color: options?.color || "#64748b",
          isDefault: false,
          isArchived: false,
          isHidden: false,
          isFavorite: false,
          sortOrder: 1000,
          createdAt: serverTimestamp(),
        }
      );

      if (options?.createDefaultSub !== false) {
        await addDoc(collection(db, "users", uid, "categories"), {
          name: "Other",
          kind: "subcategory",
          parentId: parentRef.id,
          isDefault: false,
          isArchived: false,
          isHidden: false,
          isFavorite: false,
          sortOrder: 0,
          createdAt: serverTimestamp(),
        });
      }

      toast.success("Category added");
      return parentRef.id;
    } catch (err) {
      logError("categories.addCategory", err);
      toast.error("Failed to add category");
    }
  };

  const addSubcategory = async (parentId: string, name: string) => {
    const db = getFirestoreDb();
    if (!uid || !db || !name.trim() || !parentId) return;
    try {
      await addDoc(collection(db, "users", uid, "categories"), {
        name: name.trim(),
        kind: "subcategory",
        parentId,
        isDefault: false,
        isArchived: false,
        isHidden: false,
        isFavorite: false,
        sortOrder: 100,
        createdAt: serverTimestamp(),
      });
      toast.success("Subcategory added");
    } catch (err) {
      logError("categories.addSubcategory", err);
      toast.error("Failed to add subcategory");
    }
  };

  const updateCategory = async (id: string, newName: string) => {
    const db = getFirestoreDb();
    if (!uid || !db || !newName.trim()) return;
    try {
      await updateDoc(doc(db, "users", uid, "categories", id), {
        name: newName.trim(),
      });
      toast.success("Category updated");
    } catch (err) {
      logError("categories.updateCategory", err);
      toast.error("Failed to update category");
    }
  };

  /** Rename and rewrite matching expense category/subcategory strings. */
  const renameCategory = async (
    id: string,
    newName: string,
    rewriteExpenses = true
  ) => {
    const db = getFirestoreDb();
    if (!uid || !db || !newName.trim()) return;
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const oldName = cat.name;
    const trimmed = newName.trim();
    if (oldName === trimmed) return;

    try {
      await updateDoc(doc(db, "users", uid, "categories", id), {
        name: trimmed,
      });

      if (rewriteExpenses) {
        const rows = !expensesLoading
          ? expenses.map((expense) => ({
              id: expense.id,
              data: expense,
            }))
          : (await getDocs(collection(db, "users", uid, "expenses"))).docs.map(
              (expenseDoc) => ({
                id: expenseDoc.id,
                data: expenseDoc.data() as {
                  category?: string;
                  subcategory?: string;
                },
              })
            );
        let batch = writeBatch(db);
        let ops = 0;
        const flush = async () => {
          if (ops === 0) return;
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        };

        for (const row of rows) {
          if (!row.id) continue;
          const data = row.data;
          const ref = doc(db, "users", uid, "expenses", row.id);
          if (cat.kind === "subcategory") {
            const parent = categories.find((c) => c.id === cat.parentId);
            if (
              parent &&
              data.category === parent.name &&
              data.subcategory === oldName
            ) {
              batch.update(ref, { subcategory: trimmed });
              ops++;
            }
          } else if (data.category === oldName) {
            batch.update(ref, { category: trimmed });
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
      await updateDoc(doc(db, "users", uid, "categories", id), {
        isArchived,
      });
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
      const children = categories.filter((c) => c.parentId === id);
      await Promise.all(
        children.map((c) =>
          deleteDoc(doc(db, "users", uid, "categories", c.id))
        )
      );
      await deleteDoc(doc(db, "users", uid, "categories", id));
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
    const source = categories.find((c) => c.id === sourceId);
    const target = categories.find((c) => c.id === targetId);
    if (!source || !target) {
      toast.error("Invalid merge selection");
      return;
    }
    if (source.kind === "subcategory" || target.kind === "subcategory") {
      toast.error("Merge only supports top-level categories");
      return;
    }

    try {
      const sourceSubs = categories.filter((c) => c.parentId === sourceId);
      const targetSubs = categories.filter((c) => c.parentId === targetId);
      const targetSubNames = new Set(
        targetSubs.map((s) => s.name.toLowerCase())
      );

      let batch = writeBatch(db);
      let ops = 0;
      const flush = async () => {
        if (ops === 0) return;
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      };

      for (const sub of sourceSubs) {
        let name = sub.name;
        if (targetSubNames.has(name.toLowerCase())) {
          name = `${name} (from ${source.name})`;
        }
        batch.update(doc(db, "users", uid, "categories", sub.id), {
          parentId: targetId,
          name,
        });
        ops++;
        if (ops >= 400) await flush();
      }

      const expenseRows = !expensesLoading
        ? expenses.map((expense) => ({
            id: expense.id,
            data: expense,
          }))
        : (await getDocs(collection(db, "users", uid, "expenses"))).docs.map(
            (expenseDoc) => ({
              id: expenseDoc.id,
              data: expenseDoc.data() as {
                category?: string;
                subcategory?: string;
              },
            })
          );
      for (const row of expenseRows) {
        if (!row.id) continue;
        const data = row.data;
        if (data.category === source.name) {
          const oldSub = (data.subcategory as string) || "Other";
          const conflict = targetSubNames.has(oldSub.toLowerCase());
          batch.update(doc(db, "users", uid, "expenses", row.id), {
            category: target.name,
            subcategory: conflict ? `${oldSub} (from ${source.name})` : oldSub,
          });
          ops++;
          if (ops >= 400) await flush();
        }
      }

      const budgetRows = !budgetsLoading
        ? budgets
        : (await getDocs(collection(db, "users", uid, "categoryBudgets"))).docs.map(
            (b) => ({ id: b.id, ...(b.data() as { category?: string }) })
          );
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
