import { describe, expect, it } from "vitest";

import type { GroupFund, GroupFundEvent } from "../types/groupFund";
import { reconcileGroupFund } from "./groupFundMath";
import { emptyGroupFundTotals } from "./groupFundModel";
import {
  buildAccountMove,
  buildContribution,
  buildCreateGroupFund,
  buildEditGroupFund,
  buildOpening,
  buildPayout,
  buildPurposeTransfer,
  buildReversal,
  groupFundWritePlanToOps,
  type GroupFundWritePlan,
  type GroupFundWriteResult,
} from "./groupFundWrites";

const UID = "u1";
const ctx = (eventId = "ev1", nowMs = 1_000_000) => ({ uid: UID, nowMs, eventId });
const TS = { __ts: true };
const sentinels = { serverTimestamp: () => TS, increment: (n: number) => ({ __inc: n }) };

function plan(result: GroupFundWriteResult): GroupFundWritePlan {
  if (!result.ok) throw new Error(`expected ok, got ${result.issues.join(",")}`);
  return result.plan;
}

const baseFund = (): GroupFund => ({
  id: "f1",
  name: "Dokra",
  status: "active",
  purposes: [
    { id: "appu", name: "Appu loan", cadence: "monthly", expectedPerMember: 6000 },
    { id: "podupu", name: "Podupu", cadence: "monthly", expectedPerMember: 100 },
    { id: "old", name: "Old", cadence: "adhoc", archived: true },
  ],
  members: [
    { id: "m1", name: "Ravi" },
    { id: "m2", name: "Sita" },
    { id: "gone", name: "Gone", archived: true },
  ],
  totals: emptyGroupFundTotals(),
  byPurpose: {},
  heldByAccount: {},
  version: 1,
});

/** Applies a plan the way Firestore would (increments + events), to check invariants. */
function apply(
  state: { fund: GroupFund; events: GroupFundEvent[] },
  p: GroupFundWritePlan
): { fund: GroupFund; events: GroupFundEvent[] } {
  const fund = structuredClone(state.fund) as unknown as Record<string, unknown>;
  for (const [path, delta] of Object.entries(p.increments)) {
    const parts = path.split(".");
    let cursor = fund;
    for (const part of parts.slice(0, -1)) {
      cursor[part] = (cursor[part] as Record<string, unknown>) ?? {};
      cursor = cursor[part] as Record<string, unknown>;
    }
    const last = parts[parts.length - 1];
    cursor[last] = Math.round((((cursor[last] as number) ?? 0) + delta) * 100) / 100;
  }
  Object.assign(fund, p.fields);
  return { fund: fund as unknown as GroupFund, events: [...state.events, ...p.events] };
}

function run(...steps: ((s: { fund: GroupFund; events: GroupFundEvent[] }) => GroupFundWriteResult)[]) {
  let state = { fund: baseFund(), events: [] as GroupFundEvent[] };
  for (const step of steps) state = apply(state, plan(step(state)));
  return state;
}

const contribution = (eventId: string, over: Partial<Parameters<typeof buildContribution>[2]> = {}) =>
  (s: { fund: GroupFund }) =>
    buildContribution(ctx(eventId), s.fund, {
      purposeId: "appu",
      memberId: "m1",
      amount: 6000,
      date: "2026-11-05",
      accountId: "hdfc",
      ...over,
    });

describe("buildCreateGroupFund (AC1)", () => {
  it("creates a pool with empty totals and version 1", () => {
    const p = plan(
      buildCreateGroupFund(ctx(), "f1", {
        name: "  Dokra ",
        purposes: [{ id: "appu", name: "Appu", cadence: "monthly", expectedPerMember: 6000 }],
        members: [{ id: "m1", name: "Ravi" }],
      })
    );
    expect(p.mode).toBe("create");
    expect(p.fields).toMatchObject({
      name: "Dokra",
      status: "active",
      totals: emptyGroupFundTotals(),
      byPurpose: {},
      heldByAccount: {},
      version: 1,
      schemaVersion: 1,
    });
    expect(p.events).toEqual([]);
    expect(p.accountEntries).toEqual([]);
  });

  it("rejects unsafe ids and invalid config", () => {
    expect(buildCreateGroupFund(ctx(), "a/b", { name: "x", purposes: [], members: [] })).toMatchObject({
      ok: false,
      issues: ["id_invalid"],
    });
    expect(buildCreateGroupFund(ctx(), "f1", { name: "", purposes: [], members: [] })).toMatchObject({
      ok: false,
      issues: ["name_required", "purposes_required"],
    });
  });
});

