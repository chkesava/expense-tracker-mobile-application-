import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { SPEC_BY_COLLECTION } from "../shared/utils/readModel/mapping";

/**
 * SPENDLY-592 — READ_MODEL_RULES R4: current-state money comes from Supabase
 * only as copies of Firestore's stored values. SQL never computes a number the
 * app displays as a balance or summary.
 *
 * 1. Every SQL view or function that aggregates (sum/avg) is listed here with
 *    its purpose. A new one fails until someone decides, on purpose, what it is.
 * 2. None of them aggregates the stored-copy tables (financial summaries,
 *    balances, outstanding, cash), and nothing in SQL sums financial_summaries.
 * 3. The app reads only the history view among them, and never a recomputed
 *    balance or the invariant checks.
 */
const ROOT = join(__dirname, "..");
const MIGRATIONS = join(ROOT, "supabase-readmodel", "supabase", "migrations");

const AGGREGATING: Record<string, string> = {
  readmodel_invariants: "reconciliation only (R4.2): stored vs recomputed, never displayed",
  v_account_balances: "reconciliation only: recomputed_balance sits beside stored_balance for the invariant check",
  v_account_flows: "reconciliation input for v_account_balances",
  v_cash_flow_by_month: "history report (R3): month income/expense from the rows, golden-tested; the app reads it behind the analytics switch",
  v_cashback_history: "history report: cashback earned per period",
  v_period_totals: "history report: period totals from the rows, golden-tested",
};
/** The only aggregating object the app may read: a history report, not current-state money. */
const APP_READABLE = new Set(["v_cash_flow_by_month"]);

/** The latest definition of every public view and function, as the migrations leave them. */
function sqlObjects(): Map<string, string> {
  const defs = new Map<string, string>();
  for (const file of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), "utf8");
    const re = /create (?:or replace )?(?:view|function) public\.(\w+)([\s\S]*?)(?=\ncreate (?:or replace )?(?:view|function|table)|$)/gi;
    for (const m of sql.matchAll(re)) defs.set(m[1], m[2]);
  }
  return defs;
}

const AGGREGATE = /\b(sum|avg)\s*\(/i;
// The stored-copy columns and tables a display total must never be computed from.
const STORED_MONEY = /\bfinancial_summaries\b|\bcurrent_outstanding\b|\bcash_balance\b|\btotal_outstanding\b|\boutstanding_amount\b/i;

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("current-state money is never computed in SQL (SPENDLY-592, R4)", () => {
  const objects = sqlObjects();

  it("every aggregating view/function is a known reconciliation check or history report", () => {
    const aggregating = [...objects].filter(([, body]) => AGGREGATE.test(body)).map(([name]) => name).sort();
    expect(aggregating, "a new aggregating SQL object needs an entry (and a reason) in AGGREGATING").toEqual(Object.keys(AGGREGATING).sort());
  });

  it("nothing in SQL aggregates the stored summaries, outstanding amounts or cash", () => {
    const offenders = [...objects].filter(([, body]) => AGGREGATE.test(body) && STORED_MONEY.test(body)).map(([name]) => name);
    expect(offenders).toEqual([]);
    expect(SPEC_BY_COLLECTION.get("financialSummaries")?.table).toBe("financial_summaries");
  });

  it("the app reads only the history report, never a recomputed balance or the invariant checks", () => {
    const misuse: string[] = [];
    for (const dir of ["app", "components", "hooks", "lib", "providers", "services", "shared"]) {
      for (const file of sources(join(ROOT, dir))) {
        const text = readFileSync(file, "utf8");
        const rel = relative(ROOT, file).replace(/\\/g, "/");
        if (/\brecomputed_balance\b/.test(text)) misuse.push(`${rel}: recomputed_balance`);
        for (const name of Object.keys(AGGREGATING)) {
          if (APP_READABLE.has(name)) continue;
          if (new RegExp(`["'\`]${name}["'\`]`).test(text)) misuse.push(`${rel}: ${name}`);
        }
      }
    }
    expect(misuse).toEqual([]);
  });

  it("the retired summary documents are never copied", () => {
    expect(SPEC_BY_COLLECTION.get("financialSummaries")?.excludeDocIds).toEqual(["netWorth", "investments"]);
  });
});
