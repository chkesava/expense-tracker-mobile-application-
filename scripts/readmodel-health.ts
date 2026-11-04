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
import { READ_MODEL_TABLES } from "../shared/utils/readModel/mapping";
import { evaluateHealth, renderHealthSummary, SAFETY_NET_FULL_GAP_HOURS, THRESHOLDS, type HealthCapacity, type HealthInput, type HealthPush, type HealthRun } from "./lib/readmodelHealth";
import { nightlySetting } from "./lib/readmodelNightlyMode";


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

/**
 * SPENDLY-672: rows the app wrote directly in the last 24 h, across every synced
 * table (head-only counts: no rows leave Supabase). Null if any count fails.
 */
async function loadClientWrites(client: SupabaseClient, now: number): Promise<number | null> {
  try {
    const since = new Date(now - 24 * 3600 * 1000).toISOString();
    let total = 0;
    for (const { table } of READ_MODEL_TABLES) {
      const { count, error } = await client.from(table).select("doc_id", { count: "exact", head: true })
        .eq("written_by", "client").gte("client_written_at", since);
      if (error) return null;
      total += count ?? 0;
    }
    return total;
  } catch {
    return null;
  }
}

/** SPENDLY-595: database size and realtime messages (readmodel_capacity); null before the migration or on error. */
async function loadCapacity(client: SupabaseClient): Promise<HealthCapacity | null> {
  try {
    const { data, error } = await client.rpc("readmodel_capacity");
    if (error || !data) return null;
    const d = data as { db_bytes: number; realtime_messages_24h: number | null; largest_tables: { table: string; bytes: number }[] };
    return {
      dbBytes: Number(d.db_bytes),
      realtimeMessages24h: d.realtime_messages_24h === null ? null : Number(d.realtime_messages_24h),
      largestTables: (d.largest_tables ?? []).map((t) => ({ table: t.table, bytes: Number(t.bytes) })),
    };
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
      clientWrites24h: await loadClientWrites(client, now),
      capacity: await loadCapacity(client),
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
  // SPENDLY-672: in safety-net mode the full pass is weekly.
  const maxFullGapHours = nightlySetting(process.env.READMODEL_NIGHTLY_MODE) === "safety-net" ? SAFETY_NET_FULL_GAP_HOURS : THRESHOLDS.maxFullGapHours;
  const maxDivergencesPerDay = Number(process.env.READMODEL_DIVERGENCE_WARN ?? THRESHOLDS.maxDivergencesPerDay);
  const report = evaluateHealth(input, now, { ...THRESHOLDS, dailyReadBudget, maxFullGapHours, maxDivergencesPerDay });
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
