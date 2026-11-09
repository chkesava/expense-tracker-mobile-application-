import { describe, expect, it, vi } from "vitest";

import type { CreditCardBill } from "../shared/types/creditCardBill";
import type { Account, AccountPayment, Expense } from "../shared/types/expense";
import { AUTO_CREDIT_CARD_BILL_NOTE } from "../shared/utils/autoCreditCardBills";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import { cardClosedRecently, runBillDaily, type BillDailyPorts, type StoredBill } from "./lib/billDailyCore";

type Doc = { data: Record<string, unknown>; updateTime: number };

const roar: Account = { id: "roar", name: "Roar", typeId: "t-credit", billGenerationDay: 1, creditLimit: 35000 } as Account;
const bank: Account = { id: "bank", name: "HDFC", typeId: "t-bank" } as Account;
const expense = (date: string, amount: number): Expense =>
  ({ amount, category: "Shopping", note: "", date, month: date.slice(0, 7), accountId: "roar", createdAt: null }) as Expense;
const pay = (id: string, date: string, amount: number, cashback = false): AccountPayment =>
  ({ id, fromAccountId: "bank", toAccountId: "roar", amount, date, ...(cashback ? { sourceType: "cashback" } : {}) }) as AccountPayment;

// The reported shape: ₹505 spent 2 Oct → 1 Nov, ₹236.29 cashback in the cycle, ₹268.71 paid on 2 Nov.
const SPEND = [expense("2026-10-10", 300), expense("2026-10-25", 205)];
const PAID = [pay("cb", "2026-10-20", 236.29, true), pay("hdfc", "2026-11-02", 268.71)];
const RUN = new Date("2026-11-02T03:00:00.000Z"); // 08:30 IST on 2 Nov: the cycle closed yesterday

function world(seed: Record<string, Record<string, unknown>> = {}, inputs: { expenses?: Expense[]; payments?: AccountPayment[] } = {}) {
  const docs = new Map<string, Doc>(Object.entries(seed).map(([p, d]) => [p, { data: d, updateTime: 1 }]));
  let clock = 10;
  const db: JobDb = {
    doc: (path) => ({ path }),
    batch: () => {
      const checks: Array<() => void> = [];
      const ops: Array<() => void> = [];
      const err = (code: number) => Object.assign(new Error(`code ${code}`), { code });
      return {
        create: (ref, data) => {
          checks.push(() => { if (docs.has(ref.path)) throw err(6); });
          ops.push(() => docs.set(ref.path, { data, updateTime: ++clock }));
        },
        set: (ref, data, o) => ops.push(() => docs.set(ref.path, { data: o?.merge ? { ...docs.get(ref.path)?.data, ...data } : data, updateTime: ++clock })),
        update: (ref, data, pre) => {
          checks.push(() => {
            const cur = docs.get(ref.path);
            if (!cur) throw err(5);
            if (pre && cur.updateTime !== pre.lastUpdateTime) throw err(9);
          });
          ops.push(() => docs.set(ref.path, { data: { ...docs.get(ref.path)!.data, ...data }, updateTime: ++clock }));
        },
        commit: async () => { checks.forEach((c) => c()); ops.forEach((o) => o()); },
      };
    },
  };
  const cardInputs = vi.fn(async (uid: string, cardId: string) => ({
    expenses: inputs.expenses ?? SPEND,
    payments: inputs.payments ?? PAID,
    bills: [...docs.entries()]
      .filter(([p, d]) => p.startsWith(`users/${uid}/creditCardBills/`) && d.data.accountId === cardId)
      .map(([p, d]) => ({ bill: { ...(d.data as unknown as CreditCardBill), id: p.split("/")[3] }, updateTime: d.updateTime }) as StoredBill),
  }));
  const ports = (over: Partial<BillDailyPorts> = {}): BillDailyPorts => ({
    listAccounts: async () => [{ uid: "u1", account: roar }, { uid: "u1", account: bank }],
    accountTypes: async () => [{ id: "t-credit", name: "Credit Card" }, { id: "t-bank", name: "Bank" }] as never,
    settings: async () => ({ timezone: "Asia/Kolkata", currency: "INR", remindersEnabled: true }),
    cardInputs,
    db,
    stamp: () => "<ts>",
    ...over,
  });
  return { docs, ports, cardInputs, get: (p: string) => docs.get(p)?.data };
}

const run = (w: ReturnType<typeof world>, over: Partial<BillDailyPorts> = {}, dryRun = false) =>
  runBillDaily({ ports: w.ports(over), now: RUN, dryRun, budget: jobReadBudget(1000), push: null, log: () => undefined });

const BILL = "users/u1/creditCardBills/roar_2026-11-01";

describe("cardClosedRecently", () => {
  it("is the close date when the cycle ended today or yesterday", () => {
    expect(cardClosedRecently(roar, "2026-11-01")).toBe("2026-11-01");
    expect(cardClosedRecently(roar, "2026-11-02")).toBe("2026-11-01");
    expect(cardClosedRecently(roar, "2026-11-03")).toBeNull();
    expect(cardClosedRecently({ billGenerationDay: undefined } as Account, "2026-11-01")).toBeNull();
  });
});

