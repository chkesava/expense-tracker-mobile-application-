import { describe, expect, it } from "vitest";

import type { GroupFundEvent } from "../types/groupFund";
import { groupFundEventFromDoc, groupFundFromDoc, sortGroupFundEvents, sortGroupFunds } from "./groupFundDocs";

describe("groupFundFromDoc", () => {
  it("reads a fund, defaulting missing totals to zero", () => {
    const fund = groupFundFromDoc("f1", {
      name: "Dokra",
      purposes: [{ id: "appu", name: "Appu", cadence: "monthly" }, "junk"],
      members: [{ id: "m1", name: "Ravi" }],
      totals: { held: 6000, contributions: 6000, payouts: "x" },
      byPurpose: { appu: { held: 6000 } },
      heldByAccount: { hdfc: 6000, bad: "1" },
      version: 2,
    });
    expect(fund).toMatchObject({
      id: "f1",
      status: "active",
      purposes: [{ id: "appu" }],
      totals: { held: 6000, contributions: 6000, payouts: 0, opening: 0 },
      byPurpose: { appu: { held: 6000, payouts: 0 } },
      heldByAccount: { hdfc: 6000 },
      version: 2,
    });
  });

  it("rejects something that isn't a fund", () => {
    expect(groupFundFromDoc("x", undefined)).toBeNull();
    expect(groupFundFromDoc("x", { name: "No purposes" })).toBeNull();
  });
});

describe("groupFundEventFromDoc", () => {
  it("keeps a well-formed event and drops a malformed one", () => {
    const data = { fundId: "f1", kind: "payout", amount: 10, purposeId: "a", date: "2026-11-05", actorUid: "u", createdAtMs: 5 };
    expect(groupFundEventFromDoc("e1", data)).toMatchObject({ id: "e1", kind: "payout" });
    expect(groupFundEventFromDoc("e2", { ...data, kind: "expense" })).toBeNull();
    expect(groupFundEventFromDoc("e3", { ...data, amount: "10" })).toBeNull();
  });
});

describe("ordering", () => {
  it("lists active funds first, then by name", () => {
    const f = (id: string, name: string, status?: "archived") => groupFundFromDoc(id, { name, purposes: [], status })!;
    expect(sortGroupFunds([f("1", "Zeta"), f("2", "Alpha", "archived"), f("3", "Beta")]).map((x) => x.name)).toEqual([
      "Beta",
      "Zeta",
      "Alpha",
    ]);
  });

  it("orders events newest first, ties by id descending", () => {
    const e = (id: string, createdAtMs: number) => ({ id, createdAtMs }) as GroupFundEvent;
    expect(sortGroupFundEvents([e("a", 1), e("b", 2), e("c", 2)]).map((x) => x.id)).toEqual(["c", "b", "a"]);
  });
});
