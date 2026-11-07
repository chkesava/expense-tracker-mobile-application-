import { describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-712 — the per-user push sync runs inside a Netlify function, which
 * is killed at 10 seconds. It must stop in time on its own (partial, with a
 * resume point of its own) instead of being left "running".
 */
const runs: Record<string, unknown>[] = [];
vi.mock("../../scripts/lib/readmodelSyncCore", () => ({
  runSync: vi.fn(async (_source: unknown, _sink: unknown, options: Record<string, unknown>) => {
    runs.push(options);
    return { status: "partial", failures: 0, readsUsed: 40 };
  }),
}));

const { livePushPorts, USER_SYNC_TIME_LIMIT_MS } = await import("./readmodel-push");

describe("per-user push sync (SPENDLY-712)", () => {
  it("runs one user's incremental sync as a push run, inside the function's time limit", async () => {
    const ports = livePushPorts({
      db: {} as never,
      client: {} as never,
      verifyIdToken: async () => ({ uid: "u1" }),
      enabled: true,
      limit: 120,
      maxReadsPerDay: 12_000,
    });
    const result = await ports.syncUser("u1");
    expect(result).toEqual({ readsUsed: 40, ok: true }); // stopping partway is not a failure
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ mode: "incremental", trigger: "push", timeLimitMs: USER_SYNC_TIME_LIMIT_MS });
    // Room for the page in flight and the run record before Netlify's 10 s.
    expect(USER_SYNC_TIME_LIMIT_MS).toBeLessThanOrEqual(7000);
  });
});
