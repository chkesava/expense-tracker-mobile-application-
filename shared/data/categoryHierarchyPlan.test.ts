import { describe, expect, it } from "vitest";
import { mapToV4Category } from "./categoryTaxonomy";
import {
  FIRESTORE_WRITE_BATCH_LIMIT,
  applyTaxonomyWrites,
  countExpenseRemaps,
  planDefaultTaxonomyUpsert,
  shouldFlushBatch,
  taxonomyDocsNeedUpsert,
  type PlannedCategoryDoc,
} from "./categoryHierarchyPlan";

describe("shouldFlushBatch", () => {
  it("flushes at the Firestore headroom limit", () => {
    expect(FIRESTORE_WRITE_BATCH_LIMIT).toBe(400);
    expect(shouldFlushBatch(399)).toBe(false);
    expect(shouldFlushBatch(400)).toBe(true);
  });
});

describe("planDefaultTaxonomyUpsert", () => {
  it("is idempotent once the v4 taxonomy is already stored", () => {
    const first = planDefaultTaxonomyUpsert([]);
    expect(first.writes.some((w) => w.op === "create")).toBe(true);
    const seeded = applyTaxonomyWrites([], first);
    const second = planDefaultTaxonomyUpsert(seeded);
    expect(second.writes).toEqual([]);
  });

  it("renames v3 default parents in place and preserves custom docs", () => {
    const existing: PlannedCategoryDoc[] = [
      {
        id: "p-food",
        name: "Food",
        kind: "category",
        parentId: null,
        isDefault: true,
        sortOrder: 0,
      },
      {
        id: "s-groc",
        name: "Groceries",
        kind: "subcategory",
        parentId: "p-food",
        isDefault: true,
        sortOrder: 0,
      },
      {
        id: "custom-1",
        name: "Office Chai Fund",
        kind: "category",
        parentId: null,
        isDefault: false,
      },
    ];
    const plan = planDefaultTaxonomyUpsert(existing);
    expect(plan.writes.some((w) => w.op === "update" && w.id === "p-food")).toBe(true);
    expect(plan.writes.some((w) => w.id === "custom-1")).toBe(false);
    const next = applyTaxonomyWrites(existing, plan);
    expect(next.find((d) => d.id === "custom-1")?.isArchived).toBeFalsy();
    expect(next.find((d) => d.id === "p-food")?.name).toBe("Food & Groceries");
    expect(next.find((d) => d.id === "s-groc")?.name).toBe("Groceries / Kirana");
  });

  it("skips creating a default parent when a custom parent already has that name", () => {
    const existing: PlannedCategoryDoc[] = [
      {
        id: "custom-pets",
        name: "Pets",
        kind: "category",
        parentId: null,
        isDefault: false,
      },
    ];
    const plan = planDefaultTaxonomyUpsert(existing);
    expect(plan.skippedCustomParentKeys).toContain("pets");
    expect(plan.writes.some((w) => w.op === "create" && w.data?.name === "Pets")).toBe(false);
  });

  it("still needs an upsert when the version stamp is current but parents are v3 names", () => {
    const existing: PlannedCategoryDoc[] = [
      {
        id: "p-food",
        name: "Food",
        kind: "category",
        parentId: null,
        isDefault: true,
      },
      {
        id: "p-travel",
        name: "Travel",
        kind: "category",
        parentId: null,
        isDefault: true,
      },
    ];
    expect(taxonomyDocsNeedUpsert(existing)).toBe(true);
    const upgraded = applyTaxonomyWrites(existing, planDefaultTaxonomyUpsert(existing));
    expect(taxonomyDocsNeedUpsert(upgraded)).toBe(false);
    expect(upgraded.find((d) => d.id === "p-food")?.name).toBe("Food & Groceries");
    expect(upgraded.find((d) => d.id === "p-travel")?.name).toBe("Transport & Vehicles");
  });

  it("counts no expense remaps when pairs are already v4", () => {
    const expenses = [
      { category: "Food & Groceries", subcategory: "Groceries / Kirana" },
      { category: "Office Chai Fund", subcategory: "Snacks" },
    ];
    expect(countExpenseRemaps(expenses, mapToV4Category)).toBe(0);
  });
});
