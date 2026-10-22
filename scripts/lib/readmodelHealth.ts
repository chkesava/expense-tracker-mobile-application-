/**
 * SPENDLY-507 — read-model sync health, as a pure function of what the
 * Supabase bookkeeping tables say (sync_runs, sync_failures, sync_status).
 * scripts/readmodel-health.ts fetches them; readmodel-health.yml runs it
 * hourly and goes red when this says so. No Firestore reads, no uids out.
 */

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

export type HealthInput = {
  reachable: boolean;
  reachError?: string;
  runs: HealthRun[];
  openFailures: HealthFailure[];
  status: HealthStatus[];
};

export const THRESHOLDS = {
  /** 3-hourly schedule plus an hour for GitHub's start delay. */
  maxSyncGapHours: 4,
  /** Nightly full run plus two hours of slack. */
  maxFullGapHours: 26,
  maxFailureAgeHours: 24,
  /** ADR §8: ≤ 3 h for creates and edits, plus an hour of slack. */
  maxLagP95Hours: 4,
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
        lagP50Hours: null, lagP95Hours: null, lagMaxHours: null, statusRows: 0,
      },
    };
  }

  const real = input.runs.filter((r) => r.mode === "incremental" || r.mode === "full").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const last24h = input.runs.filter((r) => hoursSince(r.startedAt, now) <= 24);
  const reads24h = last24h.reduce((s, r) => s + (r.readsUsed ?? 0), 0);

  const lastSync = real[0];
  const lastFull = real.find((r) => r.mode === "full");
  const lastSyncAge = lastSync ? hoursSince(lastSync.startedAt, now) : null;
  const lastFullAge = lastFull ? hoursSince(lastFull.startedAt, now) : null;

  if (lastSyncAge === null || lastSyncAge > thresholds.maxSyncGapHours) {
    problems.push(
      lastSyncAge === null
        ? "No sync run recorded in the last 48 h. Is the schedule enabled (READMODEL_SYNC_ENABLED) and not disabled by GitHub?"
        : `No sync run for ${round1(lastSyncAge)} h (limit ${thresholds.maxSyncGapHours} h). Check the Read-model sync workflow is enabled.`
    );
  }
  if (lastFullAge === null || lastFullAge > thresholds.maxFullGapHours) {
    problems.push(
      lastFullAge === null
        ? "No full sync run in the last 48 h: deletes and unstamped edits are not being caught."
        : `No full sync run for ${round1(lastFullAge)} h (limit ${thresholds.maxFullGapHours} h).`
    );
  }
  if (lastSync?.status === "failed") {
    problems.push(`The latest sync run failed${lastSync.notes?.error ? `: ${String(lastSync.notes.error)}` : ""}.`);
  }

  const skipped = last24h.filter((r) => r.notes?.skipped).length;
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
    },
  };
}

/** Markdown for GITHUB_STEP_SUMMARY. Collections and counts only, never uids. */
export function renderHealthSummary(report: HealthReport, recent: HealthRun[]): string {
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
    `| Copy age p50 / p95 / max | ${m.lagP50Hours ?? "—"} / ${m.lagP95Hours ?? "—"} / ${m.lagMaxHours ?? "—"} h (${m.statusRows} user-collections) |`,
    "",
    "| Started (UTC) | Mode | Status | Reads | Failures | Unmapped |",
    "|---|---|---|---|---|---|",
    ...recent.slice(0, 10).map((r) => `| ${r.startedAt.slice(0, 16).replace("T", " ")} | ${r.mode} | ${r.status} | ${r.readsUsed} | ${r.failures} | ${r.unmapped} |`),
    "",
  ];
  return lines.join("\n");
}
