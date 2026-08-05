import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { Category } from "@/shared/types/expense";

export const useCategories = () => {
  const { user } = useAuth();
  const uid = user?.uid;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setCategories([]);
      setLoading(false);
      return;
    }

    const q = query(collection(db, "users", uid, "categories"));

    return onSnapshot(
      q,
      (snap) => {
        setCategories(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Category))
        );
        setLoading(false);
      },
      (err) => {
        console.error("useCategories snapshot error:", err);
        setLoading(false);
      }
    );
  }, [uid]);

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
      console.error(err);
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
      console.error(err);
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
      console.error(err);
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
        const expensesSnap = await getDocs(
          collection(db, "users", uid, "expenses")
        );
        let batch = writeBatch(db);
        let ops = 0;
        const flush = async () => {
          if (ops === 0) return;
          await batch.commit();
          batch = writeBatch(db);
          ops = 0;
        };

        for (const expenseDoc of expensesSnap.docs) {
          const data = expenseDoc.data();
          if (cat.kind === "subcategory") {
            const parent = categories.find((c) => c.id === cat.parentId);
            if (
              parent &&
              data.category === parent.name &&
              data.subcategory === oldName
            ) {
              batch.update(expenseDoc.ref, { subcategory: trimmed });
              ops++;
            }
          } else if (data.category === oldName) {
            batch.update(expenseDoc.ref, { category: trimmed });
            ops++;
          }
          if (ops >= 400) await flush();
        }
        await flush();
      }

      toast.success("Renamed");
    } catch (err) {
      console.error(err);
      toast.error("Failed to rename category");
    }
  };

  const setCategoryHidden = async (id: string, isHidden: boolean) => {
    try {
      await patchCategory(id, { isHidden });
      toast.success(isHidden ? "Hidden from picker" : "Shown in picker");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update visibility");
    }
  };

  const setCategoryFavorite = async (id: string, isFavorite: boolean) => {
    try {
      await patchCategory(id, { isFavorite });
    } catch (err) {
      console.error(err);
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
      console.error(err);
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
      console.error(err);
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
      console.error(err);
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

      const expensesSnap = await getDocs(
        collection(db, "users", uid, "expenses")
      );
      for (const expenseDoc of expensesSnap.docs) {
        const data = expenseDoc.data();
        if (data.category === source.name) {
          const oldSub = (data.subcategory as string) || "Other";
          const conflict = targetSubNames.has(oldSub.toLowerCase());
          batch.update(expenseDoc.ref, {
            category: target.name,
            subcategory: conflict ? `${oldSub} (from ${source.name})` : oldSub,
          });
          ops++;
          if (ops >= 400) await flush();
        }
      }

      // Rewrite budgets pointing at source category
      const budgetsSnap = await getDocs(
        collection(db, "users", uid, "categoryBudgets")
      );
      for (const b of budgetsSnap.docs) {
        if (b.data().category === source.name) {
          batch.update(b.ref, { category: target.name });
          ops++;
          if (ops >= 400) await flush();
        }
      }

      batch.delete(doc(db, "users", uid, "categories", sourceId));
      ops++;
      await flush();

      toast.success(`Merged “${source.name}” into “${target.name}”`);
    } catch (err) {
      console.error(err);
      toast.error("Merge failed");
    }
  };

  return {
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
