import { describe, expect, it, vi } from "vitest";

import { SETTINGS_DEFAULTS, type UserSettings } from "../../types/settings";
import type { DeviceRecord, ExpoMessage, PushPorts } from "./pushSender";
import {
  effectiveTime,
  isSlotDue,
  latestDueSlot,
  localClock,
  runReminderTick,
  secondsLeftToday,
  type ReminderSlot,
  type ReminderSource,
} from "./reminderEngine";

const TOKEN = (uid: string) => `ExponentPushToken[tok-${uid}-000000]`;
const WINDOW = { start: "08:00", end: "21:00" };

/** A test source: items carry their own slots and an `open` flag. */
type Item = { id: string; open: boolean; slots: Omit<ReminderSlot, "title" | "body" | "url">[] };
function testSource(db: Map<string, Item>, uids: Record<string, string[]>, opts: { summarize?: boolean } = {}): ReminderSource<Item> {
  return {
    name: "test",
    category: "bills",
    candidates: async () => Object.entries(uids).flatMap(([uid, ids]) => ids.map((id) => ({ uid, item: db.get(`${uid}/${id}`)! }))),
    itemId: (item) => item.id,
    slotsFor: (item, ctx) =>
      item.open
        ? item.slots.filter((s) => s.date === ctx.today).map((s) => ({ ...s, title: `T ${s.slotId}`, body: "B", url: `/x/${item.id}` }))
        : [],
    reload: async (uid, id) => db.get(`${uid}/${id}`) ?? null,
    ...(opts.summarize
      ? { summarize: (slots: readonly ReminderSlot[]) => ({ title: `${slots.length} bills due`, body: "Open Spendly", url: "/credit-card-bills" }) }
      : {}),
  };
}

function settings(over: Partial<UserSettings> = {}): UserSettings {
  return {
    ...SETTINGS_DEFAULTS,
    timezone: "Asia/Kolkata",
    pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: WINDOW },
    ...over,
  };
}

function pushPorts(uids: string[]) {
  const claimed = new Set<string>();
  const sent: ExpoMessage[] = [];
  const devices: DeviceRecord[] = uids.map((uid) => ({ uid, installId: `i-${uid}`, token: TOKEN(uid), product: "expense", lastSeenAtMs: 1 }));
  const ports: PushPorts = {
    killSwitchOn: async () => false,
    claim: async (k) => (claimed.has(k) ? false : (claimed.add(k), true)),
    loadPreferences: async () => null,
    loadDevices: async (uid) => devices.filter((d) => d.uid === uid),
    findTokenOwners: async (tokens) => devices.filter((d) => tokens.includes(d.token)),
    deleteDevices: async () => undefined,
    sendExpo: async (msgs) => (sent.push(...msgs), { httpStatus: 200, tickets: msgs.map(() => ({ status: "ok" as const, id: "t" })) }),
    getReceipts: async () => ({}),
    finishLog: async () => undefined,
    sleep: async () => undefined,
  };
  return { ports, claimed, sent };
}

// 2026-11-06 04:00 UTC = 09:30 in Asia/Kolkata.
const NOW = new Date("2026-11-06T04:00:00Z");
const TODAY = "2026-11-06";

