import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { READ_MODEL_COLLECTIONS, SWITCHED_COLLECTIONS } from "@/shared/utils/readModel/collectionMode";

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
  // SPENDLY-598 part A: portfolio, SIP, subscriptions, watchlists.
  "holdings", "investmentCashTransactions", "portfolioSettings", "portfolioTransactions",
  "sipPlans", "sipTransactions", "subscriptions", "virtualPositions", "watchlists", "watchlists/items",
  // SPENDLY-598 part B: EPF, for display-only callers only (readFrom: "copy").
  "epfContributions", "epfEstablishments", "epfInterestEntries",
  // SPENDLY-599: the dashboard tiles + EPF summary, net-worth history, goals.
  "financialGoals", "financialSummaries", "netWorthHistory",
  // SPENDLY-674: reference data.
  "calendarReminders", "categories", "categorizationRules", "spaces",
  // SPENDLY-685: Group Funds (display only; writers load the fund from Firestore).
  "groupFunds",
  // SPENDLY-230: the unified inbox's notification rows.
  "notifications",
].sort();

const NOT_YET: Record<string, string> = {
  epfTransfers: "every caller writes from them (transfers, interest, catch-up); stays on Firestore (598)",
  epfReconciliations: "interest recompute and the summary sync write from them; stays on Firestore (598)",
  epfWageHistory: "the contribution catch-up writes from it; stays on Firestore (598)",
  epfProfile: "the EPF dashboard writes from it; stays on Firestore (598)",
  merchantOverrides: "one-off service reads on screen open; stays on Firestore (674)",
  recurringDismissals: "the recurring sync writes from them; stays on Firestore (674)",
  userSettings: "allowlisted fields only: never a source; the PIN/duress fields keep the users/{uid} listener on Firestore (674)",
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
    for (const m of text.matchAll(/const\s+(\w+)\s*=\s*useReadModelSource\(\s*"([^"]+)"\s*(?:,[^;]*)?\)/g)) {
      uses.push({ file: relative(ROOT, file).replace(/\\/g, "/"), variable: m[1], collection: m[2], text });
    }
  }
}
const count = (text: string, needle: string) => text.split(needle).length - 1;

