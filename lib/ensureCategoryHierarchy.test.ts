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

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/"), id: segments.at(-1) }),
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
    setDocs.push({ path: ref.path, data });
    docs.set(ref.path, { ...(docs.get(ref.path) ?? {}), ...data });
  }),
  writeBatch: () => ({
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: async () => {},
  }),
  serverTimestamp: () => ({ _methodName: "serverTimestamp" }),
}));

vi.mock("@/lib/firestoreReadDebug", () => ({ logDirectRead: vi.fn() }));

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
});
