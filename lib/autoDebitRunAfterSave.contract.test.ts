import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DAILY_WORKFLOWS, DISPATCH_TARGET } from "../cloudflare/push-trigger/trigger";
import { READ_MODEL_TABLES } from "../shared/utils/readModel/mapping";

/**
 * SPENDLY-796 guard (epic SPENDLY-793). Whether an account covers its coming
 * auto-debits is computed only on the server (`autodebit-daily`) and stored at
 * `serverResults/autoDebitShortfall`. The app and the push only read it.
 *
 * The chain is the same as for Spaces (SPENDLY-791):
 * 1. The app's save reaches the read model (`rm_client_apply`, written_by =
 *    'client').
 * 2. A trigger on subscriptions, accounts, card bills and group funds queues
 *    the owner, and dispatches `autodebit-daily` in queue mode (migration
 *    20261121000000).
 * 3. The Worker's daily tick runs it for every user.
 *
 * This pins those triggers, the dispatch, the workflow and the Worker.
 */
const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const MIGRATIONS = path.join(root, "supabase-readmodel", "supabase", "migrations");
const migration = read("supabase-readmodel/supabase/migrations/20261121000000_readmodel_autodebit_run_queue.sql");

/** The latest migration that (re)defines `fn`, from its definition on. */
function latestDefinition(fn: string): string {
  const file = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .filter((f) => readFileSync(path.join(MIGRATIONS, f), "utf8").includes(`function public.${fn}(`))
    .pop();
  expect(file, fn).toBeTruthy();
  const sql = readFileSync(path.join(MIGRATIONS, file!), "utf8").replace(/\r\n/g, "\n");
  const at = sql.indexOf(`function public.${fn}(`);
  return sql.slice(at, sql.indexOf("\n$$;", at));
}

describe("auto-debit shortfalls are recomputed on the server after a relevant save (SPENDLY-796)", () => {
  it("the watched tables are the read-model tables of the engine's inputs, all app-written", () => {
    const allow = latestDefinition("readmodel_client_table_ok");
    for (const [collection, table] of [
      ["subscriptions", "subscriptions"],
      ["accounts", "accounts"],
      ["creditCardBills", "credit_card_bills"],
      ["groupFunds", "group_funds"],
    ]) {
      expect(READ_MODEL_TABLES.find((s) => s.collection === collection)?.table, collection).toBe(table);
      expect(allow, table).toContain(`'${table}'`);
    }
  });

  it("app saves queue: items that debit an account (now or before), and the inputs of users with auto-debits", () => {
    expect(migration).toMatch(/create trigger subscriptions_autodebit_run_ins after insert on public\.subscriptions\s+referencing new table as changed/);
    expect(migration).toMatch(/create trigger subscriptions_autodebit_run_upd after update on public\.subscriptions\s+referencing old table as previous new table as changed/);
    expect(migration).toMatch(/create trigger accounts_autodebit_run_upd after update on public\.accounts\s+referencing old table as previous new table as changed/);
    expect(migration).toContain("array['credit_card_bills', 'group_funds']");
    expect(migration).toContain("coalesce(c.account_id, '') <> '' or coalesce(p.account_id, '') <> ''");
    expect(migration).toContain("coalesce(p.doc->>'autopayFromAccountId', '') <> ''");
    expect(migration.match(/c\.written_by = 'client'/g)?.length).toBe(5);
    // serverResults is written by the job itself: watching it would loop.
    expect(migration).not.toMatch(/on public\.server_results/);
  });

  it("the live dispatch sends autodebit-daily.yml and still every earlier job, debounced, with no uid", () => {
    const dispatch = latestDefinition("server_run_dispatch");
    expect(dispatch).toContain(`https://api.github.com/repos/${DISPATCH_TARGET.repo}/actions/workflows/' || workflow || '/dispatches`);
    for (const job of ["bill-daily", "epf-daily", "space-daily", "autodebit-daily"]) {
      expect(dispatch).toContain(`when '${job}' then '${job}.yml'`);
    }
    expect(dispatch).toContain("interval '60 seconds'");
    expect(dispatch).not.toMatch(/\buid\b/);
  });

  it("autodebit-daily.yml accepts cron and queue runs, gates both on AUTODEBIT_DAILY_ENABLED and runs --queue", () => {
    const wf = read(".github/workflows/autodebit-daily.yml");
    expect(wf).toMatch(/options:\s*\n\s*- manual\s*\n\s*- cron\s*\n\s*- queue/);
    const condition = wf.match(/\n\s{4}if: (.+)\n/)?.[1] ?? "";
    expect(condition).toBe("vars.AUTODEBIT_DAILY_ENABLED == 'true' || (inputs.trigger != 'cron' && inputs.trigger != 'queue')");
    expect(wf).toContain('if [ "$TRIGGER" = "queue" ]; then args="$args --queue"; fi');
    expect(read("scripts/autodebit-daily.ts")).toContain('supabaseServerRunQueue(client, "autodebit-daily")');
    expect(DAILY_WORKFLOWS).toContain("autodebit-daily.yml");
  });

  it("the job reads its inputs from Firestore and computes with the shared engine", () => {
    // SPENDLY-797: one loader and one engine call, shared with the push's send-time re-check.
    expect(read("scripts/lib/autoDebitDailyCore.ts")).toContain("computeForInputs(");
    expect(read("shared/utils/autoDebitInputs.ts")).toContain("computeAutoDebitShortfall(");
    const script = read("scripts/autodebit-daily.ts");
    expect(script).toContain("loadAutoDebitInputs(");
    expect(script).not.toMatch(/\.from\("(subscriptions|accounts|credit_card_bills|group_funds)"\)/);
    expect(read("shared/utils/push/sources/lowBalanceSource.ts")).toContain("loadAutoDebitInputs(");
  });
});
