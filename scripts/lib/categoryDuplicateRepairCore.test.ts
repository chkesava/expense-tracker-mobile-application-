import { describe, expect, it } from "vitest";

import { DELETE_FIELD, isNoop, planCategoryDuplicateRepair, type RepairCategoryDoc } from "./categoryDuplicateRepairCore";

const cat = (over: Partial<RepairCategoryDoc>): RepairCategoryDoc => ({
  id: "x",
  name: "x",
  kind: "category",
  ...over,
});

describe("planCategoryDuplicateRepair — parent groups", () => {
  it("merges a simple duplicate parent with no children or expenses", () => {
    const categories = [
      cat({ id: "p1", name: "Shopping", nameKey: "c_shopping" }),
      cat({ id: "p2", name: "Shopping", nameKey: "c_shopping2", createdAt: { seconds: 5 } }),
    ];
    const plan = planCategoryDuplicateRepair("u1", categories, [], []);
    expect(plan.groups).toHaveLength(1);
    const [g] = plan.groups;
    expect(g.groupType).toBe("parent");
    expect(g.canonicalId).toBe("p1"); // older (no createdAt = 0ms) wins
    expect(g.archivedIds).toEqual(["p2"]);
    expect(plan.categoryWrites).toContainEqual({ kind: "archiveCategory", id: "p2", data: { isArchived: true, nameKey: DELETE_FIELD } });
    expect(plan.lockDeletes).toContainEqual({ collection: "categoryNames", key: "c_shopping2" });
  });

  it("reparents the duplicate's subcategories onto the canonical parent", () => {
    const categories = [
      cat({ id: "p1", name: "Shopping" }),
      cat({ id: "p2", name: "Shopping", createdAt: { seconds: 5 } }),
      cat({ id: "s1", name: "Shoes", kind: "subcategory", parentId: "p2" }),
    ];
    const plan = planCategoryDuplicateRepair("u1", categories, [], []);
    const [g] = plan.groups;
    expect(g.reparented).toEqual([{ id: "s1", fromParentId: "p2", toParentId: "p1", beforeName: "Shoes", afterName: "Shoes" }]);
    expect(plan.categoryWrites).toContainEqual({ kind: "reparentCategory", id: "s1", data: { parentId: "p1" } });
  });

  it("renames a reparented subcategory that collides with an existing one under the canonical parent", () => {
    const categories = [
      cat({ id: "p1", name: "Shopping" }),
      cat({ id: "p2", name: "Shopping", createdAt: { seconds: 5 } }),
      cat({ id: "s1", name: "Shoes", kind: "subcategory", parentId: "p1" }),
      cat({ id: "s2", name: "shoes", kind: "subcategory", parentId: "p2" }),
    ];
    const plan = planCategoryDuplicateRepair("u1", categories, [], []);
    const [g] = plan.groups;
    expect(g.reparented).toEqual([{ id: "s2", fromParentId: "p2", toParentId: "p1", beforeName: "shoes", afterName: "shoes (from Shopping)" }]);
    expect(plan.categoryWrites).toContainEqual({ kind: "reparentCategory", id: "s2", data: { parentId: "p1", name: "shoes (from Shopping)" } });
  });

  it("relabels expenses and budgets pointed at the duplicate's name, including a renamed subcategory", () => {
    const categories = [
      cat({ id: "p1", name: "Shopping" }),
      cat({ id: "p2", name: "Shopping", createdAt: { seconds: 5 } }),
      cat({ id: "s1", name: "Shoes", kind: "subcategory", parentId: "p1" }),
      cat({ id: "s2", name: "Shoes", kind: "subcategory", parentId: "p2" }),
    ];
    const expenses = [{ id: "e1", category: "Shopping", subcategory: "Shoes" }];
    const budgets = [{ id: "b1", category: "Shopping", subcategory: "Shoes" }];
    const plan = planCategoryDuplicateRepair("u1", categories, expenses, budgets);
    // e1/b1 matched the duplicate parent's name; its subcategory "Shoes" was
    // the duplicate's own sub, reparented+renamed to "Shoes (from Shopping)".
    expect(plan.expenseWrites).toEqual([
      { id: "e1", before: { category: "Shopping", subcategory: "Shoes" }, after: { category: "Shopping", subcategory: "Shoes (from Shopping)" } },
    ]);
    expect(plan.budgetWrites).toEqual([
      { id: "b1", before: { category: "Shopping", subcategory: "Shoes" }, after: { category: "Shopping", subcategory: "Shoes (from Shopping)" } },
    ]);
  });

  it("ignores archived duplicates — a rerun after apply is a no-op", () => {
    const categories = [
      cat({ id: "p1", name: "Shopping" }),
      cat({ id: "p2", name: "Shopping", isArchived: true }),
    ];
    const plan = planCategoryDuplicateRepair("u1", categories, [], []);
    expect(isNoop(plan)).toBe(true);
  });

  it("merges three duplicates into one canonical, folding in all their children without a collision between the duplicates themselves", () => {
    const categories = [
      cat({ id: "p1", name: "Maintenance and Repair Services" }),
      cat({ id: "p2", name: "Maintenance and Repair Services", createdAt: { seconds: 1 } }),
      cat({ id: "p3", name: "Maintenance and Repair Services", createdAt: { seconds: 2 } }),
      cat({ id: "s1", name: "Plumbing", kind: "subcategory", parentId: "p2" }),
      cat({ id: "s2", name: "Electrical", kind: "subcategory", parentId: "p3" }),
    ];
    const plan = planCategoryDuplicateRepair("u1", categories, [], []);
    const [g] = plan.groups;
    expect(g.canonicalId).toBe("p1");
    expect(g.archivedIds.sort()).toEqual(["p2", "p3"]);
    expect(g.reparented.map((r) => r.id).sort()).toEqual(["s1", "s2"]);
    // No collision between Plumbing and Electrical, so neither is renamed.
    expect(g.reparented.every((r) => r.beforeName === r.afterName)).toBe(true);
  });
});

