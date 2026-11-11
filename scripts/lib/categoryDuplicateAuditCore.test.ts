import { describe, expect, it } from "vitest";

import { auditCategories, planDuplicateRepair, type CategoryAuditDoc } from "./categoryDuplicateAuditCore";

const parent = (over: Partial<CategoryAuditDoc>): CategoryAuditDoc => ({
  id: "x",
  name: "Shopping",
  kind: "category",
  ...over,
});

const sub = (over: Partial<CategoryAuditDoc>): CategoryAuditDoc => ({
  id: "x",
  name: "Other",
  kind: "subcategory",
  parentId: "p1",
  ...over,
});

describe("auditCategories", () => {
  it("counts parents vs subcategories and status breakdowns", () => {
    const docs = [
      parent({ id: "p1" }),
      parent({ id: "p2", name: "Food", isArchived: true }),
      sub({ id: "s1" }),
      sub({ id: "s2", isDefault: true }),
    ];
    const report = auditCategories("u1", docs, docs);
    expect(report.firestore).toMatchObject({
      total: 4,
      parents: 2,
      subcategories: 2,
      byStatus: { active: 3, archived: 1, default: 1, custom: 3, hidden: 0 },
    });
  });

  it("finds duplicate parent groups by normalized name, ignoring archived docs", () => {
    const docs = [
      parent({ id: "p1", name: "Maintenance and Repair Services" }),
      parent({ id: "p2", name: "  maintenance AND repair services " }),
      parent({ id: "p3", name: "Food" }),
      parent({ id: "p4", name: "Maintenance and Repair Services", isArchived: true }),
    ];
    const report = auditCategories("u1", docs, docs);
    expect(report.duplicateParents).toHaveLength(1);
    expect(report.duplicateParents[0].ids.sort()).toEqual(["p1", "p2"]);
  });

  it("scopes duplicate subcategory groups to their parent", () => {
    const docs = [
      sub({ id: "s1", parentId: "p1", name: "Groceries" }),
      sub({ id: "s2", parentId: "p1", name: "groceries" }),
      sub({ id: "s3", parentId: "p2", name: "Groceries" }),
    ];
    const report = auditCategories("u1", docs, docs);
    expect(report.duplicateSubcategories).toHaveLength(1);
    expect(report.duplicateSubcategories[0].ids.sort()).toEqual(["s1", "s2"]);
  });

  it("reports ids missing on either side", () => {
    const firestoreDocs = [parent({ id: "p1" }), parent({ id: "p2", name: "Food" })];
    const supabaseDocs = [parent({ id: "p1" }), parent({ id: "p3", name: "Other" })];
    const report = auditCategories("u1", firestoreDocs, supabaseDocs);
    expect(report.missingFromSupabase).toEqual(["p2"]);
    expect(report.missingFromFirestore).toEqual(["p3"]);
  });

  it("flags inconsistent metadata", () => {
    const docs = [
      sub({ id: "s1", parentId: undefined }),
      parent({ id: "p1", parentId: "p0" }),
      parent({ id: "p2", isDefault: true, semanticKey: undefined }),
    ];
    const report = auditCategories("u1", docs, docs);
    const byId = Object.fromEntries(report.inconsistentMetadata.map((r) => [r.id, r.issues]));
    expect(byId.s1).toContain("subcategory with no parentId");
    expect(byId.p1).toContain("category with a parentId");
    expect(byId.p2).toContain("default doc with no semanticKey");
  });
});

describe("planDuplicateRepair", () => {
  it("picks the default doc as canonical, mapping the rest as duplicates", () => {
    const docs: CategoryAuditDoc[] = [
      parent({ id: "custom1", createdAt: { seconds: 1 } }),
      parent({ id: "default1", isDefault: true, createdAt: { seconds: 2 } }),
    ];
    const docsById = new Map(docs.map((d) => [d.id, d]));
    const [mapping] = planDuplicateRepair([{ ids: ["custom1", "default1"] }], docsById);
    expect(mapping.canonicalId).toBe("default1");
    expect(mapping.duplicateIds).toEqual(["custom1"]);
  });

  it("falls back to the oldest doc when neither is default", () => {
    const docs: CategoryAuditDoc[] = [
      parent({ id: "b", createdAt: { seconds: 200 } }),
      parent({ id: "a", createdAt: { seconds: 100 } }),
    ];
    const docsById = new Map(docs.map((d) => [d.id, d]));
    const [mapping] = planDuplicateRepair([{ ids: ["a", "b"] }], docsById);
    expect(mapping.canonicalId).toBe("a");
    expect(mapping.duplicateIds).toEqual(["b"]);
  });
});
