/**
 * SPENDLY-323 — end-to-end QA for Fee & Charges Intelligence.
 *
 * Runs the whole pipeline (detect → resolve → dashboard / detail / patterns /
 * signals / insights) over one realistic ledger and checks the epic's
 * guarantees together rather than one module at a time:
 *
 *   1. Accuracy on a labelled narration corpus, with no false "detected".
 *   2. Canonical totals reconcile across every screen.
 *   3. Nothing is double-counted against the ledger.
 *   4. Ordinary spending produces no fees, patterns or signals.
 *   5. Corrections persist across recalculation.
 *   6. What we write to Firestore matches what the rules allow.
 *
 * Results are summarised in docs/SPENDLY-323-fee-qa-rollout.md.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { Account, Expense, Income } from "../types/expense";
import type { FeeReview, FeeTypeId } from "../types/fee";
import { detectFeeSignals } from "./feeAnomalies";
import { EMPTY_FEE_DASHBOARD_FILTERS, attributeFeeRecords, buildFeeDashboard } from "./feeDashboard";
import { buildFeeDetail } from "./feeDetail";
import { createFeeDetectionCache, detectFees } from "./feeDetection";
import { buildFeeInsights } from "./feeInsights";
import { buildFeeReview, countsTowardFeeTotals, defaultFeeComponents, feeComponentTotals, feeComponentsMatchAmount } from "./feeModel";
import { detectFeePatterns } from "./feePatterns";

const TODAY = "2026-09-29";
const BANK: Account = { id: "hdfc", name: "HDFC Savings", typeId: "t1", accountTypeId: "bank", institutionName: "HDFC Bank", last4: "4321" };
const CARD: Account = { id: "card", name: "Axis Ace", typeId: "t2", accountTypeId: "credit_card", institutionName: "Axis Bank", last4: "9876" };
const ACCOUNTS = [BANK, CARD];

let n = 0;
function exp(note: string, amount: number, date: string, accountId = "hdfc", category = "Other", subcategory = "Other"): Expense {
  n += 1;
  return { id: `e${n}`, amount, note, category, subcategory, date, month: date.slice(0, 7), accountId, createdAt: 1 };
}
function inc(note: string, amount: number, date: string, accountId = "hdfc", source = "Refund"): Income {
  n += 1;
  return { id: `i${n}`, amount, note, source, date, month: date.slice(0, 7), accountId, createdAt: 1 };
}

// ---------------------------------------------------------------------------
// 1. Labelled corpus: expected outcome per narration.
// ---------------------------------------------------------------------------

type Expected = { type: FeeTypeId } | "not_fee" | "candidate" | "interest";
const CORPUS: Array<[string, number, string, Expected, string?, string?]> = [
  // [note, amount, account, expected, category, subcategory]
  ["ATM WDL CHGS 4TH TXN", 23.6, "hdfc", { type: "atm_cash" }],
  ["NFS ATM CHG OTHER BANK", 21, "hdfc", { type: "atm_cash" }],
  ["NON MAINT CHGS AUG26", 590, "hdfc", { type: "min_balance" }],
  ["AMB CHARGES SHORTFALL", 354, "hdfc", { type: "min_balance" }],
  ["SMS ALERT CHGS QTR", 17.7, "hdfc", { type: "bank_service" }],
  ["DEBIT CARD ANNUAL FEE", 236, "hdfc", { type: "debit_card" }],
  ["CHQ RTN CHGS", 590, "hdfc", { type: "cheque" }],
  ["NEFT CHGS", 5.9, "hdfc", { type: "transfer_remittance" }],
  ["ECS RETURN CHARGES", 590, "hdfc", { type: "loan" }],
  ["DP CHARGES CDSL", 15.93, "hdfc", { type: "investment" }],
  ["ANNUAL FEE", 499, "card", { type: "credit_card" }],
  ["JOINING FEE", 499, "card", { type: "credit_card" }],
  ["FUEL SURCHARGE", 12, "card", { type: "credit_card" }],
  ["LATE PAYMENT FEE", 750, "card", { type: "late_payment" }],
  ["CASH ADVANCE FEE", 500, "card", { type: "cash_advance" }],
  ["FOREX MARKUP FEE", 98.5, "card", { type: "forex" }],
  ["OVERLIMIT FEE", 600, "card", { type: "credit_card" }],
  ["FINANCE CHARGES", 1420.5, "card", "interest"],
  // Ambiguous → must stay candidates, never silently counted
  ["IRCTC convenience fee", 1250, "hdfc", "candidate", "Travel & Holidays", "Train"],
  ["Order processing fee", 99, "hdfc", "candidate", "Shopping & Clothing", "Online Shopping"],
  ["ATM CHG INCL GST", 23.6, "hdfc", "candidate"],
  ["PROCESSING FEE", 30000, "hdfc", "candidate"],
  // Ordinary spending → nothing
  ["ATM WDR SBI MG ROAD", 5000, "hdfc", "not_fee"],
  ["ATM CASH WITHDRAWAL", 2000, "hdfc", "not_fee"],
  ["Swiggy order", 450, "hdfc", "not_fee", "Food & Groceries", "Food Delivery"],
  ["Amazon order", 1499, "card", "not_fee", "Shopping & Clothing", "Online Shopping"],
  ["Term annual fee", 45000, "hdfc", "not_fee", "Education", "School Fees"],
  ["Consultation fee Dr Rao", 800, "hdfc", "not_fee", "Health & Medical", "Doctor Consultation"],
  ["Payment to Axis card", 12000, "hdfc", "not_fee", "Finance, Loans & Insurance", "Credit Card Payment"],
  ["Home loan EMI", 32000, "hdfc", "not_fee", "Finance, Loans & Insurance", "Home Loan EMI"],
  ["UPI to Ravi", 700, "hdfc", "not_fee"],
  ["Electricity bill", 2300, "hdfc", "not_fee", "Bills & Communication", "Electricity"],
  ["charges", 100, "hdfc", "not_fee"],
];

describe("1. accuracy on the labelled corpus", () => {
  const expenses = CORPUS.map(([note, amount, acct, , cat, sub]) => exp(note, amount, "2026-09-10", acct, cat, sub));
  const { records } = detectFees({ expenses, incomes: [], accounts: ACCOUNTS });
  const byId = new Map(records.map((r) => [r.source.ref.id, r] as const));

  const results = CORPUS.map(([note], i) => {
    const r = byId.get(expenses[i].id!);
    const expected = CORPUS[i][3];
    let actual: string;
    if (!r) actual = "not_fee";
    else if (r.status === "uncertain") actual = "candidate";
    else if (r.role === "interest") actual = "interest";
    else actual = `type:${r.feeType}`;
    const want = typeof expected === "string" ? expected : `type:${expected.type}`;
    return { note, want, actual };
  });

  it("classifies every labelled narration as expected", () => {
    const wrong = results.filter((r) => r.want !== r.actual);
    expect(wrong).toEqual([]);
  });

  it("never marks ordinary spending or an ambiguous row as a detected fee", () => {
    const falsePositive = results.filter((r) => (r.want === "not_fee" || r.want === "candidate") && r.actual.startsWith("type:"));
    expect(falsePositive).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// A realistic 6-month ledger for the remaining checks.
// ---------------------------------------------------------------------------

function ledger() {
  n = 1000;
  const expenses: Expense[] = [];
  const incomes: Income[] = [];
  for (const m of ["04", "05", "06", "07", "08", "09"]) {
    expenses.push(exp("NON MAINT CHGS", 590, `2026-${m}-28`));
    expenses.push(exp("Swiggy order", 400 + Number(m), `2026-${m}-05`, "hdfc", "Food & Groceries", "Food Delivery"));
    expenses.push(exp("Amazon order", 1200, `2026-${m}-12`, "card", "Shopping & Clothing", "Online Shopping"));
    expenses.push(exp("ATM WDR SBI", 3000, `2026-${m}-02`));
  }
  expenses.push(exp("ATM WDL CHG", 20, "2026-07-03"), exp("ATM WDL CHG", 20, "2026-08-03"), exp("ATM WDL CHG", 20, "2026-09-03"));
  const gstFee = exp("SMS ALERT CHGS", 15, "2026-09-15");
  expenses.push(gstFee, exp("IGST ON SMS ALERT CHGS", 2.7, "2026-09-15"));
  expenses.push(exp("ANNUAL FEE", 500, "2026-09-18", "card"), exp("FINANCE CHARGES", 410, "2026-09-18", "card"));
  expenses.push(exp("LATE PAYMENT FEE", 750, "2026-06-20", "card"), exp("LATE PAYMENT FEE", 750, "2026-09-20", "card"));
  expenses.push(exp("IRCTC convenience fee", 1250, "2026-09-22", "hdfc", "Travel & Holidays", "Train"));
  incomes.push(inc("NON MAINT CHGS REVERSAL", 590, "2026-09-29"), inc("Salary", 90000, "2026-09-01", "hdfc", "Salary"));
  incomes.push(inc("CHGS REVERSAL", 77, "2026-09-25"));
  return { expenses, incomes };
}

describe("2. totals reconcile across every screen", () => {
  const { expenses, incomes } = ledger();
  const { records } = detectFees({ expenses, incomes, accounts: ACCOUNTS });
  const canonical = feeComponentTotals(records.filter((r) => r.source.date.startsWith("2026-09")));
  const dash = buildFeeDashboard(records, EMPTY_FEE_DASHBOARD_FILTERS, TODAY);

  it("dashboard hero equals the canonical sum for the month", () => {
    expect(dash.totals).toEqual(canonical);
  });

  it("every breakdown and the trend add up to the hero", () => {
    for (const rows of [dash.byType, dash.byAccount, dash.byProvider]) {
      expect(Math.round(rows.reduce((s, r) => s + r.cost, 0) * 100) / 100).toBe(dash.cost);
    }
    expect(dash.trend.at(-1)?.cost).toBe(dash.cost);
  });

  it("the insight headline equals the dashboard", () => {
    const month = buildFeeInsights(records, TODAY).find((i) => i.kind === "month_total")!;
    expect(month.title).toBe(`You paid ₹${dash.cost.toLocaleString("en-IN")} in fees this month`);
  });

  it("fee details sum to the same total as the dashboard over all time", () => {
    const all = buildFeeDashboard(records, { ...EMPTY_FEE_DASHBOARD_FILTERS, period: "all" }, TODAY);
    const parents = records.filter((r) => countsTowardFeeTotals(r) && !r.linkedTo);
    const viaDetail = parents.reduce((s, r) => {
      const d = buildFeeDetail(r.key, records)!;
      return s + d.effect.netFee + d.effect.netTax;
    }, 0);
    expect(Math.round(viaDetail * 100) / 100).toBe(all.cost);
  });

  it("interest is reported but never inside fee totals", () => {
    expect(dash.totals.netInterest).toBe(410);
    expect(dash.cost).toBe(Math.round((dash.totals.netFee + dash.totals.netTax) * 100) / 100);
  });

  it("an unmatched reversal does not reduce anything, and is flagged", () => {
    expect(detectFeeSignals(records, TODAY).some((s) => s.kind === "unmatched_credit")).toBe(true);
    expect(records.find((r) => r.source.amount === 77)?.status).toBe("uncertain");
  });
});

describe("3. no double counting against the ledger", () => {
  const { expenses, incomes } = ledger();
  const { records } = detectFees({ expenses, incomes, accounts: ACCOUNTS });

  it("every record points at exactly one existing ledger row, once", () => {
    const ids = new Set([...expenses.map((e) => `expense__${e.id}`), ...incomes.map((i) => `income__${i.id}`)]);
    const keys = records.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const k of keys) expect(ids.has(k)).toBe(true);
  });

  it("each record's parts add up to its source amount", () => {
    for (const r of records) expect(feeComponentsMatchAmount(r.components, r.source.amount)).toBe(true);
  });

  it("fee totals never exceed what the counted source rows actually cost", () => {
    const counted = records.filter(countsTowardFeeTotals).filter((r) => r.source.direction === "debit");
    const sourceSum = counted.reduce((s, r) => s + r.source.amount, 0);
    const t = feeComponentTotals(counted);
    expect(t.fee + t.tax + t.interest).toBeLessThanOrEqual(sourceSum + 0.01);
  });

  it("ledger rows are untouched by the pipeline", () => {
    const before = JSON.stringify({ expenses, incomes });
    const { records: r } = detectFees({ expenses, incomes, accounts: ACCOUNTS });
    buildFeeDashboard(r, EMPTY_FEE_DASHBOARD_FILTERS, TODAY);
    detectFeePatterns(r, TODAY);
    detectFeeSignals(r, TODAY);
    buildFeeInsights(r, TODAY);
    expect(JSON.stringify({ expenses, incomes })).toBe(before);
  });
});

describe("4. ordinary spending stays quiet", () => {
  it("produces no fees, patterns, signals or insights", () => {
    n = 5000;
    const expenses: Expense[] = [];
    for (const m of ["03", "04", "05", "06", "07", "08", "09"]) {
      expenses.push(exp("Swiggy order", 450, `2026-${m}-05`, "hdfc", "Food & Groceries", "Food Delivery"));
      expenses.push(exp("Netflix", 649, `2026-${m}-10`, "card", "Entertainment & Hobbies", "Streaming"));
      expenses.push(exp("ATM WDR", 5000, `2026-${m}-01`));
      expenses.push(exp("Rent", 25000, `2026-${m}-01`, "hdfc", "Home & Household", "Rent"));
    }
    const { records } = detectFees({ expenses, incomes: [inc("Refund from Amazon", 499, "2026-09-02")], accounts: ACCOUNTS });
    expect(records).toEqual([]);
    expect(detectFeePatterns(records, TODAY)).toEqual([]);
    expect(detectFeeSignals(records, TODAY)).toEqual([]);
    expect(buildFeeInsights(records, TODAY)).toEqual([]);
  });
});

describe("5. corrections persist across recalculation", () => {
  it("a 'not a fee' and a GST split survive cached and uncached runs", () => {
    const { expenses, incomes } = ledger();
    const first = detectFees({ expenses, incomes, accounts: ACCOUNTS });
    const atm = first.records.find((r) => r.role === "fee" && r.feeType === "atm_cash")!;
    const nonMaint = first.records.find((r) => r.role === "fee" && r.feeType === "min_balance")!;
    const reviews: FeeReview[] = [];
    const a = buildFeeReview({ source: atm.source, decision: "not_fee", classification: { role: "not_fee", components: defaultFeeComponents("not_fee", atm.source.amount) }, nowMs: 1 });
    const b = buildFeeReview({ source: nonMaint.source, decision: "correct", classification: { role: "fee", feeType: "min_balance", components: { principal: 0, fee: 500, tax: 90, interest: 0 } }, nowMs: 1 });
    if (!a.ok || !b.ok) throw new Error("expected valid reviews");
    reviews.push({ ...a.review, id: a.docId }, { ...b.review, id: b.docId });

    const cache = createFeeDetectionCache();
    for (let i = 0; i < 2; i++) {
      const { records } = detectFees({ expenses, incomes, accounts: ACCOUNTS, reviews, cache });
      expect(records.find((r) => r.key === atm.key)).toMatchObject({ role: "not_fee", status: "user_corrected" });
      expect(records.find((r) => r.key === nonMaint.key)?.components).toEqual({ principal: 0, fee: 500, tax: 90, interest: 0 });
    }
  });
});

describe("6. writes match the rules", () => {
  const rules = readFileSync("firestore.rules", "utf8");
  const allowed = (fn: string) => {
    const body = rules.slice(rules.indexOf(`function ${fn}(`));
    const m = body.match(/keys\(\)\.hasOnly\(\[([^\]]*)\]\)/);
    return new Set([...(m?.[1] ?? "").matchAll(/'([^']+)'/g)].map((x) => x[1]));
  };

  it("every field buildFeeReview can emit is allowed by feeReviewWellFormed", () => {
    const { expenses, incomes } = ledger();
    const { records, inferences } = detectFees({ expenses, incomes, accounts: ACCOUNTS });
    const gst = records.find((r) => r.role === "tax_on_fee" && r.linkedTo)!;
    const out = buildFeeReview({
      source: gst.source,
      decision: "correct",
      classification: { role: "tax_on_fee", feeType: "bank_service", subtype: "sms_alerts", components: gst.components, linkedTo: gst.linkedTo },
      inference: inferences.get(gst.key),
      previous: { id: gst.key, sourceKind: gst.source.ref.kind, sourceId: gst.source.ref.id, decision: "confirm", role: "tax_on_fee", components: gst.components, sourceAmount: gst.source.amount, revision: 1, createdAtMs: 1, updatedAtMs: 1 },
      note: "check",
      nowMs: 2,
    });
    if (!out.ok) throw new Error(out.issues.join());
    const permitted = allowed("feeReviewWellFormed");
    for (const key of Object.keys(out.review)) expect(permitted.has(key)).toBe(true);
    // Privacy: the review never copies the narration or any account number.
    expect(JSON.stringify(out.review)).not.toMatch(/SMS ALERT|4321|9876/);
  });

  it("every field a signal dismissal writes is allowed", () => {
    const permitted = allowed("feeSignalDismissalWellFormed");
    for (const key of ["kind", "resolution", "recordKeys", "note", "atMs"]) expect(permitted.has(key)).toBe(true);
  });

  it("attribution covers every counted record", () => {
    const { expenses, incomes } = ledger();
    const { records } = detectFees({ expenses, incomes, accounts: ACCOUNTS });
    expect(attributeFeeRecords(records).length).toBe(records.filter(countsTowardFeeTotals).length);
  });
});
