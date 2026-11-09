import { describe, expect, it } from "vitest";

import type { SipPlan } from "../shared/features/sip/types";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { runSipDaily, type SipDailyPorts } from "./lib/sipDailyCore";

type Doc = { data: Record<string, unknown>; updateTime: number };

/** In-memory Firestore with Admin batch semantics (all or nothing, preconditions), increments and stamps. */
function world(seed: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map<string, Doc>(Object.entries(seed).map(([p, d]) => [p, { data: d, updateTime: 1 }]));
  let clock = 10;
  const INC = Symbol("inc");
  const resolve = (prev: Record<string, unknown>, data: Record<string, unknown>) => {
    const out = { ...prev };
    for (const [k, v] of Object.entries(data)) {
      out[k] = v && typeof v === "object" && INC in (v as object) ? Number(prev[k] ?? 0) + (v as { [INC]: number })[INC] : v;
    }
    return out;
  };
  const db: JobDb = {
    doc: (path) => ({ path }),
    batch: () => {
      const checks: Array<() => void> = [];
      const ops: Array<() => void> = [];
      const err = (code: number) => Object.assign(new Error(`code ${code}`), { code });
      return {
        create: (ref, data) => {
          checks.push(() => { if (docs.has(ref.path)) throw err(6); });
          ops.push(() => docs.set(ref.path, { data: resolve({}, data), updateTime: ++clock }));
        },
        set: (ref, data, o) => ops.push(() => docs.set(ref.path, { data: resolve(o?.merge ? docs.get(ref.path)?.data ?? {} : {}, data), updateTime: ++clock })),
        update: (ref, data, pre) => {
          checks.push(() => {
            const cur = docs.get(ref.path);
            if (!cur) throw err(5);
            if (pre && cur.updateTime !== pre.lastUpdateTime) throw err(9);
          });
          ops.push(() => docs.set(ref.path, { data: resolve(docs.get(ref.path)!.data, data), updateTime: ++clock }));
        },
        commit: async () => { checks.forEach((c) => c()); ops.forEach((o) => o()); },
      };
    },
  };
  const ports = (over: Partial<SipDailyPorts> = {}): SipDailyPorts => ({
    listDuePlans: async () => ({
      plans: [...docs.entries()]
        .filter(([p, d]) => /^users\/[^/]+\/sipPlans\//.test(p) && d.data.status === "active")
        .map(([p, d]) => ({ uid: p.split("/")[1], plan: { ...(d.data as unknown as SipPlan), id: p.split("/")[3] } })),
    }),
    timeZoneOf: async (uid) => docs.get(`users/${uid}`)?.data.timezone as string | undefined,
    readTransaction: async (uid, id) => {
      const d = docs.get(`users/${uid}/sipTransactions/${id}`);
      return d ? { data: d.data, updateTime: d.updateTime } : null;
    },
    readPosition: async (uid, key) => {
      const d = docs.get(`users/${uid}/virtualPositions/${key}`);
      return d ? { data: d.data as never, updateTime: d.updateTime } : null;
    },
    price: async () => 50,
    db,
    stamp: () => "<ts>",
    increment: (n) => ({ [INC]: n }),
    ...over,
  });
  return { docs, ports, get: (p: string) => docs.get(p)?.data };
}

const IST_11_NOV = "2026-11-10T18:30:00.000Z"; // midnight 11 Nov in IST
const RUN = new Date("2026-11-11T03:00:00.000Z"); // 08:30 IST, the legacy cron's slot

const plan = (over: Partial<SipPlan> = {}): Record<string, unknown> => ({
  assetType: "mutual_fund",
  symbol: "120503",
  quoteKey: "MF:120503",
  assetName: "Index Fund",
  investmentAmount: 1000,
  currency: "INR",
  frequency: "monthly",
  executionDay: 11,
  startDate: "2026-01-11",
  status: "active",
  nextExecutionDate: IST_11_NOV,
  skipNextExecution: false,
  totalInvested: 0,
  totalUnits: 0,
  executionCount: 0,
  ...over,
});

const run = (w: ReturnType<typeof world>, over: Partial<SipDailyPorts> = {}, extra: { dryRun?: boolean; budget?: number } = {}) =>
  runSipDaily({
    ports: w.ports(over),
    now: RUN,
    dryRun: extra.dryRun ?? false,
    budget: jobReadBudget(extra.budget ?? 1000),
    push: null,
    log: () => undefined,
  });

describe("runSipDaily (SPENDLY-726)", () => {
  it("executes a due plan once, with the app's ids, in the user's zone (IST) on a UTC runner", async () => {
    const w = world({ "users/u1": { timezone: "Asia/Kolkata" }, "users/u1/sipPlans/p1": plan() });
    const s = await run(w);
    expect(s.counts.executed).toBe(1);
    const tx = w.get("users/u1/sipTransactions/p1_2026-11-11");
    expect(tx).toMatchObject({ status: "executed", unitsPurchased: 20, marketPrice: 50, message: "Scheduled execution", createdAt: "<ts>", updatedAt: "<ts>" });
    expect(w.get("users/u1/virtualPositions/MF:120503")).toMatchObject({ totalUnits: 20, totalInvested: 1000 });
    expect(w.get("users/u1/sipPlans/p1")).toMatchObject({
      totalInvested: 1000,
      totalUnits: 20,
      executionCount: 1,
      lastExecutionDate: "2026-11-11",
      nextExecutionDate: "2026-12-10T18:30:00.000Z",
    });
    expect(w.get("users/u1/notifications/n_p1_2026-11-11_executed")).toMatchObject({ type: "sip_executed", read: false });
    expect([...w.docs.keys()].some((k) => k.includes("virtualPortfolio"))).toBe(false);
  });

  it("a rerun the same day changes nothing (the plan moved on)", async () => {
    const w = world({ "users/u1": { timezone: "Asia/Kolkata" }, "users/u1/sipPlans/p1": plan() });
    await run(w);
    const s = await run(w);
    expect(s.counts.executed ?? 0).toBe(0);
    expect(w.get("users/u1/sipPlans/p1")).toMatchObject({ totalUnits: 20, executionCount: 1 });
  });

  it("the app's button already ran today (row exists, plan not yet moved): no double units", async () => {
    const w = world({
      "users/u1": { timezone: "Asia/Kolkata" },
      "users/u1/sipPlans/p1": plan({ totalUnits: 20, totalInvested: 1000, executionCount: 1 }),
      "users/u1/sipTransactions/p1_2026-11-11": { status: "executed" },
    });
    const s = await run(w);
    expect(s.counts.alreadyDone).toBe(1);
    expect(w.get("users/u1/sipPlans/p1")).toMatchObject({ totalUnits: 20, executionCount: 1 });
  });

  it("the button lands between the job's read and its write: the batch is refused, nothing doubles", async () => {
    const w = world({ "users/u1": { timezone: "Asia/Kolkata" }, "users/u1/sipPlans/p1": plan() });
    const s = await run(w, {
      // The job reads "no row yet"; meanwhile the app creates it.
      readTransaction: async () => {
        w.docs.set("users/u1/sipTransactions/p1_2026-11-11", { data: { status: "executed" }, updateTime: 99 });
        return null;
      },
    });
    expect(s.counts.conflicts).toBe(1);
    expect(w.get("users/u1/sipPlans/p1")).toMatchObject({ totalUnits: 0, executionCount: 0 });
    expect(w.get("users/u1/virtualPositions/MF:120503")).toBeUndefined();
  });

  it("no price: records the app's failed row and notice once; a later failed retry writes nothing", async () => {
    const w = world({ "users/u1": { timezone: "Asia/Kolkata" }, "users/u1/sipPlans/p1": plan() });
    const first = await run(w, { price: async () => undefined });
    expect(first.counts.failed).toBe(1);
    expect(w.get("users/u1/sipTransactions/p1_2026-11-11")).toMatchObject({ status: "failed", unitsPurchased: 0 });
    expect(w.get("users/u1/notifications/n_p1_2026-11-11_failed")).toMatchObject({ type: "sip_failed" });
    const again = await run(w, { price: async () => undefined });
    expect(again.counts.failedAgain).toBe(1);
    expect(again.writes.written).toBe(0);
  });

  it("a retry with a price replaces the failed row and executes", async () => {
    const w = world({ "users/u1": { timezone: "Asia/Kolkata" }, "users/u1/sipPlans/p1": plan() });
    await run(w, { price: async () => undefined });
    const s = await run(w);
    expect(s.counts.executed).toBe(1);
    expect(w.get("users/u1/sipTransactions/p1_2026-11-11")).toMatchObject({ status: "executed", unitsPurchased: 20 });
    expect(w.get("users/u1/sipPlans/p1")).toMatchObject({ executionCount: 1 });
  });

  it("an existing position is added to (absolute totals), and refused if it changed since read", async () => {
    const w = world({
      "users/u1": { timezone: "Asia/Kolkata" },
      "users/u1/sipPlans/p1": plan(),
      "users/u1/virtualPositions/MF:120503": { quoteKey: "MF:120503", totalUnits: 10, totalInvested: 400, averagePrice: 40 },
    });
    await run(w);
    expect(w.get("users/u1/virtualPositions/MF:120503")).toMatchObject({ totalUnits: 30, totalInvested: 1400 });

    const w2 = world({
      "users/u1": { timezone: "Asia/Kolkata" },
      "users/u1/sipPlans/p1": plan(),
      "users/u1/virtualPositions/MF:120503": { quoteKey: "MF:120503", totalUnits: 10, totalInvested: 400 },
    });
    const s = await run(w2, {
      readPosition: async () => ({ data: { totalUnits: 10, totalInvested: 400 } as never, updateTime: 0 }), // stale
    });
    expect(s.counts.conflicts).toBe(1);
    expect(w2.get("users/u1/sipTransactions/p1_2026-11-11")).toBeUndefined();
  });

  it("not yet due in the user's zone is left alone (New York is still on 10 Nov)", async () => {
    const w = world({
      "users/u1": { timezone: "America/New_York" },
      "users/u1/sipPlans/p1": plan({ nextExecutionDate: "2026-11-11T05:00:00.000Z" }), // NY midnight 11 Nov
    });
    const s = await run(w);
    expect(s.counts.notDueInUserZone).toBe(1);
    expect(w.get("users/u1/sipTransactions/p1_2026-11-11")).toBeUndefined();
  });

  it("skip and complete follow the app's planner", async () => {
    const w = world({
      "users/u1": { timezone: "Asia/Kolkata" },
      "users/u1/sipPlans/p1": plan({ skipNextExecution: true }),
      "users/u1/sipPlans/p2": plan({ endDate: "2026-11-01" }),
    });
    const s = await run(w);
    expect(s.counts.skipped).toBe(1);
    expect(s.counts.completed).toBe(1);
    expect(w.get("users/u1/sipPlans/p1")).toMatchObject({ skipNextExecution: false, nextExecutionDate: "2026-12-10T18:30:00.000Z" });
    expect(w.get("users/u1/notifications/n_p1_2026-11-11_skipped")).toMatchObject({ type: "sip_skipped" });
    expect(w.get("users/u1/sipPlans/p2")).toMatchObject({ status: "completed" });
  });

  it("duress trees are never touched; a missing timezone falls back to Asia/Kolkata", async () => {
    const w = world({
      "users/u1_duress/sipPlans/p1": plan(),
      "users/u2/sipPlans/p1": plan(),
    });
    const s = await run(w);
    expect(s.duressSkipped).toBe(1);
    expect(w.get("users/u1_duress/sipTransactions/p1_2026-11-11")).toBeUndefined();
    expect(w.get("users/u2/sipTransactions/p1_2026-11-11")).toMatchObject({ status: "executed" });
  });

  it("dry run decides and logs but writes nothing", async () => {
    const w = world({ "users/u1": { timezone: "Asia/Kolkata" }, "users/u1/sipPlans/p1": plan() });
    const s = await run(w, {}, { dryRun: true });
    expect(s.counts.executed).toBe(1);
    expect(s.writes.dryRun).toBe(4);
    expect(w.get("users/u1/sipTransactions/p1_2026-11-11")).toBeUndefined();
  });

  it("stops when the read budget is spent", async () => {
    const w = world({ "users/u1": { timezone: "Asia/Kolkata" }, "users/u1/sipPlans/p1": plan() });
    const s = await run(w, {}, { budget: 0 });
    expect(s.counts.plansSeen ?? 0).toBe(0);
  });
});
