import { describe, expect, it } from "vitest";

import type { Account, Expense } from "../types/expense";
import { AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY } from "../types/creditCardBill";
import { LEDGER_STAGED_LIMIT } from "./ledgerSnapshot";
import {
  AUTO_CREDIT_CARD_BILL_BACKFILL_CYCLES,
  AUTO_CREDIT_CARD_BILL_NOTE,
  autoCreditCardBillDocId,
  buildAutoCreditCardBillDraft,
  canRunAutoCreditCardBillGeneration,
  collectAutoCreditCardBillDrafts,
  collectAutoCreditCardBillRefreshPatches,
  findDuplicateCreditCardBills,
  previewClosedCycleCreditCardBill,
  previewSettledAutoBillRecalculation,
} from "./autoCreditCardBills";

const creditCard: Account = {
  id: "cc-slice",
  name: "Slice credit card",
  typeId: "t-credit",
  billGenerationDay: 15,
};

function expense(date: string, amount: number): Expense {
  return {
    amount,
    category: "Food",
    note: "test",
    date,
    month: date.slice(0, 7),
    accountId: creditCard.id,
    createdAt: date,
  };
}

const baseInput = {
  account: creditCard,
  typeName: "Credit Card",
  expenses: [] as Expense[],
  existingBills: [] as { accountId: string; statementDate: string }[],
  today: "2026-08-15",
};