describe("buildEditGroupFund", () => {
  it("writes a literal next version so a stale edit is rejected", () => {
    const p = plan(buildEditGroupFund(ctx(), { ...baseFund(), version: 7 }, { name: "Dokra 2026" }));
    expect(p.version).toEqual({ kind: "expect", next: 8 });
    expect(p.fields).toEqual({ name: "Dokra 2026" });
  });

  it("archives instead of removing purposes and members", () => {
    const fund = baseFund();
    expect(buildEditGroupFund(ctx(), fund, { purposes: fund.purposes.slice(1) })).toMatchObject({
      ok: false,
      issues: ["purpose_invalid"],
    });
    expect(buildEditGroupFund(ctx(), fund, { members: fund.members.slice(1) })).toMatchObject({
      ok: false,
      issues: ["member_invalid"],
    });
    const archived = fund.members.map((m) => (m.id === "m2" ? { ...m, archived: true } : m));
    expect(plan(buildEditGroupFund(ctx(), fund, { members: archived })).fields).toHaveProperty("members");
  });

  it("reports no_change", () => {
    expect(buildEditGroupFund(ctx(), baseFund(), { name: "Dokra" })).toMatchObject({ ok: false, issues: ["no_change"] });
  });
});

describe("buildContribution (AC2, AC3, AC4)", () => {
  it("credits the receiving account exactly once and writes no income", () => {
    const p = plan(contribution("ev1")({ fund: baseFund() }));
    expect(p.accountEntries).toEqual([
      {
        id: "gf_ev1",
        accountId: "hdfc",
        amount: 6000,
        direction: "credit",
        date: "2026-11-05",
        note: "Ravi — Dokra · Appu loan",
        source: "group_fund_contribution",
        linkedGroupFundId: "f1",
        linkedGroupFundEventId: "ev1",
      },
    ]);
    expect(p.balanceLegs).toEqual([{ accountId: "hdfc", amountDelta: 6000, date: "2026-11-05" }]);
    expect(p.events).toHaveLength(1);
    expect(p.events[0]).toMatchObject({
      id: "ev1",
      kind: "contribution",
      memberId: "m1",
      period: "2026-11",
      accountEntryIds: ["gf_ev1"],
    });
    expect(p.increments).toEqual({
      "totals.contributions": 6000,
      "totals.held": 6000,
      "byPurpose.appu.contributions": 6000,
      "byPurpose.appu.held": 6000,
      "heldByAccount.hdfc": 6000,
    });
    expect(p.version).toEqual({ kind: "increment" });
  });

  it("writes nothing outside the fund, its events and account entries", () => {
    const ops = groupFundWritePlanToOps(UID, plan(contribution("ev1")({ fund: baseFund() })), sentinels);
    expect(ops.map((o) => o.ref.path)).toEqual([
      "users/u1/groupFunds/f1",
      "users/u1/groupFundEvents/ev1",
      "users/u1/accountEntries/gf_ev1",
    ]);
    for (const op of ops) {
      expect(op.ref.path).not.toMatch(/expenses|incomes|financialSummaries|accountTransfers/);
    }
  });

  it("validates member, purpose, account and fund status", () => {
    const fund = baseFund();
    const c = (over: object, f = fund) =>
      buildContribution(ctx(), f, {
        purposeId: "appu",
        memberId: "m1",
        amount: 10,
        date: "2026-11-05",
        accountId: "hdfc",
        ...over,
      });
    expect(c({ memberId: "" })).toMatchObject({ issues: ["member_required"] });
    expect(c({ memberId: "nobody" })).toMatchObject({ issues: ["member_unknown"] });
    expect(c({ memberId: "gone" })).toMatchObject({ issues: ["member_archived"] });
    expect(c({ purposeId: "old" })).toMatchObject({ issues: ["purpose_archived"] });
    expect(c({ purposeId: "nope" })).toMatchObject({ issues: ["purpose_unknown"] });
    expect(c({ accountId: "" })).toMatchObject({ issues: ["account_required"] });
    expect(c({ date: "2026-02-30" })).toMatchObject({ issues: ["date_invalid"] });
    expect(c({ period: "2026-13" })).toMatchObject({ issues: ["period_invalid"] });
    expect(c({ amount: 0 })).toMatchObject({ issues: ["amount_not_positive"] });
    expect(c({}, { ...fund, status: "archived" })).toMatchObject({ issues: ["fund_archived"] });
  });
});

