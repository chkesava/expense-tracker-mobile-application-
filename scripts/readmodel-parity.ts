/**
 * SPENDLY-510 — nightly parity findings and the 14-day gate report.
 *
 *   npx tsx scripts/readmodel-parity.ts            record tonight's invariant findings (mode `parity`)
 *   npx tsx scripts/readmodel-parity.ts --report   print the 14-day gate report (markdown, no uids)
 *
 * Findings (readmodel_invariants, v_data_quality) describe the data as
 * Firestore holds it: orphans, duplicate cashback, overpaid bills, balances
 * the Wave 1 rows don't explain, missing amounts. They are reported, not
 * failed on; divergence of the copy itself is caught by field parity (sync)
 * and count parity (verify). Reads only Supabase.
 */
import { appendFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { all } from "./lib/supabasePaging";
import { parityGate, renderParityReport, summarizeFindings, type Finding } from "./lib/readmodelParity";
import type { HealthRun } from "./lib/readmodelHealth";

async function must<T>(label: string, result: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await result;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function recordFindings(client: SupabaseClient): Promise<string> {
  // Paged with a stable order: PostgREST cuts a response at 1,000 rows without an error.
  const findings = await all<Finding>("readmodel_invariants", (from, to) =>
    client.rpc("readmodel_invariants").order("uid").order("check_name").order("doc_id").range(from, to)
  );
  const quality = await all<{ uid: string; collection: string; problem: string }>("v_data_quality", (from, to) =>
    client.from("v_data_quality").select("uid, collection, problem").order("uid").order("collection").order("problem").range(from, to)
  );
  const summary = summarizeFindings(findings, quality);
  const run = (await must("sync_runs", client.from("sync_runs").insert({ mode: "parity", read_budget: 0 }).select("id").single())) as { id: number };
  await must("sync_runs", client.from("sync_runs").update({
    finished_at: new Date().toISOString(), status: "succeeded", reads_used: 0, failures: 0, notes: summary,
  }).eq("id", run.id));
  const lines = [
    "## Read-model parity findings",
    "",
    "These describe the data as Firestore holds it (not sync divergence). Counts by check, never users.",
    "",
    "| Check | Rows | Users |",
    "|---|---|---|",
    ...Object.entries(summary.byCheck).map(([check, c]) => `| ${check} | ${c.rows} | ${c.users} |`),
    ...Object.entries(summary.dataQuality).map(([problem, c]) => `| data quality: ${problem} | ${c.rows} | ${c.users} |`),
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const url = process.env.READMODEL_SUPABASE_URL ?? "";
  const key = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Set READMODEL_SUPABASE_URL and READMODEL_SUPABASE_SERVICE_ROLE_KEY.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  let output: string;
  if (process.argv.includes("--report")) {
    const since = new Date(Date.now() - 16 * 24 * 3600 * 1000).toISOString();
    const rows = (await must("sync_runs", client.from("sync_runs")
      .select("mode, status, started_at, reads_used, failures, unmapped, notes").gte("started_at", since).order("started_at"))) as Record<string, unknown>[];
    const runs: HealthRun[] = rows.map((r) => ({
      mode: String(r.mode), status: String(r.status), startedAt: String(r.started_at), readsUsed: Number(r.reads_used ?? 0),
      failures: Number(r.failures ?? 0), unmapped: Number(r.unmapped ?? 0), notes: (r.notes as Record<string, unknown> | null) ?? null,
    }));
    output = renderParityReport(parityGate(runs, Date.now()), runs);
  } else {
    output = await recordFindings(client);
  }
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, output);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