describe("buildAutoCreditCardBillDraft", () => {
  it("creates a statement on generation day with due date 5 days later", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [
        expense("2026-07-20", 1000),
        expense("2026-08-01", 400),
        expense("2026-08-15", 50),
      ],
    });

    expect(draft).toMatchObject({
      accountId: "cc-slice",
      statementAmount: 1450,
      minimumDueAmount: 72.5,
      statementDate: "2026-08-15",
      dueDate: "2026-08-20",
      billingPeriodStart: "2026-07-16",
      billingPeriodEnd: "2026-08-15",
      reminderFrequency: AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
    });
    expect(draft?.note).toContain("Auto-created");
  });

  it("ignores a soft-deleted cycle expense in the statement amount", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [
        expense("2026-08-01", 400),
        {
          ...expense("2026-08-01", 9999),
          deletedAt: "2026-09-17T00:00:00.000Z",
        },
      ],
    });
    expect(draft?.statementAmount).toBe(400);
  });

  it("uses the previous month statement when today is after generation day", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      today: "2026-08-20",
      expenses: [expense("2026-07-20", 2500)],
    });

    expect(draft?.statementDate).toBe("2026-08-15");
    expect(draft?.dueDate).toBe("2026-08-20");
    expect(draft?.statementAmount).toBe(2500);
  });

  it("bills gross spend — a payment in the window never shrinks the statement", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [expense("2026-07-20", 2000)],
    });

    expect(draft?.statementAmount).toBe(2000);
    expect(draft?.minimumDueAmount).toBe(100);
  });

  it("returns null when a bill already exists for the statement date", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [expense("2026-07-20", 1000)],
      existingBills: [{ accountId: "cc-slice", statementDate: "2026-08-15" }],
    });

    expect(draft).toBeNull();
  });

  it("returns null when billGenerationDay is missing", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: undefined },
      expenses: [expense("2026-07-20", 1000)],
    });

    expect(draft).toBeNull();
  });

  it("returns null when closed-cycle spend is zero", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      expenses: [expense("2026-08-16", 900)],
    });

    expect(draft).toBeNull();
  });

  it("returns null for non-credit accounts", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      typeName: "Bank",
      expenses: [expense("2026-07-20", 1000)],
    });

    expect(draft).toBeNull();
  });

  it("wraps due date into the next month", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: 28 },
      today: "2026-08-28",
      expenses: [expense("2026-08-01", 800)],
    });

    expect(draft?.statementDate).toBe("2026-08-28");
    expect(draft?.dueDate).toBe("2026-09-02");
    expect(draft?.statementAmount).toBe(800);
  });

  it("clamps a 31st card to February 28 and April 30", () => {
    const monthEndCard = { ...creditCard, billGenerationDay: 31 };

    const feb = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: monthEndCard,
      today: "2026-02-28",
      expenses: [
        expense("2026-01-31", 10),
        expense("2026-02-01", 400),
        expense("2026-02-28", 50),
        expense("2026-03-01", 9),
      ],
    });
    expect(feb).toMatchObject({
      statementDate: "2026-02-28",
      billingPeriodStart: "2026-02-01",
      billingPeriodEnd: "2026-02-28",
      statementAmount: 450,
      dueDate: "2026-03-05",
    });

    const apr = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: monthEndCard,
      today: "2026-04-30",
      expenses: [
        expense("2026-03-31", 10),
        expense("2026-04-01", 200),
        expense("2026-04-30", 25),
        expense("2026-05-01", 9),
      ],
    });
    expect(apr).toMatchObject({
      statementDate: "2026-04-30",
      billingPeriodStart: "2026-04-01",
      billingPeriodEnd: "2026-04-30",
      statementAmount: 225,
    });
  });

  it("keeps a 30th card off January 31 spend", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: 30 },
      today: "2026-01-31",
      expenses: [
        expense("2026-01-30", 100),
        expense("2026-01-31", 999),
      ],
    });
    expect(draft).toMatchObject({
      statementDate: "2026-01-30",
      billingPeriodStart: "2025-12-31",
      billingPeriodEnd: "2026-01-30",
      statementAmount: 100,
    });
  });

  it("closes on the generation day and starts the day after the previous one", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: 21 },
      today: "2026-08-21",
      expenses: [
        expense("2026-07-20", 90),
        // Belongs to the previous statement, which closed on 21 Jul.
        expense("2026-07-21", 1100),
        expense("2026-08-01", 400),
        expense("2026-08-20", 50),
        expense("2026-08-21", 25),
        expense("2026-08-22", 999),
      ],
    });

    expect(draft).toMatchObject({
      statementDate: "2026-08-21",
      dueDate: "2026-08-26",
      billingPeriodStart: "2026-07-22",
      billingPeriodEnd: "2026-08-21",
      statementAmount: 475,
    });
  });

  it("accepts a string billGenerationDay from Firestore", () => {
    const draft = buildAutoCreditCardBillDraft({
      ...baseInput,
      account: { ...creditCard, billGenerationDay: "21" as unknown as number },
      today: "2026-08-21",
      expenses: [expense("2026-08-01", 300)],
    });
    expect(draft?.statementAmount).toBe(300);
    expect(draft?.billingPeriodStart).toBe("2026-07-22");
  });

  it("previews a 21st-cycle window even when statement amount is 0", () => {
    const preview = previewClosedCycleCreditCardBill({
      account: { ...creditCard, billGenerationDay: 21 },
      typeName: "Credit Card",
      today: "2026-08-21",
      expenses: [expense("2026-07-20", 90), expense("2026-08-22", 999)],
    });

    expect(preview).toMatchObject({
      statementDate: "2026-08-21",
      billingPeriodStart: "2026-07-22",
      billingPeriodEnd: "2026-08-21",
      statementAmount: 0,
    });
    expect(
      buildAutoCreditCardBillDraft({
        ...baseInput,
        account: { ...creditCard, billGenerationDay: 21 },
        today: "2026-08-21",
        expenses: [expense("2026-07-20", 90), expense("2026-08-22", 999)],
      })
    ).toBeNull();
  });
});

