/**
 * SPENDLY-507 — read-model sync health, as a pure function of what the
 * Supabase bookkeeping tables say (sync_runs, sync_failures, sync_status).
 * scripts/readmodel-health.ts fetches them; readmodel-health.yml runs it
 * hourly and goes red when this says so. No Firestore reads, no uids out.
 */

import { GATE_DAYS, parityGate } from "./readmodelParity";

export type HealthRun = {
  mode: string;
  status: string;
  startedAt: string;
  readsUsed: number;
  failures: number;
  unmapped: number;
  notes: Record<string, unknown> | null;
};
export type HealthFailure = { uid: string; collection: string; errorClass: string; firstSeen: string };
export type HealthStatus = { collection: string; lastSyncedAt: string | null };

/** SPENDLY-583: today's per-write push counters (push_daily); null before the migration. */
export type HealthPush = { requests: number; docs: number; userSyncs: number; rejected: number; failed: number; reads: number };

export type HealthInput = {
  reachable: boolean;
  reachError?: string;
  runs: HealthRun[];
  openFailures: HealthFailure[];
  status: HealthStatus[];
  push?: HealthPush | null;
};

/**
 * A per-user sync started by a push (SPENDLY-583). Not part of the schedule:
 * it never stands in for a scheduled run, and its failure isn't the sync's
 * (the nightly run repairs it), so health and the parity gate ignore it.
 */
export const isPushRun = (r: HealthRun) => r.notes?.trigger === "push";

/** Push failures in a day that are worth a warning. */
export const PUSH_FAILURE_WARN = 5;

export const THRESHOLDS = {
  /** Nightly schedule (2026-10-23) plus two hours for GitHub's start delay. */
  maxSyncGapHours: 26,
  /** Nightly full run plus two hours of slack. */
  maxFullGapHours: 26,
  maxFailureAgeHours: 24,
  /**
   * Nightly sync: a copy is at most a day old, plus two hours of slack. Back
   * to a few hours once the per-write push (SPENDLY-583) keeps it current.
   */
  maxLagP95Hours: 26,
  dailyReadBudget: 12_000,
};

export type HealthReport = {
  ok: boolean;
  problems: string[];
  warnings: string[];
  metrics: {
    runs24h: number;
    reads24h: number;
    lastSyncAgeHours: number | null;
    lastFullAgeHours: number | null;
    openFailures: number;
    lagP50Hours: number | null;
    lagP95Hours: number | null;
    lagMaxHours: number | null;
    statusRows: number;
    /** SPENDLY-510: consecutive clean days toward the 14-day gate. */
    parityStreakDays: number;
  };
};

const HOUR = 3600 * 1000;
const hoursSince = (iso: string, now: number) => (now - Date.parse(iso)) / HOUR;
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10);

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)];
}

