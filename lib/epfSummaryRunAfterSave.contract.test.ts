import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DISPATCH_TARGET } from "../cloudflare/push-trigger/trigger";
import { READ_MODEL_TABLES } from "../shared/utils/readModel/mapping";

/**
 * SPENDLY-790 guard. Since SPENDLY-740 only the server (`epf-daily`) writes
 * `financialSummaries/epf`, which net worth, the Accounts EPF card, the
 * dashboard and runway read. Without a run after a save, a backfill or "mark
 * credited" made after the 08:30 IST run stayed off those screens for a day.
 *
 * The chain, as for bills (SPENDLY-737): the app's EPF save reaches the read
 * model (`rm_client_apply`, written_by = 'client'); a trigger on every EPF
 * ledger input queues the owner and dispatches `epf-daily` in queue mode
 * (supabase-readmodel migration 20261117000000). This pins:
 * - every ledger collection the summary is computed from (except the
 *   server-written interest) is watched, and is one the app writes;
 * - the dispatch names epf-daily.yml, queue mode, debounced, no uid, and the
 *   bill dispatch still stands;
 * - the workflow takes queue runs, gated, and the script serves the queue.
 */
const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const MIGRATIONS = path.join(root, "supabase-readmodel", "supabase", "migrations");
const migration = read("supabase-readmodel/supabase/migrations/20261117000000_readmodel_epf_run_queue.sql");

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

/** Firestore collections the EPF summary is derived from → read-model tables. */
const EPF_LEDGER_INPUTS: Record<string, string> = {
  epfEstablishments: "epf_establishments",
  epfContributions: "epf_contributions", // backfill, mark credited / missed / reversed
  epfTransfers: "epf_transfers",
  epfReconciliations: "epf_reconciliations", // "Record EPFO balance"
};

describe("the EPF summary is recomputed on the server after every EPF save (SPENDLY-790)", () => {
  it("the inputs are the read-model tables of the EPF ledger collections", () => {
    for (const [collection, table] of Object.entries(EPF_LEDGER_INPUTS)) {
      expect(READ_MODEL_TABLES.find((s) => s.collection === collection)?.table, collection).toBe(table);
    }
  });

  it("the server job loads exactly those collections plus its own interest entries", () => {
    const script = read("scripts/epf-daily.ts");
    const load = script.slice(script.indexOf("async load(uid)"), script.indexOf("db: db as unknown as JobDb"));
    for (const name of ["EPF_ESTABLISHMENTS_COLLECTION", "EPF_CONTRIBUTIONS_COLLECTION", "EPF_TRANSFERS_COLLECTION", "EPF_RECONCILIATIONS_COLLECTION", "EPF_INTEREST_ENTRIES_COLLECTION"]) {
      expect(load, name).toContain(name);
    }
  });

  it("the trigger watches every EPF ledger input, on insert and update, app saves only", () => {
    const list = migration.match(/foreach t in array array\[([^\]]+)\] loop/)?.[1] ?? "";
    const tables = [...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(tables).toEqual(Object.values(EPF_LEDGER_INPUTS).sort());
    // Interest entries are written by epf-daily itself: watching them would loop.
    expect(tables).not.toContain("epf_interest_entries");
    expect(migration).toContain("after insert on public.%I referencing new table as changed");
    expect(migration).toContain("after update on public.%I referencing new table as changed");
    expect(migration).toContain("where c.written_by = 'client'");
    expect(migration).toContain("select distinct c.uid, 'epf-daily', now()");
  });

  it("every EPF input is one the app writes into the read model (rm_client_apply allowlist)", () => {
    const body = latestDefinition("readmodel_client_table_ok");
    for (const table of Object.values(EPF_LEDGER_INPUTS)) expect(body, table).toContain(`'${table}'`);
  });

  it("the live dispatch sends epf-daily.yml and bill-daily.yml in queue mode, debounced per job, with no uid", () => {
    const dispatch = latestDefinition("server_run_dispatch");
    expect(dispatch).toContain(`https://api.github.com/repos/${DISPATCH_TARGET.repo}/actions/workflows/' || workflow || '/dispatches`);
    expect(dispatch).toContain("when 'epf-daily' then 'epf-daily.yml'");
    expect(dispatch).toContain("when 'bill-daily' then 'bill-daily.yml'");
    expect(dispatch).toContain(
      "jsonb_build_object('ref', 'main', 'inputs', jsonb_build_object('dry_run', 'false', 'trigger', 'queue'))"
    );
    expect(dispatch).toContain("interval '60 seconds'");
    expect(dispatch).not.toMatch(/\buid\b/);
  });

  it("epf-daily.yml accepts queue runs, gates them on EPF_DAILY_ENABLED and runs --queue", () => {
    const wf = read(".github/workflows/epf-daily.yml");
    expect(wf).toMatch(/options:\s*\n\s*- manual\s*\n\s*- cron\s*\n\s*- queue/);
    const condition = wf.match(/\n\s{4}if: (.+)\n/)?.[1] ?? "";
    expect(condition).toBe("vars.EPF_DAILY_ENABLED == 'true' || (inputs.trigger != 'cron' && inputs.trigger != 'queue')");
    expect(wf).toContain('if [ "$TRIGGER" = "queue" ]; then args="$args --queue"; fi');
  });

  it("queue mode serves the epf-daily queue and skips the contribution catch-up", () => {
    const script = read("scripts/epf-daily.ts");
    expect(script).toContain('supabaseServerRunQueue(client, "epf-daily")');
    expect(script).toContain('log("epf-daily: catch-up skipped (queue mode)")');
  });
});
