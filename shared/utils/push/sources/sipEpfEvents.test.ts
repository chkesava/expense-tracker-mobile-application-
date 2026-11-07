import { describe, expect, it } from "vitest";

import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { DEFAULT_PUSH_NOTIFICATIONS } from "../../pushPreferences";
import { runEventTick } from "../events";
import { fakeAdminDb, memoryPushPorts } from "../testing/fakeAdminDb";
import { createEpfEventSource, createSipEventSource, monthLabel } from "./sipEpfEvents";

const NOW = new Date("2026-11-06T04:00:00Z"); // 09:30 IST
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  ...SETTINGS_DEFAULTS,
  timezone: "Asia/Kolkata",
  pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: { start: "08:00", end: "21:00" } },
  ...over,
});

const sipRow = (type: string, createdAt: Date, over: Record<string, unknown> = {}) => ({
  id: "x",
  type,
  title: type === "sip_failed" ? "SIP Failed" : "SIP Executed",
  body: "Nifty 50 index fund",
  read: false,
  createdAt,
  meta: { sipId: "plan1" },
  ...over,
});

const epfRow = (over: Record<string, unknown> = {}) => ({
  establishmentId: "est1",
  month: "2026-10",
  status: "expected",
  statusUpdatedAt: hoursAgo(2),
  expectedCreditFrom: "2026-11-01",
  expectedCreditTo: "2026-11-15",
  ...over,
});

function run(seed: Record<string, Record<string, unknown>>, opts: { settings?: UserSettings; now?: Date } = {}) {
  const f = fakeAdminDb(seed);
  const push = memoryPushPorts(["u1"]);
  push.ports.loadPreferences = async () => opts.settings ?? settings();
  const notes: string[] = [];
  const tick = () =>
    runEventTick(
      [createSipEventSource(f.db), createEpfEventSource(f.db)],
      {
        db: f.db,
        push: push.ports,
        loadSettings: async () => opts.settings ?? settings(),
        readModel: { note: (_uid, paths) => void notes.push(...paths) },
      },
      opts.now ?? NOW
    );
  return { f, push, notes, tick };
}

describe("SIP events", () => {
  it("pushes each new SIP row once, with the row's own wording; never an old one", async () => {
    const r = run({
      "users/u1/notifications/n_plan1_2026-11-06_executed": sipRow("sip_executed", hoursAgo(1)),
      "users/u1/notifications/n_plan2_2026-11-06_failed": sipRow("sip_failed", hoursAgo(3)),
      "users/u1/notifications/n_old": sipRow("sip_executed", hoursAgo(40)),
      "users/u1/notifications/other": { type: "epf_expected", title: "x", createdAt: hoursAgo(1) },
    });
    const first = await r.tick();
    expect(first).toMatchObject({ events: 2, sent: 2, rows: 0 });
    expect(r.push.sent.map((m) => [m.title, m.data.url, m.data.category, m.data.entityId])).toEqual([
      ["SIP Executed", "/investments", "investments", "plan1"],
      ["SIP Failed", "/investments", "investments", "plan1"],
    ]);
    expect(await r.tick()).toMatchObject({ sent: 0, duplicates: 2 });
  });
});

describe("EPF events", () => {
  it("expected: pushes and writes the inbox row once, without amounts", async () => {
    const r = run({ "users/u1/epfContributions/est1_2026-10": epfRow() });
    expect(await r.tick()).toMatchObject({ events: 1, rows: 1, sent: 1 });
    expect(r.push.sent[0]).toMatchObject({ title: "EPF contribution expected", body: "Your EPF for October 2026 should be credited by 15 Nov.", data: { url: "/epf/est1", kind: "epf_expected" } });
    expect(r.f.docs.get("users/u1/notifications/epf_expected_est1_2026-10")).toMatchObject({ type: "epf_expected", category: "investments", read: false });
    expect(r.notes).toEqual(["users/u1/notifications/epf_expected_est1_2026-10"]);

    // The user reads it; the next run neither resends nor resets the row.
    r.f.docs.set("users/u1/notifications/epf_expected_est1_2026-10", { ...r.f.docs.get("users/u1/notifications/epf_expected_est1_2026-10"), read: true });
    expect(await r.tick()).toMatchObject({ rows: 0, sent: 0, duplicates: 1 });
    expect(r.f.docs.get("users/u1/notifications/epf_expected_est1_2026-10")?.read).toBe(true);
  });

  it("not credited yet: once after the window ends, never once credited", async () => {
    const late = epfRow({ statusUpdatedAt: hoursAgo(500), expectedCreditTo: "2026-11-05" });
    const r = run({ "users/u1/epfContributions/est1_2026-09": late });
    await r.tick();
    expect(r.push.sent.map((m) => m.data.kind)).toEqual(["epf_late"]);

    const credited = run({ "users/u1/epfContributions/est1_2026-09": { ...late, status: "credited" } });
    expect(await credited.tick()).toMatchObject({ events: 0 });
    for (const status of ["missed", "reversed"]) {
      expect(await run({ "users/u1/epfContributions/a": { ...late, status } }).tick()).toMatchObject({ events: 0 });
    }
  });

  it("ignores windows that ended more than 3 days ago or haven't ended", async () => {
    const r = run({
      "users/u1/epfContributions/old": epfRow({ statusUpdatedAt: hoursAgo(500), expectedCreditTo: "2026-11-01" }),
      "users/u1/epfContributions/open": epfRow({ statusUpdatedAt: hoursAgo(500), expectedCreditTo: "2026-11-06" }),
    });
    expect(await r.tick()).toMatchObject({ events: 0 });
  });
});

describe("delivery rules", () => {
  it("outside the window: the row is written now, the push waits for the window", async () => {
    const night = new Date("2026-11-05T17:30:00Z"); // 23:00 IST
    const r = run({ "users/u1/epfContributions/est1_2026-10": epfRow({ statusUpdatedAt: new Date("2026-11-05T16:00:00Z") }) }, { now: night });
    expect(await r.tick()).toMatchObject({ rows: 1, sent: 0, skipped: { "outside-window": 1 } });
    // Next morning, inside the lookback: sent.
    const morning = run({ ...Object.fromEntries(r.f.docs) }, { now: NOW });
    expect(await morning.tick()).toMatchObject({ rows: 0, sent: 1 });
  });

  it("an opted-out user gets the inbox row but no push", async () => {
    const off = settings({ pushNotifications: { ...DEFAULT_PUSH_NOTIFICATIONS, deliveryWindow: { start: "08:00", end: "21:00" }, categories: { investments: false, shared: true, priceAlerts: true } } });
    const r = run({ "users/u1/epfContributions/est1_2026-10": epfRow() }, { settings: off });
    expect(await r.tick()).toMatchObject({ rows: 1, sent: 0, skipped: { "no-delivery": 1 } });
    expect(r.push.sent).toEqual([]);
  });

  it("only users/ paths", async () => {
    const r = run({ "pandals/p1/epfContributions/x": epfRow(), "pandals/p1/notifications/n": sipRow("sip_executed", hoursAgo(1)) });
    expect(await r.tick()).toMatchObject({ events: 0 });
  });
});

describe("monthLabel", () => {
  it("formats wage months", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("bad")).toBe("this month");
  });
});
