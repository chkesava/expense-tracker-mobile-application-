import { describe, expect, it } from "vitest";

import type { Account, AccountEntry, Expense, Income } from "../types/expense";
import type { FeeRecord, FeeReview } from "../types/fee";
import {
  FEE_ENGINE_VERSION,
  createFeeDetectionCache,
  detectFees,
  feeCandidateQueue,
  maskSensitiveDigits,
  normalizeFeeText,
} from "./feeDetection";
import { countsTowardFeeTotals, defaultFeeComponents, feeComponentTotals } from "./feeModel";

const BANK: Account = { id: "hdfc", name: "HDFC Savings", typeId: "t1", accountTypeId: "bank", institutionName: "HDFC Bank" };
const CARD: Account = { id: "card", name: "Regalia", typeId: "t2", accountTypeId: "credit_card", institutionName: "HDFC Bank" };
const LEGACY_CARD: Account = { id: "old", name: "Old card", typeId: "t3", creditLimit: 50000 };
const ACCOUNTS = [BANK, CARD, LEGACY_CARD];

let seq = 0;
function exp(
  note: string,
  amount: number,
  opts: Partial<Pick<Expense, "category" | "subcategory" | "accountId" | "date" | "id" | "deletedAt">> = {}
): Expense {
  seq += 1;
  const date = opts.date ?? "2026-09-10";
  return {
    id: opts.id ?? `e${seq}`,
    amount,
    note,
    category: opts.category ?? "Other",
    subcategory: opts.subcategory ?? "Other",
    date,
    month: date.slice(0, 7),
    accountId: opts.accountId ?? "hdfc",
    createdAt: 1,
    ...(opts.deletedAt ? { deletedAt: opts.deletedAt } : {}),
  };
}

function inc(note: string, amount: number, opts: Partial<Pick<Income, "source" | "accountId" | "date" | "id">> = {}): Income {
  seq += 1;
  const date = opts.date ?? "2026-09-20";
  return {
    id: opts.id ?? `i${seq}`,
    amount,
    note,
    source: opts.source ?? "Refund",
    date,
    month: date.slice(0, 7),
    accountId: opts.accountId ?? "hdfc",
    createdAt: 1,
  };
}

function run(expenses: Expense[], incomes: Income[] = [], extra: { reviews?: FeeReview[]; entries?: AccountEntry[] } = {}) {
  return detectFees({ expenses, incomes, accounts: ACCOUNTS, ...extra });
}

function only(expense: Expense): FeeRecord | undefined {
  return run([expense]).records[0];
}

describe("text helpers", () => {
  it("normalises bank narration punctuation", () => {
    expect(normalizeFeeText("NON-MAINT.CHGS/JUL'26")).toBe("non maint chgs jul 26");
    expect(normalizeFeeText("A/c  XX1234")).toBe("a c xx1234");
  });

  it("masks long digit runs to the last four", () => {
    expect(maskSensitiveDigits("A/c 50100012345678 Ref 998877")).toBe("A/c ••5678 Ref ••8877");
    expect(maskSensitiveDigits("Rs 1234 on 12/09")).toBe("Rs 1234 on 12/09");
  });
});

