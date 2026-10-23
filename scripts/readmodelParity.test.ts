import { describe, expect, it } from "vitest";

import type { HealthRun } from "./lib/readmodelHealth";
import { GATE_DAYS, parityGate, renderParityReport, summarizeFindings } from "./lib/readmodelParity";

const DAY = 24 * 3600 * 1000;
// 2026-11-10 18:00 IST.
const NOW = Date.UTC(2026, 10, 10, 12, 30);
const at = (daysAgo: number, hourUtc = 21) => new Date(Date.UTC(2026, 10, 10 - daysAgo, hourUtc, 0)).toISOString();
const run = (mode: string, startedAt: string, extra: Partial<HealthRun> = {}): HealthRun => ({
  mode, status: "succeeded", startedAt, readsUsed: 0, failures: 0, unmapped: 0, notes: {}, ...extra,
});
// The nightly full + verify run at 20:30 UTC = 02:00 IST the next day.
const night = (daysAgo: number, extra: { full?: Partial<HealthRun>; verify?: Partial<HealthRun> } = {}) => [
  run("full", at(daysAgo + 1, 20), extra.full),
  run("verify", at(daysAgo + 1, 20), extra.verify),
];

describe("14-day parity gate (SPENDLY-510)", () => {
  it("passes after 14 consecutive clean days", () => {
    const runs = Array.from({ length: GATE_DAYS }, (_, i) => night(i)).flat();
    const gate = parityGate(runs, NOW);
    expect(gate.streak).toBe(GATE_DAYS);
    expect(gate.passed).toBe(true);
  });

  it("a day with field-parity divergence breaks the streak", () => {
    const runs = Array.from({ length: GATE_DAYS }, (_, i) =>
      night(i, i === 3 ? { full: { status: "partial", notes: { parityMismatches: 2 } } } : {})
    ).flat();
    const gate = parityGate(runs, NOW);
    expect(gate.passed).toBe(false);
    expect(gate.streak).toBe(3);
    expect(gate.days.some((d) => /field parity: 2 row\(s\) diverged/.test(d.reasons.join()))).toBe(true);
  });

  it("a failed verify or any failed run breaks it; a missing night does too", () => {
    const failedVerify = parityGate(night(0, { verify: { status: "failed" } }), NOW);
    expect(failedVerify.days.at(-1)?.reasons.join()).toMatch(/no passing count-parity verify/);
    const failedIncremental = parityGate([...night(0), run("incremental", at(0, 6), { status: "failed" })], NOW);
    expect(failedIncremental.days.at(-1)?.reasons.join()).toMatch(/1 failed run\(s\): incremental/);
    const gap = parityGate([...night(0), ...night(2)], NOW);
    expect(gap.streak).toBe(1);
  });

  it("a failed per-write push run (SPENDLY-583) doesn't break the day: the nightly run repairs it", () => {
    const gate = parityGate([...night(0), run("incremental", at(0, 9), { status: "failed", notes: { trigger: "push" } })], NOW);
    expect(gate.days.at(-1)?.clean).toBe(true);
  });

  it("today not having run yet doesn't reset the streak", () => {
    const runs = Array.from({ length: 5 }, (_, i) => night(i + 1)).flat();
    expect(parityGate(runs, NOW).streak).toBe(5);
  });

  it("summarizes findings by check and data problem, counting users not naming them", () => {
    const s = summarizeFindings(
      [
        { uid: "secret-1", check_name: "duplicate_cashback", collection: "accountPayments", doc_id: "cb1", detail: "" },
        { uid: "secret-1", check_name: "orphan_account", collection: "expenses", doc_id: "e1", detail: "" },
        { uid: "secret-2", check_name: "orphan_account", collection: "expenses", doc_id: "e2", detail: "" },
      ],
      [{ uid: "secret-2", problem: "missing amount" }]
    );
    expect(s).toEqual({
      byCheck: { duplicate_cashback: { rows: 1, users: 1 }, orphan_account: { rows: 2, users: 2 } },
      dataQuality: { "missing amount": { rows: 1, users: 1 } },
      total: 4,
    });
    const report = renderParityReport(parityGate([run("parity", at(0, 21), { notes: s })], NOW), [run("parity", at(0, 21), { notes: s })]);
    expect(report).toContain("| orphan_account | 2 | 2 |");
    expect(report).not.toContain("secret-");
  });
});
