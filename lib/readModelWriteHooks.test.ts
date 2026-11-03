import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const pushed: Array<{ uid: string; paths: string[] }> = [];
const clientWritten: Array<{ uid: string; paths: string[] }> = [];
vi.mock("@/lib/readModelPush", () => ({
  notifyReadModelWrites: (uid: string, paths: string[]) => void pushed.push({ uid, paths }),
}));
vi.mock("@/lib/readModelClientWrites", () => ({
  notifyClientWrites: (uid: string, paths: string[]) => void clientWritten.push({ uid, paths }),
}));

const { noteDirectWrites, noteTransactionWrites, trackedBatch } = await import("./readModelWriteHooks");
const { READ_MODEL_TABLES } = await import("@/shared/utils/readModel/mapping");

beforeEach(() => {
  pushed.length = 0;
  clientWritten.length = 0;
});

describe("read-model write hooks (SPENDLY-671)", () => {
  it("noteDirectWrites tells the server push and the client write outbox", () => {
    noteDirectWrites("u1", ["users/u1/expenses/e1"]);
    expect(pushed).toEqual([{ uid: "u1", paths: ["users/u1/expenses/e1"] }]);
    expect(clientWritten).toEqual([{ uid: "u1", paths: ["users/u1/expenses/e1"] }]);
  });

  it("noteTransactionWrites uses the push only (the cache may not hold the committed version yet)", () => {
    noteTransactionWrites("u1", ["users/u1/creditCardBills/b1"]);
    expect(pushed).toHaveLength(1);
    expect(clientWritten).toEqual([]);
  });

  it("does nothing without a uid or paths", () => {
    noteDirectWrites("", ["users/u1/expenses/e1"]);
    noteDirectWrites("u1", []);
    noteTransactionWrites("u1", []);
    expect(pushed).toEqual([]);
    expect(clientWritten).toEqual([]);
  });

  it("trackedBatch forwards every call and remembers each written path once", async () => {
    const calls: string[] = [];
    const inner = {
      set: (ref: { path: string }, data: unknown, opts?: unknown) => void calls.push(`set ${ref.path} ${JSON.stringify(data)} ${JSON.stringify(opts ?? null)}`),
      update: (ref: { path: string }, data: unknown) => void calls.push(`update ${ref.path} ${JSON.stringify(data)}`),
      delete: (ref: { path: string }) => void calls.push(`delete ${ref.path}`),
      commit: async () => void calls.push("commit"),
    };
    const batch = trackedBatch(inner as never);
    batch.set({ path: "users/u1/expenses/e1" } as never, { a: 1 }, { merge: true });
    batch.update({ path: "users/u1/accounts/a1" } as never, { b: 2 });
    batch.delete({ path: "users/u1/expenses/e2" } as never);
    batch.update({ path: "users/u1/expenses/e1" } as never, { c: 3 });
    await batch.commit();
    expect(calls).toEqual([
      'set users/u1/expenses/e1 {"a":1} {"merge":true}',
      'update users/u1/accounts/a1 {"b":2}',
      "delete users/u1/expenses/e2",
      'update users/u1/expenses/e1 {"c":3}',
      "commit",
    ]);
    expect(batch.writtenPaths()).toEqual(["users/u1/expenses/e1", "users/u1/accounts/a1", "users/u1/expenses/e2"]);
  });
});

/**
 * Guard: every app writer of a synced collection must tell the read model
 * (plan v2: the app writes Supabase too). A file that writes one directly
 * (not through commitMutations) must call a hook. The synced list comes from
 * the mapper, so collections added by later stories are covered as they land.
 */
describe("every direct writer of a synced collection calls a read-model hook", () => {
  const ROOT = join(__dirname, "..");
  const DIRS = ["app", "components", "hooks", "lib", "providers", "services", "shared"];
  const SKIP = /(\.test\.tsx?$)|ganesh|nutrition|\/readModel\/|lib\/firestore(\.native)?\.ts$|lib\/commitMutations\.ts$|lib\/stageMutationOps\.ts$|lib\/readModelWriteHooks\.ts$|lib\/readModelClientWrites\.ts$/i;
  // Writers that announce their writes another way, with the reason.
  const ALLOWED: Record<string, string> = {
    // A rare bulk taxonomy migration (hundreds of documents): its stamp asks
    // the push for a changed-only sync of the user (notifyReadModelChanged).
    "lib/ensureCategoryHierarchy.ts": "bulk migration: push user sync",
    // It writes only meta/categories and is itself the categories hook.
    "lib/categoryRevision.ts": "the categories hook",
  };
  const HOOK = /\b(noteDirectWrites|noteTransactionWrites|noteCategoriesWritten|commitMutations)\(/;
  const COLLS = READ_MODEL_TABLES.map((t) => t.collection).join("|");
  const SYNCED_REF = `(?:doc|collection)\\(\\s*(?:collection\\(\\s*)?\\w+\\s*,\\s*"users"\\s*,\\s*[\\w.]+\\s*,\\s*"(?:${COLLS})"`;
  const WRITE = "(?:\\b(?:setDoc|updateDoc|deleteDoc|addDoc)|\\.(?:set|update|delete))\\(\\s*";

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) out.push(...sources(full));
      else if (/\.(ts|tsx)$/.test(name)) out.push(full);
    }
    return out;
  }

  function writesSyncedCollection(text: string): boolean {
    if (new RegExp(WRITE + SYNCED_REF).test(text)) return true;
    // A ref variable to a synced document, then a write through it.
    const vars = [...text.matchAll(new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*${SYNCED_REF}`, "g"))].map((m) => m[1]);
    return vars.some((v) => new RegExp(`${WRITE}${v}\\b`).test(text));
  }

  it("finds the direct writers, and each one calls a hook", () => {
    const writers: string[] = [];
    const missing: string[] = [];
    for (const dir of DIRS) {
      for (const file of sources(join(ROOT, dir))) {
        const rel = relative(ROOT, file).replace(/\\/g, "/");
        if (SKIP.test(rel)) continue;
        const text = readFileSync(file, "utf8");
        if (!writesSyncedCollection(text)) continue;
        writers.push(rel);
        if (!HOOK.test(text) && !ALLOWED[rel]) missing.push(rel);
      }
    }
    expect(missing, `direct writers of a synced collection with no read-model hook: ${missing.join(", ")}`).toEqual([]);
    // The scan must keep finding the known direct writers (it isn't vacuous).
    for (const known of [
      "providers/CreditCardBillsProvider.tsx",
      "hooks/useSplits.ts",
      "hooks/useTrips.ts",
      "hooks/useSpaces.ts",
      "hooks/useCategories.ts",
      "services/portfolio/investmentCash.ts",
      "services/ledger/rebuildFinancialSummaries.ts",
    ]) {
      expect(writers).toContain(known);
    }
  });
});
