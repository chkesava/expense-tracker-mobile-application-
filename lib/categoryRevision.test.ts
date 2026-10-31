import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const setDoc = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
  setDoc: (...args: unknown[]) => setDoc(...args),
  increment: (n: number) => ({ _methodName: "increment", n }),
  serverTimestamp: () => ({ _methodName: "serverTimestamp" }),
}));
const notifyReadModelWrites = vi.fn();
const notifyReadModelChanged = vi.fn();
vi.mock("@/lib/readModelPush", () => ({
  notifyReadModelWrites: (...args: unknown[]) => notifyReadModelWrites(...args),
  notifyReadModelChanged: (...args: unknown[]) => notifyReadModelChanged(...args),
}));
const logWarning = vi.fn();
vi.mock("@/lib/errors", () => ({ logWarning: (...args: unknown[]) => logWarning(...args) }));

const { noteCategoriesWritten, categoriesLoadRecordKey } = await import("./categoryRevision");
const db = {} as never;

beforeEach(() => {
  setDoc.mockClear();
  notifyReadModelWrites.mockClear();
  notifyReadModelChanged.mockClear();
  logWarning.mockClear();
});

describe("noteCategoriesWritten (SPENDLY-660)", () => {
  it("bumps meta/categories.categoriesRevision with a merge, and pushes the named documents", () => {
    noteCategoriesWritten(db, "u1", ["c1", "c2"]);
    expect(setDoc).toHaveBeenCalledWith(
      { path: "users/u1/meta/categories" },
      { categoriesRevision: { _methodName: "increment", n: 1 }, categoriesRevisedAt: { _methodName: "serverTimestamp" } },
      { merge: true }
    );
    expect(notifyReadModelWrites).toHaveBeenCalledWith("u1", ["users/u1/categories/c1", "users/u1/categories/c2"]);
    expect(notifyReadModelChanged).not.toHaveBeenCalled();
  });

  it("asks for a changed-only sync when the documents aren't named", () => {
    noteCategoriesWritten(db, "u1");
    expect(notifyReadModelChanged).toHaveBeenCalledWith("u1");
    expect(notifyReadModelWrites).not.toHaveBeenCalled();
  });

  it("logs a failed bump instead of throwing", async () => {
    setDoc.mockRejectedValueOnce(new Error("offline"));
    expect(() => noteCategoriesWritten(db, "u1", ["c1"])).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(logWarning).toHaveBeenCalledWith("categories.revision", expect.any(Error));
  });

  it("keys the load record per user", () => {
    expect(categoriesLoadRecordKey("u1")).toBe("spendly.categoriesLoad.v1.u1");
  });
});

/**
 * Guard: categories are no longer watched by a live listener, so a writer that
 * forgets `noteCategoriesWritten` leaves other devices (and the read model) on
 * the old list. Every source file that writes a category document must call it,
 * or bump the revision itself (ensureCategoryHierarchy's stampVersion).
 */
describe("every category writer bumps the revision", () => {
  const ROOT = join(__dirname, "..");
  const DIRS = ["app", "components", "hooks", "lib", "providers", "services", "shared"];
  const WRITE = /\b(updateDoc|setDoc|deleteDoc|addDoc|\.set|\.update|\.delete)\s*\(\s*(doc|collection)\(\s*db\s*,\s*"users"\s*,\s*\w+\s*,\s*"categories"/;
  const PRE_MADE_REF = /doc\(\s*collection\(\s*db\s*,\s*"users"\s*,\s*\w+\s*,\s*"categories"\s*\)\s*\)/;

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...sources(full));
      else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  it("finds the writers and each one announces its writes", () => {
    const writers: string[] = [];
    for (const dir of DIRS) {
      for (const file of sources(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        if (!WRITE.test(text) && !PRE_MADE_REF.test(text)) continue;
        writers.push(relative(ROOT, file).replace(/\\/g, "/"));
        expect(
          /noteCategoriesWritten\(|CATEGORIES_REVISION_FIELD\]\s*:\s*increment\(/.test(text),
          `${relative(ROOT, file)} writes categories without bumping the revision`
        ).toBe(true);
      }
    }
    expect(writers.sort()).toEqual(["hooks/useCategories.ts", "lib/ensureCategoryHierarchy.ts"]);
  });
});
