/**
 * SPENDLY-507 — read-model sync health check. Reads only the Supabase
 * bookkeeping tables (no Firestore reads), writes a step summary, and exits 1
 * when evaluateHealth says the sync is unhealthy, so the workflow goes red and
 * GitHub emails the repository owner.
 *
 *   READMODEL_SUPABASE_URL=… READMODEL_SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/readmodel-health.ts
 */
import { appendFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { all } from "./lib/supabasePaging";
import { evaluateHealth, renderHealthSummary, THRESHOLDS, type HealthInput, type HealthPush, type HealthRun } from "./lib/readmodelHealth";


/** SPENDLY-583: today's push counters, or null (no row yet, or the migration isn't applied). */
async function loadPushToday(client: SupabaseClient, now: number): Promise<HealthPush | null> {
  try {
    const { data, error } = await client.from("push_daily").select("requests, docs, user_syncs, rejected, failed, reads")
      .eq("day", new Date(now).toISOString().slice(0, 10)).maybeSingle();
    if (error || !data) return null;
    const d = data as Record<string, number>;
    return { requests: d.requests, docs: d.docs, userSyncs: d.user_syncs, rejected: d.rejected, failed: d.failed, reads: d.reads };
  } catch {
    return null;
  }
}

export async function loadHealthInput(client: SupabaseClient, now: number): Promise<HealthInput> {
  try {
    // 16 days: enough for the SPENDLY-510 parity-gate streak.
    const since = new Date(now - 16 * 24 * 3600 * 1000).toISOString();
    const runs = await all<Record<string, unknown>>("sync_runs", (from) =>
      client.from("sync_runs").select("mode, status, started_at, reads_used, failures, unmapped, notes")
        .gte("started_at", since).order("started_at", { ascending: false }).range(from, from + 999));
    const failures = await all<Record<string, unknown>>("sync_failures", (from) =>
      client.from("sync_failures").select("uid, collection, error_class, first_seen").is("resolved_at", null).order("id").range(from, from + 999));
    const status = await all<Record<string, unknown>>("sync_status", (from) =>
      client.from("sync_status").select("collection, last_synced_at").order("uid").order("collection").range(from, from + 999));
    return {
      reachable: true,
      runs: runs.map((r) => ({
        mode: String(r.mode), status: String(r.status), startedAt: String(r.started_at),
        readsUsed: Number(r.reads_used ?? 0), failures: Number(r.failures ?? 0), unmapped: Number(r.unmapped ?? 0),
        notes: (r.notes as Record<string, unknown> | null) ?? null,
      })),
      openFailures: failures.map((f) => ({ uid: String(f.uid), collection: String(f.collection), errorClass: String(f.error_class), firstSeen: String(f.first_seen) })),
      status: status.map((s) => ({ collection: String(s.collection), lastSyncedAt: (s.last_synced_at as string | null) ?? null })),
      push: await loadPushToday(client, now),
    };
  } catch (error) {
    // A paused or unreachable project fails every query; report that, not a crash.
    return { reachable: false, reachError: error instanceof Error ? error.message : String(error), runs: [], openFailures: [], status: [] };
  }
}

async function main() {
  const url = process.env.READMODEL_SUPABASE_URL ?? "";
  const key = process.env.READMODEL_SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) throw new Error("Set READMODEL_SUPABASE_URL and READMODEL_SUPABASE_SERVICE_ROLE_KEY.");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  const input = await loadHealthInput(client, now);
  const dailyReadBudget = Number(process.env.READMODEL_MAX_READS_PER_DAY ?? THRESHOLDS.dailyReadBudget);
  const report = evaluateHealth(input, now, { ...THRESHOLDS, dailyReadBudget });
  const summary = renderHealthSummary(report, input.runs as HealthRun[], input.push);
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  for (const problem of report.problems) console.log(`::error::${problem}`);
  for (const warning of report.warnings) console.log(`::warning::${warning}`);
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