describe("runReminderTick", () => {
  it("sends a due slot once, keyed by user and slot, with a TTL to the end of the user's day", async () => {
    const db = new Map([["u1/b1", { id: "b1", open: true, slots: [{ slotId: "ccbill:b1:due", date: TODAY, time: "09:00", kind: "bill_due" }] }]]);
    const p = pushPorts(["u1"]);
    const ports = { loadSettings: async () => settings(), push: p.ports };

    const r1 = await runReminderTick([testSource(db, { u1: ["b1"] })], ports, NOW);
    expect(r1).toMatchObject({ users: 1, due: 1, sent: 1 });
    expect(p.claimed.has("u1:ccbill:b1:due")).toBe(true);
    expect(p.sent[0]).toMatchObject({ to: TOKEN("u1"), title: "T ccbill:b1:due", ttl: (24 * 60 - (9 * 60 + 30)) * 60 });

    // The next run (or an overlapping one) doesn't send it again.
    expect(await runReminderTick([testSource(db, { u1: ["b1"] })], ports, NOW)).toMatchObject({ sent: 0, duplicates: 1 });
    expect(p.sent).toHaveLength(1);
  });

  it("re-checks at send time: an item paid or deleted since the candidate query is not notified", async () => {
    const db = new Map([
      ["u1/paid", { id: "paid", open: true, slots: [{ slotId: "s-paid", date: TODAY, time: "09:00", kind: "k" }] }],
      ["u1/gone", { id: "gone", open: true, slots: [{ slotId: "s-gone", date: TODAY, time: "09:00", kind: "k" }] }],
    ]);
    const source = testSource(db, { u1: ["paid", "gone"] });
    const candidates = await source.candidates({ fromDate: "", toDate: "" });
    // Between the query and the send: one is paid, one deleted.
    db.set("u1/paid", { ...db.get("u1/paid")!, open: false });
    db.delete("u1/gone");
    const p = pushPorts(["u1"]);

    const res = await runReminderTick([{ ...source, candidates: async () => candidates }], { loadSettings: async () => settings(), push: p.ports }, NOW);
    expect(res).toMatchObject({ sent: 0, skipped: { resolved: 1, deleted: 1 } });
    expect(p.sent).toHaveLength(0);
  });

  it("sends only the latest due slot per item after downtime, and never another day's slot", async () => {
    const db = new Map([
      [
        "u1/b1",
        {
          id: "b1",
          open: true,
          slots: [
            { slotId: "early", date: TODAY, time: "08:00", kind: "k" },
            { slotId: "later", date: TODAY, time: "09:15", kind: "k" },
            { slotId: "future", date: TODAY, time: "18:00", kind: "k" },
            { slotId: "yesterday", date: "2026-11-05", time: "09:00", kind: "k" },
          ],
        },
      ],
    ]);
    const p = pushPorts(["u1"]);
    await runReminderTick([testSource(db, { u1: ["b1"] })], { loadSettings: async () => settings(), push: p.ports }, NOW);
    expect([...p.claimed]).toEqual(["u1:later"]);
  });

  it("waits outside the user's delivery window, in the user's own timezone", async () => {
    const db = new Map([["u1/b1", { id: "b1", open: true, slots: [{ slotId: "s", date: "2026-11-05", time: "09:00", kind: "k" }] }]]);
    const p = pushPorts(["u1"]);
    // 04:00 UTC is 23:00 the day before in New York: outside 08:00–21:00.
    const res = await runReminderTick(
      [testSource(db, { u1: ["b1"] })],
      { loadSettings: async () => settings({ timezone: "America/New_York" }), push: p.ports },
      NOW
    );
    expect(res).toMatchObject({ sent: 0, skipped: { "outside-window": 1 } });
  });

  it("collapses three or more due notices into one summary and claims each slot", async () => {
    const db = new Map(
      ["b1", "b2", "b3"].map((id) => [`u1/${id}`, { id, open: true, slots: [{ slotId: `ccbill:${id}:due`, date: TODAY, time: "09:00", kind: "bill_due" }] }])
    );
    const p = pushPorts(["u1"]);
    const ports = { loadSettings: async () => settings(), push: p.ports };
    const source = testSource(db, { u1: ["b1", "b2", "b3"] }, { summarize: true });

    expect(await runReminderTick([source], ports, NOW)).toMatchObject({ summaries: 1, sent: 0 });
    expect(p.sent.map((m) => m.title)).toEqual(["3 bills due"]);
    // One is paid later today: the other two must not now go out one by one.
    db.set("u1/b1", { ...db.get("u1/b1")!, open: false });
    expect(await runReminderTick([source], ports, NOW)).toMatchObject({ sent: 0, duplicates: 2 });
    expect(p.sent).toHaveLength(1);
  });

  it("stops when the read budget is spent; the next run carries on", async () => {
    const db = new Map([
      ["u1/b1", { id: "b1", open: true, slots: [{ slotId: "s1", date: TODAY, time: "09:00", kind: "k" }] }],
      ["u2/b2", { id: "b2", open: true, slots: [{ slotId: "s2", date: TODAY, time: "09:00", kind: "k" }] }],
    ]);
    const p = pushPorts(["u1", "u2"]);
    let users = 0;
    const res = await runReminderTick(
      [testSource(db, { u1: ["b1"], u2: ["b2"] })],
      { loadSettings: async () => (users++, settings()), push: p.ports, budget: { exhausted: () => users >= 1 } },
      NOW
    );
    expect(res).toMatchObject({ users: 1, stoppedForBudget: true });
  });

  it("skips a user with no settings document", async () => {
    const db = new Map([["u1/b1", { id: "b1", open: true, slots: [{ slotId: "s", date: TODAY, time: "09:00", kind: "k" }] }]]);
    const res = await runReminderTick([testSource(db, { u1: ["b1"] })], { loadSettings: async () => null, push: pushPorts([]).ports }, NOW);
    expect(res.skipped).toEqual({ "no-settings": 1 });
  });

  it("respects the kill switch", async () => {
    const db = new Map([["u1/b1", { id: "b1", open: true, slots: [{ slotId: "s", date: TODAY, time: "09:00", kind: "k" }] }]]);
    const p = pushPorts(["u1"]);
    p.ports.killSwitchOn = vi.fn(async () => true);
    const res = await runReminderTick([testSource(db, { u1: ["b1"] })], { loadSettings: async () => settings(), push: p.ports }, NOW);
    expect(res).toMatchObject({ sent: 0, skipped: { disabled: 1 } });
  });
});

