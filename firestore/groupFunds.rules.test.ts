import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { journalBalanceOps } from "../services/ledger/journalBalanceOps";
import type { GroupFund, GroupFundEvent } from "../shared/types/groupFund";
import type { MutationOp } from "../shared/types/mutations";
import { reconcileGroupFund } from "../shared/utils/groupFundMath";
import {
  buildContribution,
  buildCreateGroupFund,
  buildEditGroupFund,
  buildPayout,
  buildPurposeTransfer,
  buildReversal,
  groupFundWritePlanToOps,
  type GroupFundWritePlan,
  type GroupFundWriteResult,
} from "../shared/utils/groupFundWrites";

/**
 * SPENDLY-684 — Group Funds rules (firestore.rules, "SPENDLY-684 Group Funds").
 * Every app write is built by the real shared/utils/groupFundWrites builders
 * plus the real account balance ops, so these tests prove the app's batches
 * pass and the forged ones fail.
 */

const PROJECT_ID = "spendly-group-funds";
const OWNER = "u-owner";
const OTHER = "u-other";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: "127.0.0.1",
      port: Number(process.env.FIRESTORE_EMULATOR_PORT ?? 8080),
    },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore() as unknown as Firestore;
    for (const id of ["hdfc", "cash"]) {
      await setDoc(doc(db, "users", OWNER, "accounts", id), {
        name: id,
        typeId: "bank",
        openingBalance: 1000,
        currentBalance: 1000,
        balanceInitialized: true,
        balanceAsOfDate: "2026-11-01",
      });
    }
  });
});

const sentinels = { serverTimestamp, increment };
let clock = 1_700_000_000_000;
const ctx = (eventId: string) => ({ uid: OWNER, nowMs: (clock += 10), eventId });

function plan(result: GroupFundWriteResult): GroupFundWritePlan {
  if (!result.ok) throw new Error(`builder refused: ${result.issues.join(",")}`);
  return result.plan;
}

function ownerDb(): Firestore {
  return env.authenticatedContext(OWNER).firestore() as unknown as Firestore;
}

const accountInfo = new Map(
  ["hdfc", "cash"].map((id) => [
    id,
    {
      isCreditCard: false,
      oldBalance: 1000,
      oldOutstanding: 0,
      needsInitialization: false,
      exists: true,
      balanceAsOfDate: "2026-11-01",
    },
  ])
);

/** The batch the store commits: fund + events + entries + account balance ops. */
function appOps(p: GroupFundWritePlan): MutationOp[] {
  return [
    ...groupFundWritePlanToOps(OWNER, p, sentinels),
    ...journalBalanceOps(OWNER, p.balanceLegs, accountInfo, "2026-11-30"),
  ];
}

async function commitOps(db: Firestore, ops: MutationOp[]) {
  const batch = writeBatch(db);
  for (const op of ops) {
    const ref = doc(db, op.ref.path);
    if (op.op === "set") batch.set(ref, op.data);
    else if (op.op === "update") batch.update(ref, op.data as Record<string, unknown>);
    else batch.delete(ref);
  }
  await batch.commit();
}

const commit = (db: Firestore, p: GroupFundWritePlan) => commitOps(db, appOps(p));

async function read<T>(...path: string[]): Promise<T | undefined> {
  let out: T | undefined;
  await env.withSecurityRulesDisabled(async (c) => {
    const snap = await getDoc(doc(c.firestore() as unknown as Firestore, path.join("/")));
    out = snap.exists() ? ({ id: snap.id, ...(snap.data() as object) } as T) : undefined;
  });
  return out;
}

const readFund = async () => (await read<GroupFund>("users", OWNER, "groupFunds", "f1"))!;
const readEvent = async (id: string) => (await read<GroupFundEvent>("users", OWNER, "groupFundEvents", id))!;

async function createFund(db = ownerDb()) {
  await commit(
    db,
    plan(
      buildCreateGroupFund(ctx("unused"), "f1", {
        name: "Dokra",
        purposes: [
          { id: "appu", name: "Appu loan", cadence: "monthly", expectedPerMember: 6000 },
          { id: "podupu", name: "Podupu", cadence: "monthly", expectedPerMember: 100 },
        ],
        members: [
          { id: "m1", name: "Ravi" },
          { id: "m2", name: "Sita" },
        ],
      })
    )
  );
}

const contribution = (fund: GroupFund, eventId: string, amount = 6000, accountId = "hdfc") =>
  plan(
    buildContribution(ctx(eventId), fund, {
      purposeId: "appu",
      memberId: "m1",
      amount,
      date: "2026-11-05",
      accountId,
    })
  );

