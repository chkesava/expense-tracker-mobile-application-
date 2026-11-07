import { describe, expect, it } from "vitest";

import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import type { AdminFirestoreLike } from "../firestorePorts";
import type { DeviceRecord, ExpoMessage, PushPorts } from "../pushSender";
import { runReminderTick } from "../reminderEngine";
import { billSlots, createBillSource, dedupeBills, type BillItem } from "./billSource";

const TODAY = "2026-11-06";
const ACCOUNT = { name: "HDFC Regalia", accountNumber: "4111222233334521" };

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  ...SETTINGS_DEFAULTS,
  timezone: "Asia/Kolkata",
  pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: { start: "08:00", end: "21:00" } },
  ...over,
});

const bill = (over: Record<string, unknown> = {}, id = "b1"): BillItem => ({
  uid: "u1",
  id,
  account: ACCOUNT,
  data: {
    accountId: "acc1",
    statementDate: "2026-10-28",
    dueDate: "2026-11-09",
    statementAmount: 12000,
    amountPaid: 0,
    currency: "INR",
    status: "UPCOMING",
    reminderEnabled: true,
    reminderFrequency: { daysBefore: [7, 3, 1], onDueDate: true, overdueEveryDays: 1 },
    ...over,
  },
});

describe("billSlots", () => {
  it("reminds 3 days before, with the date in the slot id and amounts hidden by default", () => {
    const [slot] = billSlots(bill(), settings(), TODAY);
    expect(slot).toMatchObject({
      slotId: "ccbill:b1:before:3@2026-11-06",
      date: TODAY,
      time: "09:00",
      kind: "bill_before",
      title: "Credit card bill reminder",
      body: "Reminder: HDFC Regalia bill is due in 3 days.",
      url: "/credit-card-bills/b1",
    });
  });

  it("reminds on the due date and while overdue, every N days", () => {
    expect(billSlots(bill({ dueDate: TODAY }), settings(), TODAY)[0]).toMatchObject({ kind: "bill_due", body: "HDFC Regalia bill is due today." });
    expect(billSlots(bill({ dueDate: "2026-11-04" }), settings(), TODAY)[0]).toMatchObject({ kind: "bill_overdue", slotId: "ccbill:b1:overdue:2026-11-06@2026-11-06" });
    // Every 3 days: day 2 overdue is quiet, day 3 reminds.
    const every3 = { reminderFrequency: { daysBefore: [], onDueDate: true, overdueEveryDays: 3 } };
    expect(billSlots(bill({ dueDate: "2026-11-04", ...every3 }), settings(), TODAY)).toEqual([]);
    expect(billSlots(bill({ dueDate: "2026-11-03", ...every3 }), settings(), TODAY)).toHaveLength(1);
  });

  it("stops after 60 days overdue", () => {
    expect(billSlots(bill({ dueDate: "2026-09-07" }), settings(), TODAY)).toHaveLength(1); // day 60
    expect(billSlots(bill({ dueDate: "2026-09-06" }), settings(), TODAY)).toEqual([]); // day 61
  });

  it("stops once paid, cancelled or nothing is left, even if the stored status says otherwise", () => {
    expect(billSlots(bill({ amountPaid: 12000, status: "UPCOMING" }), settings(), TODAY)).toEqual([]);
    expect(billSlots(bill({ status: "CANCELLED" }), settings(), TODAY)).toEqual([]);
    expect(billSlots(bill({ remainingAmount: 0 }), settings(), TODAY)).toEqual([]);
  });

  it("keeps reminding after a part payment, with what is still owed", () => {
    const s = settings({ pushNotifications: { ...settings().pushNotifications, showAmounts: true } });
    const [slot] = billSlots(bill({ amountPaid: 4000, remainingAmount: 8000, status: "PARTIALLY_PAID" }), s, TODAY);
    expect(slot.body).toContain("8,000");
    expect(slot.body).toContain("••••4521");
  });

  it("honours the global switch, the bill's own flag and snooze", () => {
    const off = settings({ creditCardBillReminders: { ...SETTINGS_DEFAULTS.creditCardBillReminders, enabled: false } });
    expect(billSlots(bill(), off, TODAY)).toEqual([]);
    expect(billSlots(bill({ reminderEnabled: false }), settings(), TODAY)).toEqual([]);
    expect(billSlots(bill({ nextReminderAt: "2026-11-07" }), settings(), TODAY)).toEqual([]);
    expect(billSlots(bill({ nextReminderAt: "2026-11-06" }), settings(), TODAY)).toHaveLength(1);
  });

  it("uses the bill's own cadence over the defaults (auto bills: 3 and 1 days)", () => {
    const auto = { reminderFrequency: { daysBefore: [3, 1], onDueDate: true, overdueEveryDays: 1 } };
    expect(billSlots(bill({ dueDate: "2026-11-13", ...auto }), settings(), TODAY)).toEqual([]); // 7 days before: not for auto bills
    expect(billSlots(bill({ dueDate: "2026-11-13" }), settings(), TODAY)).toHaveLength(1);
  });

  it("is silent when the account was deleted", () => {
    expect(billSlots({ ...bill(), account: null }, settings(), TODAY)).toEqual([]);
  });

  it("a moved due date gives a new slot id, so an earlier send doesn't block it", () => {
    // The 3-days-before reminder went out for 9 Nov; the user then moves the due date to 10 Nov.
    const before = billSlots(bill({ dueDate: "2026-11-09" }), settings(), TODAY)[0].slotId;
    const moved = billSlots(bill({ dueDate: "2026-11-10" }), settings(), "2026-11-07")[0].slotId;
    expect(before).toBe("ccbill:b1:before:3@2026-11-06");
    expect(moved).toBe("ccbill:b1:before:3@2026-11-07");
  });
});

