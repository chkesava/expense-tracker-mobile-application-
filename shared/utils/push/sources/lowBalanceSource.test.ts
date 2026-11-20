import { describe, expect, it, vi } from "vitest";

import { SETTINGS_DEFAULTS, type UserSettings } from "../../../types/settings";
import { computeForInputs, loadAutoDebitInputs, type AutoDebitInputsDb } from "../../autoDebitInputs";
import { autoDebitShortfallDocData } from "../../serverResults";
import type { AdminFirestoreLike } from "../firestorePorts";
import { runReminderTick } from "../reminderEngine";
import { fakeAdminDb, memoryPushPorts } from "../testing/fakeAdminDb";
import {
  createLowBalanceSource,
  debitKey,
  itemsFromAccounts,
  lowBalanceRowId,
  lowBalanceSlots,
  type LowBalanceDebit,
  type LowBalanceItem,
} from "./lowBalanceSource";

const TODAY = "2026-11-20";
const NOW = new Date("2026-11-20T04:00:00Z"); // 09:30 IST

const settings = (over: Partial<UserSettings> = {}): UserSettings => ({
  ...SETTINGS_DEFAULTS,
  timezone: "Asia/Kolkata",
  currency: "INR",
  pushNotifications: { ...SETTINGS_DEFAULTS.pushNotifications, deliveryWindow: { start: "08:00", end: "21:00" } },
  ...over,
});

const debit = (over: Partial<LowBalanceDebit> = {}): LowBalanceDebit => ({
  kind: "subscription",
  refId: "emi1",
  name: "Home loan EMI",
  accountId: "bank1",
  accountName: "HDFC Savings",
  dueDate: "2026-11-22",
  amount: 12000,
  leadDays: 3,
  cumulative: 12000,
  shortBy: 2000,
  alerting: true,
  ...over,
});
const item = (over: Partial<LowBalanceDebit> = {}): LowBalanceItem => {
  const d = debit(over);
  return { uid: "u1", key: debitKey(d), debit: d };
};
const ctx = (over: Partial<UserSettings> = {}, today = TODAY) => ({ today, settings: settings(over) });

describe("lowBalanceSlots", () => {
  it("alerts inside the lead window, with the dates in the slot id and amounts hidden by default", () => {
    expect(lowBalanceSlots(item(), ctx())).toEqual([
      {
        slotId: "lowbal:subscription:emi1::2026-11-22@2026-11-20",
        date: TODAY,
        time: "09:00",
        kind: "low_balance_before",
        title: "Low balance before an auto-debit",
        body: "HDFC Savings may not cover Home loan EMI due on 22 Nov. Add money before it's debited.",
        url: "/recurring/emi1",
      },
    ]);
  });

  it("shows amounts only when the user allows them", () => {
    const [slot] = lowBalanceSlots(item(), ctx({ pushNotifications: { ...settings().pushNotifications, showAmounts: true } }));
    expect(slot!.body).toBe("HDFC Savings is short by ₹2,000 for Home loan EMI (₹12,000) due on 22 Nov. Add money before it's debited.");
  });

  it("says tomorrow and today, and marks the due day", () => {
    expect(lowBalanceSlots(item({ dueDate: "2026-11-21" }), ctx())[0]!.body).toContain("due tomorrow");
    const [due] = lowBalanceSlots(item({ dueDate: TODAY }), ctx());
    expect(due).toMatchObject({ kind: "low_balance_due", title: "Low balance for today's auto-debit" });
    expect(due!.body).toContain("due today");
  });

  it("a card's autopay opens its bill", () => {
    const [slot] = lowBalanceSlots(item({ kind: "card", refId: "card1", billId: "bill1", name: "HDFC Card" }), ctx());
    expect(slot).toMatchObject({ url: "/credit-card-bills/bill1", slotId: "lowbal:card:card1:bill1:2026-11-22@2026-11-20" });
    expect(slot!.body).toContain("HDFC Card autopay");
  });

  it("stops: before the window, after the due day, when covered, untrusted or switched off", () => {
    expect(lowBalanceSlots(item({ dueDate: "2026-11-24" }), ctx())).toEqual([]); // window opens the 21st
    expect(lowBalanceSlots(item({ dueDate: "2026-11-19" }), ctx())).toEqual([]); // the due day has passed
    expect(lowBalanceSlots(item({ shortBy: 0 }), ctx())).toEqual([]);
    expect(lowBalanceSlots(item({ shortBy: null }), ctx())).toEqual([]);
    expect(lowBalanceSlots({ uid: "u1", key: "k", debit: null }, ctx())).toEqual([]);
    expect(lowBalanceSlots(item(), ctx({ lowBalanceAlerts: { enabled: false, defaultLeadDays: 3 } }))).toEqual([]);
  });

  it("a new day is a new slot (once a day, until covered)", () => {
    const a = lowBalanceSlots(item(), ctx())[0]!.slotId;
    const b = lowBalanceSlots(item(), ctx({}, "2026-11-21"))[0]!.slotId;
    expect(a).not.toBe(b);
  });
});

