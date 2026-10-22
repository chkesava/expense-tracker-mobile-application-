import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * SPENDLY-571 — the 3-hourly read-model sync (SPENDLY-506) finds changed
 * documents with `createdAt > hw` and `updatedAt > hw`. A write that sets
 * neither is invisible to it until the nightly full copy.
 *
 * This scans every Firestore write call in the app, Netlify functions and
 * scripts:
 * - an update or merge-set on a changed-only collection must set `updatedAt`;
 * - a create on one must set `createdAt` (or `updatedAt`);
 * - in a file that writes those collections, a write through a ref variable
 *   (collection not visible in the call) must set `updatedAt` too, or be listed
 *   in ALLOWED with the reason it doesn't target a changed-only collection.
 *
 * accounts, accountTypes, accountTransfers and accountEntries are copied in
 * full on every run, so they are not checked.
 */

const root = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "hooks", "lib", "providers", "services", "shared", "features", "netlify", "scripts"];

/** Collections the sync copies "changed only" (ADR §0, decision 6). */
export const CHANGED_ONLY = ["expenses", "incomes", "accountPayments", "creditCardBills", "categories", "ledgerEvents"];

/**
 * Writes through a ref variable that do not target a changed-only collection.
 * Key: file. Value: substrings that identify the call, each with its reason.
 */
const ALLOWED: Record<string, { match: string | RegExp; reason: string }[]> = {
  "lib/ensureCategoryHierarchy.ts": [
    { match: "(ref, payload, { merge: true })", reason: "inside createBatchWriter; its call sites are checked" },
    { match: "(ref, data)", reason: "inside createBatchWriter; its call sites are checked" },
    {
      match: /^\(row\.ref, \{\s+category: mapped\.category,\s+subcategory: mapped\.subcategory,\s+\}\)$/,
      reason: "remapNamedPairs: categoryBudgets / categorizationRules",
    },
    { match: "{ category: mapped.category }", reason: "remapSubscriptions: subscriptions" },
    { match: "{ categoryBudgets: next }", reason: "remapTripCategoryBudgets: trips" },
    { match: "{ defaultCategory: mapped.category }", reason: "the user's settings document" },
  ],
  "providers/ExpenseReferenceDataProvider.tsx": [
    { match: "isCompleted: true", reason: "subscriptions (completing an EMI)" },
  ],
};

const matches = (args: string, m: string | RegExp) => (typeof m === "string" ? args.includes(m) : m.test(args));

type WriteCall = { file: string; line: number; kind: "update" | "create" | "merge"; target: string; args: string };

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|js)$/.test(name) && !/\.test\.(ts|tsx|js)$/.test(name) ? [full] : [];
  });
}

/** Text of the balanced (...) or {...} group starting at `open`. */
function balanced(source: string, open: number): string {
  const opener = source[open];
  const closer = opener === "(" ? ")" : "}";
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch;
    else if (ch === opener) depth++;
    else if (ch === closer && --depth === 0) return source.slice(open, i + 1);
  }
  return source.slice(open);
}

/**
 * The changed-only collection a ref names, "other" when it names only other
 * literal paths, or "?" when it is a variable. A literal counts as a
 * collection when a document id follows it (`"expenses", id`) or it is
 * `collection("expenses")`. `doc(db, "users", uid, "meta", "categories")` is a
 * document id, not the categories collection.
 */
function collectionIn(text: string): string {
  const named = CHANGED_ONLY.find(
    (c) =>
      new RegExp(`["'\`]${c}["'\`]\\s*,`).test(text) ||
      new RegExp(`collection\\(\\s*["'\`]${c}["'\`]`).test(text) ||
      new RegExp(`collection\\([^()]*["'\`]${c}["'\`]\\s*\\)`).test(text)
  );
  if (named) return named;
  return /["'`][A-Za-z_]+["'`]/.test(text) ? "other" : "?";
}
const lineOf = (source: string, index: number) => source.slice(0, index).split("\n").length;

/** First argument of a call's argument text "(a, b, ...)". */
function firstArg(args: string): string {
  let depth = 0;
  for (let i = 1; i < args.length; i++) {
    const ch = args[i];
    if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) {
      if (depth === 0) return args.slice(1, i);
      depth--;
    } else if (ch === "," && depth === 0) return args.slice(1, i);
  }
  return args.slice(1, -1);
}

