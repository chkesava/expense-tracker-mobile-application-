/**
 * SPENDLY-753 — the dry-run-first repair for the duplicate category/subcategory
 * groups scripts/categoryDuplicateAudit.ts finds. Pure; Admin SDK wiring lives
 * in scripts/categoryDuplicateRepair.ts, via scripts/lib/dailyJobCore.ts's
 * `applyJobWrites` (same server-writer contract every other daily job uses:
 * users/{uid}/… only, stamps updatedAt/createdAt, chunked batches, pushed to
 * the read model after commit).
 *
 * Mirrors hooks/useCategories.ts's `mergeCategories` (move subs with a
 * rename-on-conflict, relabel expenses/budgets, retire the loser) but:
 * - archives the loser (isArchived: true, lock cleared) instead of deleting it,
 *   so the repair is reversible;
 * - runs for every duplicate group on the account in one planned pass, not
 *   one pair at a time;
 * - a reparented child colliding with a sibling (already under the canonical
 *   parent, or arriving from another duplicate processed just before it) is
 *   renamed on the spot, the same way `mergeCategories` disambiguates — this
 *   fully resolves the common cross-dependency case (two duplicate
 *   subcategories, e.g. "Flowers", sitting under duplicate parents) inside
 *   the parent-merge step itself, with no separate subcategory-merge needed.
 *   A second pass still re-derives subcategory duplicates on the resulting
 *   shape, for the plain case: two subcategories duplicated under a parent
 *   that was never itself a duplicate (most of the real groups found).
 *
 * Idempotent: a duplicate's lock, parentId and name only change once;
 * archived docs are excluded from active-duplicate detection, so re-running
 * the plan after an apply finds nothing left to do.
 */

import { auditCategories, planDuplicateRepair, type CategoryAuditDoc } from "./categoryDuplicateAuditCore";
import { normalizeCategoryName } from "../../shared/utils/categoryModel";

/** A plan value meaning "clear this field" — the CLI layer maps it to `FieldValue.delete()`. */
export const DELETE_FIELD = "__categoryDuplicateRepair_deleteField__";

export type RepairCategoryDoc = {
  id: string;
  name: string;
  kind?: string;
  parentId?: string | null;
  isDefault?: boolean;
  isArchived?: boolean;
  nameKey?: string;
  subNameKey?: string;
  createdAt?: unknown;
};

export type RepairExpenseDoc = { id: string; category?: string; subcategory?: string };
export type RepairBudgetDoc = { id: string; category?: string; subcategory?: string };

type CategoryWrite = { kind: "archiveCategory" | "reparentCategory"; id: string; data: Record<string, unknown> };
type ExpenseWrite = { id: string; before: { category?: string; subcategory?: string }; after: { category?: string; subcategory?: string } };
type BudgetWrite = { id: string; before: { category?: string; subcategory?: string }; after: { category?: string; subcategory?: string } };
type LockDelete = { collection: "categoryNames" | "categorySubNames"; key: string };

export type GroupRepairSummary = {
  groupKey: string;
  groupType: "parent" | "subcategory";
  name: string;
  parentId?: string;
  canonicalId: string;
  archivedIds: string[];
  /** Subcategories reparented onto the canonical parent, with any rename-on-conflict applied. */
  reparented: { id: string; fromParentId: string; toParentId: string; beforeName: string; afterName: string }[];
  expensesRelabeled: number;
  budgetsRelabeled: number;
};

export type RepairPlan = {
  uid: string;
  groups: GroupRepairSummary[];
  categoryWrites: CategoryWrite[];
  expenseWrites: ExpenseWrite[];
  budgetWrites: BudgetWrite[];
  lockDeletes: LockDelete[];
};

function toAuditDoc(c: RepairCategoryDoc): CategoryAuditDoc {
  return { id: c.id, name: c.name, kind: c.kind, parentId: c.parentId, isDefault: c.isDefault, isArchived: c.isArchived, createdAt: c.createdAt };
}

/** A conflict-free name for `name` among `taken` (case/whitespace-insensitive), suffixed like mergeCategories. */
function disambiguate(name: string, suffix: string, taken: Set<string>): string {
  if (!taken.has(normalizeCategoryName(name))) return name;
  return `${name} (from ${suffix})`;
}

