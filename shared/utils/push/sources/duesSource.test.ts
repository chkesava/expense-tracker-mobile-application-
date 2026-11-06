import { describe, expect, it } from "vitest";

import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { runReminderTick } from "../reminderEngine";
import { fakeAdminDb, memoryPushPorts } from "../testing/fakeAdminDb";
import { createDuesSource, subscriptionOccurrencePosted, type DueItem } from "./duesSource";

const TODAY = "2026-11-06";

/** Dues on (they're off by default), 1 day before. */
const settings = (over: Partial<UserSettings["calendarNotifications"]> = {}, top: Partial<UserSettings> = {}): UserSettings => ({
  ...SETTINGS_DEFAULTS,
  timezone: "Asia/Kolkata",
  calendarNotifications: { ...SETTINGS_DEFAULTS.calendarNotifications, duesEnabled: true, duesDaysBefore: 1, ...over },
  pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: { start: "08:00", end: "21:00" } },
  ...top,
});

const borrowing = (over: Record<string, unknown> = {}) => ({ lenderName: "Ravi", dueDate: TODAY, status: "ACTIVE", totalOutstanding: 20000, ...over });
const receivable = (over: Record<string, unknown> = {}) => ({ personName: "Anil", dueDate: TODAY, status: "PENDING", outstandingAmount: 5000, ...over });
const subscription = (over: Record<string, unknown> = {}) => ({
  name: "Netflix",
  amount: 649,
  dayOfMonth: 6,
  isActive: true,
  isCompleted: false,
  type: "subscription",
  category: "Entertainment",
  lastProcessed: "2026-10",
  ...over,
});

const source = createDuesSource(fakeAdminDb({}).db);
const slots = (item: DueItem, s = settings()) => source.slotsFor(item, { today: TODAY, settings: s });
const it_ = (kind: DueItem["kind"], data: Record<string, unknown>, id = "x1"): DueItem => ({ uid: "u1", kind, id, data });

describe("dues slots", () => {
  it("borrowing due today, and the day before with the lead", () => {
    expect(slots(it_("borrowing", borrowing()))).toEqual([
      expect.objectContaining({ slotId: "cal:borrowing:x1:2026-11-06:due", kind: "calendar_due", title: "Repay Ravi", body: "Repayment due today" }),
    ]);
    expect(slots(it_("borrowing", borrowing({ dueDate: "2026-11-07" })))[0]).toMatchObject({ kind: "calendar_before", body: "Repayment due tomorrow" });
  });

  it("stops once a borrowing is settled or closed, and a receivable settled or cancelled", () => {
    for (const status of ["FULLY_SETTLED", "CLOSED"]) expect(slots(it_("borrowing", borrowing({ status })))).toEqual([]);
    for (const status of ["FULLY_SETTLED", "CANCELLED"]) expect(slots(it_("receivable", receivable({ status })))).toEqual([]);
  });

  it("part repaid keeps reminding with what is outstanding (when amounts are allowed)", () => {
    const s = settings({}, { pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, showAmounts: true } });
    const [slot] = slots(it_("borrowing", borrowing({ status: "PARTIALLY_SETTLED", totalOutstanding: 7500 })), s);
    expect(slot.body).toMatch(/Repayment due today · .*7,500/);
    expect(slots(it_("borrowing", borrowing({ totalOutstanding: 7500 })))[0].body).toBe("Repayment due today");
  });

  it("money owed to the user: expected today, and once the day after", () => {
    expect(slots(it_("receivable", receivable()))[0]).toMatchObject({ title: "Anil owes you", body: "Expected today" });
    expect(slots(it_("receivable", receivable({ dueDate: "2026-11-05" })))[0]).toMatchObject({ kind: "calendar_overdue", body: "Expected yesterday" });
  });

  it("subscription renewing today, unless already posted this month", () => {
    expect(slots(it_("subscription", subscription()))[0]).toMatchObject({ slotId: "cal:subscription:x1:2026-11-06:due", title: "Netflix" });
    expect(slots(it_("subscription", subscription({ lastProcessed: "2026-11" })))).toEqual([]);
  });

  it("EMIs and subscriptions: inactive, completed, finished term and transfers never notify", () => {
    expect(slots(it_("subscription", subscription({ isActive: false })))).toEqual([]);
    expect(slots(it_("subscription", subscription({ isCompleted: true })))).toEqual([]);
    expect(slots(it_("subscription", subscription({ type: "transfer" })))).toEqual([]);
    expect(slots(it_("subscription", subscription({ type: "emi", endYear: 2026, endMonth: 10 })))).toEqual([]);
    expect(slots(it_("subscription", subscription({ type: "emi" })))[0]).toMatchObject({ slotId: "cal:emi:x1:2026-11-06:due" });
  });

  it("nothing while dues are switched off (the default)", () => {
    const off = settings({ duesEnabled: false });
    expect(slots(it_("borrowing", borrowing()), off)).toEqual([]);
    expect(slots(it_("subscription", subscription()), off)).toEqual([]);
  });
});

describe("subscriptionOccurrencePosted", () => {
  it("monthly by lastProcessed month, every-N-days by lastProcessedDate", () => {
    expect(subscriptionOccurrencePosted({ lastProcessed: "2026-11" }, TODAY)).toBe(true);
    expect(subscriptionOccurrencePosted({ lastProcessed: "2026-10" }, TODAY)).toBe(false);
    expect(subscriptionOccurrencePosted({ frequency: "every_n_days", lastProcessed: "2026-11", lastProcessedDate: "2026-11-04" }, TODAY)).toBe(false);
    expect(subscriptionOccurrencePosted({ frequency: "every_n_days", lastProcessed: "2026-11", lastProcessedDate: TODAY }, TODAY)).toBe(true);
  });
});

describe("createDuesSource", () => {
  const seed = () => ({
    "users/u1/borrowings/b1": borrowing(),
    "users/u1/borrowings/far": borrowing({ dueDate: "2027-01-01" }),
    "users/u1/receivables/r1": receivable(),
    "users/u1/subscriptions/s1": subscription(),
    "users/u1/subscriptions/off": subscription({ isActive: false }),
    "pandals/p1/borrowings/x": borrowing(),
  });

  it("finds borrowings and receivables due around today and active subscriptions, under users/ only", async () => {
    const found = await createDuesSource(fakeAdminDb(seed()).db).candidates({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    expect(found.map((c) => `${c.item.kind}/${c.item.id}`).sort()).toEqual(["borrowing/b1", "receivable/r1", "subscription/s1"]);
  });

  it("end to end: settled or posted before the send means no push", async () => {
    const f = fakeAdminDb(seed());
    const src = createDuesSource(f.db);
    const candidates = await src.candidates({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    f.docs.set("users/u1/borrowings/b1", { ...f.docs.get("users/u1/borrowings/b1"), status: "FULLY_SETTLED" });
    f.docs.set("users/u1/subscriptions/s1", { ...f.docs.get("users/u1/subscriptions/s1"), lastProcessed: "2026-11" });
    const push = memoryPushPorts(["u1"]);
    // The sender checks the user's own switches too (dues are off by default).
    push.ports.loadPreferences = async () => settings();
    const res = await runReminderTick([{ ...src, candidates: async () => candidates }], { loadSettings: async () => settings(), push: push.ports }, new Date("2026-11-06T04:00:00Z"));
    expect(res.skipped).toMatchObject({ resolved: 2 });
    expect(push.sent.map((m) => m.data.entityId)).toEqual(["receivable/r1"]);
  });
});
