import { describe, expect, it, vi } from "vitest";

import { taxonomyFingerprint } from "../shared/data/categoryHierarchyPlan";
import { CATEGORY_HIERARCHY_VERSION } from "../shared/data/categoryHierarchyMigration";
import { jobReadBudget } from "./lib/dailyJobCore";
import { adminCategoryEnv, runCategoryDaily, staleCategoryUsers } from "./lib/categoryDailyCore";

const current = { categoryHierarchyVersion: CATEGORY_HIERARCHY_VERSION, taxonomyFingerprint: taxonomyFingerprint() };

describe("category-daily (SPENDLY-742): taxonomy upgrades on the server", () => {
  it("selects only users whose stamp is behind; duress never", () => {
    const stale = staleCategoryUsers([
      { uid: "u-current", data: current },
      { uid: "u-old", data: { categoryHierarchyVersion: 2 } },
      { uid: "u-prefinger", data: { categoryHierarchyVersion: CATEGORY_HIERARCHY_VERSION } },
      { uid: "u-old_duress", data: { categoryHierarchyVersion: 1 } },
    ]);
    expect(stale.sort()).toEqual(["u-old", "u-prefinger"]);
  });

  it("dry run counts, upgrades nothing", async () => {
    const upgrade = vi.fn();
    const s = await runCategoryDaily({
      metaDocs: [{ uid: "u-old", data: { categoryHierarchyVersion: 2 } }],
      upgrade,
      dryRun: true,
      budget: jobReadBudget(1000),
      push: null,
      log: () => undefined,
    });
    expect(upgrade).not.toHaveBeenCalled();
    expect(s.counts).toMatchObject({ stampsChecked: 1, usersBehind: 1 });
  });

  it("upgrades each stale user, pushes what it wrote, and a failure names no uid", async () => {
    const noted: Array<[string, string[]]> = [];
    const push = { note: (uid: string, paths: Iterable<string>) => noted.push([uid, [...paths]]) };
    const upgrade = vi.fn(async (uid: string) => {
      if (uid === "u-bad") throw Object.assign(new Error("users/u-bad/expenses/x failed"), { code: 13 });
      return { outcome: "migrated", written: [`users/${uid}/categories/c1`] };
    });
    const s = await runCategoryDaily({
      metaDocs: [
        { uid: "u-old", data: { categoryHierarchyVersion: 3 } },
        { uid: "u-bad", data: { categoryHierarchyVersion: 3 } },
        { uid: "u-current", data: current },
      ],
      upgrade,
      dryRun: false,
      budget: jobReadBudget(1000),
      push,
      log: () => undefined,
    });
    expect(upgrade).toHaveBeenCalledTimes(2);
    expect(noted).toEqual([["u-old", ["users/u-old/categories/c1"]]]);
    expect(s.counts.outcome_migrated).toBe(1);
    expect(s.writes.failed).toBe(1);
    expect(s.failures.join(" ")).not.toContain("u-bad");
  });

  it("the Admin SDK adapter behaves like the client functions the migration expects", async () => {
    const reads: number[] = [];
    const autoRef = { id: "auto-1" };
    const colRef = { doc: (p?: string) => (p === undefined ? autoRef : { path: `col/${p}` }), get: async () => ({ size: 2, docs: [{ id: "a", ref: { path: "x/a" }, data: () => ({ n: 1 }) }, { id: "b", ref: { path: "x/b" }, data: () => ({ n: 2 }) }] }) };
    const docRef = { get: async () => ({ exists: true, data: () => ({ v: 4 }) }) };
    const db = { collection: vi.fn(() => colRef), doc: vi.fn(() => docRef), batch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), delete: vi.fn(), commit: vi.fn() })) };
    const env = adminCategoryEnv(db as never, (n) => reads.push(n));
    expect(env.doc(env.collection(env.db, "users", "u", "categories")).id).toBe("auto-1");
    expect(db.collection).toHaveBeenCalledWith("users/u/categories");
    const meta = await env.getDoc(env.doc(env.db, "users", "u", "meta", "categories"));
    expect(db.doc).toHaveBeenCalledWith("users/u/meta/categories");
    expect(meta.exists()).toBe(true);
    expect(meta.data()).toEqual({ v: 4 });
    const list = await env.getDocs(colRef);
    expect(list.docs.map((d) => d.id)).toEqual(["a", "b"]);
    expect(list.metadata.fromCache).toBe(false);
    expect(reads).toEqual([1, 2]);
    const batch = env.trackedBatch(env.writeBatch(env.db));
    batch.set({ path: "users/u/categories/c" }, { a: 1 });
    expect(batch.writtenPaths()).toEqual(["users/u/categories/c"]);
  });
});
