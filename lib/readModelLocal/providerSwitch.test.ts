import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { READ_MODEL_COLLECTIONS } from "@/shared/utils/readModel/collectionMode";

/**
 * SPENDLY-673 — providers' read switches, checked in their source.
 *
 * Each `useReadModelSource("<collection>")` must keep today's Firestore
 * listener (the `firestore` default), read the copy only in `supabase` mode,
 * compare only in `shadow` mode, and re-run its effect when the mode changes.
 *
 * Some collections must NOT read from the copy yet: their data drives a write,
 * or their screen's story migrates them with its own rules.
 */
const ROOT = join(__dirname, "..", "..");

const INTEGRATED = [
  // SPENDLY-597: accounts and the account ledger.
  "accountEntries", "accountPayments", "accountTransfers", "accountTypes", "accounts",
  "borrowingRepayments", "borrowings", "categoryBudgets", "creditCardBills",
  // SPENDLY-596: the Journal's newest-300 window (FinanceDataProvider).
  "expenses", "incomes",
  "investments", "receivableRepayments", "receivables",
];

const NOT_YET: Record<string, string> = {
  subscriptions: "drives due-subscription auto-posting, which waits for server-confirmed data (SPENDLY-525); 598",
  sipPlans: "drives SIP execution (executeSips writes from it); 598",
  sipTransactions: "read by SIP execution; 598",
  virtualPositions: "SIP execution updates positions from it; 598",
  epfContributions: "the EPF summary sync writes from EPF sources; 598",
  epfEstablishments: "the EPF summary sync writes from EPF sources; 598",
  epfTransfers: "the EPF summary sync writes from EPF sources; 598",
  epfInterestEntries: "the EPF summary sync writes from EPF sources; 598",
  epfReconciliations: "the EPF summary sync writes from EPF sources; 598",
  financialSummaries: "the EPF summary sync compares against the stored summary; 599",
  categories: "loaded by revision (SPENDLY-660), not a plain listener; 674",
  financialGoals: "pending-write state per goal (SPENDLY-613); 599",
  userSettings: "allowlisted fields only: never a source",
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

type Use = { file: string; variable: string; collection: string; text: string };
const uses: Use[] = [];
for (const dir of ["providers", "hooks", "app", "components"]) {
  for (const file of sources(join(ROOT, dir))) {
    // The hook itself (its doc comment shows an example use).
    if (file.endsWith("useReadModelSource.ts")) continue;
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/const\s+(\w+)\s*=\s*useReadModelSource\(\s*"([^"]+)"\s*\)/g)) {
      uses.push({ file: relative(ROOT, file).replace(/\\/g, "/"), variable: m[1], collection: m[2], text });
    }
  }
}
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("provider read switches (SPENDLY-673)", () => {
  it("the integrated collections are exactly the expected ones", () => {
    expect([...new Set(uses.map((u) => u.collection))].sort()).toEqual(INTEGRATED);
    for (const c of INTEGRATED) expect(READ_MODEL_COLLECTIONS).toContain(c);
  });

  it("no provider reads a not-yet collection from the copy", () => {
    const offenders = uses.filter((u) => NOT_YET[u.collection]).map((u) => `${u.file}: ${u.collection} (${NOT_YET[u.collection]})`);
    expect(offenders).toEqual([]);
  });

  it.each(uses.map((u) => [`${u.file} → ${u.collection}`, u] as const))("%s keeps Firestore by default and switches safely", (_label, u) => {
    // Today's listener is still there: `firestore` (the default) changes nothing.
    expect(u.text).toMatch(/\bonSnapshot\(/);
    // The copy is read only in supabase mode…
    const subscribes = count(u.text, `${u.variable}.subscribe(`);
    expect(subscribes).toBeGreaterThan(0);
    expect(count(u.text, `${u.variable}.mode === "supabase"`)).toBeGreaterThanOrEqual(subscribes);
    // …compared only in shadow mode…
    expect(count(u.text, `if (${u.variable}.mode === "shadow") void ${u.variable}.shadow(`)).toBe(count(u.text, `${u.variable}.shadow(`));
    // …and the effect re-runs when the mode changes (a session fallback included).
    expect(u.text).toMatch(new RegExp(`\\b${u.variable}\\.mode[,\\]]`));
  });

  // SPENDLY-597 (R4.3a): writers that write from what the screens read.
  it("the credit card bill pass never writes from the copy: it checks its inputs' modes and verifies on Firestore", () => {
    const text = readFileSync(join(ROOT, "providers", "CreditCardBillsProvider.tsx"), "utf8");
    expect(text).toMatch(/billPassReadsCopy\(passInputModesRef\.current\)/);
    expect(text).toMatch(/loadAuthoritativeBillInputs\(firestoreBillReader\(/);
    for (const c of ["expenses", "accountPayments", "accounts", "accountTypes"]) {
      expect(text).toContain(`useReadModelMode("${c}")`);
    }
  });

  it("the account baseline repair confirms on Firestore when accounts come from the copy", () => {
    const text = readFileSync(join(ROOT, "providers", "FinanceDataProvider.tsx"), "utf8");
    expect(text).toMatch(/accountsSource\.mode === "supabase"\s*\?\s*getDoc\(doc\(db, "users", uid, "accounts", accountId\)\)/);
  });
});