describe("groupFunds create / edit / delete", () => {
  it("lets the owner create a fund and nobody else", async () => {
    await assertSucceeds(createFund());
    await env.clearFirestore();
    await assertFails(createFund(env.authenticatedContext(OTHER).firestore() as unknown as Firestore));
  });

  it("refuses a fund created with money already in its totals", async () => {
    const p = plan(
      buildCreateGroupFund(ctx("x"), "f1", {
        name: "Dokra",
        purposes: [{ id: "appu", name: "Appu", cadence: "monthly" }],
        members: [],
      })
    );
    p.fields.totals = { opening: 0, contributions: 500, payouts: 0, transfersIn: 0, transfersOut: 0, held: 500 };
    await assertFails(commit(ownerDb(), p));
  });

  it("accepts a config edit at the next version and rejects a stale one", async () => {
    await createFund();
    const fund = await readFund();
    await assertSucceeds(commit(ownerDb(), plan(buildEditGroupFund(ctx("e1"), fund, { name: "Dokra 2026" }))));
    // Built against version 1 again: the literal version 2 is now stale.
    await assertFails(commit(ownerDb(), plan(buildEditGroupFund(ctx("e2"), fund, { notes: "late" }))));
  });

  it("deletes a fund only before any money was recorded", async () => {
    await createFund();
    await assertSucceeds(deleteDoc(doc(ownerDb(), "users", OWNER, "groupFunds", "f1")));
    await createFund();
    await commit(ownerDb(), contribution(await readFund(), "c1"));
    await assertFails(deleteDoc(doc(ownerDb(), "users", OWNER, "groupFunds", "f1")));
  });
});

describe("money events", () => {
  it("records a contribution: fund, event, entry and balance move together, once", async () => {
    await createFund();
    await assertSucceeds(commit(ownerDb(), contribution(await readFund(), "c1")));
    const fund = await readFund();
    expect(fund.totals.held).toBe(6000);
    expect(fund.heldByAccount).toEqual({ hdfc: 6000 });
    expect(reconcileGroupFund(fund, [await readEvent("c1")])).toEqual([]);
    const entry = await read<{ source: string }>("users", OWNER, "accountEntries", "gf_c1");
    expect(entry?.source).toBe("group_fund_contribution");
    const account = await read<{ currentBalance: number }>("users", OWNER, "accounts", "hdfc");
    expect(account?.currentBalance).toBe(7000);
  });

  it("rejects a replay of the same batch, so nothing applies twice (AC10)", async () => {
    await createFund();
    const p = contribution(await readFund(), "c1");
    await commit(ownerDb(), p);
    await assertFails(commit(ownerDb(), p));
    expect((await readFund()).totals.held).toBe(6000);
    const account = await read<{ currentBalance: number }>("users", OWNER, "accounts", "hdfc");
    expect(account?.currentBalance).toBe(7000);
  });

  it("applies two devices' contributions built from the same stale fund", async () => {
    await createFund();
    const stale = await readFund();
    await assertSucceeds(commit(ownerDb(), contribution(stale, "c1")));
    await assertSucceeds(commit(ownerDb(), contribution(stale, "c2", 3000)));
    expect((await readFund()).totals.held).toBe(9000);
  });

  it("rejects a total that does not match its event", async () => {
    await createFund();
    const p = contribution(await readFund(), "c1");
    p.increments["totals.held"] = 7000;
    p.increments["totals.contributions"] = 7000;
    await assertFails(commit(ownerDb(), p));
  });

  it("rejects an event or a group-fund account entry written on its own", async () => {
    await createFund();
    const ops = groupFundWritePlanToOps(OWNER, contribution(await readFund(), "c1"), sentinels);
    const eventOnly = ops.filter((o) => o.ref.path.includes("/groupFundEvents/"));
    const entryOnly = ops.filter((o) => o.ref.path.includes("/accountEntries/"));
    await assertFails(commitOps(ownerDb(), eventOnly));
    await assertFails(commitOps(ownerDb(), entryOnly));
  });

  it("rejects a payout of more than the purpose holds, even from a device that thinks it holds more", async () => {
    await createFund();
    await commit(ownerDb(), contribution(await readFund(), "c1"));
    const real = await readFund();
    const imagined = { ...real, byPurpose: { appu: { ...real.byPurpose.appu, held: 10000 } } };
    const p = plan(buildPayout(ctx("p1"), imagined, { purposeId: "appu", amount: 10000, date: "2026-11-06", accountId: "hdfc" }));
    await assertFails(commit(ownerDb(), p));
    const ok = plan(buildPayout(ctx("p2"), real, { purposeId: "appu", amount: 6000, date: "2026-11-06", accountId: "hdfc" }));
    await assertSucceeds(commit(ownerDb(), ok));
    expect((await readFund()).totals.held).toBe(0);
  });

  it("rejects an over-transfer between purposes from a stale device", async () => {
    await createFund();
    await commit(ownerDb(), contribution(await readFund(), "c1"));
    const real = await readFund();
    const imagined = { ...real, byPurpose: { appu: { ...real.byPurpose.appu, held: 9000 } } };
    const p = plan(
      buildPurposeTransfer(ctx("t1"), imagined, { fromPurposeId: "appu", toPurposeId: "podupu", amount: 9000, date: "2026-11-06" })
    );
    await assertFails(commit(ownerDb(), p));
    const ok = plan(
      buildPurposeTransfer(ctx("t2"), real, { fromPurposeId: "appu", toPurposeId: "podupu", amount: 100, date: "2026-11-06" })
    );
    await assertSucceeds(commit(ownerDb(), ok));
  });

  it("refuses money events on an archived fund", async () => {
    await createFund();
    const fund = await readFund();
    await commit(ownerDb(), plan(buildEditGroupFund(ctx("e1"), fund, { status: "archived" })));
    // Built as if still active: rules check the stored status.
    await assertFails(commit(ownerDb(), contribution(fund, "c1")));
  });
});

