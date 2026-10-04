import { describe, expect, it } from "vitest";

import type { FeeRecord } from "../types/fee";
import { defaultFeeComponents } from "./feeModel";
import {
  bulkReviewPlan,
  decisionFor,
  describeHistoryEntry,
  draftForRole,
  draftFromRecord,
  draftRemainder,
  draftToClassification,
  draftWithFeeType,
  draftWithGstIncluded,
  feeIssueMessage,
  feeLinkOptions,
  feeRecordTitle,
  feeRolesFor,
  feeStatusPresentation,
  sortForReview,
  uncertainReasonText,
} from "./feeReviewForm";

function record(id: string, over: Partial<FeeRecord> = {}, src: Partial<FeeRecord["source"]> = {}): FeeRecord {
  const source = {
    ref: { kind: "expense" as const, id },
    date: "2026-09-10",
    amount: 23.6,
    direction: "debit" as const,
    currency: "INR",
    accountId: "hdfc",
    ...src,
  };
  return {
    key: `${source.ref.kind}__${id}`,
    source,
    role: "fee",
    feeType: "atm_cash",
    components: defaultFeeComponents("fee", source.amount),
    status: "inferred",
    confidence: 0.9,
    evidence: [],
    provenance: { origin: "rule", ruleIds: [] },
    ...over,
  };
}

describe("labels", () => {
  it("never renders two statuses alike", () => {
    const labels = (["inferred", "uncertain", "confirmed", "user_corrected"] as const).map(
      (s) => feeStatusPresentation(s).label
    );
    expect(new Set(labels).size).toBe(4);
    expect(feeStatusPresentation("uncertain").tone).toBe("warning");
  });

  it("titles records by type and role", () => {
    expect(feeRecordTitle({ role: "fee", feeType: "atm_cash", subtype: "other_bank_atm" })).toBe("ATM / cash withdrawal · Other bank's ATM");
    expect(feeRecordTitle({ role: "tax_on_fee", feeType: "credit_card" })).toBe("GST on a fee · Credit card");
    expect(feeRecordTitle({ role: "interest" })).toBe("Interest");
  });

  it("offers roles that fit the money direction", () => {
    expect(feeRolesFor("debit")).not.toContain("reversal");
    expect(feeRolesFor("credit")).not.toContain("fee");
  });

  it("explains every issue and reason", () => {
    expect(feeIssueMessage("components_do_not_sum")).toMatch(/add up/);
    expect(feeIssueMessage("invalid_amount")).toMatch(/numbers/);
    expect(uncertainReasonText("source_changed")).toMatch(/changed/);
    expect(uncertainReasonText(undefined)).toBeUndefined();
  });
});

describe("draft round-trip", () => {
  it("submitting the engine's reading unchanged is a confirmation", () => {
    const r = record("a");
    const out = draftToClassification(draftFromRecord(r), r);
    expect(out.ok).toBe(true);
    if (out.ok) expect(decisionFor(r, out.classification)).toBe("confirm");
  });

  it("changing type is a correction", () => {
    const r = record("a");
    const out = draftToClassification(draftWithFeeType(draftFromRecord(r), "bank_service"), r);
    expect(out.ok && decisionFor(r, out.classification)).toBe("correct");
  });

  it("changing type drops a subtype that no longer applies", () => {
    const d = draftWithFeeType({ ...draftFromRecord(record("a")), subtype: "other_bank_atm" }, "cheque");
    expect(d.subtype).toBeUndefined();
  });

  it("splits fee and GST at 18% and stays exact", () => {
    const r = record("a");
    const d = draftWithGstIncluded(draftFromRecord(r));
    expect(d.fee).toBe("20");
    expect(d.tax).toBe("3.6");
    expect(draftRemainder(d, 23.6)).toBe(0);
    const out = draftToClassification(d, r);
    expect(out.ok && out.classification.components).toEqual({ principal: 0, fee: 20, tax: 3.6, interest: 0 });
    expect(out.ok && decisionFor(r, out.classification)).toBe("correct");
  });

  it("leaves principal alone when splitting an embedded fee", () => {
    const r = record("a", {}, { amount: 1030 });
    const d = draftWithGstIncluded({ ...draftFromRecord(r), principal: "1000", fee: "30" });
    expect(draftRemainder(d, 1030)).toBe(0);
    expect(d.principal).toBe("1000");
  });

  it("reports the remainder and rejects bad input", () => {
    const r = record("a");
    const d = { ...draftFromRecord(r), fee: "20" };
    expect(draftRemainder(d, 23.6)).toBe(3.6);
    expect(draftToClassification(d, r)).toEqual({ ok: false, issues: ["components_do_not_sum"] });
    expect(draftToClassification({ ...d, fee: "abc" }, r)).toEqual({ ok: false, issues: ["invalid_amount"] });
    expect(draftToClassification({ ...d, fee: "1.234" }, r)).toEqual({ ok: false, issues: ["invalid_amount"] });
    expect(draftRemainder({ ...d, fee: "x" }, 23.6)).toBeNull();
  });

  it("accepts comma-grouped amounts", () => {
    const r = record("a", {}, { amount: 1180 });
    const out = draftToClassification({ ...draftFromRecord(r), fee: "1,000", tax: "180" }, r);
    expect(out.ok).toBe(true);
  });

  it("re-allocates the amount when the role changes", () => {
    const r = record("a");
    const d = draftForRole(draftFromRecord(r), "interest", 23.6);
    expect(d).toMatchObject({ role: "interest", interest: "23.6", fee: "", feeType: undefined, linkedKey: null });
    const nf = draftToClassification(draftForRole(d, "not_fee", 23.6), r);
    expect(nf.ok && decisionFor(r, nf.classification)).toBe("not_fee");
  });

  it("requires a link for GST and validates it", () => {
    const gst = record("g", { role: "tax_on_fee", feeType: undefined, components: defaultFeeComponents("tax_on_fee", 3.6) }, { amount: 3.6 });
    const d = draftFromRecord(gst);
    expect(draftToClassification(d, gst)).toEqual({ ok: false, issues: ["link_required"] });
    const linked = draftToClassification({ ...d, linkedKey: "expense__fee1" }, gst);
    expect(linked.ok && linked.classification.linkedTo).toEqual({ kind: "expense", id: "fee1" });
    expect(draftToClassification({ ...d, linkedKey: "expense__g" }, gst)).toEqual({ ok: false, issues: ["self_link"] });
  });

  it("detects a changed link as a correction", () => {
    const rev = record("r", {
      role: "reversal",
      components: defaultFeeComponents("reversal", 20),
      linkedTo: { kind: "expense", id: "f1" },
    }, { direction: "credit", amount: 20, ref: { kind: "income", id: "r" } });
    const same = draftToClassification(draftFromRecord(rev), rev);
    expect(same.ok && decisionFor(rev, same.classification)).toBe("confirm");
    const moved = draftToClassification({ ...draftFromRecord(rev), linkedKey: "expense__f2" }, rev);
    expect(moved.ok && decisionFor(rev, moved.classification)).toBe("correct");
    const unlinked = draftToClassification({ ...draftFromRecord(rev), linkedKey: null }, rev);
    expect(unlinked.ok && decisionFor(rev, unlinked.classification)).toBe("correct");
  });
});