describe("time helpers", () => {
  it("localClock reads the user's date and time, falling back to UTC", () => {
    expect(localClock(NOW, "Asia/Kolkata")).toEqual({ date: "2026-11-06", time: "09:30" });
    expect(localClock(NOW, "Not/AZone")).toEqual({ date: "2026-11-06", time: "04:00" });
  });

  it("effectiveTime moves a slot timed outside the window to its start", () => {
    expect(effectiveTime("09:00", WINDOW)).toBe("09:00");
    expect(effectiveTime("06:00", WINDOW)).toBe("08:00");
    expect(effectiveTime("22:30", WINDOW)).toBe("08:00");
  });

  it("isSlotDue handles an overnight window", () => {
    const night = { start: "22:00", end: "07:00" };
    const slot = { slotId: "s", date: TODAY, time: "06:00", kind: "k", title: "", body: "", url: "/" };
    expect(isSlotDue(slot, { date: TODAY, time: "06:30" }, night)).toBe(true);
    expect(isSlotDue(slot, { date: TODAY, time: "05:00" }, night)).toBe(false);
    expect(isSlotDue({ ...slot, time: "12:00" }, { date: TODAY, time: "23:00" }, night)).toBe(true);
  });

  it("latestDueSlot and secondsLeftToday", () => {
    const s = (slotId: string, time: string) => ({ slotId, date: TODAY, time, kind: "k", title: "", body: "", url: "/" });
    expect(latestDueSlot([s("a", "08:00"), s("b", "10:00")], { date: TODAY, time: "09:00" }, WINDOW)?.slotId).toBe("a");
    expect(latestDueSlot([s("a", "10:00")], { date: TODAY, time: "09:00" }, WINDOW)).toBeNull();
    expect(secondsLeftToday("23:59")).toBe(60);
    expect(secondsLeftToday("00:00")).toBe(86400);
  });
});