describe("collectAutoCreditCardBillRefreshPatches", () => {
  const refreshInput = {
    accounts: [{ ...creditCard, billGenerationDay: 21 }],
    typeNameById: new Map([["t-credit", "Credit Card"]]),
    expenses: [expense("2026-07-21", 1000), expense("2026-08-21", 200)],
    today: "2026-08-21",
  };

  it("recomputes an auto bill whose window was wrong", () => {
    const patches = collectAutoCreditCardBillRefreshPatches({
      ...refreshInput,
      existingBills: [
        {
          id: "bill-1",
          accountId: creditCard.id,
          statementDate: "2026-08-21",
          statementAmount: 1000,
          billingPeriodStart: "2026-08-01",
          billingPeriodEnd: "2026-08-20",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
          amountPaid: 0,
          status: "UPCOMING",
        },
      ],
    });

    expect(patches).toEqual([
      {
        billId: "bill-1",
        statementAmount: 200,
        minimumDueAmount: 10,
        statementDate: "2026-08-21",
        billingPeriodStart: "2026-07-22",
        billingPeriodEnd: "2026-08-21",
        dueDate: "2026-08-26",
      },
    ]);
  });

  it("re-dates an auto bill in place after the bill day moved a few days", () => {
    const patches = collectAutoCreditCardBillRefreshPatches({
      ...refreshInput,
      existingBills: [
        {
          id: "bill-drifted",
          accountId: creditCard.id,
          statementDate: "2026-08-20",
          statementAmount: 17764,
          billingPeriodStart: "2026-07-20",
          billingPeriodEnd: "2026-08-20",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
          amountPaid: 0,
          status: "UPCOMING",
        },
      ],
    });

    expect(patches).toEqual([
      {
        billId: "bill-drifted",
        statementAmount: 200,
        minimumDueAmount: 10,
        statementDate: "2026-08-21",
        billingPeriodStart: "2026-07-22",
        billingPeriodEnd: "2026-08-21",
        dueDate: "2026-08-26",
      },
    ]);
  });

  it("still corrects a partially paid auto bill", () => {
    const patches = collectAutoCreditCardBillRefreshPatches({
      ...refreshInput,
      existingBills: [
        {
          id: "bill-partial",
          accountId: creditCard.id,
          statementDate: "2026-08-21",
          statementAmount: 100,
          billingPeriodStart: "2026-07-22",
          billingPeriodEnd: "2026-08-21",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
          amountPaid: 50,
          status: "PARTIALLY_PAID",
        },
      ],
    });

    expect(patches[0]?.statementAmount).toBe(200);
  });

  it("leaves manually created statements alone", () => {
    const patches = collectAutoCreditCardBillRefreshPatches({
      ...refreshInput,
      existingBills: [
        {
          id: "bill-manual",
          accountId: creditCard.id,
          statementDate: "2026-08-21",
          statementAmount: 1000,
          billingPeriodStart: "2026-08-01",
          billingPeriodEnd: "2026-08-20",
          note: "July statement",
          amountPaid: 0,
          status: "UPCOMING",
        },
      ],
    });

    expect(patches).toEqual([]);
  });

  it("does not rewrite a PAID auto statement when spend changes", () => {
    const patches = collectAutoCreditCardBillRefreshPatches({
      ...refreshInput,
      expenses: [expense("2026-07-21", 1)],
      existingBills: [
        {
          id: "bill-paid",
          accountId: creditCard.id,
          statementDate: "2026-08-21",
          statementAmount: 1200,
          billingPeriodStart: "2026-07-22",
          billingPeriodEnd: "2026-08-21",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
          amountPaid: 1200,
          status: "PAID",
        },
      ],
    });
    expect(patches).toEqual([]);
  });
});

/**
 * Statements only generate while the app is open, so a user who skips a couple
 * of months would otherwise never get documents (or reminders) for the cycles
 * they missed. The ledger already derives and bills those windows either way —
 * backfill just gives them documents.
 */