describe("feeLinkOptions", () => {
  const fees = [
    record("near", {}, { date: "2026-09-09" }),
    record("far", {}, { date: "2026-01-01" }),
    record("otherAcct", {}, { date: "2026-09-10", accountId: "card" }),
    record("weak", { status: "uncertain" }, { date: "2026-09-10" }),
    record("interest", { role: "interest" }, { date: "2026-09-10" }),
    record("later", {}, { date: "2026-09-12" }),
  ];

  it("offers GST links within a week on the same account, closest first", () => {
    const gst = record("g", { role: "tax_on_fee" }, { amount: 3.6 });
    expect(feeLinkOptions(gst, fees).map((r) => r.source.ref.id)).toEqual(["near", "later"]);
  });

  it("offers reversal links only to earlier fees within 180 days", () => {
    const rev = record("r", { role: "reversal" }, { direction: "credit", date: "2026-09-11", ref: { kind: "income", id: "r" } });
    expect(feeLinkOptions(rev, fees).map((r) => r.source.ref.id)).toEqual(["near"]);
  });

  it("offers nothing for roles that don't link", () => {
    expect(feeLinkOptions(record("x"), fees)).toEqual([]);
    expect(feeLinkOptions(record("x"), fees, "tax_on_fee").length).toBeGreaterThan(0);
  });
});

describe("bulkReviewPlan", () => {
  const ok = record("ok", { status: "uncertain", uncertainReason: "ambiguous" });
  const bad = record("bad", { status: "uncertain", uncertainReason: "conflicting_signals", components: defaultFeeComponents("fee", 1) });
  const stale = record("stale", { status: "uncertain", uncertainReason: "source_changed" });
  const orphan = record("orphan", { status: "uncertain", uncertainReason: "broken_link" });

  it("confirms only internally valid readings", () => {
    const plan = bulkReviewPlan([ok, bad, stale, orphan], "confirm");
    expect(plan.ready.map((r) => r.record.key)).toEqual(["expense__ok"]);
    expect(plan.ready[0].decision).toBe("confirm");
    expect(plan.skipped).toHaveLength(3);
  });

  it("applies 'not a fee' to everything", () => {
    const plan = bulkReviewPlan([ok, bad], "not_fee");
    expect(plan.skipped).toEqual([]);
    expect(plan.ready.every((r) => r.classification.components.principal === r.record.source.amount)).toBe(true);
  });
});

describe("ordering and history", () => {
  it("puts candidates first, newest first", () => {
    const out = sortForReview([
      record("a", {}, { date: "2026-09-12" }),
      record("b", { status: "uncertain" }, { date: "2026-09-01" }),
      record("c", { status: "uncertain" }, { date: "2026-09-05" }),
    ]);
    expect(out.map((r) => r.source.ref.id)).toEqual(["c", "b", "a"]);
  });

  it("describes history entries", () => {
    expect(
      describeHistoryEntry({ revision: 2, decision: "correct", role: "fee", feeType: "bank_service", components: defaultFeeComponents("fee", 1), atMs: 1 })
    ).toBe("Revision 2: Corrected as Bank service charge");
    expect(
      describeHistoryEntry({ revision: 1, decision: "not_fee", role: "not_fee", components: defaultFeeComponents("not_fee", 1), atMs: 1 })
    ).toBe("Revision 1: Marked not a fee");
  });
});
