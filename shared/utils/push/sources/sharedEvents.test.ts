import { describe, expect, it } from "vitest";

import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { runEventTick } from "../events";
import { fakeAdminDb, memoryPushPorts } from "../testing/fakeAdminDb";
import { createSharedEventSource, otherMembers } from "./sharedEvents";

const NOW = new Date("2026-11-06T04:00:00Z"); // 09:30 IST
const ago = (h: number) => NOW.getTime() - h * 3_600_000;

const settings = (): UserSettings => ({
  ...SETTINGS_DEFAULTS,
  timezone: "Asia/Kolkata",
  pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: { start: "08:00", end: "21:00" } },
});

const split = (over: Record<string, unknown> = {}) => ({
  title: "Goa trip",
  totalAmount: 24000,
  createdBy: "org",
  createdByName: "Priya",
  createdAt: ago(2),
  settled: false,
  participantIds: ["org", "u1", "u2"],
  ...over,
});

/** The fake token is `ExponentPushToken[tok-{uid}-0000]`. */
const uidOf = (token: string) => /tok-(.+)-0000/.exec(token)?.[1] ?? token;

function run(seed: Record<string, Record<string, unknown>>) {
  const f = fakeAdminDb(seed);
  const push = memoryPushPorts(["org", "u1", "u2", "u3"]);
  push.ports.loadPreferences = async () => settings();
  const tick = () =>
    runEventTick([createSharedEventSource(f.db)], { db: f.db, push: push.ports, loadSettings: async () => settings(), readModel: { note: () => undefined } }, NOW);
  const to = () => push.sent.map((m) => `${uidOf(m.to)}:${m.data.kind}`).sort();
  return { f, push, tick, to };
}

describe("splits", () => {
  it("a new split notifies the other participants, not the organiser, without amounts", async () => {
    const r = run({ "splits/s1": split() });
    expect(await r.tick()).toMatchObject({ events: 2, sent: 2, rows: 2 });
    expect(r.to()).toEqual(["u1:split_added", "u2:split_added"]);
    expect(r.push.sent[0]).toMatchObject({ title: "Priya added you to a split", data: { url: "/vaults?tab=splits", category: "shared" } });
    expect(JSON.stringify(r.push.sent)).not.toContain("24000");
    expect(await r.tick()).toMatchObject({ sent: 0, duplicates: 2 });
  });

  it("a split settled in the last day tells the others; an old one doesn't repeat", async () => {
    const r = run({
      "splits/s1": split({ createdAt: ago(500), settled: true, settledAt: ago(1) }),
      "splits/old": split({ createdAt: ago(900), settled: true, settledAt: ago(400) }),
    });
    await r.tick();
    expect(r.to()).toEqual(["u1:split_settled", "u2:split_settled"]);
  });

  it("a deleted split never notifies, nor a settledAt without settled", async () => {
    const r = run({
      "splits/gone": split({ deletedAt: "2026-11-06" }),
      "splits/reopened": split({ createdAt: ago(500), settled: false, settledAt: ago(1) }),
    });
    expect(await r.tick()).toMatchObject({ events: 0 });
  });
});

describe("claims", () => {
  const share = {
    splitId: "s1",
    createdBy: "org",
    title: "Goa trip",
    participants: [
      { name: "Ravi", claimKey: "k1" },
      { name: "Anu", claimKey: "k2" },
    ],
  };

  it("an 'I paid' claim notifies the organiser only, named, once per filing", async () => {
    const r = run({
      "splitPublicShares/sh1": share,
      "splitShareClaims/sh1__k1": { shareId: "sh1", participantKey: "k1", type: "paid", amount: 4000, status: "pending", createdAt: ago(1), updatedAt: ago(1) },
    });
    await r.tick();
    expect(r.push.sent.map((m) => [uidOf(m.to), m.title])).toEqual([["org", "Ravi says they've paid"]]);
    // Applied, then filed again later: a new filing notifies again.
    r.f.docs.set("splitShareClaims/sh1__k1", { ...r.f.docs.get("splitShareClaims/sh1__k1"), updatedAt: ago(0.5) });
    await r.tick();
    expect(r.push.sent).toHaveLength(2);
  });

  it("opt-out claims, and claims for a share that's gone", async () => {
    const r = run({
      "splitPublicShares/sh1": share,
      "splitShareClaims/sh1__k2": { shareId: "sh1", participantKey: "k2", type: "optOut", amount: 0, status: "pending", createdAt: ago(1), updatedAt: ago(1) },
      "splitShareClaims/gone__k1": { shareId: "gone", participantKey: "k1", type: "paid", amount: 1, status: "pending", createdAt: ago(1), updatedAt: ago(1) },
    });
    await r.tick();
    expect(r.push.sent.map((m) => m.title)).toEqual(["Anu wants to drop out"]);
  });
});

describe("vaults", () => {
  it("a deposit notifies the other members and the owner, not the person who added it", async () => {
    const r = run({
      "vaults/v1": { name: "House fund", ownerId: "u1", memberIds: ["u1", "u2", "u3"] },
      "vaults/v1/expenses/e1": { vaultId: "v1", type: "deposit", amount: 500, createdBy: "u2", createdByName: "Kiran", createdAt: new Date(ago(1)) },
      "vaults/v1/expenses/old": { vaultId: "v1", type: "deposit", amount: 500, createdBy: "u2", createdAt: new Date(ago(50)) },
      "vaults/solo": { name: "Mine", ownerId: "u1", memberIds: ["u1"] },
      "vaults/solo/expenses/e2": { vaultId: "solo", type: "withdrawal", amount: 5, createdBy: "u1", createdAt: new Date(ago(1)) },
    });
    await r.tick();
    expect(r.to()).toEqual(["u1:vault_entry", "u3:vault_entry"]);
    expect(r.push.sent[0].title).toBe("Kiran added a deposit to House fund");
  });
});

describe("otherMembers", () => {
  it("drops the actor and duplicates", () => {
    expect(otherMembers(["a", "b", "a", "c"], "a")).toEqual(["b", "c"]);
  });
});
