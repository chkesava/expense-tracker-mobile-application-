import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteField, doc, getDoc, setDoc, deleteDoc, writeBatch, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { categoryNameKey, subcategoryNameKey } from "../shared/utils/categoryModel";

/**
 * SPENDLY-753 — categoryNames/{key} and categorySubNames/{key}: the same
 * create-only unique-name lock as goalNames (firestore/saveGoals.rules.test.ts),
 * written in the same batch as the category/subcategory doc it protects.
 */

const PROJECT_ID = "spendly-category-names";
const OWNER = "u-owner";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function ownerDb(): Firestore {
  return env.authenticatedContext(OWNER).firestore() as unknown as Firestore;
}

async function createCategory(db: Firestore, id: string, name: string, lockedName = name) {
  const batch = writeBatch(db);
  const nameKey = categoryNameKey(lockedName);
  batch.set(doc(db, "users", OWNER, "categories", id), {
    name,
    kind: "category",
    parentId: null,
    isArchived: false,
    nameKey,
    createdAt: 1,
    updatedAt: 1,
  });
  batch.set(doc(db, "users", OWNER, "categoryNames", nameKey), { categoryId: id, createdAtMs: 1 });
  await batch.commit();
}

async function createSubcategory(db: Firestore, parentId: string, id: string, name: string, lockedName = name) {
  const batch = writeBatch(db);
  const subNameKey = subcategoryNameKey(parentId, lockedName);
  batch.set(doc(db, "users", OWNER, "categories", id), {
    name,
    kind: "subcategory",
    parentId,
    isArchived: false,
    subNameKey,
    createdAt: 1,
    updatedAt: 1,
  });
  batch.set(doc(db, "users", OWNER, "categorySubNames", subNameKey), { categoryId: id, createdAtMs: 1 });
  await batch.commit();
}

async function readCategory(id: string): Promise<Record<string, unknown> | undefined> {
  let out: Record<string, unknown> | undefined;
  await env.withSecurityRulesDisabled(async (c) => {
    const snap = await getDoc(doc(c.firestore() as unknown as Firestore, "users", OWNER, "categories", id));
    out = snap.data();
  });
  return out;
}

describe("categoryNames — parent locks", () => {
  it("accepts a category created with its matching name lock", async () => {
    await assertSucceeds(createCategory(ownerDb(), "p1", "Shopping"));
    expect(await readCategory("p1")).toMatchObject({ nameKey: "c_shopping" });
  });

  it("rejects a duplicate name: the second lock create fails as an update", async () => {
    await createCategory(ownerDb(), "p1", "Shopping");
    await assertFails(createCategory(ownerDb(), "p2", "Shopping"));
    // The whole batch failed: no second category doc landed either.
    expect(await readCategory("p2")).toBeUndefined();
  });

  it("accepts the same name again once the category is archived and its lock released", async () => {
    const db = ownerDb();
    await createCategory(db, "p1", "Shopping");
    // archiveCategory (hooks/useCategories.ts) clears `nameKey` in the same
    // batch as deleting the lock — the delete rule checks that field.
    const archive = writeBatch(db);
    archive.delete(doc(db, "users", OWNER, "categoryNames", "c_shopping"));
    archive.update(doc(db, "users", OWNER, "categories", "p1"), { isArchived: true, nameKey: deleteField() });
    await assertSucceeds(archive.commit());
    await assertSucceeds(createCategory(db, "p2", "Shopping"));
  });

  it("refuses to release a lock while the category doc still claims it, even if archived", async () => {
    const db = ownerDb();
    await createCategory(db, "p1", "Shopping");
    const archiveOnly = writeBatch(db);
    archiveOnly.delete(doc(db, "users", OWNER, "categoryNames", "c_shopping"));
    archiveOnly.update(doc(db, "users", OWNER, "categories", "p1"), { isArchived: true });
    await assertFails(archiveOnly.commit());
  });

  it("rejects a lock create whose key doesn't match the category's own nameKey", async () => {
    const db = ownerDb();
    const batch = writeBatch(db);
    batch.set(doc(db, "users", OWNER, "categories", "p1"), {
      name: "Shopping",
      kind: "category",
      parentId: null,
      isArchived: false,
      nameKey: "c_other",
      createdAt: 1,
      updatedAt: 1,
    });
    batch.set(doc(db, "users", OWNER, "categoryNames", "c_shopping"), { categoryId: "p1", createdAtMs: 1 });
    await assertFails(batch.commit());
  });

  it("refuses to release a lock the category still holds", async () => {
    await createCategory(ownerDb(), "p1", "Shopping");
    await assertFails(deleteDoc(doc(ownerDb(), "users", OWNER, "categoryNames", "c_shopping")));
  });

  it("refuses to hijack another category's lock", async () => {
    await createCategory(ownerDb(), "p1", "Shopping");
    await assertFails(setDoc(doc(ownerDb(), "users", OWNER, "categoryNames", "c_shopping"), { categoryId: "p2", createdAtMs: 1 }));
  });

  it("renames by claiming the new lock and releasing the old one", async () => {
    const db = ownerDb();
    await createCategory(db, "p1", "Shopping");
    const batch = writeBatch(db);
    batch.delete(doc(db, "users", OWNER, "categoryNames", "c_shopping"));
    batch.set(doc(db, "users", OWNER, "categoryNames", "c_clothing"), { categoryId: "p1", createdAtMs: 2 });
    batch.update(doc(db, "users", OWNER, "categories", "p1"), { name: "Clothing", nameKey: "c_clothing", updatedAt: 2 });
    await assertSucceeds(batch.commit());
    // The old name is free again.
    await assertSucceeds(createCategory(db, "p2", "Shopping"));
  });
});

describe("categorySubNames — parent-scoped subcategory locks", () => {
  it("allows the same subcategory name under two different parents", async () => {
    await createCategory(ownerDb(), "p1", "Food");
    await createCategory(ownerDb(), "p2", "Shopping");
    await assertSucceeds(createSubcategory(ownerDb(), "p1", "s1", "Other"));
    await assertSucceeds(createSubcategory(ownerDb(), "p2", "s2", "Other"));
  });

  it("rejects a duplicate subcategory name under the same parent", async () => {
    await createCategory(ownerDb(), "p1", "Food");
    await createSubcategory(ownerDb(), "p1", "s1", "Groceries");
    await assertFails(createSubcategory(ownerDb(), "p1", "s2", "Groceries"));
    expect(await readCategory("s2")).toBeUndefined();
  });

  it("refuses to release a subcategory lock the doc still holds", async () => {
    await createCategory(ownerDb(), "p1", "Food");
    await createSubcategory(ownerDb(), "p1", "s1", "Groceries");
    await assertFails(deleteDoc(doc(ownerDb(), "users", OWNER, "categorySubNames", "cs_p1_groceries")));
  });
});
