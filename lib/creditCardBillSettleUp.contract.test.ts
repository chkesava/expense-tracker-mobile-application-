import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DISPATCH_TARGET } from "../cloudflare/push-trigger/trigger";

/**
 * SPENDLY-719 guard, rewritten for epic SPENDLY-735 (the app only delivers).
 *
 * The bills list and every reminder trust the stored bill (`amountPaid`,
 * `status`, `remainingAmount`). Only the bill pass keeps it in line with the
 * ledger, where cashback also settles statements. Since SPENDLY-734 that pass
 * runs only on the server (`bill-daily`). Since SPENDLY-737 a money action
 * needs no call to start it: the save itself reaches the read model through
 * the app's write path (`rm_client_apply`, written_by = 'client'), whose
 * trigger queues the user and dispatches `bill-daily` in queue mode
 * (supabase-readmodel migration 20261112000000).
 *
 * So this guard pins the chain, end to end:
 * - the app runs no bill pass and sends no extra signal;
 * - every collection a money action writes is a bill input the trigger watches,
 *   and is one the app writes into the read model;
 * - the trigger dispatches the right workflow, which runs queue mode, gated.
 */
const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const MIGRATIONS = path.join(root, "supabase-readmodel", "supabase", "migrations");
const migration = read("supabase-readmodel/supabase/migrations/20261112000000_readmodel_bill_run_queue.sql");

/** Firestore collections the money actions write → their read-model tables. */
const BILL_INPUTS: Record<string, string> = {
  accountPayments: "account_payments", // bill payments, cashback (addCashback)
  creditCardBills: "credit_card_bills", // statements, payment stamps, mark paid
  expenses: "expenses", // card spend
  accounts: "accounts", // the card itself (bill day, outstanding)
};

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sources(full));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("stored bills are settled by the server after every money action (SPENDLY-719/734/737)", () => {
  it("the app runs no bill pass and sends no extra signal", () => {
    const offenders: string[] = [];
    for (const dir of ["app", "components", "providers", "hooks", "lib", "services"]) {
      for (const file of sources(path.join(root, dir))) {
        if (/\brequestBillPass\b|\bgenerateAutoBills\b/.test(readFileSync(file, "utf8"))) offenders.push(path.relative(root, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("cashback is written to a bill-input collection", () => {
    const finance = read("providers/FinanceDataProvider.tsx");
    const at = finance.indexOf("const addCashback = useCallback(");
    expect(at).toBeGreaterThan(-1);
    expect(finance.slice(at, at + 4000)).toContain('"accountPayments"');
  });

  it("the trigger watches every bill input, on insert and update, app saves only", () => {
    const list = migration.match(/foreach t in array array\[([^\]]+)\] loop/)?.[1] ?? "";
    const tables = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(tables).toEqual(Object.values(BILL_INPUTS).sort());
    expect(migration).toContain("after insert on public.%I referencing new table as changed");
    expect(migration).toContain("after update on public.%I referencing new table as changed");
    // Server writes (sync, push, bill-daily's own bills) never queue: no loops.
    expect(migration).toContain("where c.written_by = 'client'");
  });

  it("every bill input is one the app writes into the read model (rm_client_apply allowlist)", () => {
    const latest = readdirSync(MIGRATIONS)
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .filter((f) => readFileSync(path.join(MIGRATIONS, f), "utf8").includes("function public.readmodel_client_table_ok"))
      .pop();
    expect(latest).toBeTruthy();
    const sql = readFileSync(path.join(MIGRATIONS, latest!), "utf8");
    const body = sql.slice(sql.indexOf("function public.readmodel_client_table_ok"));
    for (const table of Object.values(BILL_INPUTS)) expect(body, table).toContain(`'${table}'`);
  });

  it("the trigger dispatches bill-daily.yml in queue mode, debounced, with no uid", () => {
    expect(migration).toContain(`https://api.github.com/repos/${DISPATCH_TARGET.repo}/actions/workflows/bill-daily.yml/dispatches`);
    expect(migration).toContain(
      "jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('dry_run', 'false', 'trigger', 'queue'))"
    );
    expect(migration).toContain("interval '60 seconds'");
  });

  it("bill-daily.yml accepts queue runs, gates them on BILL_DAILY_ENABLED and runs --queue", () => {
    const wf = read(".github/workflows/bill-daily.yml");
    expect(wf).toMatch(/options:\s*\n\s*- manual\s*\n\s*- cron\s*\n\s*- queue/);
    const condition = wf.match(/\n\s{4}if: (.+)\n/)?.[1] ?? "";
    expect(condition).toBe("vars.BILL_DAILY_ENABLED == 'true' || (inputs.trigger != 'cron' && inputs.trigger != 'queue')");
    expect(wf).toContain('if [ "$TRIGGER" = "queue" ]; then args="$args --queue"; fi');
  });
});