describe("itemsFromAccounts", () => {
  it("keeps short debits on trusted accounts only", () => {
    const accounts = [
      { accountId: "bank1", accountName: "HDFC", trusted: true, items: [debit(), debit({ refId: "gym", shortBy: 0 })] },
      { accountId: "bank2", accountName: "SBI", trusted: false, items: [debit({ refId: "x", shortBy: null })] },
    ];
    expect(itemsFromAccounts("u1", accounts).map((i) => i.key)).toEqual(["subscription:emi1::2026-11-22"]);
    expect(itemsFromAccounts("u1", "junk")).toEqual([]);
  });
});

// ─── The engine end to end, on an in-memory Firestore ──────────────────────

type Seed = Record<string, Record<string, unknown>>;

function seed(over: Seed = {}): Seed {
  return {
    "users/u1": { timezone: "Asia/Kolkata", currency: "INR" },
    "users/u1/accountTypes/t-bank": { name: "Bank Account" },
    "users/u1/accountTypes/t-cc": { name: "Credit Card" },
    "users/u1/accounts/bank1": { name: "HDFC Savings", typeId: "t-bank", currentBalance: 10000, balanceReconciliationStatus: "healthy" },
    "users/u1/subscriptions/emi1": {
      name: "Home loan EMI",
      amount: 12000,
      category: "EMI",
      type: "emi",
      dayOfMonth: 22,
      isActive: true,
      lastProcessed: "2026-10",
      accountId: "bank1",
    },
    ...over,
  };
}

/** Stores what autodebit-daily would, from the seed as it is now. */
async function storeResult(f: ReturnType<typeof fakeAdminDb>) {
  const inputs = await loadAutoDebitInputs(f.db as unknown as AutoDebitInputsDb, "u1");
  const result = computeForInputs(inputs, TODAY);
  f.docs.set("users/u1/serverResults/autoDebitShortfall", autoDebitShortfallDocData(result, { runId: "r1", inputsSyncedAt: null, version: 1 }));
  return result;
}

async function tick(f: ReturnType<typeof fakeAdminDb>, over: Partial<UserSettings> = {}, now = NOW) {
  const note = vi.fn();
  const source = createLowBalanceSource(f.db, { now: () => now, readModel: { note } });
  const { ports, sent } = memoryPushPorts(["u1"]);
  const res = await runReminderTick([source as never], { loadSettings: async () => settings(over), push: ports }, now);
  return { res, sent, note };
}