describe("collectAutoCreditCardBillDrafts — backfill", () => {
  const typeNameById = new Map([["t-credit", "Credit Card"]]);

  it("drafts every closed cycle with spend, oldest first", () => {
    const drafts = collectAutoCreditCardBillDrafts({
      accounts: [creditCard],
      typeNameById,
      expenses: [
        expense("2026-06-01", 1000),
        expense("2026-07-01", 2000),
        expense("2026-08-01", 3000),
      ],
      existingBills: [],
      today: "2026-08-20",
    });

    expect(drafts.map((d) => [d.statementDate, d.statementAmount])).toEqual([
      ["2026-06-15", 1000],
      ["2026-07-15", 2000],
      ["2026-08-15", 3000],
    ]);
  });

  it("skips cycles with no spend instead of creating empty statements", () => {
    const drafts = collectAutoCreditCardBillDrafts({
      accounts: [creditCard],
      typeNameById,
      expenses: [expense("2026-06-01", 1000), expense("2026-08-01", 3000)],
      existingBills: [],
      today: "2026-08-20",
    });

    expect(drafts.map((d) => d.statementDate)).toEqual([
      "2026-06-15",
      "2026-08-15",
    ]);
  });

  it("does not redraft a cycle that already has a statement", () => {
    const drafts = collectAutoCreditCardBillDrafts({
      accounts: [creditCard],
      typeNameById,
      expenses: [expense("2026-07-01", 2000), expense("2026-08-01", 3000)],
      existingBills: [
        { accountId: creditCard.id, statementDate: "2026-07-15" },
      ],
      today: "2026-08-20",
    });

    expect(drafts.map((d) => d.statementDate)).toEqual(["2026-08-15"]);
  });

  it("never drafts a cycle that has not closed yet", () => {
    const drafts = collectAutoCreditCardBillDrafts({
      accounts: [creditCard],
      typeNameById,
      expenses: [expense("2026-08-16", 500)],
      existingBills: [],
      today: "2026-08-20",
    });

    expect(drafts).toEqual([]);
  });

  it("stays bounded by the requested cycle depth", () => {
    const drafts = collectAutoCreditCardBillDrafts({
      accounts: [creditCard],
      typeNameById,
      expenses: [
        expense("2026-06-01", 1000),
        expense("2026-07-01", 2000),
        expense("2026-08-01", 3000),
      ],
      existingBills: [],
      today: "2026-08-20",
      cycles: 2,
    });

    expect(drafts.map((d) => d.statementDate)).toEqual([
      "2026-07-15",
      "2026-08-15",
    ]);
  });

  it("skips a card with no generation day", () => {
    const drafts = collectAutoCreditCardBillDrafts({
      accounts: [{ ...creditCard, billGenerationDay: undefined }],
      typeNameById,
      expenses: [expense("2026-07-01", 2000)],
      existingBills: [],
      today: "2026-08-20",
    });

    expect(drafts).toEqual([]);
  });

  it("repairs a backfilled older statement when spend is backdated into it", () => {
    const patches = collectAutoCreditCardBillRefreshPatches({
      accounts: [creditCard],
      typeNameById,
      expenses: [expense("2026-06-01", 1000), expense("2026-06-02", 750)],
      existingBills: [
        {
          id: "bill-june",
          accountId: creditCard.id,
          statementDate: "2026-06-15",
          statementAmount: 1000,
          billingPeriodStart: "2026-05-16",
          billingPeriodEnd: "2026-06-15",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
          amountPaid: 0,
          status: "OVERDUE",
        },
      ],
      today: "2026-08-20",
    });

    expect(patches).toEqual([
      {
        billId: "bill-june",
        statementAmount: 1750,
        minimumDueAmount: 87.5,
        statementDate: "2026-06-15",
        billingPeriodStart: "2026-05-16",
        billingPeriodEnd: "2026-06-15",
        dueDate: "2026-06-20",
      },
    ]);
  });

  it("does not let two cycles fight over the same statement document", () => {
    const patches = collectAutoCreditCardBillRefreshPatches({
      accounts: [creditCard],
      typeNameById,
      expenses: [expense("2026-07-01", 2000), expense("2026-08-01", 3000)],
      existingBills: [
        {
          id: "bill-only",
          accountId: creditCard.id,
          statementDate: "2026-07-15",
          statementAmount: 1,
          billingPeriodStart: "2026-06-16",
          billingPeriodEnd: "2026-07-15",
          note: AUTO_CREDIT_CARD_BILL_NOTE,
          amountPaid: 0,
          status: "OVERDUE",
        },
      ],
      today: "2026-08-20",
    });

    expect(patches).toHaveLength(1);
    expect(patches[0]).toMatchObject({
      billId: "bill-only",
      statementDate: "2026-07-15",
      statementAmount: 2000,
    });
  });
});

describe("autoCreditCardBillDocId", () => {
  it("is accountId_statementDate so two devices share one document", () => {
    expect(autoCreditCardBillDocId("cc-slice", "2026-08-15")).toBe(
      "cc-slice_2026-08-15"
    );
  });
});