/** Does this first argument look like a Firestore document reference? */
const looksLikeRef = (arg: string) =>
  /^\s*doc\(/.test(arg) || /(^|\.)ref\s*$/i.test(arg.trim()) || /Ref\s*$/.test(arg.trim()) || /\.doc\(/.test(arg);

export function findWrites(file: string, source: string): WriteCall[] {
  const calls: WriteCall[] = [];
  const rel = path.relative(root, file).replace(/\\/g, "/");

  for (const m of source.matchAll(/\b(updateDoc|setDoc|addDoc)\(|\.(update|set)\(/g)) {
    const open = m.index! + m[0].length - 1;
    const args = balanced(source, open);
    const target = firstArg(args);
    const fn = m[1] ?? m[2];
    if (fn !== "addDoc" && !looksLikeRef(target)) continue; // Map.set, hash.update, …
    const merge = /merge:\s*true/.test(args) || (fn === "set" && /,\s*true\s*\)\s*$/.test(args));
    const kind = fn === "update" || fn === "updateDoc" ? "update" : merge ? "merge" : "create";
    calls.push({ file: rel, line: lineOf(source, m.index!), kind, target: collectionIn(target), args });
  }

  // commitMutations ops: { op: "update" | "set", ref: doc(...), data: {...} }
  for (const m of source.matchAll(/op:\s*["'](update|set)["']/g)) {
    let i = m.index!;
    let depth = 0;
    for (; i >= 0; i--) {
      if (source[i] === "}") depth++;
      else if (source[i] === "{" && depth-- === 0) break;
    }
    if (i < 0) continue;
    const obj = balanced(source, i);
    const ref = /ref:\s*([^\n]+)/.exec(obj)?.[1] ?? "";
    const merge = /merge:\s*true/.test(obj);
    const kind = m[1] === "update" ? "update" : merge ? "merge" : "create";
    calls.push({ file: rel, line: lineOf(source, m.index!), kind, target: collectionIn(ref), args: obj });
  }
  return calls;
}

export function violations(calls: WriteCall[], fileWritesChangedOnly: (file: string) => boolean): string[] {
  const out: string[] = [];
  for (const call of calls) {
    const stamped = /\bupdatedAt\b/.test(call.args);
    const created = /\bcreatedAt\b/.test(call.args);
    if (call.target === "other") continue;
    if (call.target !== "?") {
      if (call.kind === "create" ? !(created || stamped) : !stamped) {
        out.push(`${call.file}:${call.line} ${call.kind} on ${call.target} sets no ${call.kind === "create" ? "createdAt" : "updatedAt"}`);
      }
      continue;
    }
    if (call.kind === "create" || stamped || !fileWritesChangedOnly(call.file)) continue;
    const allowed = (ALLOWED[call.file] ?? []).some((a) => matches(call.args, a.match));
    if (!allowed) out.push(`${call.file}:${call.line} ${call.kind} through a ref variable sets no updatedAt (stamp it, or add it to ALLOWED with the reason)`);
  }
  return out;
}

describe("sync stamp guard (SPENDLY-571)", () => {
  const files = DIRS.flatMap((d) => sourceFiles(path.join(root, d)));
  const sources = new Map(files.map((f) => [path.relative(root, f).replace(/\\/g, "/"), readFileSync(f, "utf8")]));
  const calls = files.flatMap((f) => findWrites(f, sources.get(path.relative(root, f).replace(/\\/g, "/"))!));
  const writesChangedOnly = (file: string) =>
    calls.some((c) => c.file === file && CHANGED_ONLY.includes(c.target)) ||
    CHANGED_ONLY.some((c) => new RegExp(`collection\\([^)]*["'\`]${c}["'\`]`).test(sources.get(file) ?? ""));

  it("finds the write sites it is meant to police", () => {
    // If the scanner silently matched nothing, the guard would pass vacuously.
    expect(calls.filter((c) => c.target === "expenses").length).toBeGreaterThan(5);
    expect(calls.filter((c) => c.target === "categories").length).toBeGreaterThan(3);
  });

  it("every write to a changed-only collection is visible to the incremental sync", () => {
    expect(violations(calls, writesChangedOnly)).toEqual([]);
  });

  it("every ALLOWED entry still matches a real call (no stale exemptions)", () => {
    for (const [file, entries] of Object.entries(ALLOWED)) {
      for (const entry of entries) {
        expect(calls.some((c) => c.file === file && matches(c.args, entry.match)), `${file}: ${entry.match}`).toBe(true);
      }
    }
  });
});

describe("sync stamp guard catches regressions", () => {
  it("flags an unstamped update and an unstamped create", () => {
    const src = `
      updateDoc(doc(db, "users", uid, "expenses", id), { amount: 1 });
      batch.set(doc(db, "users", uid, "categories", id), { name: "x" });
      batch.update(doc(db, "users", uid, "expenses", id), { amount: 1, updatedAt: serverTimestamp() });
      byId.set(split.id, split);
    `;
    const out = violations(findWrites(path.join(root, "hooks/x.ts"), src), () => true);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/update on expenses sets no updatedAt/);
    expect(out[1]).toMatch(/create on categories sets no createdAt/);
  });

  it("flags an unstamped commitMutations update op", () => {
    const src = `const ops = [{ op: "update", ref: doc(db, "users", u, "accountPayments", id), data: { amount: 2 } }];`;
    expect(violations(findWrites(path.join(root, "services/x.ts"), src), () => true)).toHaveLength(1);
  });

  it("flags an unstamped ref-variable update in a file that writes changed-only collections", () => {
    const src = `batch.update(expenseDoc.ref, { spaceId: null });`;
    expect(violations(findWrites(path.join(root, "hooks/y.ts"), src), () => true)).toHaveLength(1);
    expect(violations(findWrites(path.join(root, "hooks/y.ts"), src), () => false)).toHaveLength(0);
  });
});
