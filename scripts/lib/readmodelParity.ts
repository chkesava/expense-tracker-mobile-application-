import type { HealthRun } from "./readmodelHealth";

/**
 * SPENDLY-510 — the 14-day parity gate (Phase 2 exit), as a pure function of
 * sync_runs, plus the nightly findings summary. No uids in any output.
 *
 * A day (IST) is clean when it has:
 * - a full sync that succeeded with no field-parity mismatch;
 * - a count-parity verify that succeeded;
 * - no failed run of any kind.
 * The gate passes at 14 consecutive clean days ending today or yesterday
 * (tonight's runs may not have happened yet). Lag and old failures are the
 * hourly health check's job and are reported alongside.
 */

export const GATE_DAYS = 14;

export type Finding = { uid: string; check_name: string; collection: string; doc_id: string; detail: string };
export type FindingsSummary = {
  byCheck: Record<string, { rows: number; users: number }>;
  dataQuality: Record<string, { rows: number; users: number }>;
  total: number;
};

export function summarizeFindings(findings: Finding[], quality: { uid: string; problem: string }[]): FindingsSummary {
  const group = <T>(rows: T[], key: (r: T) => string, uid: (r: T) => string) => {
    const out: Record<string, { rows: number; users: Set<string> }> = {};
    for (const r of rows) {
      const g = (out[key(r)] ??= { rows: 0, users: new Set() });
      g.rows += 1;
      g.users.add(uid(r));
    }
    return Object.fromEntries(Object.entries(out).sort().map(([k, v]) => [k, { rows: v.rows, users: v.users.size }]));
  };
  return {
    byCheck: group(findings, (f) => f.check_name, (f) => f.uid),
    dataQuality: group(quality, (q) => q.problem, (q) => q.uid),
    total: findings.length + quality.length,
  };
}

export type GateDay = { day: string; clean: boolean; reasons: string[] };
export type GateResult = { days: GateDay[]; streak: number; passed: boolean };

const istDay = (iso: string) => new Date(Date.parse(iso) + 5.5 * 3600 * 1000).toISOString().slice(0, 10);

export function parityGate(runs: HealthRun[], now: number, days = GATE_DAYS + 1): GateResult {
  const today = istDay(new Date(now).toISOString());
  const list: GateDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = istDay(new Date(Date.parse(`${today}T12:00:00Z`) - i * 24 * 3600 * 1000).toISOString());
    const dayRuns = runs.filter((r) => istDay(r.startedAt) === day);
    const reasons: string[] = [];
    const fullOk = dayRuns.some((r) => r.mode === "full" && r.status === "succeeded" && !r.notes?.parityMismatches);
    if (!fullOk) {
      const mismatched = dayRuns.find((r) => r.mode === "full" && r.notes?.parityMismatches);
      reasons.push(mismatched ? `field parity: ${String(mismatched.notes?.parityMismatches)} row(s) diverged` : "no clean full sync");
    }
    if (!dayRuns.some((r) => r.mode === "verify" && r.status === "succeeded")) reasons.push("no passing count-parity verify");
    // A failed per-write push (SPENDLY-583) isn't the sync's failure: the nightly run repairs it.
    const failed = dayRuns.filter((r) => r.status === "failed" && r.notes?.trigger !== "push");
    if (failed.length) reasons.push(`${failed.length} failed run(s): ${[...new Set(failed.map((r) => r.mode))].join(", ")}`);
    list.push({ day, clean: reasons.length === 0, reasons });
  }

  // Consecutive clean days ending today, or yesterday if today isn't done yet.
  const ordered = [...list].reverse();
  const start = ordered[0] && !ordered[0].clean ? 1 : 0;
  let streak = 0;
  for (const d of ordered.slice(start)) {
    if (!d.clean) break;
    streak += 1;
  }
  return { days: list, streak, passed: streak >= GATE_DAYS };
}

export function renderParityReport(gate: GateResult, runs: HealthRun[]): string {
  const lastFindings = [...runs].reverse().find((r) => r.mode === "parity")?.notes as FindingsSummary | undefined;
  return [
    `# Read-model 14-day parity report (SPENDLY-510)`,
    "",
    `**Gate: ${gate.passed ? "PASSED" : "NOT YET"}**: ${gate.streak} of ${GATE_DAYS} consecutive clean days.`,
    "",
    "A clean day has a full sync with no field-parity divergence, a passing count-parity verify, and no failed run.",
    "",
    "| Day (IST) | Clean | Why not |",
    "|---|---|---|",
    ...gate.days.map((d) => `| ${d.day} | ${d.clean ? "yes" : "no"} | ${d.reasons.join("; ")} |`),
    "",
    "## Latest data findings (explained, not divergence)",
    "",
    ...(lastFindings
      ? [
          "| Check | Rows | Users |",
          "|---|---|---|",
          ...Object.entries(lastFindings.byCheck ?? {}).map(([c, v]) => `| ${c} | ${v.rows} | ${v.users} |`),
          ...Object.entries(lastFindings.dataQuality ?? {}).map(([c, v]) => `| data quality: ${c} | ${v.rows} | ${v.users} |`),
        ]
      : ["No parity findings run recorded yet."]),
    "",
  ].join("\n");
}