describe("findDuplicateCreditCardBills", () => {
  it("flags more than one doc for the same account and statement date", () => {
    expect(
      findDuplicateCreditCardBills([
        { id: "random-a", accountId: "cc-slice", statementDate: "2026-08-15" },
        { id: "random-b", accountId: "cc-slice", statementDate: "2026-08-15" },
        { id: "other", accountId: "cc-slice", statementDate: "2026-07-15" },
      ])
    ).toEqual([
      {
        accountId: "cc-slice",
        statementDate: "2026-08-15",
        ids: ["random-a", "random-b"],
      },
    ]);
  });

  it("returns nothing when each cycle has a single document", () => {
    expect(
      findDuplicateCreditCardBills([
        { id: "a", accountId: "cc-slice", statementDate: "2026-08-15" },
        { id: "b", accountId: "cc-hdfc", statementDate: "2026-08-15" },
      ])
    ).toEqual([]);
  });
});

describe("canRunAutoCreditCardBillGeneration (SPENDLY-97)", () => {
  const ready = {
    billsLoading: false,
    expensesLoading: false,
    paymentsLoading: false,
    expensesComplete: true,
  };

  it("allows generation once the ledger is complete", () => {
    expect(canRunAutoCreditCardBillGeneration(ready)).toBe(true);
  });

  it("blocks the staged-page race: every loading flag false, ledger truncated", () => {
    // This is the exact production shape. `expensesLoading` flips false on the
    // staged snapshot, so the old guard let generation run against 300 rows.
    expect(
      canRunAutoCreditCardBillGeneration({ ...ready, expensesComplete: false })
    ).toBe(false);
  });

  it("still blocks while any collection is loading", () => {
    expect(
      canRunAutoCreditCardBillGeneration({ ...ready, billsLoading: true })
    ).toBe(false);
    expect(
      canRunAutoCreditCardBillGeneration({ ...ready, expensesLoading: true })
    ).toBe(false);
    expect(
      canRunAutoCreditCardBillGeneration({ ...ready, paymentsLoading: true })
    ).toBe(false);
  });
});

describe("collectAutoCreditCardBillDrafts — staged-page race (SPENDLY-97)", () => {
  // 14 closed cycles, 28 expenses of 100 each, all dated safely inside the
  // cycle that ends on the 15th of that month. `createdAt` equals `date`, so
  // the staged query's `orderBy("createdAt","desc") limit(300)` keeps the ten
  // newest cycles whole, 20 of the 28 rows in the eleventh, and none below it.
  const CYCLE_MONTHS = [
    "2026-08", "2026-07", "2026-06", "2026-05", "2026-04", "2026-03",
    "2026-02", "2026-01", "2025-12", "2025-11", "2025-10", "2025-09",
    "2025-08", "2025-07",
  ];
  const PER_CYCLE = 28;
  const AMOUNT = 100;
  const FULL_CYCLE_TOTAL = PER_CYCLE * AMOUNT;

  const fullHistory: Expense[] = CYCLE_MONTHS.flatMap((month) =>
    Array.from({ length: PER_CYCLE }, () => expense(`${month}-10`, AMOUNT))
  );

  /** What the first-paint listener actually holds. */
  const stagedPage = [...fullHistory]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, LEDGER_STAGED_LIMIT);

  const collect = (expenses: Expense[]) =>
    collectAutoCreditCardBillDrafts({
      accounts: [creditCard],
      typeNameById: new Map([[creditCard.typeId, "Credit Card"]]),
      expenses,
      existingBills: [],
      today: "2026-08-15",
    });

  const amountFor = (
    drafts: ReturnType<typeof collect>,
    statementDate: string
  ) => drafts.find((draft) => draft.statementDate === statementDate)?.statementAmount;

  it("the fixture really is bigger than one staged page", () => {
    expect(fullHistory.length).toBeGreaterThan(LEDGER_STAGED_LIMIT);
    expect(stagedPage.length).toBe(LEDGER_STAGED_LIMIT);
  });

  it("bills every backfilled cycle at its full-history amount", () => {
    const drafts = collect(fullHistory);
    expect(drafts).toHaveLength(AUTO_CREDIT_CARD_BILL_BACKFILL_CYCLES);
    for (const draft of drafts) {
      expect(draft.statementAmount).toBe(FULL_CYCLE_TOTAL);
    }
  });

  it("understates a partially truncated cycle — the bug being gated out", () => {
    const staged = collect(stagedPage);
    const full = collect(fullHistory);
    expect(amountFor(staged, "2025-10-15")).toBe(20 * AMOUNT);
    expect(amountFor(full, "2025-10-15")).toBe(FULL_CYCLE_TOTAL);
    expect(amountFor(staged, "2025-10-15")).not.toBe(
      amountFor(full, "2025-10-15")
    );
  });

  it("drops a cycle whose spend fell off the page entirely, and keeps it on full history", () => {
    expect(amountFor(collect(stagedPage), "2025-09-15")).toBeUndefined();
    expect(amountFor(collect(fullHistory), "2025-09-15")).toBe(FULL_CYCLE_TOTAL);
  });

  it("writes fewer statements from a staged page than from full history", () => {
    expect(collect(stagedPage).length).toBeLessThan(collect(fullHistory).length);
  });
});