describe("createLowBalanceSource with the engine", () => {
  it("sends today's alert and creates the inbox row once, noted for the read model", async () => {
    const f = fakeAdminDb(seed());
    await storeResult(f);
    const { res, sent, note } = await tick(f);
    expect(res.sent).toBe(1);
    expect(sent[0]).toMatchObject({ title: "Low balance before an auto-debit", channelId: "low-balance" });
    const rowPath = `users/u1/notifications/${lowBalanceRowId("subscription:emi1::2026-11-22")}`;
    expect(f.docs.get(rowPath)).toMatchObject({ type: "low_balance", category: "lowBalance", url: "/recurring/emi1", read: false });
    expect(note).toHaveBeenCalledWith("u1", [rowPath]);
  });

  it("stops when the account is topped up after the stored result (re-checked at send time)", async () => {
    const f = fakeAdminDb(seed());
    await storeResult(f);
    f.docs.set("users/u1/accounts/bank1", { ...f.docs.get("users/u1/accounts/bank1"), currentBalance: 50000 });
    const { res, sent } = await tick(f);
    expect(sent).toEqual([]);
    expect(res.skipped.resolved).toBe(1);
    expect([...f.docs.keys()].some((p) => p.includes("/notifications/"))).toBe(false);
  });

  it.each([
    ["the debit posted", { "users/u1/subscriptions/emi1": { ...seed()["users/u1/subscriptions/emi1"], lastProcessed: "2026-11" } }],
    ["the item was paused", { "users/u1/subscriptions/emi1": { ...seed()["users/u1/subscriptions/emi1"], isActive: false } }],
    ["the item was unlinked", { "users/u1/subscriptions/emi1": { ...seed()["users/u1/subscriptions/emi1"], accountId: "" } }],
    ["the balance needs reconciliation", { "users/u1/accounts/bank1": { ...seed()["users/u1/accounts/bank1"], balanceReconciliationStatus: "needs_reconciliation" } }],
  ])("stops when %s", async (_why, change) => {
    const f = fakeAdminDb(seed());
    await storeResult(f);
    for (const [path, data] of Object.entries(change)) f.docs.set(path, data);
    const { sent } = await tick(f);
    expect(sent).toEqual([]);
  });

  it("stops when the card bill is paid", async () => {
    const card = {
      "users/u1/accounts/card1": { name: "HDFC Card", typeId: "t-cc", autopayFromAccountId: "bank1", autopayAmountMode: "total" },
      "users/u1/creditCardBills/bill1": { accountId: "card1", statementDate: "2026-11-05", dueDate: "2026-11-21", statementAmount: 15000, minimumDueAmount: 1500, amountPaid: 0, remainingAmount: 15000, currency: "INR", status: "DUE_SOON" },
    };
    const f = fakeAdminDb(seed({ ...card, "users/u1/subscriptions/emi1": { ...seed()["users/u1/subscriptions/emi1"], isActive: false } }));
    await storeResult(f);
    f.docs.set("users/u1/creditCardBills/bill1", { ...card["users/u1/creditCardBills/bill1"], amountPaid: 15000, remainingAmount: 0, status: "PAID" });
    expect((await tick(f)).sent).toEqual([]);
  });

  it("sends nothing when the user switched the alerts off", async () => {
    const f = fakeAdminDb(seed());
    await storeResult(f);
    const { sent } = await tick(f, { lowBalanceAlerts: { enabled: false, defaultLeadDays: 3 } });
    expect(sent).toEqual([]);
  });

  it("once a day: a second run sends nothing; the next day sends again, without a second inbox row", async () => {
    const f = fakeAdminDb(seed());
    await storeResult(f);
    const source = createLowBalanceSource(f.db, { now: () => NOW });
    const { ports, sent } = memoryPushPorts(["u1"]);
    const run = (now: Date) => runReminderTick([source as never], { loadSettings: async () => settings(), push: ports }, now);
    await run(NOW);
    await run(new Date("2026-11-20T06:00:00Z"));
    expect(sent).toHaveLength(1);
    const tomorrow = new Date("2026-11-21T04:00:00Z");
    const next = createLowBalanceSource(f.db, { now: () => tomorrow });
    await runReminderTick([next as never], { loadSettings: async () => settings(), push: ports }, tomorrow);
    expect(sent).toHaveLength(2);
    expect([...f.docs.keys()].filter((p) => p.includes("/notifications/"))).toHaveLength(1);
  });

  it("three short debits for one user: one summary, and their inputs are read once", async () => {
    const sub = (id: string, day: number) => ({ ...seed()["users/u1/subscriptions/emi1"], name: id, dayOfMonth: day });
    const f = fakeAdminDb(seed({ "users/u1/subscriptions/a": sub("a", 21), "users/u1/subscriptions/b": sub("b", 22), "users/u1/subscriptions/c": sub("c", 23) }));
    await storeResult(f);
    const reads = vi.fn();
    const counted: AdminFirestoreLike = {
      ...f.db,
      collection: (path) => {
        if (path === "users/u1/subscriptions") reads();
        return f.db.collection(path);
      },
    };
    const source = createLowBalanceSource(counted, { now: () => NOW });
    const { ports, sent } = memoryPushPorts(["u1"]);
    const res = await runReminderTick([source as never], { loadSettings: async () => settings(), push: ports }, NOW);
    expect(res.summaries).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ title: "4 auto-debits may fall short" });
    expect(reads).toHaveBeenCalledTimes(1);
  });
});
