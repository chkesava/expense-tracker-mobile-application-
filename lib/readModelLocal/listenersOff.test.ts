import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * SPENDLY-600 — switching a collection to `supabase` saves reads only if no
 * Firestore listener on it is mounted. Every `onSnapshot` on a collection
 * that reads through the switch must sit behind its `supabase` branch (an
 * early `return source.subscribe(...)`, or the other side of
 * `source.mode === "supabase" ? source.subscribe(...) : onSnapshot(...)`).
 *
 * A listener that deliberately stays on Firestore is listed in KEEP with its
 * reason (R4.3a: its data drives a write).
 */
const ROOT = join(__dirname, "..", "..");

/** The collections read through the switch (596–599, 673, 674, 600). */
const MIGRATED = new Set([
  "accountEntries", "accountPayments", "accountTransfers", "accountTypes", "accounts",
  "borrowingRepayments", "borrowings", "receivableRepayments", "receivables",
  "categoryBudgets", "creditCardBills", "expenses", "incomes", "investments",
  "holdings", "investmentCashTransactions", "portfolioSettings", "portfolioTransactions",
  "sipPlans", "sipTransactions", "virtualPositions", "subscriptions", "watchlists", "watchlists/items",
  "epfContributions", "epfEstablishments", "epfInterestEntries",
  "financialGoals", "financialSummaries", "netWorthHistory",
  "calendarReminders", "categories", "categorizationRules", "spaces",
  "groupFunds",
  "notifications",
]);

/** `file:collection` listeners that stay on Firestore on purpose. */
const KEEP: Record<string, string> = {
  // The single establishment on the EPF detail screen feeds its writers (598, R4.3a).
  "hooks/useEpf.ts:epfEstablishments#doc": "useEpfEstablishment: the detail screen's writers read it",
  // The Firestore listener behind the drill-downs' month store; the copy-backed
  // twin is chosen by the mode, and falls back to this one on a copy failure.
  "lib/summaryMonthStore.ts:financialSummaries": "firestoreMonth: firestore mode, and the copy store's fallback",
};

/** A listener whose document stands for a collection: categories load by revision (SPENDLY-660). */
const ALIASES: Record<string, string> = { meta: "categories" };

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const files = ["providers", "hooks", "app", "components", "lib", "services", "shared"].flatMap((d) => sources(join(ROOT, d)));
const constants = new Map<string, string>();
for (const file of files) {
  for (const m of readFileSync(file, "utf8").matchAll(/export const (\w+_COLLECTION)\s*=\s*"(\w+)"/g)) constants.set(m[1], m[2]);
}

/** The collection a listener's first argument names, following one `const x = …` if it's a variable. */
function collectionAt(text: string, at: number): string | null {
  let window = text.slice(at, at + 300);
  const arg = window.match(/^onSnapshot\(\s*(\w+)\s*,/) ?? window.match(/^onSnapshot\(\s*query\(\s*(\w+)\s*,/);
  if (arg && !["collection", "doc", "query"].includes(arg[1])) {
    const def = text.lastIndexOf(`const ${arg[1]} =`, at);
    if (def >= 0) window = text.slice(def, def + 300);
  }
  const nested = window.match(/"users",\s*\w+(?:\.uid)?,\s*"(\w+)",\s*\w+,\s*"(\w+)"/);
  if (nested && nested[1] !== "meta") return `${nested[1]}/${nested[2]}`;
  const literal =
    window.match(/"users",\s*\w+(?:\.uid)?,\s*"(\w+)"/) ??
    window.match(/\.\.\.base,\s*"(\w+)"/) ??
    window.match(/`users\/\$\{uid\}\/(\w+)`/);
  if (literal) return ALIASES[literal[1]] ?? literal[1];
  const constant = window.match(/\b([A-Z][A-Z_]*_COLLECTION)\b/);
  return constant ? constants.get(constant[1]) ?? null : null;
}

type Site = { file: string; collection: string; gated: boolean };

const sites: Site[] = [];
for (const full of files) {
  const file = relative(ROOT, full).replace(/\\/g, "/");
  const text = readFileSync(full, "utf8");
  // The variables bound to each collection's switch in this file.
  const switchVars = new Map<string, string[]>();
  for (const m of text.matchAll(/const\s+(\w+)\s*=\s*useReadModelSource\(\s*"([^"]+)"/g)) {
    switchVars.set(m[2], [...(switchVars.get(m[2]) ?? []), m[1]]);
  }
  for (const m of text.matchAll(/\bonSnapshot\(/g)) {
    const at = m.index ?? 0;
    const collection = collectionAt(text, at);
    if (!collection || !MIGRATED.has(collection)) continue;
    // The enclosing effect: from the last `useEffect(` before the listener.
    const effectStart = text.lastIndexOf("useEffect(", at);
    const before = text.slice(effectStart < 0 ? Math.max(0, at - 3000) : effectStart, at);
    const gated = (switchVars.get(collection) ?? []).some((v) => before.includes(`${v}.mode === "supabase"`));
    // useEpf's single-establishment listener is told apart from the list's.
    const single = file === "hooks/useEpf.ts" && /^onSnapshot\(\s*ref\b/.test(text.slice(at, at + 40));
    sites.push({ file, collection: single ? `${collection}#doc` : collection, gated });
  }
}

describe("no Firestore listener in supabase mode (SPENDLY-600)", () => {
  it("finds the migrated listeners (the scan works)", () => {
    const found = new Set(sites.map((s) => s.collection.replace("#doc", "")));
    for (const c of [
      "expenses", "incomes", "accounts", "holdings", "investments", "categories", "financialSummaries",
      "sipPlans", "calendarReminders", "epfContributions", "epfEstablishments", "watchlists/items",
    ]) {
      expect(found).toContain(c);
    }
  });

  it("every listener on a migrated collection is behind its supabase branch, or kept on purpose", () => {
    const offenders = sites
      .filter((s) => !s.gated && !KEEP[`${s.file}:${s.collection}`])
      .map((s) => `${s.file}: ${s.collection}`);
    expect(offenders).toEqual([]);
  });

  it("each kept listener still exists (no stale exemptions)", () => {
    for (const key of Object.keys(KEEP)) {
      expect(sites.some((s) => `${s.file}:${s.collection}` === key && !s.gated)).toBe(true);
    }
  });

  it("the drill-downs' month store has a copy-backed twin chosen by the mode", () => {
    const hook = readFileSync(join(ROOT, "hooks", "useSpendingDrilldown.ts"), "utf8");
    expect(hook).toMatch(/useReadModelMode\("financialSummaries"\) === "supabase" \? copySummaryMonthStore : summaryMonthStore/);
    const store = readFileSync(join(ROOT, "lib", "summaryMonthStore.ts"), "utf8");
    expect(store).toMatch(/export const copySummaryMonthStore = createSummaryMonthStore\(/);
  });
});
