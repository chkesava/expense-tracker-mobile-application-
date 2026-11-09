import { describe, expect, it } from "vitest";

import {
  applyJobWrites,
  finishJobSummary,
  isOwnDocPath,
  jobReadBudget,
  JOB_BATCH_LIMIT,
  newJobSummary,
  recordApply,
  summaryAnnotations,
  type JobDb,
  type JobWrite,
} from "./lib/dailyJobCore";

/** In-memory Firestore slice with the Admin SDK's batch semantics: all or nothing, preconditions enforced. */
function fakeDb(seed: Record<string, { data: Record<string, unknown>; updateTime: number }> = {}) {
  const docs = new Map(Object.entries(seed));
  let clock = 100;
  let commits = 0;
  const db: JobDb = {
    doc: (path) => ({ path }),
    batch: () => {
      const ops: Array<() => void> = [];
      const checks: Array<() => void> = [];
      const fail = (code: number, msg: string) => Object.assign(new Error(msg), { code });
      return {
        create: (ref, data) => {
          checks.push(() => {
            if (docs.has(ref.path)) throw fail(6, `ALREADY_EXISTS ${ref.path}`);
          });
          ops.push(() => docs.set(ref.path, { data, updateTime: ++clock }));
        },
        set: (ref, data, options) => {
          ops.push(() => {
            const prev = docs.get(ref.path)?.data ?? {};
            docs.set(ref.path, { data: options?.merge ? { ...prev, ...data } : data, updateTime: ++clock });
          });
        },
        update: (ref, data, pre) => {
          checks.push(() => {
            const cur = docs.get(ref.path);
            if (!cur) throw fail(5, `NOT_FOUND ${ref.path}`);
            if (pre && cur.updateTime !== pre.lastUpdateTime) throw fail(9, `FAILED_PRECONDITION ${ref.path}`);
          });
          ops.push(() => docs.set(ref.path, { data: { ...docs.get(ref.path)!.data, ...data }, updateTime: ++clock }));
        },
        commit: async () => {
          for (const c of checks) c();
          for (const o of ops) o();
          commits++;
        },
      };
    },
  };
  return { db, docs, commits: () => commits };
}

const STAMP = "<serverTimestamp>";
const base = (db: JobDb, writes: JobWrite[], over: Partial<Parameters<typeof applyJobWrites>[0]> = {}) => {
  const noted: string[] = [];
  const lines: string[] = [];
  const run = applyJobWrites({
    db,
    uid: "u1",
    writes,
    dryRun: false,
    stamp: () => STAMP,
    push: { note: (_uid, paths) => noted.push(...paths) },
    log: (l) => lines.push(l),
    ...over,
  });
  return { run, noted, lines };
};

