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
  const SYNCED = new Set(READ_MODEL_TABLES.map((t) => t.collection));
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

  const FILES = DIRS.flatMap((dir) => sources(join(ROOT, dir)));
  // A name constant counts as the literal (SPENDLY-590: EPF and the portfolio
  // use them, e.g. EPF_CONTRIBUTIONS_COLLECTION = "epfContributions").
  const CONSTS = new Set<string>();
  for (const file of FILES) {
    for (const m of readFileSync(file, "utf8").matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*"(\w+)"/g)) {
      if (SYNCED.has(m[2])) CONSTS.add(m[1]);
    }
  }
  const NAMES = [...[...SYNCED].map((c) => `"${c}"`), ...[...CONSTS].map((c) => `${c}\\b`)].join("|");
  // Segments (`db, "users", uid, "expenses"`) or a template path (SPENDLY-591:
  // useSips writes `users/${uid}/sipPlans`).
  const SYNCED_REF =
    `(?:doc|collection)\\(\\s*(?:collection\\(\\s*)?\\w+\\s*,\\s*` +
    `(?:"users"\\s*,\\s*[\\w.]+\\s*,\\s*(?:${NAMES})|\`users/\\$\\{[\\w.]+\\}/(?:${[...SYNCED].join("|")})\`)`;

  function writesSyncedCollection(text: string): boolean {
    if (new RegExp(WRITE + SYNCED_REF).test(text)) return true;
    // A ref variable to a synced document, then a write through it.
    const vars = [...text.matchAll(new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*${SYNCED_REF}`, "g"))].map((m) => m[1]);
    return vars.some((v) => new RegExp(`${WRITE}${v}\\b`).test(text));
  }

  it("finds the direct writers, and each one calls a hook", () => {
    const writers: string[] = [];
    const missing: string[] = [];
    for (const file of FILES) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (SKIP.test(rel)) continue;
      const text = readFileSync(file, "utf8");
      if (!writesSyncedCollection(text)) continue;
      writers.push(rel);
      if (!HOOK.test(text) && !ALLOWED[rel]) missing.push(rel);
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
      // SPENDLY-590: found through name constants.
      "hooks/useEpfContributions.ts",
      "services/portfolio/holdingAdjustments.ts",
      // SPENDLY-224: push devices, found through DEVICES_COLLECTION.
      "lib/pushRegistration.ts",
      // SPENDLY-591: a template path, and plain literals.
      "hooks/useSips.ts",
      "hooks/useCategoryBudgets.ts",
      "services/sip/executeSips.ts",
    ]) {
      expect(writers).toContain(known);
    }
  });

  // SPENDLY-679: a file-level check let a writer slip through when another
  // function in the same file had a hook (spaces and trips create/edit). A
  // direct SDK write (setDoc, updateDoc, deleteDoc, addDoc) to a synced
  // collection must have its own hook close by, in the same function. Batch
  // and transaction writes are covered by their trackedBatch/writtenPaths()
  // or noteTransactionWrites, which the file-level check above already finds.
  const DIRECT = "\\b(?:setDoc|updateDoc|deleteDoc|addDoc)\\(\\s*";
  const SITE_WINDOW = 25;

  function directSites(text: string): number[] {
    const at = [...text.matchAll(new RegExp(DIRECT + SYNCED_REF, "g"))].map((m) => m.index ?? 0);
    const vars = [...text.matchAll(new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*${SYNCED_REF}`, "g"))].map((m) => m[1]);
    for (const v of vars) at.push(...[...text.matchAll(new RegExp(`${DIRECT}${v}\\b`, "g"))].map((m) => m.index ?? 0));
    return [...new Set(at)].map((i) => text.slice(0, i).split("\n").length - 1);
  }

  it("each direct write to a synced collection has its own hook (SPENDLY-679)", () => {
    const missing: string[] = [];
    let sites = 0;
    for (const file of FILES) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (SKIP.test(rel) || ALLOWED[rel]) continue;
      const lines = readFileSync(file, "utf8").split("\n");
      for (const line of directSites(lines.join("\n"))) {
        sites += 1;
        const near = lines.slice(Math.max(0, line - SITE_WINDOW), line + SITE_WINDOW).join("\n");
        if (!HOOK.test(near)) missing.push(`${rel}:${line + 1}`);
      }
    }
    expect(missing, `direct writes with no read-model hook nearby: ${missing.join(", ")}`).toEqual([]);
    expect(sites).toBeGreaterThan(10); // the scan isn't vacuous
  });

  it("spaces and trips create and edit tell the read model and stamp updatedAt (SPENDLY-679)", () => {
    const spaces = readFileSync(join(ROOT, "hooks", "useSpaces.ts"), "utf8");
    expect(spaces.match(/noteDirectWrites\(uid, \[ref\.path\]\)/g)).toHaveLength(2);
    const trips = readFileSync(join(ROOT, "hooks", "useTrips.ts"), "utf8");
    expect(trips).toMatch(/noteDirectWrites\(uid, \[docRef\.path\]\)/);
    expect(trips).toMatch(/updateDoc\(ref, \{ \.\.\.updates, updatedAt: serverTimestamp\(\) \}\)/);
    expect(trips.match(/spentAmount: increment\(-?expenseAmount\),\s*updatedAt: serverTimestamp\(\)/g)).toHaveLength(2);
  });

  // SPENDLY-591 part C: users/{uid} itself is copied (allowlisted fields only).
  // A writer of it must tell the read model, unless it writes only fields the
  // copy leaves out.
  const ROOT_WRITE_OK: Record<string, string> = {
    "providers/PrivacyPinProvider.tsx": "clears the legacy PIN fields (never copied)",
    "components/onboarding/SetupWizardModal.tsx": "username and avatar (identity, never copied)",
    "components/settings/sections/ProfileSection.tsx": "profile identity fields (never copied)",
    "lib/ensureCategoryHierarchy.ts": "bulk migration: push user sync",
  };
  const ROOT_REF = `doc\\(\\s*\\w+\\s*,\\s*"users"\\s*,\\s*[\\w.]+\\s*\\)`;

  it("every writer of the users/{uid} document calls a hook or writes only uncopied fields", () => {
    const writers: string[] = [];
    const missing: string[] = [];
    for (const file of [...FILES, ...sources(join(ROOT, "theme"))]) {
      const rel = relative(ROOT, file).replace(/\\/g, "/");
      if (SKIP.test(rel)) continue;
      const text = readFileSync(file, "utf8");
      const vars = [...text.matchAll(new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*${ROOT_REF}`, "g"))].map((m) => m[1]);
      const writes =
        new RegExp(WRITE + ROOT_REF).test(text) || vars.some((v) => new RegExp(`${WRITE}${v}\\b`).test(text));
      if (!writes) continue;
      writers.push(rel);
      if (!HOOK.test(text) && !ROOT_WRITE_OK[rel]) missing.push(rel);
    }
    expect(missing, `users/{uid} writers with no read-model hook: ${missing.join(", ")}`).toEqual([]);
    for (const known of ["providers/SettingsProvider.tsx", "theme/ThemeProvider.tsx", "providers/PrivacyPinProvider.tsx"]) {
      expect(writers).toContain(known);
    }
  });
});