describe("previewSettledAutoBillRecalculation (SPENDLY-99)", () => {
  // The cycle closing 2026-08-15 runs 2026-07-16 → 2026-08-15.
  const CYCLE_EXPENSES = [
    expense("2026-07-20", 1000),
    expense("2026-08-01", 500),
  ];

  const settledBill = {
    id: "cc-slice_2026-08-15",
    accountId: creditCard.id,
    statementDate: "2026-08-15",
    statementAmount: 1000, // understated — 500 was never counted
    note: AUTO_CREDIT_CARD_BILL_NOTE,
    status: "PAID" as const,
  };

  const preview = (bill: typeof settledBill, expenses = CYCLE_EXPENSES) =>
    previewSettledAutoBillRecalculation({
      bill,
      account: creditCard,
      typeName: "Credit Card",
      expenses,
      today: "2026-08-15",
    });

  it("reports the corrected amount and the delta for a settled auto bill", () => {
    const result = preview(settledBill);
    expect(result).not.toBeNull();
    expect(result!.storedAmount).toBe(1000);
    expect(result!.recomputedAmount).toBe(1500);
    expect(result!.delta).toBe(500);
    expect(result!.billingPeriodStart).toBe("2026-07-16");
    expect(result!.billingPeriodEnd).toBe("2026-08-15");
  });

  it("returns null when the stored amount is already correct", () => {
    expect(preview({ ...settledBill, statementAmount: 1500 })).toBeNull();
  });

  it("returns null for a manual statement", () => {
    expect(preview({ ...settledBill, note: "Typed by hand" })).toBeNull();
  });

  it("returns null for an open bill — the automatic pass already repairs those", () => {
    expect(preview({ ...settledBill, status: "OVERDUE" as never })).toBeNull();
  });

  it("covers a CANCELLED statement, which the automatic pass also skips", () => {
    const result = preview({ ...settledBill, status: "CANCELLED" as never });
    expect(result?.recomputedAmount).toBe(1500);
  });

  it("reports a negative delta when the cycle shrank", () => {
    const result = preview({ ...settledBill, statementAmount: 2000 });
    expect(result!.delta).toBe(-500);
  });

  it("matches a statement whose close date drifted within tolerance", () => {
    const result = preview({ ...settledBill, statementDate: "2026-08-13" });
    expect(result?.recomputedAmount).toBe(1500);
  });

  it("does not match a statement from an unrelated close date", () => {
    expect(preview({ ...settledBill, statementDate: "2026-08-02" })).toBeNull();
  });

  it("ignores a bill belonging to another card", () => {
    expect(preview({ ...settledBill, accountId: "other-card" })).toBeNull();
  });

  it("never mutates its inputs", () => {
    const expenses = [...CYCLE_EXPENSES];
    const bill = { ...settledBill };
    preview(bill, expenses);
    expect(bill).toEqual(settledBill);
    expect(expenses).toEqual(CYCLE_EXPENSES);
  });
});