describe("high-confidence Indian fee narrations", () => {
  const cases: Array<[string, Account, string, string | undefined]> = [
    ["ATM WDL CHGS 3 TXN EXCEEDED", BANK, "atm_cash", "excess_withdrawal"],
    ["NFS ATM CHG OTHER BANK", BANK, "atm_cash", "other_bank_atm"],
    ["NON MAINT CHGS JUL26", BANK, "min_balance", "average_balance_shortfall"],
    ["AMB CHARGES SHORTFALL", BANK, "min_balance", "average_balance_shortfall"],
    ["SMS ALERT CHGS QTR", BANK, "bank_service", "sms_alerts"],
    ["DEBIT CARD ANNUAL FEE", BANK, "debit_card", "annual_fee"],
    ["ANNUAL FEE", BANK, "debit_card", "annual_fee"],
    ["ANNUAL FEE", CARD, "credit_card", "annual_fee"],
    ["JOINING FEE", CARD, "credit_card", "joining_fee"],
    ["FUEL SURCHARGE", CARD, "credit_card", "fuel_surcharge"],
    ["LATE PAYMENT FEE", CARD, "late_payment", "credit_card"],
    ["CASH ADVANCE FEE", CARD, "cash_advance", "credit_card_cash"],
    ["ATM CASH WDL FEE", CARD, "cash_advance", "credit_card_cash"],
    ["ATM CASH WDL FEE", LEGACY_CARD, "cash_advance", "credit_card_cash"],
    ["EMI PROCESSING FEE", CARD, "emi_conversion", "processing_fee"],
    ["FOREX MARKUP FEE", CARD, "forex", "markup"],
    ["CROSS BORDER TXN FEE", CARD, "forex", "cross_border"],
    ["CHQ RTN CHGS", BANK, "cheque", "bounce"],
    ["STOP PAYMENT CHARGES", BANK, "cheque", "stop_payment"],
    ["NEFT CHGS", BANK, "transfer_remittance", "domestic_transfer"],
    ["DP CHARGES CDSL", BANK, "investment", "depository"],
    ["ECS RETURN CHARGES", BANK, "loan", "bounce"],
    ["PENAL CHARGES LOAN", BANK, "loan", "penal_charge"],
    ["LOCKER RENT 2026", BANK, "bank_service", "locker"],
  ];

  it.each(cases)("%s on %s", (note, account, feeType, subtype) => {
    const record = only(exp(note, 250, { accountId: account.id }));
    expect(record?.role).toBe("fee");
    expect(record?.status).toBe("inferred");
    expect(record?.feeType).toBe(feeType);
    expect(record?.subtype).toBe(subtype);
    expect(record?.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it("detects the same narration the same way every run", () => {
    const rows = [exp("NON MAINT CHGS", 590), exp("ATM WDL CHG", 23.6)];
    expect(run(rows).records).toEqual(run(rows).records);
  });

  it("trusts a fee category the user chose, even without a keyword", () => {
    const record = only(exp("Charges", 118, { category: "Finance, Loans & Insurance", subcategory: "ATM Fees" }));
    expect(record).toMatchObject({ role: "fee", feeType: "atm_cash", status: "inferred" });
    expect(record?.evidence[0]).toMatchObject({ signal: "category", ruleId: "cat.atm_fees" });
  });

  it("understands the v3 'Bank Charges / Tax' label", () => {
    expect(only(exp("debit", 50, { category: "Bank Charges / Tax", subcategory: "Bank Charges / Tax" }))?.feeType).toBe("bank_service");
  });

  it("strengthens a keyword with an agreeing category", () => {
    const record = only(exp("ATM WDL CHG", 20, { category: "Finance, Loans & Insurance", subcategory: "ATM Fees" }));
    expect(record?.confidence).toBeGreaterThan(only(exp("ATM WDL CHG", 20))!.confidence);
  });
});

describe("things that are not fees", () => {
  it.each([
    ["an ATM withdrawal", exp("ATM WDR at SBI ATM MG ROAD", 5000)],
    ["a cash withdrawal", exp("ATM CASH WITHDRAWAL", 2000)],
    ["school fees", exp("Term annual fee", 45000, { category: "Education", subcategory: "School Fees" })],
    ["a doctor's fee", exp("Consultation fee Dr Rao", 800, { category: "Health & Medical", subcategory: "Doctor Consultation" })],
    ["a card bill payment", exp("Payment to HDFC card", 12000, { category: "Finance, Loans & Insurance", subcategory: "Credit Card Payment" })],
    ["an EMI", exp("Home loan EMI", 32000, { category: "Finance, Loans & Insurance", subcategory: "Home Loan EMI" })],
    ["a purchase", exp("Amazon order", 1499, { category: "Shopping", subcategory: "Online Shopping" })],
    ["GST on a purchase", exp("Invoice incl CGST SGST", 1180, { category: "Shopping" })],
    ["a bare 'charges' note", exp("charges", 100)],
    ["a huge amount", exp("ANNUAL FEE", 250000, { accountId: "card" })],
  ])("ignores %s", (_label, expense) => {
    expect(run([expense]).records).toEqual([]);
  });

  it("ignores merchant refunds and savings interest", () => {
    const out = run([], [inc("Refund from Amazon", 499), inc("Int. credit Q2", 812, { source: "Interest" })]);
    expect(out.records).toEqual([]);
  });

  it("ignores soft-deleted rows and split/investment postings", () => {
    const entries: AccountEntry[] = [
      { id: "s1", accountId: "hdfc", amount: 20, direction: "debit", date: "2026-09-10", note: "ATM WDL CHG", source: "split_spend" },
      { id: "t1", accountId: "hdfc", amount: 20, direction: "debit", date: "2026-09-10", note: "ATM WDL CHG", transferId: "x" },
    ];
    const out = run([exp("ATM WDL CHG", 20, { deletedAt: "2026-09-11" })], [], { entries });
    expect(out.records).toEqual([]);
  });

  it("classifies a manual account-entry debit like any other row", () => {
    const entries: AccountEntry[] = [
      { id: "m1", accountId: "hdfc", amount: 177, direction: "debit", date: "2026-09-10", note: "SMS ALERT CHGS" },
    ];
    expect(run([], [], { entries }).records[0]).toMatchObject({ key: "entry__m1", feeType: "bank_service" });
  });
});

describe("ambiguous cases stay candidates", () => {
  it.each([
    ["convenience fee inside a train ticket", exp("IRCTC convenience fee", 1250, { category: "Travel & Holidays", subcategory: "Train" })],
    ["processing fee on a shopping order", exp("Order processing fee", 99, { category: "Shopping & Clothing" })],
    ["an annual fee with no account", exp("ANNUAL FEE", 500, { accountId: "" })],
    ["a large keyword-only charge", exp("PROCESSING FEE", 30000)],
  ])("%s", (_label, expense) => {
    const record = only(expense);
    expect(record?.status).toBe("uncertain");
    expect(countsTowardFeeTotals(record!)).toBe(false);
    expect(feeCandidateQueue([record!])).toHaveLength(1);
  });

  it("marks a card charge on a bank account as weaker than on a card", () => {
    const onBank = only(exp("OVERLIMIT FEE", 500, { accountId: "hdfc" }))!;
    const onCard = only(exp("OVERLIMIT FEE", 500, { accountId: "card" }))!;
    expect(onBank.confidence).toBeLessThan(onCard.confidence);
    expect(onBank.evidence.some((e) => e.weight < 0 && e.signal === "account_context")).toBe(true);
  });

  it("splits a GST-inclusive fee at 18% but asks the user to confirm", () => {
    const record = only(exp("ATM CHG INCL GST", 23.6));
    expect(record?.components).toEqual({ principal: 0, fee: 20, tax: 3.6, interest: 0 });
    expect(record?.status).toBe("uncertain");
    expect(record?.evidence.some((e) => e.ruleId === "tax.gst_inclusive")).toBe(true);
  });
});

describe("interest is not a fee", () => {
  it("classifies finance charges as interest", () => {
    const record = only(exp("FINANCE CHARGES", 1420.5, { accountId: "card" }));
    expect(record).toMatchObject({ role: "interest", status: "inferred" });
    expect(record?.components.interest).toBe(1420.5);
    expect(feeComponentTotals([record!])).toMatchObject({ fee: 0, interest: 1420.5 });
  });

  it("prefers the fee when a narration names both", () => {
    expect(only(exp("LATE PAYMENT FEE AND FINANCE CHARGES", 700, { accountId: "card" }))?.role).toBe("fee");
  });
});

describe("GST on a fee", () => {
  it("pairs a GST row with its fee and keeps it in the tax column", () => {
    const fee = exp("ATM WDL CHG", 20, { id: "fee" });
    const gst = exp("IGST ON ATM WDL CHG", 3.6, { id: "gst" });
    const { records } = run([fee, gst]);
    const tax = records.find((r) => r.key === "expense__gst")!;
    expect(tax).toMatchObject({ role: "tax_on_fee", status: "inferred", linkedTo: { kind: "expense", id: "fee" } });
    expect(feeComponentTotals(records)).toMatchObject({ fee: 20, tax: 3.6, count: 2 });
  });

  it("leaves unpaired GST as a candidate", () => {
    const { records } = run([exp("IGST ON ATM CHG", 3.6)]);
    expect(records[0]).toMatchObject({ role: "tax_on_fee", status: "uncertain" });
  });

  it("does not pair GST across accounts or distant dates", () => {
    const fee = exp("ATM WDL CHG", 20, { id: "f", date: "2026-09-01" });
    const far = exp("GST ON ATM CHG", 3.6, { id: "g1", date: "2026-09-20" });
    const other = exp("GST ON ATM CHG", 3.6, { id: "g2", date: "2026-09-01", accountId: "card" });
    const { records } = run([fee, far, other]);
    expect(records.filter((r) => r.role === "tax_on_fee").every((r) => r.status === "uncertain")).toBe(true);
  });
});

describe("reversal and refund pairing", () => {
  it("pairs a charge reversal with the fee it undoes and nets it out", () => {
    const fee = exp("NON MAINT CHGS", 590, { id: "f", date: "2026-08-31" });
    const rev = inc("NON MAINT CHGS REVERSAL", 590, { id: "r", date: "2026-09-05" });
    const { records } = run([fee], [rev]);
    const reversal = records.find((r) => r.key === "income__r")!;
    expect(reversal).toMatchObject({ role: "reversal", status: "inferred", linkedTo: { kind: "expense", id: "f" } });
    expect(feeComponentTotals(records)).toMatchObject({ fee: 590, reversedFee: 590, netFee: 0 });
  });

  it("reverses fee and GST together when the whole debit comes back", () => {
    const fee = exp("ATM CHG INCL GST", 23.6, { id: "f" });
    const reviews: FeeReview[] = [{
      id: "expense__f", sourceKind: "expense", sourceId: "f", decision: "confirm", role: "fee", feeType: "atm_cash",
      components: { principal: 0, fee: 20, tax: 3.6, interest: 0 }, sourceAmount: 23.6, revision: 1, createdAtMs: 1, updatedAtMs: 1,
    }];
    const { records } = run([fee], [inc("ATM CHG REVERSED", 23.6)], { reviews });
    expect(feeComponentTotals(records)).toMatchObject({ netFee: 0, netTax: 0 });
  });

  it("lets one fee be reversed only once", () => {
    const fee = exp("SMS ALERT CHGS", 15, { id: "f", date: "2026-09-01" });
    const { records } = run([fee], [
      inc("SMS CHGS REVERSAL", 15, { id: "r1", date: "2026-09-02" }),
      inc("SMS CHGS REVERSAL", 15, { id: "r2", date: "2026-09-03" }),
    ]);
    expect(records.find((r) => r.key === "income__r1")?.status).toBe("inferred");
    expect(records.find((r) => r.key === "income__r2")?.status).toBe("uncertain");
    expect(feeComponentTotals(records).netFee).toBe(0);
  });

  it("does not pair a credit that precedes the fee or falls outside the window", () => {
    const fee = exp("SMS ALERT CHGS", 15, { id: "f", date: "2026-09-10" });
    const { records } = run([fee], [
      inc("SMS CHGS REVERSAL", 15, { id: "early", date: "2026-09-01" }),
      inc("SMS CHGS REVERSAL", 15, { id: "late", date: "2027-01-01" }),
    ]);
    expect(records.filter((r) => r.role === "reversal").every((r) => r.status === "uncertain")).toBe(true);
    expect(feeComponentTotals(records).netFee).toBe(15);
  });

  it("does not pair across mismatched fee families", () => {
    const fee = exp("SMS ALERT CHGS", 15, { id: "f", date: "2026-09-01" });
    const { records } = run([fee], [inc("FUEL SURCHARGE REVERSAL", 15, { date: "2026-09-02" })]);
    expect(records.find((r) => r.role === "reversal")?.status).toBe("uncertain");
  });

  it("classifies a refunded charge as a refund", () => {
    const fee = exp("LATE PAYMENT FEE", 500, { id: "f", accountId: "card", date: "2026-09-01" });
    const { records } = run([fee], [inc("LATE PAYMENT FEE REFUND", 500, { accountId: "card" })]);
    expect(records.find((r) => r.role === "refund")?.status).toBe("inferred");
  });
});

describe("user corrections survive recalculation", () => {
  const review = (id: string, over: Partial<FeeReview>): FeeReview => ({
    id: `expense__${id}`, sourceKind: "expense", sourceId: id, decision: "confirm", role: "fee", feeType: "atm_cash",
    components: defaultFeeComponents("fee", 20), sourceAmount: 20, revision: 1, createdAtMs: 1, updatedAtMs: 1, ...over,
  });

  it("keeps 'not a fee' on every run, cached or not", () => {
    const rows = [exp("ATM WDL CHG", 20, { id: "x" })];
    const reviews = [review("x", { decision: "not_fee", role: "not_fee", components: defaultFeeComponents("not_fee", 20) })];
    const cache = createFeeDetectionCache();
    for (let i = 0; i < 3; i++) {
      const { records } = detectFees({ expenses: rows, incomes: [], accounts: ACCOUNTS, reviews, cache });
      expect(records[0]).toMatchObject({ role: "not_fee", status: "user_corrected" });
    }
  });

  it("applies a confirmation to a row the engine never detected", () => {
    const { records } = run([exp("Paid bank", 20, { id: "y" })], [], { reviews: [review("y", {})] });
    expect(records[0]).toMatchObject({ status: "confirmed", feeType: "atm_cash" });
  });

  it("never pairs a reversal with a fee the user rejected", () => {
    const rows = [exp("SMS ALERT CHGS", 15, { id: "z", date: "2026-09-01" })];
    const reviews = [review("z", { decision: "not_fee", role: "not_fee", components: defaultFeeComponents("not_fee", 15), sourceAmount: 15 })];
    const { records } = run(rows, [inc("SMS CHGS REVERSAL", 15, { date: "2026-09-02" })], { reviews });
    expect(records.find((r) => r.role === "reversal")?.status).toBe("uncertain");
  });

  it("drops reviews whose transaction is gone", () => {
    expect(run([], [], { reviews: [review("gone", {})] }).records).toEqual([]);
  });

  it("returns the raw inference for provenance when writing a review", () => {
    const out = run([exp("ATM WDL CHG", 20, { id: "p" })]);
    expect(out.inferences.get("expense__p")).toMatchObject({ engineVersion: FEE_ENGINE_VERSION, feeType: "atm_cash" });
  });
});

describe("explainability", () => {
  it("explains every record with rule ids and masked detail", () => {
    const { records } = run([
      exp("UPI/50100012345678/ATM WDL CHG", 20),
      exp("A/c XX98765432 NON MAINT CHGS", 590),
      exp("FINANCE CHARGES", 100, { accountId: "card" }),
    ]);
    expect(records).toHaveLength(3);
    for (const record of records) {
      expect(record.evidence.length).toBeGreaterThan(0);
      expect(record.provenance.ruleIds.length).toBeGreaterThan(0);
      for (const e of record.evidence) {
        expect(e.ruleId).toMatch(/^[a-z_]+\./);
        expect(e.detail).not.toMatch(/\d{5,}/);
      }
      expect(record.source.merchant ?? "").not.toMatch(/\d{5,}/);
    }
  });
});

describe("incremental processing", () => {
  it("re-classifies only rows that changed, and forgets deleted rows", () => {
    const cache = createFeeDetectionCache();
    const rows = Array.from({ length: 50 }, (_, i) => exp(i % 5 === 0 ? "ATM WDL CHG" : "Groceries", 20 + i, { id: `r${i}` }));
    const first = detectFees({ expenses: rows, incomes: [], accounts: ACCOUNTS, cache });
    expect(first.stats.reclassified).toBe(50);

    const again = detectFees({ expenses: rows, incomes: [], accounts: ACCOUNTS, cache });
    expect(again.stats.reclassified).toBe(0);
    expect(again.records).toEqual(first.records);

    const edited = rows.map((r) => (r.id === "r1" ? { ...r, note: "SMS ALERT CHGS" } : r)).slice(0, 40);
    const third = detectFees({ expenses: edited, incomes: [], accounts: ACCOUNTS, cache });
    expect(third.stats.reclassified).toBe(1);
    expect(cache.rows.size).toBe(40);
    expect(third.records.some((r) => r.key === "expense__r1")).toBe(true);
  });

  it("handles a large history quickly", () => {
    const notes = ["Swiggy order", "ATM WDL CHG", "Amazon", "NON MAINT CHGS", "Petrol", "UPI to Ravi", "SMS ALERT CHGS", "Rent"];
    const expenses = Array.from({ length: 20_000 }, (_, i) =>
      exp(notes[i % notes.length], 10 + (i % 900), {
        id: `big${i}`,
        date: `2025-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      })
    );
    const incomes = Array.from({ length: 500 }, (_, i) => inc("NON MAINT CHGS REVERSAL", 10 + ((i * 8 + 3) % 900), { id: `bigr${i}`, date: "2025-12-28" }));
    const cache = createFeeDetectionCache();

    const t0 = performance.now();
    const cold = detectFees({ expenses, incomes, accounts: ACCOUNTS, cache });
    const coldMs = performance.now() - t0;
    const t1 = performance.now();
    detectFees({ expenses, incomes, accounts: ACCOUNTS, cache });
    const warmMs = performance.now() - t1;

    expect(cold.stats.scanned).toBe(20_500);
    expect(cold.stats.detected).toBeGreaterThan(7_000);
    expect(coldMs).toBeLessThan(4_000);
    expect(warmMs).toBeLessThan(coldMs);
  });
});
