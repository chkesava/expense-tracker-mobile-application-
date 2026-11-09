import { describe, expect, it, vi } from "vitest";

import type { CreditCardBill } from "../shared/types/creditCardBill";
import type { Account, AccountPayment, Expense } from "../shared/types/expense";
import { AUTO_CREDIT_CARD_BILL_NOTE } from "../shared/utils/autoCreditCardBills";
import { jobReadBudget, type JobDb } from "./lib/dailyJobCore";
import {
  cardClosedRecently,
  findBillWorkOnReadModel,
  runBillDaily,
  storedBillFromDoc,
  type BillDailyPorts,
  type ReadModelBillSource,
  type StoredBill,
} from "./lib/billDailyCore";
import { billSettingsFromDoc, readModelRowToDoc } from "./lib/billReadModelSource";

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

describe("SPENDLY-734: bill work found on the read model, settled from Firestore", () => {
  // 9 Nov: the Roar cycle closed on 1 Nov, so it is not a closing card any more.
  const LATER = new Date("2026-11-09T03:00:00.000Z");
  const cashOnly = {
    accountId: "roar", statementDate: "2026-11-01", billingPeriodStart: "2026-10-02", billingPeriodEnd: "2026-11-01",
    dueDate: "2026-11-06", statementAmount: 505, minimumDueAmount: 25, amountPaid: 268.71, paymentIds: ["hdfc"],
    status: "PARTIALLY_PAID", remainingAmount: 236.29, note: AUTO_CREDIT_CARD_BILL_NOTE,
  };
  const copyOf = (bill: Record<string, unknown>, payments: AccountPayment[] = PAID): ReadModelBillSource => ({
    users: async () => [
      { uid: "u1", accounts: [roar, bank], accountTypes: [{ id: "t-credit", name: "Credit Card" }, { id: "t-bank", name: "Bank" }] as never },
    ],
    settings: async () => ({ timezone: "Asia/Kolkata", currency: "INR", remindersEnabled: true }),
    cardInputs: async () => ({ expenses: SPEND, payments, bills: [{ bill: storedBillFromDoc("roar_2026-11-01", bill), updateTime: null }] }),
  });
  const runAt = (w: ReturnType<typeof world>, readModel: Awaited<ReturnType<typeof findBillWorkOnReadModel>> | null, dryRun = false) =>
    runBillDaily({ ports: w.ports(), now: LATER, dryRun, budget: jobReadBudget(1000), push: null, log: () => undefined, readModel });

  it("the reported Roar bill (cashback recorded after the close) is found on the copy and settled to PAID", async () => {
    const work = await findBillWorkOnReadModel(copyOf(cashOnly), LATER);
    expect([...(work.cards.get("u1") ?? [])]).toEqual(["roar"]);

    const w = world({ [BILL]: cashOnly });
    const s = await runAt(w, work);
    expect(s.counts.cardsFromReadModel).toBe(1);
    expect(s.counts.cardsClosing ?? 0).toBe(0);
    expect(w.get(BILL)).toMatchObject({ amountPaid: 505, status: "PAID", remainingAmount: 0 });
    // Only the named card is read from Firestore.
    expect(w.cardInputs).toHaveBeenCalledTimes(1);
    expect(w.cardInputs).toHaveBeenCalledWith("u1", "roar");
  });

  it("without the read model the job is unchanged: a card that closed days ago costs nothing", async () => {
    const w = world({ [BILL]: cashOnly });
    const s = await runAt(w, null);
    expect(w.cardInputs).not.toHaveBeenCalled();
    expect(w.get(BILL)).toMatchObject({ amountPaid: 268.71 });
    expect(s.counts.cardsFromReadModel ?? 0).toBe(0);
  });

  it("a settled copy names nothing: no Firestore card reads", async () => {
    const settled = { ...cashOnly, amountPaid: 505, paymentIds: ["cb", "hdfc"], status: "PAID", remainingAmount: 0 };
    const work = await findBillWorkOnReadModel(copyOf(settled), LATER);
    expect(work.cards.size).toBe(0);
    const w = world({ [BILL]: settled });
    await runAt(w, work);
    expect(w.cardInputs).not.toHaveBeenCalled();
  });

  it("writes Firestore's numbers, never the copy's: a lagging copy that names a settled card writes nothing", async () => {
    const work = await findBillWorkOnReadModel(copyOf(cashOnly), LATER);
    const settled = { ...cashOnly, amountPaid: 505, paymentIds: ["cb", "hdfc"], status: "PAID", remainingAmount: 0 };
    const w = world({ [BILL]: settled });
    const s = await runAt(w, work);
    expect(s.counts.readModelDisagreed).toBe(1);
    expect(s.writes.written).toBe(0);
    expect(w.get(BILL)).toMatchObject(settled);
  });

  it("Firestore changed after the job read it: compare-and-set refuses, nothing written", async () => {
    const work = await findBillWorkOnReadModel(copyOf(cashOnly), LATER);
    const w = world({ [BILL]: cashOnly });
    const s = await runBillDaily({
      ports: w.ports({
        cardInputs: async () => ({ expenses: SPEND, payments: PAID, bills: [{ bill: storedBillFromDoc("roar_2026-11-01", cashOnly), updateTime: 0 }] }),
      }),
      now: LATER, dryRun: false, budget: jobReadBudget(1000), push: null, log: () => undefined, readModel: work,
    });
    expect(s.counts.conflicts).toBe(1);
    expect(w.get(BILL)).toMatchObject({ amountPaid: 268.71 });
  });

  it("dry run plans the settle and writes nothing; summary counts the finder", async () => {
    const work = await findBillWorkOnReadModel(copyOf(cashOnly), LATER);
    const w = world({ [BILL]: cashOnly });
    const s = await runAt(w, work, true);
    expect(w.get(BILL)).toMatchObject({ amountPaid: 268.71 });
    expect(s.counts).toMatchObject({ readModelUsers: 1, readModelCards: 1, cardsFromReadModel: 1 });
  });

  it("the finder skips duress accounts and survives one failing user without naming it", async () => {
    let calls = 0;
    const source: ReadModelBillSource = {
      users: async () => [
        { uid: "u1__duress", accounts: [roar], accountTypes: [{ id: "t-credit", name: "Credit Card" }] as never },
        { uid: "u2", accounts: [roar], accountTypes: [{ id: "t-credit", name: "Credit Card" }] as never },
        { uid: "u3", accounts: [roar], accountTypes: [{ id: "t-credit", name: "Credit Card" }] as never },
      ],
      settings: async () => {
        calls += 1;
        if (calls === 1) throw new Error("read model: users/u2 unreachable");
        return { timezone: "Asia/Kolkata" };
      },
      cardInputs: copyOf(cashOnly).cardInputs,
    };
    const work = await findBillWorkOnReadModel(source, LATER);
    expect(work.failures).toBe(1);
    expect(work.usersSeen).toBe(2);
    expect([...work.cards.keys()]).toEqual(["u3"]);
  });

  it("read-model rows map back to the documents and settings they copy", () => {
    expect(readModelRowToDoc({ uid: "u", doc_id: "roar_2026-11-01", doc: { amountPaid: 1 } })).toEqual({ id: "roar_2026-11-01", data: { amountPaid: 1 } });
    expect(readModelRowToDoc({ uid: "u", doc_id: "list/item", doc: null })).toEqual({ id: "item", data: {} });
    expect(billSettingsFromDoc({ timezone: "Asia/Kolkata", currency: "INR", creditCardBillReminders: { enabled: false } })).toEqual({
      timezone: "Asia/Kolkata", currency: "INR", remindersEnabled: false,
    });
    expect(storedBillFromDoc("b", { amountPaid: "268.71" })).toMatchObject({ id: "b", amountPaid: 268.71, paymentIds: [] });
  });
});
