import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyTaxonomyWrites,
  planDefaultTaxonomyUpsert,
  taxonomyFingerprint,
} from "@/shared/data/categoryHierarchyPlan";

type FakeRef = { path: string };

const docs = new Map<string, Record<string, unknown>>();
const collectionReads: string[] = [];
const setDocs: Array<{ path: string; data: Record<string, unknown> }> = [];
/** Paths written by committed batches, in commit order. */
const batchWrites: string[] = [];
let autoId = 0;
/** SPENDLY-730: the commit number (1-based) that fails, and a setDoc path that fails. */
let commits = 0;
let failCommit = 0;
let failSetDocPath = "";

vi.mock("firebase/firestore", () => ({
  doc: (base: FakeRef, ...segments: string[]) => {
    if (segments.length === 0) {
      autoId += 1;
      return { path: `${base.path}/auto${autoId}`, id: `auto${autoId}` };
    }
    return { path: segments.join("/"), id: segments.at(-1) };
  },
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  getDoc: vi.fn(async (ref: FakeRef) => ({
    exists: () => docs.has(ref.path),
    data: () => docs.get(ref.path),
  })),
  getDocs: vi.fn(async (ref: FakeRef) => {
    collectionReads.push(ref.path);
    const prefix = `${ref.path}/`;
    const rows = [...docs.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes("/"))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: () => data, ref: { path } }));
    return { docs: rows, metadata: { fromCache: false } };
  }),
  setDoc: vi.fn(async (ref: FakeRef, data: Record<string, unknown>) => {
    if (ref.path === failSetDocPath) throw new Error("setDoc failed");
    setDocs.push({ path: ref.path, data });
    docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
  }),
  writeBatch: () => {
    const staged: string[] = [];
    const stage = (ref: FakeRef) => void staged.push(ref.path);
    return {
      set: vi.fn(stage),
      update: vi.fn(stage),
      delete: vi.fn(stage),
      commit: async () => {
        commits += 1;
        if (commits === failCommit) throw new Error("commit failed");
        batchWrites.push(...staged);
      },
    };
  },
  serverTimestamp: () => ({ _methodName: "serverTimestamp" }),
  increment: (n: number) => ({ _methodName: "increment", n }),
}));

vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: vi.fn() }));
// SPENDLY-712: the real noteDirectWrites runs; these are its two ends.
const pushed: Array<{ uid: string; paths: string[] }> = [];
const outboxed: Array<{ uid: string; paths: string[] }> = [];
vi.mock("@/lib/readModelPush", () => ({
  notifyReadModelWrites: (uid: string, paths: string[]) => void pushed.push({ uid, paths }),
}));
vi.mock("@/lib/readModelClientWrites", () => ({
  notifyClientWrites: (uid: string, paths: string[]) => void outboxed.push({ uid, paths }),
}));

const { ensureCategoryHierarchy, CATEGORY_HIERARCHY_VERSION } = await import("./ensureCategoryHierarchy");

const UID = "u1";
const META = `users/${UID}/meta/categories`;
const db = {} as never;

/** Seeds a categories collection that already matches the current taxonomy. */
function seedCurrentTaxonomy() {
  const plan = planDefaultTaxonomyUpsert([]);
  for (const row of applyTaxonomyWrites([], plan)) {
    docs.set(`users/${UID}/categories/${row.id}`, { ...row });
  }
}

describe("ensureCategoryHierarchy (SPENDLY-501 early exit)", () => {
  beforeEach(() => {
    docs.clear();
    collectionReads.length = 0;
    setDocs.length = 0;
    batchWrites.length = 0;
    pushed.length = 0;
    outboxed.length = 0;
  });

  it("reads no categories when version and fingerprint are current", async () => {
    docs.set(META, {
      categoryHierarchyVersion: CATEGORY_HIERARCHY_VERSION,
      taxonomyFingerprint: taxonomyFingerprint(),
    });

    await ensureCategoryHierarchy(db, UID);

    expect(collectionReads).toEqual([]);
    expect(setDocs).toEqual([]);
  });

  it("reads once and stamps the fingerprint for a pre-501 stamp", async () => {
    docs.set(META, { categoryHierarchyVersion: CATEGORY_HIERARCHY_VERSION });
    seedCurrentTaxonomy();

    await ensureCategoryHierarchy(db, UID);

    expect(collectionReads).toEqual([`users/${UID}/categories`]);
    expect(docs.get(META)?.taxonomyFingerprint).toBe(taxonomyFingerprint());
    // Only the stamp was written: nothing for the read model.
    expect(pushed).toEqual([]);
    expect(outboxed).toEqual([]);

    collectionReads.length = 0;
    await ensureCategoryHierarchy(db, UID);
    expect(collectionReads).toEqual([]);
  });

  it("re-checks the categories when the shipped taxonomy changed", async () => {
    docs.set(META, {
      categoryHierarchyVersion: CATEGORY_HIERARCHY_VERSION,
      taxonomyFingerprint: "stale000",
    });
    seedCurrentTaxonomy();

    await ensureCategoryHierarchy(db, UID);

    expect(collectionReads).toContain(`users/${UID}/categories`);
  });

  it("still runs the full check when the version is old", async () => {
    docs.set(META, { categoryHierarchyVersion: 1, taxonomyFingerprint: taxonomyFingerprint() });

    await ensureCategoryHierarchy(db, UID);

    expect(collectionReads).toContain(`users/${UID}/categories`);
  });

  it("bumps the categories revision and tells the read model what it wrote (SPENDLY-660)", async () => {
    docs.set(META, { categoryHierarchyVersion: 1, taxonomyFingerprint: taxonomyFingerprint() });

    await ensureCategoryHierarchy(db, UID);

    const stamp = setDocs.find((w) => w.path === META);
    expect(stamp?.data.categoriesRevision).toEqual({ _methodName: "increment", n: 1 });
    expect(pushed).toHaveLength(1);
    expect(pushed[0].uid).toBe(UID);
  });

  it("neither bumps nor notifies on the early exit", async () => {
    docs.set(META, { categoryHierarchyVersion: CATEGORY_HIERARCHY_VERSION, taxonomyFingerprint: taxonomyFingerprint() });

    await ensureCategoryHierarchy(db, UID);

    expect(setDocs).toEqual([]);
    expect(pushed).toEqual([]);
    expect(outboxed).toEqual([]);
  });
});