describe("planCategoryDuplicateRepair — subcategory groups", () => {
  it("merges duplicate subcategories under the same parent and relabels matching expenses", () => {
    const categories = [
      cat({ id: "p1", name: "Food" }),
      cat({ id: "s1", name: "Groceries", kind: "subcategory", parentId: "p1" }),
      cat({ id: "s2", name: "groceries", kind: "subcategory", parentId: "p1", createdAt: { seconds: 5 } }),
    ];
    const expenses = [{ id: "e1", category: "Food", subcategory: "groceries" }];
    const plan = planCategoryDuplicateRepair("u1", categories, expenses, []);
    const [g] = plan.groups;
    expect(g.groupType).toBe("subcategory");
    expect(g.canonicalId).toBe("s1");
    expect(g.archivedIds).toEqual(["s2"]);
    expect(plan.expenseWrites).toEqual([{ id: "e1", before: { category: "Food", subcategory: "groceries" }, after: { category: "Food", subcategory: "Groceries" } }]);
  });

  it("scopes subcategory duplicates to their parent — same name under a different parent is untouched", () => {
    const categories = [
      cat({ id: "p1", name: "Food" }),
      cat({ id: "p2", name: "Shopping" }),
      cat({ id: "s1", name: "Other", kind: "subcategory", parentId: "p1" }),
      cat({ id: "s2", name: "Other", kind: "subcategory", parentId: "p2" }),
    ];
    const plan = planCategoryDuplicateRepair("u1", categories, [], []);
    expect(isNoop(plan)).toBe(true);
  });

  it("resolves a same-named child colliding with the canonical parent's existing child entirely within the parent merge (no separate subcategory step needed)", () => {
    const categories = [
      cat({ id: "p1", name: "Devotional" }),
      cat({ id: "p2", name: "Devotional", createdAt: { seconds: 5 } }),
      cat({ id: "s1", name: "Flowers", kind: "subcategory", parentId: "p1" }),
      cat({ id: "s2", name: "Flowers", kind: "subcategory", parentId: "p2" }),
    ];
    const expenses = [{ id: "e1", category: "Devotional", subcategory: "Flowers" }];
    const plan = planCategoryDuplicateRepair("u1", categories, expenses, []);
    // One parent group; the would-be sibling collision is resolved as a
    // rename at reparent time, so no separate "subcategory" group appears.
    expect(plan.groups.map((g) => g.groupType)).toEqual(["parent"]);
    const [g] = plan.groups;
    expect(g.reparented).toEqual([{ id: "s2", fromParentId: "p2", toParentId: "p1", beforeName: "Flowers", afterName: "Flowers (from Devotional)" }]);
    // e1 pointed at the duplicate's own "Flowers", so it follows the rename.
    expect(plan.expenseWrites).toEqual([
      { id: "e1", before: { category: "Devotional", subcategory: "Flowers" }, after: { category: "Devotional", subcategory: "Flowers (from Devotional)" } },
    ]);
  });

  it("the same collision, but both duplicate subcategories start under the SAME duplicate parent (the real SPENDLY-753 account's shape)", () => {
    const categories = [
      cat({ id: "p1", name: "Devotional" }),
      cat({ id: "p2", name: "Devotional", createdAt: { seconds: 5 } }),
      cat({ id: "s1", name: "Flowers", kind: "subcategory", parentId: "p2" }),
      cat({ id: "s2", name: "Flowers", kind: "subcategory", parentId: "p2" }),
    ];
    const plan = planCategoryDuplicateRepair("u1", categories, [], []);
    expect(plan.groups.map((g) => g.groupType)).toEqual(["parent"]);
    const [g] = plan.groups;
    expect(g.reparented.map((r) => r.toParentId)).toEqual(["p1", "p1"]);
    // The first sibling arrives with no conflict yet; the second collides
    // with the first and gets renamed.
    const unchanged = g.reparented.filter((r) => r.beforeName === r.afterName);
    const renamed = g.reparented.filter((r) => r.beforeName !== r.afterName);
    expect(unchanged).toHaveLength(1);
    expect(renamed).toEqual([{ id: renamed[0].id, fromParentId: "p2", toParentId: "p1", beforeName: "Flowers", afterName: "Flowers (from Devotional)" }]);
  });
});

describe("isNoop", () => {
  it("is true when nothing is duplicated", () => {
    const plan = planCategoryDuplicateRepair("u1", [cat({ id: "p1", name: "Food" })], [], []);
    expect(isNoop(plan)).toBe(true);
  });
});