describe("provider read switches (SPENDLY-673)", () => {
  it("the integrated collections are exactly the expected ones", () => {
    expect([...new Set(uses.map((u) => u.collection))].sort()).toEqual(INTEGRATED);
    for (const c of INTEGRATED) expect(READ_MODEL_COLLECTIONS).toContain(c);
    // SPENDLY-690: the bulk switch workflow sets exactly these.
    expect([...SWITCHED_COLLECTIONS].sort()).toEqual(INTEGRATED);
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
  // SPENDLY-734: the credit card bill pass left the app; the server reconciler
  // finds the work on the read model and writes only from Firestore. The app
  // must not write bills from what it reads at all.
  it("the app runs no credit card bill pass: no statement, allocation or merge is computed from screen data", () => {
    const text = readFileSync(join(ROOT, "providers", "CreditCardBillsProvider.tsx"), "utf8");
    for (const banned of [
      "generateAutoBills",
      "planBillPass",
      "collectAutoCreditCardBillDrafts",
      "collectAutoCreditCardBillRefreshPatches",
      "collectCreditBillAllocationPatches",
      "collectCreditBillDuplicateResolutions",
      "createAutoCreditCardBill",
    ]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it("the account baseline repair confirms on Firestore when accounts come from the copy", () => {
    const text = readFileSync(join(ROOT, "providers", "FinanceDataProvider.tsx"), "utf8");
    expect(text).toMatch(/accountsSource\.mode === "supabase"\s*\?\s*getDoc\(doc\(db, "users", uid, "accounts", accountId\)\)/);
  });

  // SPENDLY-598 (R4.3a): more writers that write from what the screens read.
  // SPENDLY-739 (epic SPENDLY-735): subscription posting left the app; the
  // server's subscription-daily job plans on Firestore data (R4.3a). The app
  // must not post charges from what it reads at all.
  it("the app runs no subscription auto-post: no charge is planned or posted from screen data", () => {
    const text = readFileSync(join(ROOT, "providers", "ExpenseReferenceDataProvider.tsx"), "utf8");
    for (const banned of ["processDueSubscriptions", "planDueSubscriptionPosts", "postDueSubscriptionCharge", "evaluateSubscriptionDue"]) {
      expect(text, banned).not.toContain(banned);
    }
  });

  it("watchlist setup confirms on the server that there are no lists before writing", () => {
    const text = readFileSync(join(ROOT, "hooks", "useWatchlists.ts"), "utf8");
    expect(text).toMatch(/listsSourceModeRef\.current === "supabase"/);
    expect(text).toMatch(/existing\.metadata\.fromCache/);
  });

  it("the daily portfolio snapshot checks holdings on Firestore when they come from the copy", () => {
    const text = readFileSync(join(ROOT, "hooks", "usePortfolio.ts"), "utf8");
    expect(text).toMatch(/holdingsSourceModeRef\.current === "supabase"/);
    expect(text).toMatch(/holdingsFingerprint\(/);
  });

  it("EPF hooks read the copy only for a caller that opts in (readFrom: \"copy\")", () => {
    const epf = uses.filter((u) => u.collection.startsWith("epf"));
    expect(epf.length).toBeGreaterThan(0);
    for (const u of epf) expect(u.text).toContain(`useReadModelSource("${u.collection}", { copy: options?.readFrom === "copy" })`);
  });

  it("only display-only EPF callers opt in, and they take no writer from the hook", () => {
    const optIns: string[] = [];
    for (const dir of ["providers", "hooks", "app", "components"]) {
      for (const file of sources(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        // A call (`= useEpf…({ readFrom: "copy" })`), not a definition or a comment.
        if (/=\s*useEpf\w*\([^;]*readFrom: "copy"/.test(text)) optIns.push(relative(ROOT, file).replace(/\\/g, "/"));
      }
    }
    expect(optIns.sort()).toEqual([
      "components/epf/EpfContributionHistory.tsx",
      "components/epf/EpfCurrentMonthCard.tsx",
      "hooks/useEpfNetWorth.ts",
      "hooks/useFinancialCalendar.ts",
    ]);
    // The EPF writers that compute from loaded rows (R4.3a).
    const writers = /\b(saveContributions?|applyTransition|recordCredit|markMissed|markReversed|deleteContribution|discardDrafts|repairCreditWindows|repairLifecycleStates|recomputeInterest|recordReconciliation|saveProfile|addEstablishment|updateEstablishment|closeEstablishment|archiveEstablishment|restoreEstablishment|deleteEstablishment)\b/;
    for (const file of optIns) expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(writers);
  });

  // SPENDLY-599 (R4.3a).
  it("the EPF summary sync compares with the stored summary on Firestore; only display opts into the copy", () => {
    const summaries = readFileSync(join(ROOT, "hooks", "useDomainSummaries.ts"), "utf8");
    expect(summaries).toContain('useReadModelSource("financialSummaries", { copy: options?.readFrom === "copy" })');
    const sync = readFileSync(join(ROOT, "hooks", "useEpfSummarySync.ts"), "utf8");
    expect(sync).toMatch(/useEpfSummary\(\)/);
  });

  it("the net-worth point confirms its history and inputs on Firestore when any comes from the copy", () => {
    const recorder = readFileSync(join(ROOT, "hooks", "useNetWorthSnapshotRecorder.ts"), "utf8");
    expect(recorder).toMatch(/if \(snapshotReadsCopy\(modesRef\.current\)\) \{\s*const verdict = await confirmSnapshotOnFirestore\(/);
    expect(recorder).toMatch(/useReadModelModes\(NET_WORTH_SNAPSHOT_COLLECTIONS\)/);
    const verify = readFileSync(join(ROOT, "services", "netWorth", "netWorthSnapshotVerify.ts"), "utf8");
    // Every source of composeNetWorth's totals (the ledger only raises a non-blocking flag).
    for (const c of ["accounts", "accountTypes", "investments", "holdings", "investmentCashTransactions", "borrowings", "borrowingRepayments", "receivables", "receivableRepayments"]) {
      expect(verify).toContain(`{ collection: "${c}" }`);
    }
    expect(verify).toContain('{ collection: "financialSummaries", docId: "epf" }');
    expect(verify).toMatch(/if \(one\.metadata\.fromCache\) return null;/);
    expect(verify).toMatch(/all\.metadata\.fromCache \? null/);
  });

  it("goal writes are built from Firestore's goals when the copy serves them", () => {
    const text = readFileSync(join(ROOT, "hooks", "useFinancialGoals.ts"), "utf8");
    expect(text).toMatch(/if \(goalsModeRef\.current === "supabase" && db\) \{\s*const snap = await getDocs\(query\(collection\(db, "users", uid, "financialGoals"\)/);
    expect(text).toMatch(/goalsRef\.current = snap\.docs\.map/);
  });

  // SPENDLY-674 (R4.3a).
  it("category rename, delete and merge rewrite from Firestore when the copy serves categories or expenses", () => {
    const text = readFileSync(join(ROOT, "hooks", "useCategories.ts"), "utf8");
    expect(text).toMatch(/const expensesInMemory = expensesComplete && expensesMode !== "supabase";/);
    expect(text).not.toMatch(/= expensesComplete\s*\?/);
    expect(text).toMatch(/if \(categoriesMode !== "supabase" \|\| !uid\) return categories;/);
    expect(count(text, "await categoriesForWrite(db)")).toBe(3);
  });

  it("in supabase mode categories come from the copy; the revision listener stays for firestore mode", () => {
    const text = readFileSync(join(ROOT, "providers", "ExpenseReferenceDataProvider.tsx"), "utf8");
    expect(text).toMatch(/if \(categoriesSource\.mode === "supabase"\) \{[\s\S]{0,200}return categoriesSource\.subscribe\(/);
    expect(text).toContain('doc(db, "users", uid, "meta", "categories")');
  });

  it("SIP execution reads its plans and positions from Firestore itself", () => {
    const text = readFileSync(join(ROOT, "services", "sip", "executeSips.ts"), "utf8");
    expect(text).toMatch(/getDocs\(collection\(db, "users", owner, "sipPlans"\)\)/);
    expect(text).toMatch(/getDocs\(collection\(db, "users", owner, "virtualPositions"\)\)/);
  });
});