export function evaluateHealth(input: HealthInput, now: number, thresholds = THRESHOLDS): HealthReport {
  const problems: string[] = [];
  const warnings: string[] = [];

  if (!input.reachable) {
    return {
      ok: false,
      problems: [`Supabase is unreachable or paused: ${input.reachError ?? "no response"}`],
      warnings,
      metrics: {
        runs24h: 0, reads24h: 0, lastSyncAgeHours: null, lastFullAgeHours: null, openFailures: 0,
        lagP50Hours: null, lagP95Hours: null, lagMaxHours: null, statusRows: 0, parityStreakDays: 0,
      },
    };
  }

  const real = input.runs
    .filter((r) => (r.mode === "incremental" || r.mode === "full") && !isPushRun(r))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const last24h = input.runs.filter((r) => hoursSince(r.startedAt, now) <= 24);
  const reads24h = last24h.reduce((s, r) => s + (r.readsUsed ?? 0), 0);

  const lastSync = real[0];
  const lastFull = real.find((r) => r.mode === "full");
  const lastSyncAge = lastSync ? hoursSince(lastSync.startedAt, now) : null;
  const lastFullAge = lastFull ? hoursSince(lastFull.startedAt, now) : null;

  if (lastSyncAge === null || lastSyncAge > thresholds.maxSyncGapHours) {
    problems.push(
      lastSyncAge === null
        ? "No sync run recorded. Is the schedule enabled (READMODEL_SYNC_ENABLED) and not disabled by GitHub?"
        : `No sync run for ${round1(lastSyncAge)} h (limit ${thresholds.maxSyncGapHours} h). Check the Read-model sync workflow is enabled.`
    );
  }
  if (lastFullAge === null || lastFullAge > thresholds.maxFullGapHours) {
    problems.push(
      lastFullAge === null
        ? "No full sync run recorded: deletes and unstamped edits are not being caught."
        : `No full sync run for ${round1(lastFullAge)} h (limit ${thresholds.maxFullGapHours} h).`
    );
  }
  if (lastSync?.status === "failed") {
    problems.push(`The latest sync run failed${lastSync.notes?.error ? `: ${String(lastSync.notes.error)}` : ""}.`);
  }

  // SPENDLY-509: the latest count-parity check must agree.
  const lastVerify = input.runs.filter((r) => r.mode === "verify").sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (lastVerify && hoursSince(lastVerify.startedAt, now) <= thresholds.maxFullGapHours && lastVerify.status === "failed") {
    const byCollection = (lastVerify.notes?.byCollection as { collection: string; mismatchedUsers: number }[] | undefined) ?? [];
    const which = byCollection.filter((c) => c.mismatchedUsers).map((c) => `${c.collection} ×${c.mismatchedUsers}`);
    problems.push(
      which.length
        ? `Count parity failed: Firestore and the read model differ for ${which.join(", ")} (user, collection) pair(s).`
        : `Count parity check failed${lastVerify.notes?.error ? `: ${String(lastVerify.notes.error)}` : ""}.`
    );
  }

  if (input.push && input.push.failed >= PUSH_FAILURE_WARN) {
    warnings.push(`${input.push.failed} per-write push(es) failed today; the nightly sync will repair them. Check the readmodel-push function logs on Netlify.`);
  }

  const skipped = last24h.filter((r) => r.notes?.skipped && !isPushRun(r)).length;
  if (skipped) warnings.push(`${skipped} run(s) in 24 h were skipped for the daily read budget.`);
  if (reads24h > thresholds.dailyReadBudget * 0.9) {
    warnings.push(`Sync used ${reads24h} Firestore reads in 24 h (budget ${thresholds.dailyReadBudget}).`);
  }

  // Failures: grouped by collection and class, never by user.
  const stale = input.openFailures.filter((f) => hoursSince(f.firstSeen, now) > thresholds.maxFailureAgeHours);
  const describe = (list: HealthFailure[]) => {
    const groups = new Map<string, { count: number; users: Set<string> }>();
    for (const f of list) {
      const key = `${f.collection} (${f.errorClass})`;
      const g = groups.get(key) ?? { count: 0, users: new Set<string>() };
      g.count += 1;
      g.users.add(f.uid);
      groups.set(key, g);
    }
    return [...groups].sort().map(([key, g]) => `${key}: ${g.count} across ${g.users.size} user(s)`).join("; ");
  };
  if (stale.length) problems.push(`Unresolved sync failures older than ${thresholds.maxFailureAgeHours} h: ${describe(stale)}.`);
  const fresh = input.openFailures.filter((f) => !stale.includes(f));
  if (fresh.length) warnings.push(`Open sync failures (under ${thresholds.maxFailureAgeHours} h): ${describe(fresh)}.`);

  // Lag: how old each (uid, collection) copy is.
  const lags = input.status
    .filter((s) => s.lastSyncedAt)
    .map((s) => hoursSince(s.lastSyncedAt!, now))
    .sort((a, b) => a - b);
  const p95 = percentile(lags, 95);
  if (p95 !== null && p95 > thresholds.maxLagP95Hours) {
    const behind = new Map<string, number>();
    for (const s of input.status) {
      if (s.lastSyncedAt && hoursSince(s.lastSyncedAt, now) > thresholds.maxLagP95Hours) behind.set(s.collection, (behind.get(s.collection) ?? 0) + 1);
    }
    problems.push(
      `p95 copy age is ${round1(p95)} h (limit ${thresholds.maxLagP95Hours} h). Behind: ${[...behind].sort().map(([c, n]) => `${c} ×${n}`).join(", ")}.`
    );
  }

  return {
    ok: problems.length === 0,
    problems,
    warnings,
    metrics: {
      runs24h: last24h.length,
      reads24h,
      lastSyncAgeHours: round1(lastSyncAge),
      lastFullAgeHours: round1(lastFullAge),
      openFailures: input.openFailures.length,
      lagP50Hours: round1(percentile(lags, 50)),
      lagP95Hours: round1(p95),
      lagMaxHours: round1(lags.length ? lags[lags.length - 1] : null),
      statusRows: lags.length,
      parityStreakDays: parityGate(input.runs, now).streak,
    },
  };
}

/** Markdown for GITHUB_STEP_SUMMARY. Collections and counts only, never uids. */
export function renderHealthSummary(report: HealthReport, recent: HealthRun[], push?: HealthPush | null): string {
  const m = report.metrics;
  const lines = [
    `## Read-model sync health: ${report.ok ? "OK" : "FAILING"}`,
    "",
    ...(report.problems.length ? ["**Problems**", "", ...report.problems.map((p) => `- ${p}`), ""] : []),
    ...(report.warnings.length ? ["**Warnings**", "", ...report.warnings.map((w) => `- ${w}`), ""] : []),
    "| Metric | Value |",
    "|---|---|",
    `| Runs in 24 h | ${m.runs24h} |`,
    `| Firestore reads in 24 h | ${m.reads24h} |`,
    `| Last sync run | ${m.lastSyncAgeHours ?? "—"} h ago |`,
    `| Last full run | ${m.lastFullAgeHours ?? "—"} h ago |`,
    `| Open failures | ${m.openFailures} |`,
    `| Parity gate (SPENDLY-510) | ${m.parityStreakDays} of ${GATE_DAYS} clean days |`,
    `| Copy age p50 / p95 / max | ${m.lagP50Hours ?? "—"} / ${m.lagP95Hours ?? "—"} / ${m.lagMaxHours ?? "—"} h (${m.statusRows} user-collections) |`,
    `| Per-write pushes today (SPENDLY-583) | ${push ? `${push.requests} requests · ${push.docs} docs · ${push.userSyncs} user syncs · ${push.rejected} rejected · ${push.failed} failed · ${push.reads} reads` : "—"} |`,
    "",
    "| Started (UTC) | Mode | Status | Reads | Failures | Unmapped |",
    "|---|---|---|---|---|---|",
    ...recent.filter((r) => !isPushRun(r)).slice(0, 10).map((r) => `| ${r.startedAt.slice(0, 16).replace("T", " ")} | ${r.mode} | ${r.status} | ${r.readsUsed} | ${r.failures} | ${r.unmapped} |`),
    "",
  ];
  return lines.join("\n");
}