export function planCategoryDuplicateRepair(
  uid: string,
  categories: readonly RepairCategoryDoc[],
  expenses: readonly RepairExpenseDoc[],
  budgets: readonly RepairBudgetDoc[]
): RepairPlan {
  // A working clone: parentId/name/isArchived mutate here as parent-group
  // merges are planned, so subcategory-duplicate detection (step 2) and
  // expense/budget matching see the post-merge shape.
  const working = new Map<string, RepairCategoryDoc>(categories.map((c) => [c.id, { ...c }]));
  const categoryWrites: CategoryWrite[] = [];
  const expenseWrites = new Map<string, ExpenseWrite>();
  const budgetWrites = new Map<string, BudgetWrite>();
  const lockDeletes: LockDelete[] = [];
  const groups: GroupRepairSummary[] = [];

  const relabelExpense = (id: string, patch: { category?: string; subcategory?: string }) => {
    const existing = expenseWrites.get(id);
    const expense = expenses.find((e) => e.id === id)!;
    const before = existing?.before ?? { category: expense.category, subcategory: expense.subcategory };
    const after = { category: existing?.after.category ?? expense.category, subcategory: existing?.after.subcategory ?? expense.subcategory, ...patch };
    expenseWrites.set(id, { id, before, after });
  };

  const relabelBudget = (id: string, patch: { category?: string; subcategory?: string }) => {
    const existing = budgetWrites.get(id);
    const budget = budgets.find((b) => b.id === id)!;
    const before = existing?.before ?? { category: budget.category, subcategory: budget.subcategory };
    const after = { category: existing?.after.category ?? budget.category, subcategory: existing?.after.subcategory ?? budget.subcategory, ...patch };
    budgetWrites.set(id, { id, before, after });
  };

  const activeAuditDocs = () => [...working.values()].map(toAuditDoc);

  // --- Step 1: merge duplicate PARENTS -------------------------------------
  const firstPass = auditCategories(uid, activeAuditDocs(), []);
  for (const group of firstPass.duplicateParents) {
    const canonicalId = planDuplicateRepair([group], new Map(activeAuditDocs().map((d) => [d.id, d])))[0].canonicalId;
    const canonical = working.get(canonicalId)!;
    const duplicateIds = group.ids.filter((id) => id !== canonicalId);
    const reparented: GroupRepairSummary["reparented"] = [];
    let expensesRelabeled = 0;
    let budgetsRelabeled = 0;
    // Names already under the canonical parent, grown as duplicates' own
    // children are folded in, so two duplicates' same-named children don't
    // collide with each other either.
    const canonicalChildNames = new Set(
      [...working.values()].filter((c) => c.parentId === canonicalId).map((c) => normalizeCategoryName(c.name))
    );

    for (const dupId of duplicateIds) {
      const dup = working.get(dupId)!;
      const children = [...working.values()].filter((c) => c.parentId === dupId);
      for (const child of children) {
        const finalName = disambiguate(child.name, dup.name, canonicalChildNames);
        canonicalChildNames.add(normalizeCategoryName(finalName));
        reparented.push({ id: child.id, fromParentId: dupId, toParentId: canonicalId, beforeName: child.name, afterName: finalName });
        const data: Record<string, unknown> = { parentId: canonicalId };
        if (finalName !== child.name) data.name = finalName;
        categoryWrites.push({ kind: "reparentCategory", id: child.id, data });
        working.set(child.id, { ...child, parentId: canonicalId, name: finalName });
      }

      for (const expense of expenses) {
        if (expense.category !== dup.name) continue;
        const reparentedChild = reparented.find((r) => r.fromParentId === dupId && r.beforeName === (expense.subcategory ?? ""));
        relabelExpense(expense.id, { category: canonical.name, ...(reparentedChild ? { subcategory: reparentedChild.afterName } : {}) });
        expensesRelabeled++;
      }
      for (const budget of budgets) {
        if (budget.category !== dup.name) continue;
        const reparentedChild = reparented.find((r) => r.fromParentId === dupId && r.beforeName === (budget.subcategory ?? ""));
        relabelBudget(budget.id, { category: canonical.name, ...(reparentedChild ? { subcategory: reparentedChild.afterName } : {}) });
        budgetsRelabeled++;
      }

      categoryWrites.push({
        kind: "archiveCategory",
        id: dupId,
        data: { isArchived: true, ...(dup.nameKey ? { nameKey: DELETE_FIELD } : {}) },
      });
      if (dup.nameKey) lockDeletes.push({ collection: "categoryNames", key: dup.nameKey });
      working.set(dupId, { ...dup, isArchived: true, nameKey: undefined });
    }

    groups.push({
      groupKey: group.key,
      groupType: "parent",
      name: canonical.name,
      canonicalId,
      archivedIds: duplicateIds,
      reparented,
      expensesRelabeled,
      budgetsRelabeled,
    });
  }

  // --- Step 2: re-derive subcategory duplicates on the POST-merge shape ----
  // Catches both the audit's original groups and any new collision the
  // reparenting above just created (two same-named subs now sharing a parent).
  const secondPass = auditCategories(uid, activeAuditDocs(), []);
  for (const group of secondPass.duplicateSubcategories) {
    const canonicalId = planDuplicateRepair([group], new Map(activeAuditDocs().map((d) => [d.id, d])))[0].canonicalId;
    const canonical = working.get(canonicalId)!;
    const parent = working.get(canonical.parentId ?? "");
    const duplicateIds = group.ids.filter((id) => id !== canonicalId);
    let expensesRelabeled = 0;
    let budgetsRelabeled = 0;

    for (const dupId of duplicateIds) {
      const dup = working.get(dupId)!;
      for (const expense of expenses) {
        if (expense.category !== parent?.name || expense.subcategory !== dup.name) continue;
        relabelExpense(expense.id, { subcategory: canonical.name });
        expensesRelabeled++;
      }
      for (const budget of budgets) {
        if (budget.category !== parent?.name || budget.subcategory !== dup.name) continue;
        relabelBudget(budget.id, { subcategory: canonical.name });
        budgetsRelabeled++;
      }
      categoryWrites.push({
        kind: "archiveCategory",
        id: dupId,
        data: { isArchived: true, ...(dup.subNameKey ? { subNameKey: DELETE_FIELD } : {}) },
      });
      if (dup.subNameKey) lockDeletes.push({ collection: "categorySubNames", key: dup.subNameKey });
      working.set(dupId, { ...dup, isArchived: true, subNameKey: undefined });
    }

    groups.push({
      groupKey: group.key,
      groupType: "subcategory",
      name: canonical.name,
      parentId: canonical.parentId ?? undefined,
      canonicalId,
      archivedIds: duplicateIds,
      reparented: [],
      expensesRelabeled,
      budgetsRelabeled,
    });
  }

  return {
    uid,
    groups,
    categoryWrites,
    expenseWrites: [...expenseWrites.values()],
    budgetWrites: [...budgetWrites.values()],
    lockDeletes,
  };
}

/** Everything a group found but nothing to do about it (already clean). */
export function isNoop(plan: RepairPlan): boolean {
  return plan.groups.length === 0;
}