describe("a taxonomy upgrade reaches the read model (SPENDLY-712)", () => {
  beforeEach(() => {
    docs.clear();
    collectionReads.length = 0;
    setDocs.length = 0;
    batchWrites.length = 0;
    pushed.length = 0;
    outboxed.length = 0;
  });

  it("puts every category it created or changed in the client outbox and the server push, once, after the commits", async () => {
    // A user on the current hierarchy whose stored defaults predate this
    // taxonomy: one default is missing, one was renamed, and an old default
    // the taxonomy no longer has is still live.
    seedCurrentTaxonomy();
    const categoryPaths = [...docs.keys()].filter((p) => p.startsWith(`users/${UID}/categories/`));
    const missing = categoryPaths.find((p) => docs.get(p)?.kind === "subcategory")!;
    docs.delete(missing);
    const renamed = categoryPaths.find((p) => p !== missing && docs.get(p)?.kind === "subcategory")!;
    docs.set(renamed, { ...docs.get(renamed), name: "Old name" });
    const retired = `users/${UID}/categories/retired1`;
    docs.set(retired, { name: "Retired default", kind: "category", parentId: null, isDefault: true, isArchived: false, semanticKey: "retired.default" });
    docs.set(META, { categoryHierarchyVersion: CATEGORY_HIERARCHY_VERSION, taxonomyFingerprint: "stale000" });

    await ensureCategoryHierarchy(db, UID);

    const written = [...new Set(batchWrites)].sort();
    expect(written).toContain(renamed);
    expect(written).toContain(retired);
    expect(written.some((p) => p.startsWith(`users/${UID}/categories/auto`))).toBe(true); // the re-created default
    // One announcement, after every batch committed, naming exactly what was written.
    expect(pushed).toHaveLength(1);
    expect(outboxed).toHaveLength(1);
    expect([...pushed[0].paths].sort()).toEqual(written);
    expect([...outboxed[0].paths].sort()).toEqual(written);
    // Never the old per-user sync for this.
    expect(pushed[0].paths.length).toBeGreaterThan(0);
  });

  it("a first-time seed of hundreds of defaults names every one of them", async () => {
    await ensureCategoryHierarchy(db, UID);

    const created = [...new Set(batchWrites)];
    expect(created.length).toBeGreaterThan(100);
    expect(pushed).toHaveLength(1);
    expect(new Set(pushed[0].paths)).toEqual(new Set(created));
    expect(new Set(outboxed[0].paths)).toEqual(new Set(created));
  });
});

describe("a failed upgrade still announces what it committed (SPENDLY-730)", () => {
  beforeEach(() => {
    docs.clear();
    collectionReads.length = 0;
    setDocs.length = 0;
    batchWrites.length = 0;
    pushed.length = 0;
    outboxed.length = 0;
    commits = 0;
    failCommit = 0;
    failSetDocPath = "";
  });

  it("a later batch fails: the batches committed before it are announced, and the error still reaches the caller", async () => {
    // A pre-hierarchy user: the old flat categories are deleted (commit 1),
    // then the defaults are seeded (commit 2, which fails).
    for (const id of ["old1", "old2", "old3"]) {
      docs.set(`users/${UID}/categories/${id}`, { name: id, kind: "category", parentId: null });
    }
    docs.set(META, { categoryHierarchyVersion: 1, taxonomyFingerprint: taxonomyFingerprint() });
    failCommit = 2;

    await expect(ensureCategoryHierarchy(db, UID)).rejects.toThrow("commit failed");

    const deleted = ["old1", "old2", "old3"].map((id) => `users/${UID}/categories/${id}`);
    expect(batchWrites).toEqual(deleted);
    expect(pushed).toEqual([{ uid: UID, paths: deleted }]);
    expect(outboxed).toEqual([{ uid: UID, paths: deleted }]);
    expect(setDocs.find((w) => w.path === META)).toBeUndefined(); // never stamped, so the next login retries
  });

  it("the stamp fails after every batch committed: all of them are announced", async () => {
    failSetDocPath = META;

    await expect(ensureCategoryHierarchy(db, UID)).rejects.toThrow("setDoc failed");

    const created = [...new Set(batchWrites)];
    expect(created.length).toBeGreaterThan(100);
    expect(pushed).toHaveLength(1);
    expect(new Set(pushed[0].paths)).toEqual(new Set(created));
  });

  it("nothing committed before the failure: nothing announced", async () => {
    docs.set(META, { categoryHierarchyVersion: 1, taxonomyFingerprint: taxonomyFingerprint() });
    failCommit = 1;

    await expect(ensureCategoryHierarchy(db, UID)).rejects.toThrow("commit failed");

    expect(pushed).toEqual([]);
    expect(outboxed).toEqual([]);
  });
});
