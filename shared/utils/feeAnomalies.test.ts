import { describe, expect, it } from "vitest";

import type { FeeRecord, FeeTypeId } from "../types/fee";
import {
  FEE_SIGNAL_MAX_RECORDS,
  activeFeeSignals,
  detectFeeSignals,
  feeSignalId,
  signalsForRecord,
} from "./feeAnomalies";
import { EMPTY_FEE_DASHBOARD_FILTERS, buildFeeDashboard } from "./feeDashboard";
import { defaultFeeComponents, feeReviewDocId } from "./feeModel";

const TODAY = "2026-09-29";

function fee(id: string, date: string, amount: number, feeType: FeeTypeId = "atm_cash", over: Partial<FeeRecord> = {}, src: Partial<FeeRecord["source"]> = {}): FeeRecord {
  const source = { ref: { kind: "expense" as const, id }, date, amount, direction: "debit" as const, currency: "INR", accountId: "hdfc", ...src };
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

function credit(id: string, date: string, amount: number, linkedTo?: FeeRecord, over: Partial<FeeRecord> = {}): FeeRecord {
  return fee(id, date, amount, "atm_cash", {
    role: "reversal",
    components: defaultFeeComponents("reversal", amount),
    ...(linkedTo ? { linkedTo: linkedTo.source.ref } : {}),
    ...over,
  }, { direction: "credit", ref: { kind: "income", id } });
}

const kinds = (records: FeeRecord[]) => detectFeeSignals(records, TODAY).map((s) => s.kind);

describe("possible duplicates", () => {
  it("flags the same fee charged twice within a few days", () => {
    const signals = detectFeeSignals([fee("a", "2026-09-10", 23.6), fee("b", "2026-09-11", 23.6)], TODAY);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({ kind: "possible_duplicate", severity: "attention", recordKeys: ["expense__b", "expense__a"] });
    expect(signals[0].detail).toMatch(/2026-09-10.*2026-09-11/);
  });

  it("does not flag different amounts, accounts, families or distant dates", () => {
    expect(kinds([fee("a", "2026-09-10", 23.6), fee("b", "2026-09-11", 21)])).toEqual([]);
    expect(kinds([fee("a", "2026-09-10", 23.6), fee("b", "2026-09-11", 23.6, "atm_cash", {}, { accountId: "card" })])).toEqual([]);
    expect(kinds([fee("a", "2026-09-10", 23.6), fee("b", "2026-09-11", 23.6, "bank_service")])).toEqual([]);
    expect(kinds([fee("a", "2026-09-01", 23.6), fee("b", "2026-09-10", 23.6)])).toEqual([]);
  });

  it("pairs each charge at most once", () => {
    const signals = detectFeeSignals([fee("a", "2026-09-10", 20), fee("b", "2026-09-10", 20), fee("c", "2026-09-11", 20)], TODAY);
    expect(signals.filter((s) => s.kind === "possible_duplicate")).toHaveLength(1);
  });
});

describe("unusual amounts", () => {
  it("flags a charge well above the usual for that fee", () => {
    const history = ["2026-05-31", "2026-06-30", "2026-07-31"].map((d, i) => fee(`m${i}`, d, 100, "bank_service"));
    const spike = fee("spike", "2026-08-31", 250, "bank_service");
    const signals = detectFeeSignals([...history, spike], TODAY).filter((s) => s.kind === "unusual_amount");
    expect(signals).toHaveLength(1);
    expect(signals[0].recordKeys[0]).toBe("expense__spike");
    expect(signals[0].detail).toMatch(/usual ₹100.*3 earlier charges/);
  });

  it("needs enough history and a meaningful jump", () => {
    const short = ["2026-06-30", "2026-07-31"].map((d, i) => fee(`s${i}`, d, 100, "bank_service"));
    expect(kinds([...short, fee("x", "2026-08-31", 400, "bank_service")])).not.toContain("unusual_amount");
    const small = ["2026-05-31", "2026-06-30", "2026-07-31"].map((d, i) => fee(`t${i}`, d, 20, "bank_service"));
    expect(kinds([...small, fee("y", "2026-08-31", 40, "bank_service")])).not.toContain("unusual_amount");
  });
});

describe("repeated penalties", () => {
  it("flags two or more penalties within six months", () => {
    const signals = detectFeeSignals([fee("l1", "2026-06-05", 500, "late_payment"), fee("l2", "2026-09-05", 750, "late_payment")], TODAY);
    const p = signals.find((s) => s.kind === "repeated_penalty")!;
    expect(p.detail).toBe("Charged 2 times in the last 6 months, ₹1,250 in total.");
  });

  it("ignores old penalties and non-penalty fees", () => {
    expect(kinds([fee("l1", "2025-12-01", 500, "late_payment"), fee("l2", "2026-09-05", 500, "late_payment")])).not.toContain("repeated_penalty");
    expect(kinds([fee("a1", "2026-07-01", 20), fee("a2", "2026-09-01", 20)])).not.toContain("repeated_penalty");
  });

  it("caps the records kept on one signal", () => {
    const many = Array.from({ length: 20 }, (_, i) => fee(`p${i}`, `2026-0${4 + (i % 5)}-${String(i + 1).padStart(2, "0")}`, 100 + i, "min_balance"));
    const p = detectFeeSignals(many, TODAY).find((s) => s.kind === "repeated_penalty")!;
    expect(p.recordKeys.length).toBe(FEE_SIGNAL_MAX_RECORDS);
  });
});

describe("reversals", () => {
  const f = fee("f", "2026-09-01", 590, "min_balance");

  it("reports a full reversal and it nets the fee out of totals", () => {
    const records = [f, credit("r", "2026-09-05", 590, f)];
    const s = detectFeeSignals(records, TODAY).find((x) => x.kind === "reversed")!;
    expect(s).toMatchObject({ severity: "info", recordKeys: ["expense__f", "income__r"] });
    expect(buildFeeDashboard(records, EMPTY_FEE_DASHBOARD_FILTERS, TODAY).totals.netFee).toBe(0);
  });

  it("reports a partial reversal and what still counts", () => {
    const s = detectFeeSignals([f, credit("r", "2026-09-05", 300, f)], TODAY).find((x) => x.kind === "partly_reversed")!;
    expect(s.detail).toMatch(/₹300 of the ₹590.*₹290 still counts/);
  });

  it("does not let an unsupported credit reduce totals, and says so", () => {
    const loose = credit("u", "2026-09-05", 590, undefined, { status: "uncertain", uncertainReason: "ambiguous" });
    const records = [f, loose];
    expect(kinds(records)).toContain("unmatched_credit");
    expect(buildFeeDashboard(records, EMPTY_FEE_DASHBOARD_FILTERS, TODAY).totals.netFee).toBe(590);
  });
});

describe("needs attention", () => {
  it("surfaces conflicting, broken and changed records but not plain candidates", () => {
    const out = kinds([
      fee("c", "2026-09-10", 20, "atm_cash", { status: "uncertain", uncertainReason: "conflicting_signals" }),
      fee("s", "2026-09-10", 21, "bank_service", { status: "uncertain", uncertainReason: "source_changed" }),
      fee("a", "2026-09-10", 22, "cheque", { status: "uncertain", uncertainReason: "ambiguous" }),
    ]);
    expect(out.filter((k) => k === "needs_attention")).toHaveLength(2);
  });
});

describe("determinism, dismissal and safety", () => {
  const records = [fee("a", "2026-09-10", 23.6), fee("b", "2026-09-11", 23.6), fee("l1", "2026-06-05", 500, "late_payment"), fee("l2", "2026-09-05", 750, "late_payment")];

  it("is deterministic and orders attention before info, newest first", () => {
    expect(detectFeeSignals(records, TODAY)).toEqual(detectFeeSignals([...records].reverse(), TODAY));
    const out = detectFeeSignals([...records, fee("f", "2026-09-01", 590, "min_balance"), credit("r", "2026-09-05", 590, fee("f", "2026-09-01", 590, "min_balance"))], TODAY);
    expect(out.at(-1)?.severity).toBe("info");
  });

  it("builds ids that are stable, order-independent and valid document ids", () => {
    expect(feeSignalId("possible_duplicate", ["b", "a"])).toBe(feeSignalId("possible_duplicate", ["a", "b"]));
    for (const s of detectFeeSignals(records, TODAY)) {
      expect(s.id).toMatch(/^[a-z_]+--[A-Za-z0-9_-]+$/);
      expect(s.id.length).toBeLessThan(700);
    }
  });

  it("hides dismissed signals until the evidence changes", () => {
    const signals = detectFeeSignals(records, TODAY);
    const dup = signals.find((s) => s.kind === "possible_duplicate")!;
    expect(activeFeeSignals(signals, [{ id: dup.id }]).map((s) => s.id)).not.toContain(dup.id);
    const changed = detectFeeSignals([...records, fee("c", "2026-09-12", 23.6)], TODAY);
    expect(changed.find((s) => s.kind === "possible_duplicate")?.id).toBe(dup.id);
  });

  it("finds signals for one record", () => {
    const signals = detectFeeSignals(records, TODAY);
    expect(signalsForRecord(signals, "expense__a").map((s) => s.kind)).toEqual(["possible_duplicate"]);
  });

  it("never changes the records it reads", () => {
    const snapshot = JSON.stringify(records);
    detectFeeSignals(records, TODAY);
    expect(JSON.stringify(records)).toBe(snapshot);
  });

  it("gives no advice", () => {
    const text = detectFeeSignals(records, TODAY).map((s) => `${s.title} ${s.detail}`).join(" ").toLowerCase();
    for (const w of ["switch", "recommend", "better", "cheaper", "should"]) expect(text).not.toContain(w);
  });
});