describe("buildPayout (AC6)", () => {
  it("debits the paying account once, is not an expense, and cannot exceed what the purpose holds", () => {
    const state = run(contribution("c1"));
    const p = plan(
      buildPayout(ctx("p1"), state.fund, {
        purposeId: "appu",
        amount: 6000,
        date: "2026-11-30",
        accountId: "hdfc",
        recipient: "Dokra centre",
        reference: "UTR123",
      })
    );
    expect(p.accountEntries).toEqual([
      expect.objectContaining({ id: "gf_p1", direction: "debit", amount: 6000, source: "group_fund_payout" }),
    ]);
    expect(p.balanceLegs).toEqual([{ accountId: "hdfc", amountDelta: -6000, date: "2026-11-30" }]);
    expect(p.events[0]).toMatchObject({ recipient: "Dokra centre", reference: "UTR123" });
    expect(
      buildPayout(ctx("p2"), state.fund, { purposeId: "appu", amount: 6000.01, date: "2026-11-30", accountId: "hdfc" })
    ).toMatchObject({ ok: false, issues: ["exceeds_held"] });
    expect(
      buildPayout(ctx("p3"), state.fund, { purposeId: "podupu", amount: 1, date: "2026-11-30", accountId: "hdfc" })
    ).toMatchObject({ ok: false, issues: ["exceeds_held"] });
  });
});

describe("buildOpening", () => {
  it("adds to the fund without crediting any account", () => {
    const p = plan(buildOpening(ctx("o1"), baseFund(), { purposeId: "appu", amount: 1000, date: "2026-11-01", accountId: "cash" }));
    expect(p.accountEntries).toEqual([]);
    expect(p.balanceLegs).toEqual([]);
    expect(p.increments).toMatchObject({ "totals.opening": 1000, "totals.held": 1000, "heldByAccount.cash": 1000 });
  });
});

describe("buildPurposeTransfer", () => {
  it("writes a pair that leaves the fund's held total unchanged", () => {
    const state = run(contribution("c1"));
    const p = plan(
      buildPurposeTransfer(ctx("t1"), state.fund, {
        fromPurposeId: "appu",
        toPurposeId: "podupu",
        amount: 100,
        date: "2026-11-06",
      })
    );
    expect(p.events.map((e) => [e.id, e.kind, e.transferPairId])).toEqual([
      ["t1", "transfer_out", "t1"],
      ["t1__in", "transfer_in", "t1"],
    ]);
    // Rules check the linked event's purpose; link the one money leaves.
    expect(p.fields.lastEventId).toBe("t1");
    expect(p.accountEntries).toEqual([]);
    expect(p.increments).toEqual({
      "totals.transfersOut": 100,
      "totals.transfersIn": 100,
      "byPurpose.appu.transfersOut": 100,
      "byPurpose.appu.held": -100,
      "byPurpose.podupu.transfersIn": 100,
      "byPurpose.podupu.held": 100,
    });
  });

  it("refuses same purpose and over-transfer", () => {
    const fund = run(contribution("c1")).fund;
    const t = (over: object) =>
      buildPurposeTransfer(ctx(), fund, { fromPurposeId: "appu", toPurposeId: "podupu", amount: 1, date: "2026-11-06", ...over });
    expect(t({ toPurposeId: "appu" })).toMatchObject({ issues: ["purposes_same"] });
    expect(t({ amount: 7000 })).toMatchObject({ issues: ["exceeds_held"] });
    expect(t({ toPurposeId: "old" })).toMatchObject({ issues: ["purpose_archived"] });
  });
});

describe("buildAccountMove", () => {
  it("debits one account and credits the other as a transfer; held total unchanged", () => {
    const fund = run(contribution("c1", { accountId: "cash" })).fund;
    const p = plan(
      buildAccountMove(ctx("mv1"), fund, {
        purposeId: "appu",
        fromAccountId: "cash",
        toAccountId: "hdfc",
        amount: 5000,
        date: "2026-11-07",
      })
    );
    expect(p.accountEntries.map((e) => [e.id, e.accountId, e.direction, e.transferId, e.source])).toEqual([
      ["gf_mv1_out", "cash", "debit", "mv1", "group_fund_move"],
      ["gf_mv1_in", "hdfc", "credit", "mv1", "group_fund_move"],
    ]);
    expect(p.increments).toEqual({ "heldByAccount.cash": -5000, "heldByAccount.hdfc": 5000 });
    expect(
      buildAccountMove(ctx(), fund, { purposeId: "appu", fromAccountId: "cash", toAccountId: "cash", amount: 1, date: "2026-11-07" })
    ).toMatchObject({ issues: ["accounts_same"] });
    expect(
      buildAccountMove(ctx(), fund, { purposeId: "appu", fromAccountId: "hdfc", toAccountId: "cash", amount: 1, date: "2026-11-07" })
    ).toMatchObject({ issues: ["exceeds_account_held"] });
  });
});