describe("dedupeBills", () => {
  it("keeps one bill per account and statement date, preferring the app's own id, and drops cancelled ones", () => {
    const items = [
      bill({}, "zzz-legacy"),
      bill({}, "acc1_2026-10-28"),
      bill({ statementDate: "2026-09-28" }, "old"),
      bill({ status: "CANCELLED", statementDate: "2026-08-28" }, "gone"),
    ];
    expect(dedupeBills(items).map((b) => b.id).sort()).toEqual(["acc1_2026-10-28", "old"]);
  });
});

/** In-memory Admin Firestore with the range/`in` filters the source uses. */
function fakeDb(seed: Record<string, Record<string, unknown>>) {
  const docs = new Map(Object.entries(seed));
  type F = [string, string, unknown];
  const ok = (v: unknown, op: string, x: unknown) =>
    op === "in" ? (x as unknown[]).includes(v) : op === ">=" ? String(v) >= String(x) : op === "<=" ? String(v) <= String(x) : op === "<" ? String(v) < String(x) : v === x;
  const snap = (path: string) => ({ exists: docs.has(path), id: path.split("/").pop()!, ref: { path }, data: () => docs.get(path) });
  const query = (match: (p: string) => boolean, filters: F[] = []): ReturnType<AdminFirestoreLike["collection"]> => ({
    where: (f, op, v) => query(match, [...filters, [f, op, v]]),
    limit: () => query(match, filters),
    get: async () => ({ docs: [...docs.keys()].filter(match).filter((p) => filters.every(([f, op, v]) => ok(docs.get(p)?.[f], op, v))).map(snap) }),
  });
  const db: AdminFirestoreLike = {
    doc: (path) => ({
      path,
      get: async () => snap(path),
      create: async (data) => {
        if (docs.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
        docs.set(path, data);
      },
      set: async (data, o) => void docs.set(path, o?.merge ? { ...docs.get(path), ...data } : data),
    }),
    collection: (path) => query((p) => p.startsWith(`${path}/`) && p.split("/").length === path.split("/").length + 1),
    collectionGroup: (id) => query((p) => p.split("/").at(-2) === id),
    batch: () => ({ delete: () => undefined, commit: async () => undefined }),
  };
  return { db, docs };
}

describe("createBillSource", () => {
  const seed = () => ({
    "users/u1/accounts/acc1": ACCOUNT,
    "users/u1/creditCardBills/soon": bill({ dueDate: "2026-11-09" }).data,
    "users/u1/creditCardBills/far": bill({ dueDate: "2026-12-20", statementDate: "2026-12-01" }).data,
    "users/u1/creditCardBills/late": bill({ dueDate: "2026-10-20", statementDate: "2026-10-01", status: "OVERDUE" }).data,
    "users/u1/creditCardBills/paidLate": bill({ dueDate: "2026-10-20", statementDate: "2026-09-01", status: "PAID", amountPaid: 12000 }).data,
    "pandals/p1/creditCardBills/x": bill({ dueDate: "2026-11-09" }).data,
  });

  it("finds bills due this week and unsettled overdue ones, only under users/", async () => {
    const f = fakeDb(seed());
    const found = await createBillSource(f.db).candidates({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    expect(found.map((c) => c.item.id).sort()).toEqual(["late", "soon"]);
  });

  it("reloads the bill with its account, or null when the bill is gone", async () => {
    const f = fakeDb(seed());
    const source = createBillSource(f.db);
    expect((await source.reload("u1", "soon"))?.account).toEqual(ACCOUNT);
    expect(await source.reload("u1", "missing")).toBeNull();
    f.docs.delete("users/u1/accounts/acc1");
    expect((await source.reload("u1", "soon"))?.account).toBeNull();
  });

  it("writes the bill reminder log with channel push", async () => {
    const f = fakeDb(seed());
    const source = createBillSource(f.db, { now: () => new Date("2026-11-06T04:00:00Z") });
    await source.onSent!("u1", "soon", { slotId: "ccbill:soon:before:3@2026-11-06", date: TODAY, time: "09:00", kind: "bill_before", title: "", body: "", url: "/" }, "sent");
    expect(f.docs.get("users/u1/creditCardBillReminderLogs/push_ccbill:soon:before:3@2026-11-06")).toMatchObject({
      billId: "soon",
      notificationType: "days_before",
      daysBefore: 3,
      channel: "push",
      status: "sent",
    });
  });

  it("end to end: a bill paid between the query and the send gets no push", async () => {
    const f = fakeDb({ ...seed(), "users/u1": { timezone: "Asia/Kolkata" } });
    const source = createBillSource(f.db);
    const sent: ExpoMessage[] = [];
    const devices: DeviceRecord[] = [{ uid: "u1", installId: "i1", token: "ExponentPushToken[tok000000]", product: "expense", lastSeenAtMs: 1 }];
    const claimed = new Set<string>();
    const push: PushPorts = {
      killSwitchOn: async () => false,
      claim: async (k) => (claimed.has(k) ? false : (claimed.add(k), true)),
      loadPreferences: async () => null,
      loadDevices: async () => devices,
      findTokenOwners: async () => devices,
      deleteDevices: async () => undefined,
      sendExpo: async (m) => (sent.push(...m), { httpStatus: 200, tickets: m.map(() => ({ status: "ok" as const, id: "t" })) }),
      getReceipts: async () => ({}),
      finishLog: async () => undefined,
      sleep: async () => undefined,
    };
    const candidates = await source.candidates({ fromDate: "2026-11-05", toDate: "2026-11-07" });
    // Paid in the app a moment later.
    f.docs.set("users/u1/creditCardBills/soon", { ...f.docs.get("users/u1/creditCardBills/soon"), amountPaid: 12000, status: "PAID" });
    const now = new Date("2026-11-06T04:00:00Z"); // 09:30 IST
    const res = await runReminderTick([{ ...source, candidates: async () => candidates }], { loadSettings: async () => settings(), push }, now);

    // "soon" (3 days before) is skipped; "late" (overdue, unpaid) is sent.
    expect(res.skipped).toMatchObject({ resolved: 1 });
    expect(sent.map((m) => m.data.entityId)).toEqual(["late"]);
    expect(sent[0].body).toBe("HDFC Regalia bill is overdue.");
  });
});
