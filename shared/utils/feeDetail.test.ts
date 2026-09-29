import { describe, expect, it } from "vitest";

import type { FeeRecord } from "../types/fee";
import { EMPTY_FEE_DASHBOARD_FILTERS, buildFeeDashboard } from "./feeDashboard";
import {
  buildFeeDetail,
  feeDetailHref,
  feeProvenanceText,
  feeRecordForTransaction,
  maskedAccountLabel,
} from "./feeDetail";
import { defaultFeeComponents, feeReviewDocId } from "./feeModel";

function rec(id: string, over: Partial<FeeRecord> = {}, src: Partial<FeeRecord["source"]> = {}): FeeRecord {
  const source = {
    ref: { kind: "expense" as const, id },
    date: "2026-09-10",
    amount: 100,
    direction: "debit" as const,
    currency: "INR",
    accountId: "hdfc",
    ...src,
  };
  return {
    key: feeReviewDocId(source.ref),
    source,
    role: "fee",
    feeType: "credit_card",
    components: defaultFeeComponents("fee", source.amount),
    status: "inferred",
    confidence: 0.92,
    evidence: [],
    provenance: { origin: "rule", engineVersion: 1, ruleIds: ["kw.x"] },
    ...over,
  };
}

const fee = rec("fee", {}, { amount: 500 });
const gst = rec("gst", { role: "tax_on_fee", feeType: undefined, components: defaultFeeComponents("tax_on_fee", 90), linkedTo: fee.source.ref }, { amount: 90, date: "2026-09-11" });
const rev = rec("rev", { role: "reversal", components: defaultFeeComponents("reversal", 500), linkedTo: fee.source.ref }, { amount: 500, direction: "credit", ref: { kind: "income", id: "rev" }, date: "2026-09-20" });
const weakRev = rec("weak", { role: "refund", status: "uncertain", uncertainReason: "ambiguous", components: defaultFeeComponents("refund", 90), linkedTo: fee.source.ref }, { amount: 90, direction: "credit", ref: { kind: "income", id: "weak" } });
const RECORDS = [fee, gst, rev, weakRev];

describe("buildFeeDetail", () => {
  it("returns null for an unknown key", () => {
    expect(buildFeeDetail("expense__nope", RECORDS)).toBeNull();
  });

  it("shows a fee with its GST and reversals, and nets only counted ones", () => {
    const d = buildFeeDetail(fee.key, RECORDS)!;
    // Oldest first.
    expect(d.children.map((c) => c.key)).toEqual(["income__weak", "expense__gst", "income__rev"]);
    expect(d.effect).toMatchObject({ fee: 500, tax: 90, reversedFee: 500, netFee: 0, netTax: 90 });
    expect(d.counted).toBe(true);
    expect(d.countedReason).toMatch(/Counted in your fee totals/);
  });

  it("agrees with the dashboard for the same records", () => {
    const d = buildFeeDetail(fee.key, RECORDS)!;
    const dash = buildFeeDashboard(RECORDS, { ...EMPTY_FEE_DASHBOARD_FILTERS, period: "all" }, "2026-09-29");
    const row = dash.byType.find((r) => r.key === "credit_card")!;
    expect(row.totals.netFee).toBe(d.effect.netFee);
    expect(row.totals.netTax).toBe(d.effect.netTax);
  });

  it("links a child back to its parent", () => {
    const d = buildFeeDetail(rev.key, RECORDS)!;
    expect(d.parent?.key).toBe(fee.key);
    expect(d.countedReason).toMatch(/Reduces/);
    expect(d.parts).toEqual([{ key: "fee", label: "Fee", value: 500 }]);
  });

  it("explains why a record is not counted", () => {
    expect(buildFeeDetail(weakRev.key, RECORDS)!.countedReason).toMatch(/Not counted yet — spendly isn't sure/);
    const nope = rec("n", { role: "not_fee", status: "user_corrected", components: defaultFeeComponents("not_fee", 10) }, { amount: 10 });
    expect(buildFeeDetail(nope.key, [nope])!.countedReason).toMatch(/marked as not a fee/);
    expect(buildFeeDetail(nope.key, [nope])!.effect.count).toBe(0);
  });

  it("lists only non-zero parts, with principal named as not a fee", () => {
    const mixed = rec("m", { components: { principal: 1000, fee: 25, tax: 5, interest: 0 } }, { amount: 1030 });
    expect(buildFeeDetail(mixed.key, [mixed])!.parts.map((p) => p.label)).toEqual(["Purchase (not a fee)", "Fee", "GST / tax on the fee"]);
  });
});

describe("masking and links", () => {
  it("never shows more than the last four digits", () => {
    expect(maskedAccountLabel({ name: "HDFC Savings", last4: "1234" })).toBe("HDFC Savings ••1234");
    expect(maskedAccountLabel({ name: "Old", accountNumber: "50100012345678" })).toBe("Old ••5678");
    expect(maskedAccountLabel({ name: "Cash" })).toBe("Cash");
    expect(maskedAccountLabel({ name: "", displayName: "Card", accountNumber: "XXXX-XXXX-9876" })).toBe("Card ••9876");
    expect(maskedAccountLabel(undefined)).toBeUndefined();
    expect(maskedAccountLabel({ name: "HDFC", accountNumber: "50100012345678" })).not.toMatch(/\d{5,}/);
  });

  it("builds a round-trippable detail link and finds the fee behind a transaction", () => {
    expect(feeDetailHref("expense__a b")).toBe("/fees/expense__a%20b");
    expect(decodeURIComponent(feeDetailHref(fee.key).slice(6))).toBe(fee.key);
    expect(feeRecordForTransaction(RECORDS, { kind: "income", id: "rev" })?.key).toBe("income__rev");
    expect(feeRecordForTransaction(RECORDS, { kind: "expense", id: "zzz" })).toBeUndefined();
  });

  it("describes provenance", () => {
    expect(feeProvenanceText(fee)).toBe("Detected by Spendly (rules v1) with 92% confidence.");
    const reviewed = rec("r", { provenance: { origin: "user", ruleIds: [], reviewRevision: 2, reviewedAtMs: Date.UTC(2026, 8, 12) } });
    expect(feeProvenanceText(reviewed)).toBe("Reviewed by you on 2026-09-12 (revision 2).");
  });
});