describe("buildReversal (AC7 corrections)", () => {
  it("undoes a contribution with an explicit event and an opposite account entry", () => {
    const state = run(contribution("c1"));
    const p = plan(buildReversal(ctx("x"), state.fund, { target: state.events[0], knownEvents: state.events, date: "2026-11-08" }));
    expect(p.events).toEqual([
      expect.objectContaining({
        id: "rev_c1",
        kind: "reversal",
        reversalOf: "c1",
        reversedKind: "contribution",
        memberId: "m1",
        period: "2026-11",
        accountEntryIds: ["gf_rev_c1"],
      }),
    ]);
    expect(p.accountEntries).toEqual([
      expect.objectContaining({
        id: "gf_rev_c1",
        direction: "debit",
        accountId: "hdfc",
        source: "group_fund_reversal",
        reversalOf: "gf_c1",
        date: "2026-11-08",
      }),
    ]);
    expect(p.balanceLegs).toEqual([{ accountId: "hdfc", amountDelta: -6000, date: "2026-11-08" }]);
  });

  it("can only reverse an event once, and never a reversal", () => {
    const state = run(contribution("c1"), (s) =>
      buildReversal(ctx("x"), s.fund, { target: s.events[0], knownEvents: s.events, date: "2026-11-08" })
    );
    expect(
      buildReversal(ctx("y"), state.fund, { target: state.events[0], knownEvents: state.events, date: "2026-11-08" })
    ).toMatchObject({ ok: false, issues: ["already_reversed"] });
    expect(
      buildReversal(ctx("y"), state.fund, { target: state.events[1], knownEvents: state.events, date: "2026-11-08" })
    ).toMatchObject({ ok: false, issues: ["reversal_not_allowed"] });
  });

  it("refuses to undo a contribution whose money was already paid out", () => {
    const state = run(contribution("c1"), (s) =>
      buildPayout(ctx("p1"), s.fund, { purposeId: "appu", amount: 6000, date: "2026-11-30", accountId: "hdfc" })
    );
    expect(
      buildReversal(ctx("x"), state.fund, { target: state.events[0], knownEvents: state.events, date: "2026-12-01" })
    ).toMatchObject({ ok: false, issues: ["exceeds_held"] });
  });

  it("undoes a payout by crediting the account back", () => {
    const state = run(contribution("c1"), (s) =>
      buildPayout(ctx("p1"), s.fund, { purposeId: "appu", amount: 6000, date: "2026-11-30", accountId: "hdfc" })
    );
    const p = plan(buildReversal(ctx("x"), state.fund, { target: state.events[1], knownEvents: state.events, date: "2026-12-01" }));
    expect(p.accountEntries[0]).toMatchObject({ id: "gf_rev_p1", direction: "credit", reversalOf: "gf_p1" });
  });

  it("undoes both halves of a purpose transfer, from either half", () => {
    const state = run(contribution("c1"), (s) =>
      buildPurposeTransfer(ctx("t1"), s.fund, { fromPurposeId: "appu", toPurposeId: "podupu", amount: 100, date: "2026-11-06" })
    );
    const inHalf = state.events.find((e) => e.id === "t1__in")!;
    const p = plan(buildReversal(ctx("x"), state.fund, { target: inHalf, knownEvents: state.events, date: "2026-11-09" }));
    expect(p.events.map((e) => e.id)).toEqual(["rev_t1", "rev_t1__in"]);
    expect(p.fields.lastEventId).toBe("rev_t1__in");
    expect(p.accountEntries).toEqual([]);
  });

  it("undoes an account move with both opposite legs", () => {
    const state = run(contribution("c1", { accountId: "cash" }), (s) =>
      buildAccountMove(ctx("mv1"), s.fund, { purposeId: "appu", fromAccountId: "cash", toAccountId: "hdfc", amount: 6000, date: "2026-11-07" })
    );
    const p = plan(buildReversal(ctx("x"), state.fund, { target: state.events[1], knownEvents: state.events, date: "2026-11-09" }));
    expect(p.accountEntries.map((e) => [e.id, e.accountId, e.direction])).toEqual([
      ["gf_rev_mv1_out", "cash", "credit"],
      ["gf_rev_mv1_in", "hdfc", "debit"],
    ]);
  });
});

