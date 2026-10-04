import { describe, expect, it } from "vitest";

import type { FeeRecord, FeeTypeId } from "../types/fee";
import { defaultFeeComponents, feeReviewDocId } from "./feeModel";
import { detectFeePatterns, feePatternLabel } from "./feePatterns";

const TODAY = "2026-09-29";

function fee(id: string, date: string, amount: number, feeType: FeeTypeId = "min_balance", over: Partial<FeeRecord> = {}, src: Partial<FeeRecord["source"]> = {}): FeeRecord {
  const source = { ref: { kind: "expense" as const, id }, date, amount, direction: "debit" as const, currency: "INR", accountId: "hdfc", institution: "HDFC Bank", ...src };
  return {
    key: feeReviewDocId(source.ref),
    source,
    role: "fee",
    feeType,
    components: defaultFeeComponents("fee", amount),
    status: "inferred",
    confidence: 0.9,
    evidence: [],
    provenance: { origin: "rule", ruleIds: [] },
    ...over,
  };
}

const monthly = ["2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31"].map((d, i) => fee(`amb${i}`, d, 590));

describe("detectFeePatterns", () => {
  it("finds a regular monthly charge with a steady amount", () => {
    const [p] = detectFeePatterns(monthly, TODAY);
    expect(p).toMatchObject({
      feeType: "min_balance",
      accountId: "hdfc",
      cadence: "monthly",
      steadyAmount: true,
      regular: true,
      occurrences: 5,
      monthsWithCharges: 5,
      firstSeen: "2026-04-30",
      lastSeen: "2026-08-31",
      typicalAmount: 590,
      totalCost: 2950,
    });
    expect(feePatternLabel(p)).toBe("Regular monthly charge");
    expect(p.recordKeys).toHaveLength(5);
  });

  it("labels the yearly figure as a scaled estimate for short histories", () => {
    const [p] = detectFeePatterns(monthly, TODAY);
    // 6 months (Apr–Sep) of history, ₹2950 → ×12/6
    expect(p.estimatedYearly).toBe(5900);
    expect(p.estimateBasis).toMatch(/^Estimate: 6 months of history scaled to a year/);
  });

  it("uses the last 12 months once the history is long enough", () => {
    const long = Array.from({ length: 14 }, (_, i) => fee(`l${i}`, `${i < 2 ? "2025" : "2026"}-${String(((i + 7) % 12) + 1).padStart(2, "0")}-15`, 100));
    const [p] = detectFeePatterns(long, TODAY);
    expect(p.estimateBasis).toMatch(/last 12 months/);
    expect(p.estimatedYearly).toBeLessThanOrEqual(1200);
  });

  it("needs sufficient evidence", () => {
    expect(detectFeePatterns(monthly.slice(0, 2), TODAY)).toEqual([]);
    // three charges in one month: repeated, but only one month of evidence
    const sameMonth = ["2026-09-02", "2026-09-10", "2026-09-20"].map((d, i) => fee(`s${i}`, d, 21, "atm_cash"));
    expect(detectFeePatterns(sameMonth, TODAY)).toEqual([]);
  });

  it("accepts an annual fee from two charges a year apart", () => {
    const annual = [fee("y1", "2025-03-10", 500, "credit_card"), fee("y2", "2026-03-12", 500, "credit_card")];
    const [p] = detectFeePatterns(annual, TODAY);
    expect(p).toMatchObject({ cadence: "yearly", regular: true, estimatedYearly: 500 });
    expect(p.estimateBasis).toMatch(/^Estimate: one charge a year/);
    expect(feePatternLabel(p)).toBe("Regular yearly charge");
  });

  it("never calls variable or irregular charges regular", () => {
    const atm = ["2026-06-03", "2026-06-20", "2026-07-02", "2026-08-15", "2026-08-16", "2026-09-10"].map((d, i) =>
      fee(`atm${i}`, d, [21, 23.6, 21, 42, 21, 23.6][i], "atm_cash")
    );
    const [p] = detectFeePatterns(atm, TODAY);
    expect(p.cadence).toBe("irregular");
    expect(p.regular).toBe(false);
    expect(feePatternLabel(p)).toBe("Repeated charge");
    expect(p.signals.join(" ")).toMatch(/not on a regular schedule/);

    const variableMonthly = ["2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01"].map((d, i) => fee(`v${i}`, d, [100, 400, 50, 900][i], "late_payment"));
    const [v] = detectFeePatterns(variableMonthly, TODAY);
    expect(v.cadence).toBe("monthly");
    expect(v.steadyAmount).toBe(false);
    expect(v.regular).toBe(false);
  });

  it("groups by where the fee is charged, not only by type", () => {
    const card = ["2026-05-05", "2026-06-05", "2026-07-05"].map((d, i) => fee(`c${i}`, d, 590, "min_balance", {}, { accountId: "icici" }));
    const out = detectFeePatterns([...monthly, ...card], TODAY);
    expect(out.map((p) => p.accountId).sort()).toEqual(["hdfc", "icici"]);
  });

  it("includes GST in each charge and nets reversals, with every record listed", () => {
    const withGst = monthly.flatMap((f, i) => [
      f,
      fee(`g${i}`, f.source.date, 106.2, undefined as never, { role: "tax_on_fee", feeType: undefined, components: defaultFeeComponents("tax_on_fee", 106.2), linkedTo: f.source.ref }),
    ]);
    const reversal = fee("rev", "2026-09-02", 590, "min_balance", { role: "reversal", components: defaultFeeComponents("reversal", 590), linkedTo: monthly[4].source.ref }, { direction: "credit", ref: { kind: "income", id: "rev" } });
    const [p] = detectFeePatterns([...withGst, reversal], TODAY);
    expect(p.typicalAmount).toBe(696.2);
    expect(p.totalCost).toBe(roundTo(5 * 696.2 - 590));
    expect(p.reversals).toBe(1);
    expect(p.recordKeys).toHaveLength(11);
    expect(p.signals.join(" ")).toMatch(/1 was reversed/);
  });

  it("ignores candidates and not-a-fee records", () => {
    const weak = monthly.map((f) => ({ ...f, status: "uncertain" as const }));
    expect(detectFeePatterns(weak, TODAY)).toEqual([]);
  });

  it("reports trends and a pattern that may have stopped", () => {
    const rising = ["2026-03-10", "2026-05-10", "2026-07-10", "2026-08-10", "2026-09-10"].map((d, i) => fee(`r${i}`, d, 100, "bank_service"));
    expect(detectFeePatterns(rising, TODAY)[0].trend).toBe("rising");

    const stopped = ["2026-01-31", "2026-02-28", "2026-03-31"].map((d, i) => fee(`x${i}`, d, 590));
    const [s] = detectFeePatterns(stopped, TODAY);
    expect(s.trend).toBe("stopped");
    expect(s.mayHaveStopped).toBe(true);
    expect(s.signals.join(" ")).toMatch(/may have stopped/);

    const fresh = ["2026-07-31", "2026-08-31", "2026-09-28"].map((d, i) => fee(`n${i}`, d, 590));
    expect(detectFeePatterns(fresh, TODAY)[0].trend).toBe("new");
  });

  it("stays fast on a large history", () => {
    const many = Array.from({ length: 20_000 }, (_, i) =>
      fee(`big${i}`, `2026-${String((i % 9) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`, 20 + (i % 7), i % 2 ? "atm_cash" : "bank_service", {}, { accountId: `a${i % 20}` })
    );
    const t0 = performance.now();
    const out = detectFeePatterns(many, TODAY);
    expect(performance.now() - t0).toBeLessThan(2000);
    expect(out.length).toBeGreaterThan(0);
  });

  it("never recommends a provider or product", () => {
    const text = detectFeePatterns(monthly, TODAY).flatMap((p) => [...p.signals, p.estimateBasis]).join(" ").toLowerCase();
    for (const word of ["switch", "recommend", "better", "cheaper", "best", "should"]) expect(text).not.toContain(word);
  });
});

function roundTo(v: number) {
  return Math.round(v * 100) / 100;
}
