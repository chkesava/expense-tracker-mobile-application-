import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DISPATCH_TARGET } from "../cloudflare/push-trigger/trigger";
import { READ_MODEL_TABLES } from "../shared/utils/readModel/mapping";

/**
 * SPENDLY-791 guard. A Space's totals used to be added up in the app from the
 * months the Journal had loaded, so an expense in an unloaded month (August)
 * was missing. Now only the server (`space-daily`) writes them, from every
 * expense in the Space, into `financialSummaries/spaces`.
 *
 * The chain, as for EPF (SPENDLY-790): the app's save reaches the read model
 * (`rm_client_apply`, written_by = 'client'); a trigger on spaces and on
 * expenses in a Space (now or before) queues the owner and dispatches
 * `space-daily` in queue mode (migration 20261119000000). The Worker's daily
 * tick runs it for every Space owner. This pins:
 * - the triggers, the dispatch and the workflow;
 * - the app shows stored totals, never sums a Space from loaded months.
 */
const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
const MIGRATIONS = path.join(root, "supabase-readmodel", "supabase", "migrations");
const migration = read("supabase-readmodel/supabase/migrations/20261119000000_readmodel_space_run_queue.sql");

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

describe("Space totals are computed on the server after every Space save (SPENDLY-791)", () => {
  it("the watched tables are the read-model tables of spaces and expenses, both app-written", () => {
    expect(READ_MODEL_TABLES.find((s) => s.collection === "spaces")?.table).toBe("spaces");
    expect(READ_MODEL_TABLES.find((s) => s.collection === "expenses")?.table).toBe("expenses");
    const allow = latestDefinition("readmodel_client_table_ok");
    for (const table of ["spaces", "expenses"]) expect(allow, table).toContain(`'${table}'`);
  });

  it("spaces queue on any app save; expenses only when in a Space now or before", () => {
    expect(migration).toMatch(/create trigger spaces_space_run_ins after insert on public\.spaces\s+referencing new table as changed/);
    expect(migration).toMatch(/create trigger spaces_space_run_upd after update on public\.spaces\s+referencing new table as changed/);
    expect(migration).toMatch(/create trigger expenses_space_run_ins after insert on public\.expenses\s+referencing new table as changed/);
    expect(migration).toMatch(/create trigger expenses_space_run_upd after update on public\.expenses\s+referencing old table as previous new table as changed/);
    expect(migration).toContain("coalesce(c.doc->>'spaceId', '') <> '' or coalesce(p.doc->>'spaceId', '') <> ''");
    expect(migration.match(/c\.written_by = 'client'/g)?.length).toBe(3);
    // financialSummaries is written by space-daily itself: watching it would loop.
    expect(migration).not.toMatch(/on public\.financial_summaries/);
  });

  it("the live dispatch sends space-daily.yml, and still bill-daily and epf-daily, debounced, with no uid", () => {
    const dispatch = latestDefinition("server_run_dispatch");
    expect(dispatch).toContain(`https://api.github.com/repos/${DISPATCH_TARGET.repo}/actions/workflows/' || workflow || '/dispatches`);
    expect(dispatch).toContain("when 'space-daily' then 'space-daily.yml'");
    expect(dispatch).toContain("when 'epf-daily' then 'epf-daily.yml'");
    expect(dispatch).toContain("when 'bill-daily' then 'bill-daily.yml'");
    expect(dispatch).toContain("interval '60 seconds'");
    expect(dispatch).not.toMatch(/\buid\b/);
  });

  it("space-daily.yml accepts cron and queue runs, gates both on SPACE_DAILY_ENABLED and runs --queue", () => {
    const wf = read(".github/workflows/space-daily.yml");
    expect(wf).toMatch(/options:\s*\n\s*- manual\s*\n\s*- cron\s*\n\s*- queue/);
    const condition = wf.match(/\n\s{4}if: (.+)\n/)?.[1] ?? "";
    expect(condition).toBe("vars.SPACE_DAILY_ENABLED == 'true' || (inputs.trigger != 'cron' && inputs.trigger != 'queue')");
    expect(wf).toContain('if [ "$TRIGGER" = "queue" ]; then args="$args --queue"; fi');
    expect(read("scripts/space-daily.ts")).toContain('supabaseServerRunQueue(client, "space-daily")');
  });

  it("the server loads every expense of the Spaces by spaceId, never a month window", () => {
    const script = read("scripts/space-daily.ts");
    const load = script.slice(script.indexOf("async load(uid)"), script.indexOf("db: db as unknown as JobDb"));
    expect(load).toContain('.where("spaceId", "in"');
    expect(load).not.toMatch(/where\("date"|month/);
  });

  it("the Spaces screens show stored totals and never sum a Space from loaded expenses", () => {
    for (const file of ["components/spaces/SpacesList.tsx", "components/spaces/SpaceDetailModal.tsx"]) {
      const src = read(file);
      expect(src, file).not.toMatch(/\bsummarizeSpaces?\(|buildSpaceCategoryBreakdown\(/);
    }
    expect(read("components/spaces/SpacesList.tsx")).toContain("useSpacesSummary()");
    expect(read("hooks/useSpacesSummary.ts")).toContain('useReadModelSource("financialSummaries")');
  });
});
