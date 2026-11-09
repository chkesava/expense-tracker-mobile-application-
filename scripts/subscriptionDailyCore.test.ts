import { describe, expect, it, vi } from "vitest";

import type { Subscription } from "../shared/types/subscription";
import type { JournalAccountInfo } from "../shared/utils/journalBalanceOpsCore";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import {
  findSubscriptionWorkOnReadModel,
  runSubscriptionDaily,
  type StoredSubscription,
  type SubscriptionDailyPorts,
} from "./lib/subscriptionDailyCore";

// 10 Nov 2026, 08:30 IST: Netflix (day 10, last posted October) is due today.
const NOW = new Date("2026-11-10T03:00:00.000Z");
const netflix: Subscription = {
  id: "sub-1",
  name: "Netflix 4K",
  amount: 649,
  category: "Entertainment",
  dayOfMonth: 10,
  isActive: true,
  lastProcessed: "2026-10",
  type: "subscription",
  accountId: "hdfc",
} as Subscription;
const CHARGE = "users/u1/expenses/sub-1_2026-11";

type Doc = { data: Record<string, unknown>; updateTime: number };
const fv = {
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => "<server-ts>",
};

function world(subs: Subscription[], seed: Record<string, Record<string, unknown>> = {}) {
  const docs = new Map<string, Doc>(
    Object.entries({ "users/u1/accounts/hdfc": { name: "HDFC" }, ...seed }).map(([p, d]) => [p, { data: d, updateTime: 1 }])
  );
  for (const s of subs) docs.set(`users/u1/subscriptions/${s.id}`, { data: { ...s }, updateTime: 1 });
  let clock = 10;
  const batches: string[][] = [];
  const db: JobDb = {
    doc: (path) => ({ path }),
    batch: () => {
      const checks: Array<() => void> = [];
      const ops: Array<() => void> = [];
      const paths: string[] = [];
      const err = (code: number) => Object.assign(new Error(`code ${code}`), { code });
      return {
        create: (ref, data) => {
          paths.push(ref.path);
          checks.push(() => {
            if (docs.has(ref.path)) throw err(6);
          });
          ops.push(() => docs.set(ref.path, { data, updateTime: ++clock }));
        },
        set: (ref, data, o) => {
          paths.push(ref.path);
          ops.push(() => docs.set(ref.path, { data: o?.merge ? { ...docs.get(ref.path)?.data, ...data } : data, updateTime: ++clock }));
        },
        update: (ref, data, pre) => {
          paths.push(ref.path);
          checks.push(() => {
            const cur = docs.get(ref.path);
            if (!cur) throw err(5);
            if (pre && cur.updateTime !== pre.lastUpdateTime) throw err(9);
          });
          ops.push(() => docs.set(ref.path, { data: { ...docs.get(ref.path)!.data, ...data }, updateTime: ++clock }));
        },
        commit: async () => {
          checks.forEach((c) => c());
          ops.forEach((o) => o());
          batches.push(paths);
        },
      };
    },
  };
  const subscriptions = vi.fn(async (uid: string): Promise<StoredSubscription[]> =>
    [...docs.entries()]
      .filter(([p]) => p.startsWith(`users/${uid}/subscriptions/`))
      .map(([p, d]) => ({ sub: { ...(d.data as unknown as Subscription), id: p.split("/")[3] }, updateTime: d.updateTime }))
  );
  const listOwners = vi.fn(async () => ["u1"]);
  const ports = (over: Partial<SubscriptionDailyPorts> = {}): SubscriptionDailyPorts => ({
    listOwners,
    settings: async () => ({ timezone: "Asia/Kolkata" }),
    subscriptions,
    chargeExists: async (uid, kind, docId) => docs.has(`users/${uid}/${kind === "transfer" ? "accountTransfers" : "expenses"}/${docId}`),
    accountInfo: async (_uid, ids) =>
      new Map<string, JournalAccountInfo>(
        ids.map((id) => [id, { isCreditCard: false, oldBalance: 10000, oldOutstanding: 0, needsInitialization: false, exists: true, balanceAsOfDate: null }])
      ),
    db,
    stamp: () => "<ts>",
    fv,
    ...over,
  });
  return { docs, batches, ports, subscriptions, listOwners, get: (p: string) => docs.get(p)?.data };
}

const run = (w: ReturnType<typeof world>, over: Partial<SubscriptionDailyPorts> = {}, dryRun = false, now = NOW) =>
  runSubscriptionDaily({ ports: w.ports(over), now, dryRun, budget: jobReadBudget(1000), push: null, log: () => undefined });

