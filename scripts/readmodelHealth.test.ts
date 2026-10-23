import { describe, expect, it } from "vitest";

import { evaluateHealth, renderHealthSummary, type HealthInput, type HealthRun } from "./lib/readmodelHealth";

const NOW = Date.UTC(2026, 9, 22, 12, 0);
const ago = (h: number) => new Date(NOW - h * 3600 * 1000).toISOString();
const run = (h: number, mode: string, extra: Partial<HealthRun> = {}): HealthRun => ({
  mode, status: "succeeded", startedAt: ago(h), readsUsed: 550, failures: 0, unmapped: 0, notes: {}, ...extra,
});

function healthy(): HealthInput {
  return {
    reachable: true,
    runs: [run(1, "incremental"), run(4, "incremental"), run(10, "full", { readsUsed: 4000 })],
    openFailures: [],
    status: [
      { collection: "expenses", lastSyncedAt: ago(1) },
      { collection: "accounts", lastSyncedAt: ago(1) },
      { collection: "categories", lastSyncedAt: ago(2) },
    ],
  };
}

describe("read-model sync health (SPENDLY-507)", () => {
  it("is green on a clean schedule, with metrics", () => {
    const r = evaluateHealth(healthy(), NOW);
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
    expect(r.metrics).toMatchObject({ runs24h: 3, reads24h: 5100, lastSyncAgeHours: 1, lastFullAgeHours: 10, lagP95Hours: 2 });
  });

  it("fails when Supabase is unreachable or paused", () => {
    const r = evaluateHealth({ ...healthy(), reachable: false, reachError: "HTTP 540" }, NOW);
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/unreachable or paused: HTTP 540/);
  });

  it("fails when no sync has run for over 26 h (nightly schedule disabled or stuck)", () => {
    const r = evaluateHealth({ ...healthy(), runs: [run(27, "full")] }, NOW);
    expect(r.problems.join()).toMatch(/No sync run for 27 h/);
    // A nightly run 20 h ago is healthy.
    expect(evaluateHealth({ ...healthy(), runs: [run(20, "full")] }, NOW).problems.join()).not.toMatch(/No sync run for/);
    expect(evaluateHealth({ ...healthy(), runs: [] }, NOW).problems.join()).toMatch(/No sync run recorded/);
  });

  it("does not count dry runs as syncs", () => {
    const r = evaluateHealth({ ...healthy(), runs: [run(1, "dry_run"), run(30, "full")] }, NOW);
    expect(r.problems.join()).toMatch(/No sync run for 30 h/);
  });

  it("ignores per-write push runs (SPENDLY-583): a failed one isn't a failed sync, and none stands in for the schedule", () => {
    const push = (h: number, status = "succeeded") => run(h, "incremental", { status, notes: { trigger: "push" } });
    const failedPush = evaluateHealth({ ...healthy(), runs: [push(0.5, "failed"), run(10, "full")] }, NOW);
    expect(failedPush.problems.join()).not.toMatch(/latest sync run failed/);
    // Only push runs for 30 h: the schedule is still reported missing.
    const onlyPushes = evaluateHealth({ ...healthy(), runs: [push(1), push(2), run(30, "full")] }, NOW);
    expect(onlyPushes.problems.join()).toMatch(/No sync run for 30 h/);
  });

  it("warns on repeated push failures and shows today's push counters (SPENDLY-583)", () => {
    const input = { ...healthy(), push: { requests: 40, docs: 55, userSyncs: 2, rejected: 1, failed: 6, reads: 113 } };
    const r = evaluateHealth(input, NOW);
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/6 per-write push\(es\) failed today/);
    expect(renderHealthSummary(r, input.runs, input.push)).toContain("40 requests · 55 docs · 2 user syncs · 1 rejected · 6 failed · 113 reads");
    expect(evaluateHealth({ ...healthy(), push: { ...input.push, failed: 4 } }, NOW).warnings.join()).not.toMatch(/push/);
  });

  it("fails when the nightly full run is missing", () => {
    const r = evaluateHealth({ ...healthy(), runs: [run(1, "incremental"), run(30, "full")] }, NOW);
    expect(r.problems.join()).toMatch(/No full sync run for 30 h/);
  });

  it("fails when the latest run failed", () => {
    const r = evaluateHealth({ ...healthy(), runs: [run(1, "incremental", { status: "failed", notes: { error: "boom" } }), run(10, "full")] }, NOW);
    expect(r.problems.join()).toMatch(/latest sync run failed: boom/);
  });

  it("fails on a failure older than 24 h, naming the collection but no user", () => {
    const r = evaluateHealth({
      ...healthy(),
      openFailures: [
        { uid: "secret-uid-1", collection: "expenses", errorClass: "mapping", firstSeen: ago(30) },
        { uid: "secret-uid-2", collection: "expenses", errorClass: "mapping", firstSeen: ago(26) },
        { uid: "secret-uid-1", collection: "categories", errorClass: "pair_failed", firstSeen: ago(2) },
      ],
    }, NOW);
    expect(r.ok).toBe(false);
    expect(r.problems.join()).toMatch(/expenses \(mapping\): 2 across 2 user\(s\)/);
    expect(r.warnings.join()).toMatch(/categories \(pair_failed\): 1 across 1 user/);
    const all = JSON.stringify(r) + renderHealthSummary(r, healthy().runs);
    expect(all).not.toContain("secret-uid");
  });

  it("only warns on a fresh failure", () => {
    const r = evaluateHealth({ ...healthy(), openFailures: [{ uid: "u", collection: "incomes", errorClass: "mapping", firstSeen: ago(1) }] }, NOW);
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(1);
  });

  it("fails when p95 copy age is over 26 h, naming the collections behind", () => {
    const status = [
      ...Array.from({ length: 10 }, () => ({ collection: "expenses", lastSyncedAt: ago(1) })),
      { collection: "categories", lastSyncedAt: ago(30) },
    ];
    const r = evaluateHealth({ ...healthy(), status }, NOW);
    expect(r.problems.join()).toMatch(/p95 copy age is 30 h .*categories ×1/);
  });

  it("warns when runs were skipped for the read budget or reads are near it", () => {
    const r = evaluateHealth({
      ...healthy(),
      runs: [run(1, "incremental", { notes: { skipped: "daily read budget used up" }, readsUsed: 0 }), run(3, "incremental", { readsUsed: 11_000 }), run(10, "full")],
    }, NOW);
    expect(r.ok).toBe(true);
    expect(r.warnings.join()).toMatch(/skipped for the daily read budget/);
    expect(r.warnings.join()).toMatch(/Firestore reads in 24 h/);
  });

  it("fails when the latest count-parity check failed, naming the collections (SPENDLY-509)", () => {
    const verify = run(9, "verify", { status: "failed", notes: { byCollection: [{ collection: "expenses", mismatchedUsers: 2 }, { collection: "accounts", mismatchedUsers: 0 }] } });
    const r = evaluateHealth({ ...healthy(), runs: [...healthy().runs, verify] }, NOW);
    expect(r.problems.join()).toMatch(/Count parity failed: .*expenses ×2/);
    expect(r.problems.join()).not.toMatch(/accounts/);
    // A later passing verify clears it.
    const ok = run(1, "verify");
    expect(evaluateHealth({ ...healthy(), runs: [...healthy().runs, verify, ok] }, NOW).ok).toBe(true);
  });

  it("renders a step summary with metrics and recent runs", () => {
    const r = evaluateHealth(healthy(), NOW);
    const md = renderHealthSummary(r, healthy().runs);
    expect(md).toContain("## Read-model sync health: OK");
    expect(md).toContain("| Firestore reads in 24 h | 5100 |");
    expect(md).toContain("| incremental | succeeded | 550 | 0 | 0 |");
  });
});

describe("health loader (SPENDLY-507)", () => {
  /** A supabase-js-like query builder whose every query resolves to `result`. */
  const client = (result: { data: unknown[] | null; error: { message: string } | null }) => {
    const builder: Record<string, unknown> = {};
    for (const m of ["select", "gte", "order", "range", "is"]) builder[m] = () => builder;
    builder.then = (resolve: (v: unknown) => unknown) => resolve(result);
    return { from: () => builder } as never;
  };

  it("reports a paused or unreachable project as unreachable, not a crash", async () => {
    const { loadHealthInput } = await import("./readmodel-health");
    const input = await loadHealthInput(client({ data: null, error: { message: "HTTP 540: project paused" } }), NOW);
    expect(input).toMatchObject({ reachable: false, reachError: expect.stringContaining("project paused") });
    expect(evaluateHealth(input, NOW).ok).toBe(false);
  });

  it("maps rows into the evaluator's input", async () => {
    const { loadHealthInput } = await import("./readmodel-health");
    const input = await loadHealthInput(client({ data: [], error: null }), NOW);
    expect(input).toEqual({ reachable: true, runs: [], openFailures: [], status: [], push: null });
  });
});