describe("stored totals always equal the history (invariant)", () => {
  it("holds across a mixed sequence: split purposes, multiple accounts, partial collection, reversal", () => {
    const state = run(
      contribution("c1"),
      contribution("c2", { memberId: "m2", amount: 3000, accountId: "cash" }),
      contribution("c3", { purposeId: "podupu", amount: 100, accountId: "cash" }),
      (s) => buildOpening(ctx("o1"), s.fund, { purposeId: "podupu", amount: 900, date: "2026-11-01" }),
      (s) => buildPurposeTransfer(ctx("t1"), s.fund, { fromPurposeId: "podupu", toPurposeId: "appu", amount: 50, date: "2026-11-06" }),
      (s) => buildAccountMove(ctx("mv1"), s.fund, { purposeId: "appu", fromAccountId: "cash", toAccountId: "hdfc", amount: 3000, date: "2026-11-07" }),
      (s) => buildPayout(ctx("p1"), s.fund, { purposeId: "appu", amount: 9000, date: "2026-11-30", accountId: "hdfc" }),
      (s) => buildReversal(ctx("x"), s.fund, { target: s.events.find((e) => e.id === "c3")!, knownEvents: s.events, date: "2026-12-01" })
    );
    expect(reconcileGroupFund(state.fund, state.events)).toEqual([]);
    expect(state.fund.totals).toEqual({
      opening: 900,
      contributions: 9000,
      payouts: 9000,
      transfersIn: 50,
      transfersOut: 50,
      held: 900,
    });
    expect(state.fund.byPurpose.appu.held).toBe(50);
    expect(state.fund.byPurpose.podupu.held).toBe(850);
  });
});

describe("groupFundWritePlanToOps", () => {
  it("stamps timestamps, increments totals and version on money events", () => {
    const [fundOp, eventOp, entryOp] = groupFundWritePlanToOps(
      UID,
      plan(contribution("ev1")({ fund: baseFund() })),
      sentinels
    );
    expect(fundOp).toEqual({
      op: "update",
      ref: { path: "users/u1/groupFunds/f1" },
      data: {
        lastEventId: "ev1",
        updatedAt: TS,
        "totals.contributions": { __inc: 6000 },
        "totals.held": { __inc: 6000 },
        "byPurpose.appu.contributions": { __inc: 6000 },
        "byPurpose.appu.held": { __inc: 6000 },
        "heldByAccount.hdfc": { __inc: 6000 },
        version: { __inc: 1 },
      },
    });
    expect(eventOp.op).toBe("set");
    expect((eventOp as { data: Record<string, unknown> }).data).toMatchObject({ createdAt: TS, updatedAt: TS, fundId: "f1" });
    expect((eventOp as { data: Record<string, unknown> }).data).not.toHaveProperty("id");
    expect((entryOp as { data: Record<string, unknown> }).data).toMatchObject({ createdAt: TS, updatedAt: TS, source: "group_fund_contribution" });
  });

  it("creates the fund with timestamps, and edits with a literal version", () => {
    const create = plan(
      buildCreateGroupFund(ctx(), "f1", {
        name: "Dokra",
        purposes: [{ id: "appu", name: "Appu", cadence: "monthly" }],
        members: [],
      })
    );
    expect(groupFundWritePlanToOps(UID, create, sentinels)[0]).toMatchObject({
      op: "set",
      data: { createdAt: TS, updatedAt: TS, version: 1 },
    });
    const edit = plan(buildEditGroupFund(ctx(), baseFund(), { notes: "Monthly at the temple" }));
    expect(groupFundWritePlanToOps(UID, edit, sentinels)[0]).toMatchObject({
      op: "update",
      data: { notes: "Monthly at the temple", version: 2 },
    });
  });

  it("is deterministic for a retried submit (same event id → same docs)", () => {
    const a = groupFundWritePlanToOps(UID, plan(contribution("ev9")({ fund: baseFund() })), sentinels);
    const b = groupFundWritePlanToOps(UID, plan(contribution("ev9")({ fund: baseFund() })), sentinels);
    expect(b).toEqual(a);
  });
});