describe("subscription-daily (SPENDLY-739): the app's auto-post, on the server", () => {
  it("posts a due charge with its balance and dashboard ops and the subscription stamp, in one batch", async () => {
    const w = world([netflix]);
    const s = await run(w);
    expect(w.get(CHARGE)).toMatchObject({ amount: 649, accountId: "hdfc", category: "Entertainment" });
    // Bank balance moves by the charge (first write only), stamped server-side.
    expect(w.get("users/u1/accounts/hdfc")).toMatchObject({ currentBalance: { __increment: -649 }, balanceUpdatedAt: "<server-ts>" });
    // The month's dashboard summary counts it.
    expect(w.get("users/u1/financialSummaries/dashboard_2026-11")).toMatchObject({
      totalExpenses: { __increment: 649 },
      transactionCount: { __increment: 1 },
      period: "2026-11",
    });
    expect(w.get("users/u1/subscriptions/sub-1")).toMatchObject({ lastProcessed: "2026-11" });
    expect(w.batches).toHaveLength(1);
    expect(w.batches[0].sort()).toEqual(
      [CHARGE, "users/u1/accounts/hdfc", "users/u1/financialSummaries/dashboard_2026-11", "users/u1/subscriptions/sub-1"].sort()
    );
    expect(s.counts.posted).toBe(1);
  });

  it("a rerun posts nothing (the stamp makes the plan empty)", async () => {
    const w = world([netflix]);
    await run(w);
    const s = await run(w);
    expect(s.counts.posted ?? 0).toBe(0);
    expect(w.batches).toHaveLength(1);
  });

  it("an existing charge is never rewritten or counted twice: only the stamp (SPENDLY-523/525)", async () => {
    const w = world([netflix], { [CHARGE]: { amount: 649, accountId: "sbi" } });
    const s = await run(w);
    expect(w.get(CHARGE)).toEqual({ amount: 649, accountId: "sbi" });
    expect(w.get("users/u1/accounts/hdfc")).toEqual({ name: "HDFC" });
    expect(w.get("users/u1/financialSummaries/dashboard_2026-11")).toBeUndefined();
    expect(w.get("users/u1/subscriptions/sub-1")).toMatchObject({ lastProcessed: "2026-11" });
    expect(s.counts.alreadyPosted).toBe(1);
  });

  it("a subscription changed since read: the whole batch is refused, nothing posted", async () => {
    const w = world([netflix]);
    const s = await run(w, {
      subscriptions: async () => [{ sub: netflix, updateTime: 0 }], // read before a later edit
    });
    expect(s.counts.conflicts).toBe(1);
    expect(w.get(CHARGE)).toBeUndefined();
    expect(w.get("users/u1/accounts/hdfc")).toEqual({ name: "HDFC" });
  });

  it("a charge with no account to debit is skipped (SPENDLY-40)", async () => {
    const w = world([{ ...netflix, accountId: undefined } as Subscription]);
    const s = await run(w);
    expect(s.counts.skippedNoAccount).toBe(1);
    expect(w.batches).toHaveLength(0);
  });

  it("dry run decides and writes nothing", async () => {
    const w = world([netflix]);
    const s = await run(w, {}, true);
    expect(w.get(CHARGE)).toBeUndefined();
    expect(s.counts.posted).toBe(1);
    expect(s.writes.dryRun).toBeGreaterThan(0);
  });

  it("duress trees are skipped; an invalid zone skips only that user", async () => {
    const w = world([netflix]);
    const d = await run(w, { listOwners: async () => ["u1_duress"] });
    expect(d.duressSkipped).toBe(1);
    const z = await run(w, { settings: async () => ({ timezone: "Mars/Olympus" }) });
    expect(z.counts.invalidTimeZone).toBe(1);
    expect(w.get(CHARGE)).toBeUndefined();
  });
});

describe("subscription-daily: work found on the read model (no Firestore reads for the rest)", () => {
  it("names only users whose copied subscriptions show something due", async () => {
    const found = await findSubscriptionWorkOnReadModel(
      {
        users: async () => [
          { uid: "u1", subscriptions: [netflix] },
          { uid: "u2", subscriptions: [{ ...netflix, lastProcessed: "2026-11" } as Subscription] },
          { uid: "u3_duress", subscriptions: [netflix] },
        ],
        settings: async () => ({ timezone: "Asia/Kolkata" }),
      },
      NOW
    );
    expect([...found.uids]).toEqual(["u1"]);
    expect(found.usersSeen).toBe(2);
  });

  it("with the read model, only named users are read from Firestore; no owner scan", async () => {
    const w = world([netflix]);
    const s = await runSubscriptionDaily({
      ports: w.ports(),
      now: NOW,
      dryRun: false,
      budget: jobReadBudget(1000),
      push: null,
      log: () => undefined,
      readModel: { uids: new Set(["u1"]), usersSeen: 3, failures: 0 },
    });
    expect(w.listOwners).not.toHaveBeenCalled();
    expect(w.subscriptions).toHaveBeenCalledTimes(1);
    expect(s.counts).toMatchObject({ readModelUsers: 3, readModelUsersWithWork: 1, posted: 1 });
  });

  it("the copy named a user Firestore has nothing for: no write, counted", async () => {
    const w = world([{ ...netflix, lastProcessed: "2026-11" } as Subscription]);
    const s = await runSubscriptionDaily({
      ports: w.ports(),
      now: NOW,
      dryRun: false,
      budget: jobReadBudget(1000),
      push: null,
      log: () => undefined,
      readModel: { uids: new Set(["u1"]), usersSeen: 1, failures: 0 },
    });
    expect(s.counts.readModelDisagreed).toBe(1);
    expect(w.batches).toHaveLength(0);
  });
});

describe("server cores never load the app's Firestore client (SPENDLY-739)", () => {
  it("the shared op cores and the job core import no client SDK", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = join(__dirname, "..");
    for (const file of [
      "shared/utils/balanceMutationsCore.ts",
      "shared/utils/dashboardMutationsCore.ts",
      "shared/utils/journalBalanceOpsCore.ts",
      "scripts/lib/subscriptionDailyCore.ts",
    ]) {
      const text = readFileSync(join(root, file), "utf8");
      expect(text, file).not.toMatch(/from "@\/lib\/firestore"|from "firebase\/firestore"|react-native/);
    }
  });
});