describe("reversals and immutability", () => {
  it("reverses a contribution once, with an opposite entry", async () => {
    await createFund();
    await commit(ownerDb(), contribution(await readFund(), "c1"));
    const target = await readEvent("c1");
    const before = await readFund();
    const rev = plan(buildReversal(ctx("x1"), before, { target, knownEvents: [target], date: "2026-11-07" }));
    await assertSucceeds(commit(ownerDb(), rev));
    expect((await readFund()).totals.held).toBe(0);
    const account = await read<{ currentBalance: number }>("users", OWNER, "accounts", "hdfc");
    expect(account?.currentBalance).toBe(1000);
    // A second device that never saw the first reversal derives the same id.
    const again = plan(buildReversal(ctx("x2"), before, { target, knownEvents: [target], date: "2026-11-07" }));
    await assertFails(commit(ownerDb(), again));
  });

  it("refuses a reversal whose id is not derived from its target", async () => {
    await createFund();
    await commit(ownerDb(), contribution(await readFund(), "c1"));
    const target = await readEvent("c1");
    const rev = plan(buildReversal(ctx("x1"), await readFund(), { target, knownEvents: [target], date: "2026-11-07" }));
    const ops = appOps(rev).map((o) =>
      o.ref.path.endsWith("/groupFundEvents/rev_c1") ? { ...o, ref: { path: o.ref.path.replace("rev_c1", "other") } } : o
    );
    await assertFails(commitOps(ownerDb(), ops));
  });

  it("never lets a group-fund event or entry be edited or deleted", async () => {
    await createFund();
    await commit(ownerDb(), contribution(await readFund(), "c1"));
    const db = ownerDb();
    await assertFails(updateDoc(doc(db, "users", OWNER, "groupFundEvents", "c1"), { amount: 1 }));
    await assertFails(deleteDoc(doc(db, "users", OWNER, "groupFundEvents", "c1")));
    await assertFails(updateDoc(doc(db, "users", OWNER, "accountEntries", "gf_c1"), { amount: 1 }));
    await assertFails(deleteDoc(doc(db, "users", OWNER, "accountEntries", "gf_c1")));
  });

  it("still allows ordinary manual account entries (regression)", async () => {
    const db = ownerDb();
    const ref = doc(db, "users", OWNER, "accountEntries", "manual1");
    await assertSucceeds(setDoc(ref, { accountId: "hdfc", amount: 50, direction: "credit", date: "2026-11-05" }));
    await assertSucceeds(updateDoc(ref, { amount: 60 }));
    await assertSucceeds(deleteDoc(ref));
  });

  it("does not let another user read a fund", async () => {
    await createFund();
    const other = env.authenticatedContext(OTHER).firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(other, "users", OWNER, "groupFunds", "f1")));
    await assertFails(getDoc(doc(other, "users", OWNER, "groupFundEvents", "c1")));
  });
});