describe("runBillDaily (SPENDLY-727)", () => {
  it("creates the statement at the app's id, settled by cash + cashback, so it is born PAID (no false reminder)", async () => {
    const w = world();
    const s = await run(w);
    expect(s.counts.billsCreated).toBeGreaterThanOrEqual(1);
    expect(w.get(BILL)).toMatchObject({
      accountId: "roar",
      statementDate: "2026-11-01",
      billingPeriodStart: "2026-10-02",
      statementAmount: 505,
      amountPaid: 505,
      remainingAmount: 0,
      status: "PAID",
      note: AUTO_CREDIT_CARD_BILL_NOTE,
      createdAt: "<ts>",
      updatedAt: "<ts>",
    });
    expect([...(w.get(BILL)!.paymentIds as string[])].sort()).toEqual(["cb", "hdfc"]);
    expect(w.get("users/u1/notifications/n_ccstmt_roar_2026-11-01")).toMatchObject({ type: "credit_card_statement", read: false });
  });

  it("a rerun finds nothing to change", async () => {
    const w = world();
    await run(w);
    const s = await run(w);
    expect(s.counts.cardsUpToDate).toBe(1);
    expect(s.writes.written).toBe(0);
  });

  it("the app made the statement first with cash only (the 719 shape): updated to PAID, only if unchanged since read", async () => {
    const w = world({
      [BILL]: {
        accountId: "roar", statementDate: "2026-11-01", billingPeriodStart: "2026-10-02", billingPeriodEnd: "2026-11-01",
        dueDate: "2026-11-06", statementAmount: 505, minimumDueAmount: 25, amountPaid: 268.71, paymentIds: ["hdfc"],
        status: "PARTIALLY_PAID", remainingAmount: 236.29, note: AUTO_CREDIT_CARD_BILL_NOTE,
      },
    });
    await run(w);
    expect(w.get(BILL)).toMatchObject({ amountPaid: 505, status: "PAID", remainingAmount: 0 });

    const stale = world({ [BILL]: { ...w.get(BILL), amountPaid: 268.71, paymentIds: ["hdfc"], status: "PARTIALLY_PAID", remainingAmount: 236.29 } });
    const s = await run(stale, {
      cardInputs: async () => ({
        expenses: SPEND,
        payments: PAID,
        bills: [{ bill: { ...(stale.get(BILL) as unknown as CreditCardBill), id: "roar_2026-11-01" }, updateTime: 0 }], // read before a later write
      }),
    });
    expect(s.counts.conflicts).toBe(1);
    expect(stale.get(BILL)).toMatchObject({ amountPaid: 268.71 });
  });

  it("cards that didn't close today or yesterday cost no reads", async () => {
    const w = world();
    const later = runBillDaily({ ports: w.ports(), now: new Date("2026-11-05T03:00:00.000Z"), dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined });
    expect((await later).counts.cardsClosing ?? 0).toBe(0);
    expect(w.cardInputs).not.toHaveBeenCalled();
  });

  it("a legacy random-id twin of the same cycle is CANCELLED (never deleted); the app's id is canonical", async () => {
    const w = world({
      "users/u1/creditCardBills/xRandom": {
        accountId: "roar", statementDate: "2026-11-01", billingPeriodStart: "2026-10-02", billingPeriodEnd: "2026-11-01",
        dueDate: "2026-11-06", statementAmount: 505, minimumDueAmount: 25, amountPaid: 0, paymentIds: [], status: "OVERDUE",
        remainingAmount: 505, note: AUTO_CREDIT_CARD_BILL_NOTE,
      },
    });
    await run(w);
    const statuses = [...w.docs.entries()].filter(([p]) => p.includes("creditCardBills/")).map(([p, d]) => [p.split("/")[3], d.data.status]);
    expect(statuses.filter(([, st]) => st !== "CANCELLED")).toHaveLength(1);
    expect(w.docs.has("users/u1/creditCardBills/xRandom")).toBe(true);
  });

  it("duress trees are skipped; dry run writes nothing", async () => {
    const d = world();
    const s = await run(d, { listAccounts: async () => [{ uid: "u1_duress", account: roar }] });
    expect(s.duressSkipped).toBe(1);
    expect(d.docs.size).toBe(0);

    const dry = world();
    const sd = await run(dry, {}, true);
    expect(sd.writes.dryRun).toBeGreaterThan(0);
    expect(dry.docs.size).toBe(0);
  });
});

describe("invalid stored timezone (CodeRabbit on #288)", () => {
  it("skips only that user's cards and keeps going for everyone else", async () => {
    const w = world();
    const s = await run(w, {
      listAccounts: async () => [
        { uid: "bad", account: roar },
        { uid: "u1", account: roar },
      ],
      settings: async (uid) => (uid === "bad" ? { timezone: "Mars/Olympus" } : { timezone: "Asia/Kolkata", currency: "INR", remindersEnabled: true }),
    });
    expect(s.counts.invalidTimeZone).toBe(1);
    expect(s.failures.some((f) => f.includes("invalid timezone"))).toBe(true);
    expect([...w.docs.keys()].some((k) => k.startsWith("users/bad/"))).toBe(false);
    expect(w.get(BILL)).toMatchObject({ status: "PAID" });
  });
});
