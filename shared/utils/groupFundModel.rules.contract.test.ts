import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { GROUP_FUND_EVENT_KINDS, GROUP_FUND_LIMITS, GROUP_FUND_STATUSES } from "../types/groupFund";
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
} from "./groupFundWrites";

/** SPENDLY-684 — the Group Funds builders and firestore.rules must agree. */
const rules = readFileSync("firestore.rules", "utf8");
const section = rules.slice(
  rules.indexOf("SPENDLY-684 Group Funds (epic SPENDLY-678)"),
  rules.indexOf("function investmentWellFormed(")
);
const fn = (name: string) => {
  const start = section.indexOf(`function ${name}(`);
  const next = section.indexOf("\n      function ", start + 1);
  return section.slice(start, next === -1 ? undefined : next);
};
const quoted = (text: string) => [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const firstList = (text: string, re: RegExp) => quoted(text.match(re)?.[1] ?? "");

const fundAllowed = firstList(fn("groupFundShape"), /hasOnly\(\[([^\]]*)\]\)/);
const eventAllowed = firstList(fn("groupFundEventWellFormed"), /hasOnly\(\[([^\]]*)\]\)/);

const S = { serverTimestamp: () => "ts", increment: (n: number) => ({ inc: n }) };
const ctx = (eventId = "e") => ({ uid: "u", nowMs: 10, eventId });
const fund = {
  id: "f",
  name: "Dokra",
  notes: "n",
  status: "active" as const,
  purposes: [
    { id: "a", name: "Appu", cadence: "monthly" as const, expectedPerMember: 6000, target: 60000 },
    { id: "b", name: "Podupu", cadence: "adhoc" as const },
  ],
  members: [{ id: "m", name: "Ravi" }],
  totals: { ...emptyGroupFundTotals(), contributions: 1000, held: 1000 },
  byPurpose: { a: { ...emptyGroupFundTotals(), contributions: 1000, held: 1000 } },
  heldByAccount: { acc: 1000 },
  version: 3,
};

function allOps() {
  const contribution = buildContribution(ctx("c"), fund, {
    purposeId: "a",
    memberId: "m",
    amount: 10,
    date: "2026-11-05",
    period: "2026-11",
    accountId: "acc",
    note: "n",
  });
  if (!contribution.ok) throw new Error(contribution.issues.join(","));
  const results = [
    buildCreateGroupFund(ctx(), "f", { name: "Dokra", notes: "n", purposes: fund.purposes, members: fund.members }),
    buildEditGroupFund(ctx(), fund, { name: "Dokra 2", notes: "x", status: "archived" }),
    contribution,
    buildPayout(ctx("p"), fund, {
      purposeId: "a",
      amount: 10,
      date: "2026-11-05",
      accountId: "acc",
      recipient: "r",
      reference: "ref",
      note: "n",
    }),
    buildOpening(ctx("o"), fund, { purposeId: "a", amount: 10, date: "2026-11-05", accountId: "acc", note: "n" }),
    buildPurposeTransfer(ctx("t"), fund, { fromPurposeId: "a", toPurposeId: "b", amount: 10, date: "2026-11-05", note: "n" }),
    buildAccountMove(ctx("mv"), fund, { purposeId: "a", fromAccountId: "acc", toAccountId: "acc2", amount: 10, date: "2026-11-05" }),
    buildReversal(ctx("x"), fund, {
      target: contribution.plan.events[0],
      knownEvents: contribution.plan.events,
      date: "2026-11-06",
      note: "n",
    }),
  ];
  return results.flatMap((r) => {
    if (!r.ok) throw new Error(r.issues.join(","));
    return groupFundWritePlanToOps("u", r.plan, S);
  });
}

describe("Group Funds rules ↔ builders contract", () => {
  it("finds the rules section", () => {
    expect(fundAllowed.length).toBeGreaterThan(5);
    expect(eventAllowed.length).toBeGreaterThan(5);
  });

  it("every fund field a builder writes is allowed by groupFundShape", () => {
    for (const op of allOps()) {
      if (!op.ref.path.includes("/groupFunds/") || op.op === "delete") continue;
      for (const key of Object.keys(op.data)) {
        expect(fundAllowed, key).toContain(key.split(".")[0]);
      }
    }
  });

  it("every event field a builder writes is allowed by groupFundEventWellFormed", () => {
    for (const op of allOps()) {
      if (!op.ref.path.includes("/groupFundEvents/") || op.op === "delete") continue;
      for (const key of Object.keys(op.data)) expect(eventAllowed, key).toContain(key);
    }
  });

  it("event kinds, statuses and entry sources match", () => {
    expect(quoted(fn("groupFundEventKinds")).sort()).toEqual([...GROUP_FUND_EVENT_KINDS].sort());
    expect(fn("groupFundShape")).toContain(`d.status in [${GROUP_FUND_STATUSES.map((s) => `'${s}'`).join(", ")}]`);
    const sources = new Set<string>();
    for (const op of allOps()) {
      if (op.op !== "delete" && op.ref.path.includes("/accountEntries/")) {
        sources.add(String((op.data as { source: string }).source));
      }
    }
    expect([...sources].sort()).toEqual(quoted(fn("groupFundEntrySources")).sort());
  });

  it("limits match", () => {
    const shape = fn("groupFundShape");
    expect(shape).toContain(`d.name.size() <= ${GROUP_FUND_LIMITS.nameMax}`);
    expect(shape).toContain(`optionalText(d, 'notes', ${GROUP_FUND_LIMITS.notesMax})`);
    expect(shape).toContain(`d.purposes.size() <= ${GROUP_FUND_LIMITS.maxPurposes}`);
    expect(shape).toContain(`d.members.size() <= ${GROUP_FUND_LIMITS.maxMembers}`);
    const event = fn("groupFundEventWellFormed");
    expect(event).toContain(`optionalText(d, 'note', ${GROUP_FUND_LIMITS.noteMax})`);
    expect(event).toContain(`optionalText(d, 'recipient', ${GROUP_FUND_LIMITS.recipientMax})`);
    expect(event).toContain(`optionalText(d, 'reference', ${GROUP_FUND_LIMITS.referenceMax})`);
  });

  it("the reversal id the builders derive is the one rules require", () => {
    expect(fn("groupFundEventWellFormed")).toContain("eventId == 'rev_' + d.reversalOf");
    const reversal = allOps().find((o) => o.ref.path.endsWith("/groupFundEvents/rev_c"));
    expect(reversal).toBeDefined();
  });
});
