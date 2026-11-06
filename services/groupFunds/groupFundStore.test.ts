import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SPENDLY-684: the Group Funds write path against a fake Firestore. The fund,
 * its events, the account entries and the account balance ops go out as ONE
 * commitMutations batch; a card or missing account is refused before anything
 * is written.
 */

type FakeRef = { path: string; id: string };
const fakeRef = (_db: unknown, ...segments: string[]): FakeRef => ({
  path: segments.join("/"),
  id: segments[segments.length - 1] ?? "auto-id",
});

let queryResults: { id: string; data: Record<string, unknown> }[][] = [];

vi.mock("firebase/firestore", () => ({
  doc: (db: unknown, ...segments: string[]) =>
    segments.length % 2 === 1 ? fakeRef(db, ...segments, "auto-id") : fakeRef(db, ...segments),
  collection: (db: unknown, ...segments: string[]) => fakeRef(db, ...segments),
  query: (ref: FakeRef, ...constraints: unknown[]) => ({ ref, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  limit: (n: number) => ({ limit: n }),
  getDocs: vi.fn(async () => {
    const docs = queryResults.shift() ?? [];
    return { docs: docs.map((d) => ({ id: d.id, data: () => d.data })), metadata: { fromCache: false } };
  }),
  getDoc: vi.fn(),
  getDocFromCache: vi.fn(),
  increment: (n: number) => ({ __increment: n }),
  serverTimestamp: () => ({ __serverTimestamp: true }),
}));

vi.mock("@/lib/firebase", () => ({ getFirestoreDb: () => ({ __db: true }) }));

const commitMutations = vi.fn(async (..._args: unknown[]) => "acked" as const);
vi.mock("@/lib/commitMutations", () => ({
  commitMutations: (...args: unknown[]) => (commitMutations as (...a: unknown[]) => unknown)(...args),
}));

type Info = { isCreditCard: boolean; exists: boolean };
let accounts: Record<string, Info> = {};
vi.mock("@/services/ledger/fetchAccountTypes", () => ({
  fetchAccountTypes: vi.fn(async (_db: unknown, _uid: string, ids: string[]) =>
    new Map(
      ids.map((id) => [
        id,
        {
          oldBalance: 1000,
          oldOutstanding: 0,
          needsInitialization: false,
          balanceAsOfDate: null,
          ...(accounts[id] ?? { isCreditCard: false, exists: false }),
        },
      ])
    )
  ),
}));

import type { GroupFund, GroupFundEvent } from "@/shared/types/groupFund";
import { emptyGroupFundTotals } from "@/shared/utils/groupFundModel";
import { buildContribution, buildOpening } from "@/shared/utils/groupFundWrites";

import { commitGroupFundWrite, GroupFundInvalidError, loadReversalContext } from "./groupFundStore";

const fund: GroupFund = {
  id: "f1",
  name: "Dokra",
  status: "active",
  purposes: [{ id: "appu", name: "Appu", cadence: "monthly" }],
  members: [{ id: "m1", name: "Ravi" }],
  totals: emptyGroupFundTotals(),
  byPurpose: {},
  heldByAccount: {},
  version: 1,
};
const ctx = { uid: "u1", nowMs: 1, eventId: "ev1" };
const contribution = (accountId = "hdfc") =>
  buildContribution(ctx, fund, { purposeId: "appu", memberId: "m1", amount: 6000, date: "2026-11-05", accountId });

beforeEach(() => {
  commitMutations.mockClear();
  accounts = { hdfc: { isCreditCard: false, exists: true }, card: { isCreditCard: true, exists: true } };
  queryResults = [];
});

describe("commitGroupFundWrite", () => {
  it("commits the fund, event, entry and the account balance in one batch", async () => {
    await expect(commitGroupFundWrite("u1", contribution(), "group fund contribution")).resolves.toBe("acked");
    expect(commitMutations).toHaveBeenCalledTimes(1);
    const [uid, ops, options] = commitMutations.mock.calls[0] as unknown as [
      string,
      { op: string; ref: { path: string }; data?: Record<string, unknown> }[],
      { label: string },
    ];
    expect(uid).toBe("u1");
    expect(options.label).toBe("group fund contribution");
    expect(ops.map((o) => o.ref.path)).toEqual([
      "users/u1/groupFunds/f1",
      "users/u1/groupFundEvents/ev1",
      "users/u1/accountEntries/gf_ev1",
      "users/u1/accounts/hdfc",
    ]);
    // Never an expense, an income or a dashboard summary.
    expect(ops.some((o) => /expenses|incomes|financialSummaries/.test(o.ref.path))).toBe(false);
  });

  it("does not touch accounts when no money moves through one", async () => {
    const opening = buildOpening(ctx, fund, { purposeId: "appu", amount: 500, date: "2026-11-01" });
    await commitGroupFundWrite("u1", opening, "opening");
    const ops = commitMutations.mock.calls[0][1] as unknown as { ref: { path: string } }[];
    expect(ops.map((o) => o.ref.path)).toEqual(["users/u1/groupFunds/f1", "users/u1/groupFundEvents/ev1"]);
  });

  it("refuses a credit card or a missing account before writing anything", async () => {
    await expect(commitGroupFundWrite("u1", contribution("card"), "x")).rejects.toBeInstanceOf(GroupFundInvalidError);
    await expect(commitGroupFundWrite("u1", contribution("gone"), "x")).rejects.toMatchObject({
      issues: ["account_unsupported"],
    });
    expect(commitMutations).not.toHaveBeenCalled();
  });

  it("throws the builder's issues for an invalid write", async () => {
    const bad = buildContribution(ctx, fund, { purposeId: "appu", memberId: "", amount: 0, date: "x", accountId: "hdfc" });
    await expect(commitGroupFundWrite("u1", bad, "x")).rejects.toBeInstanceOf(GroupFundInvalidError);
    expect(commitMutations).not.toHaveBeenCalled();
  });

  it("is the same batch on a retry with the same event id", async () => {
    await commitGroupFundWrite("u1", contribution(), "x");
    await commitGroupFundWrite("u1", contribution(), "x");
    expect(commitMutations.mock.calls[1][1]).toEqual(commitMutations.mock.calls[0][1]);
  });
});

describe("loadReversalContext", () => {
  const target: GroupFundEvent = {
    id: "t1",
    fundId: "f1",
    kind: "transfer_out",
    amount: 100,
    purposeId: "appu",
    date: "2026-11-05",
    transferPairId: "t1",
    actorUid: "u1",
    createdAtMs: 1,
  };

  it("returns the target, earlier reversals and the transfer's other half, once each", async () => {
    queryResults = [
      [{ id: "rev_t1", data: { kind: "reversal", reversalOf: "t1" } }],
      [
        { id: "t1", data: { kind: "transfer_out" } },
        { id: "t1__in", data: { kind: "transfer_in", transferPairId: "t1" } },
      ],
    ];
    const events = await loadReversalContext("u1", target);
    expect(events.map((e) => e.id).sort()).toEqual(["rev_t1", "t1", "t1__in"]);
  });
});