describe("applyJobWrites (SPENDLY-725)", () => {
  it("writes one atomic batch, stamps createdAt/updatedAt, and pushes exactly the written paths", async () => {
    const f = fakeDb({ "users/u1/sipPlans/p1": { data: { totalUnits: 1 }, updateTime: 1 } });
    const { run, noted } = base(f.db, [
      { kind: "create", path: "users/u1/sipTransactions/p1_2026-11-11", data: { status: "executed" } },
      { kind: "set", path: "users/u1/virtualPositions/AAA", data: { units: 2 }, merge: true, stampCreatedAt: true },
      { kind: "update", path: "users/u1/sipPlans/p1", data: { totalUnits: 3 } },
    ]);
    expect(await run).toEqual({
      status: "written",
      paths: ["users/u1/sipTransactions/p1_2026-11-11", "users/u1/virtualPositions/AAA", "users/u1/sipPlans/p1"],
    });
    expect(f.docs.get("users/u1/sipTransactions/p1_2026-11-11")?.data).toEqual({ status: "executed", createdAt: STAMP, updatedAt: STAMP });
    expect(f.docs.get("users/u1/virtualPositions/AAA")?.data).toEqual({ units: 2, createdAt: STAMP, updatedAt: STAMP });
    expect(f.docs.get("users/u1/sipPlans/p1")?.data).toEqual({ totalUnits: 3, updatedAt: STAMP });
    expect(noted).toHaveLength(3);
  });

  it("a create that already exists is a conflict: nothing in the batch is written, nothing pushed (safe rerun)", async () => {
    const f = fakeDb({ "users/u1/sipTransactions/p1_2026-11-11": { data: { status: "executed" }, updateTime: 1 } });
    const { run, noted } = base(f.db, [
      { kind: "create", path: "users/u1/sipTransactions/p1_2026-11-11", data: { status: "executed" } },
      { kind: "update", path: "users/u1/sipPlans/p1", data: { totalUnits: 99 } },
    ]);
    const result = await run;
    expect(result.status).toBe("conflict");
    expect(f.docs.has("users/u1/sipPlans/p1")).toBe(false);
    expect(f.commits()).toBe(0);
    expect(noted).toEqual([]);
  });

  it("an update whose document changed since it was read is a conflict (compare-and-set)", async () => {
    const f = fakeDb({ "users/u1/creditCardBills/c1_2026-11-01": { data: { amountPaid: 268.71 }, updateTime: 7 } });
    const stale = await base(f.db, [
      { kind: "update", path: "users/u1/creditCardBills/c1_2026-11-01", data: { amountPaid: 505 }, lastUpdateTime: 6 },
    ]).run;
    expect(stale.status).toBe("conflict");
    expect(f.docs.get("users/u1/creditCardBills/c1_2026-11-01")?.data.amountPaid).toBe(268.71);
    const fresh = await base(f.db, [
      { kind: "update", path: "users/u1/creditCardBills/c1_2026-11-01", data: { amountPaid: 505 }, lastUpdateTime: 7 },
    ]).run;
    expect(fresh.status).toBe("written");
    expect(f.docs.get("users/u1/creditCardBills/c1_2026-11-01")?.data.amountPaid).toBe(505);
  });

  it("dry run logs every write and writes nothing", async () => {
    const f = fakeDb();
    const { run, noted, lines } = base(
      f.db,
      [{ kind: "create", path: "users/u1/notifications/n1", data: { type: "x", read: false } }],
      { dryRun: true }
    );
    expect((await run).status).toBe("dry-run");
    expect(f.docs.size).toBe(0);
    expect(noted).toEqual([]);
    expect(lines).toEqual(["[DRY RUN] would create users/u1/notifications/n1 (read, type)"]);
  });

  it("never writes a duress tree", async () => {
    const f = fakeDb();
    const { run } = base(f.db, [{ kind: "create", path: "users/u1_duress/notifications/n1", data: {} }], { uid: "u1_duress" });
    expect(await run).toEqual({ status: "skipped", paths: [], reason: "duress" });
    expect(f.docs.size).toBe(0);
  });

  it("refuses paths outside the user's own tree, and oversize batches", async () => {
    const f = fakeDb();
    await expect(base(f.db, [{ kind: "create", path: "users/u2/notifications/n1", data: {} }]).run).rejects.toThrow(/outside users\/u1/);
    await expect(base(f.db, [{ kind: "create", path: "pushConfig/x", data: {} }]).run).rejects.toThrow(/outside/);
    const many = Array.from({ length: JOB_BATCH_LIMIT + 1 }, (_, i) => ({ kind: "create" as const, path: `users/u1/notifications/n${i}`, data: {} }));
    await expect(base(f.db, many).run).rejects.toThrow(/batch limit/);
  });

  it("a non-precondition error is a failure with its reason, not a throw", async () => {
    const db: JobDb = {
      doc: (path) => ({ path }),
      batch: () => ({ create: () => undefined, set: () => undefined, update: () => undefined, commit: async () => Promise.reject(new Error("deadline exceeded")) }),
    };
    expect(await base(db, [{ kind: "create", path: "users/u1/notifications/n1", data: {} }]).run).toEqual({
      status: "failed",
      paths: ["users/u1/notifications/n1"],
      reason: "deadline exceeded",
    });
  });
});

describe("isOwnDocPath", () => {
  it("accepts only document paths in the user's tree", () => {
    expect(isOwnDocPath("u1", "users/u1/sipPlans/p1")).toBe(true);
    expect(isOwnDocPath("u1", "users/u1/sipPlans")).toBe(false);
    expect(isOwnDocPath("u1", "users/u1")).toBe(false);
    expect(isOwnDocPath("u1", "users/u12/sipPlans/p1")).toBe(false);
    expect(isOwnDocPath("u1", "users/u1//p1")).toBe(false);
  });
});

describe("daily job summary", () => {
  it("counts writes, conflicts and failures (reasons kept, no uid), and annotates budget stops and failures", () => {
    const s = newJobSummary("sip-daily", false);
    recordApply(s, { status: "written", paths: ["a", "b"] }, "plan p1");
    recordApply(s, { status: "conflict", paths: ["c"], reason: "exists" }, "plan p2");
    recordApply(s, { status: "failed", paths: ["d"], reason: "deadline" }, "plan p3");
    recordApply(s, { status: "skipped", paths: [], reason: "duress" }, "plan p4");
    const budget = jobReadBudget(2);
    budget.add(2);
    finishJobSummary(s, budget, { pushed: 2, failed: 0, skipped: null });
    expect(s.writes).toEqual({ written: 2, dryRun: 0, conflicts: 1, failed: 1 });
    expect(s.duressSkipped).toBe(1);
    expect(s.failures).toEqual(["plan p3: deadline"]);
    expect(s.stoppedForBudget).toBe(true);
    expect(s.readModelPushed).toBe(2);
    expect(summaryAnnotations(s)).toEqual([
      "::warning::sip-daily stopped early: read budget spent. The next run carries on.",
      "::error::sip-daily: 1 write batch(es) failed.",
    ]);
  });
});

describe("summary annotations for skipped accounts", () => {
  it("warns when items were skipped for an invalid timezone", () => {
    const s = newJobSummary("bill-daily", false);
    s.counts.invalidTimeZone = 2;
    expect(summaryAnnotations(s)).toContain("::warning::bill-daily: skipped 2 item(s) on accounts with an invalid timezone; see failures.");
  });
});
