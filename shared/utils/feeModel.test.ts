import { describe, expect, it } from "vitest";

import type {
  FeeInference,
  FeeRecord,
  FeeReview,
  FeeSourceSnapshot,
} from "../types/fee";
import {
  FEE_CANDIDATE_MIN_CONFIDENCE,
  FEE_INFERRED_MIN_CONFIDENCE,
  FEE_REVIEW_HISTORY_LIMIT,
  buildFeeReview,
  countsTowardFeeTotals,
  defaultFeeComponents,
  feeComponentTotals,
  feeComponentsMatchAmount,
  feeReviewDocId,
  feeStatusForConfidence,
  needsFeeReview,
  parseFeeReviewDocId,
  reconcileFeeLinks,
  resolveFeeRecord,
  validateFeeClassification,
} from "./feeModel";

function src(
  id: string,
  amount: number,
  direction: "debit" | "credit" = "debit",
  kind: FeeSourceSnapshot["ref"]["kind"] = direction === "debit" ? "expense" : "income"
): FeeSourceSnapshot {
  return { ref: { kind, id }, date: "2026-09-10", amount, direction, currency: "INR" };
}

function inference(
  source: FeeSourceSnapshot,
  overrides: Partial<FeeInference> = {}
): FeeInference {
  return {
    source,
    role: "fee",
    feeType: "atm_cash",
    components: defaultFeeComponents("fee", source.amount),
    confidence: 0.9,
    evidence: [{ signal: "keyword", ruleId: "kw.atm", detail: "Note mentions ATM charge", weight: 0.6 }],
    engineVersion: 1,
    ...overrides,
  };
}

function review(source: FeeSourceSnapshot, overrides: Partial<FeeReview> = {}): FeeReview {
  return {
    id: feeReviewDocId(source.ref),
    sourceKind: source.ref.kind,
    sourceId: source.ref.id,
    decision: "confirm",
    role: "fee",
    feeType: "atm_cash",
    components: defaultFeeComponents("fee", source.amount),
    sourceAmount: source.amount,
    revision: 1,
    createdAtMs: 1,
    updatedAtMs: 1,
    ...overrides,
  };
}

function resolved(
  source: FeeSourceSnapshot,
  inf?: Partial<FeeInference> | null,
  rev?: Partial<FeeReview> | null
): FeeRecord {
  const record = resolveFeeRecord({
    source,
    inference: inf === null ? null : inference(source, inf ?? {}),
    review: rev ? review(source, rev) : null,
  });
  if (!record) throw new Error("expected a record");
  return record;
}

describe("review doc ids", () => {
  it("round-trips every transaction kind", () => {
    for (const kind of ["expense", "income", "payment", "borrowingRepayment"] as const) {
      const id = feeReviewDocId({ kind, id: "abc_123" });
      expect(parseFeeReviewDocId(id)).toEqual({ kind, id: "abc_123" });
    }
  });

  it("rejects malformed ids", () => {
    expect(parseFeeReviewDocId("abc")).toBeNull();
    expect(parseFeeReviewDocId("__abc")).toBeNull();
    expect(parseFeeReviewDocId("bogus__abc")).toBeNull();
    expect(parseFeeReviewDocId("expense__")).toBeNull();
  });
});

describe("components partition the source amount", () => {
  it("defaults each role to the matching part", () => {
    expect(defaultFeeComponents("fee", 20)).toEqual({ principal: 0, fee: 20, tax: 0, interest: 0 });
    expect(defaultFeeComponents("tax_on_fee", 3.6)).toEqual({ principal: 0, fee: 0, tax: 3.6, interest: 0 });
    expect(defaultFeeComponents("interest", 410)).toEqual({ principal: 0, fee: 0, tax: 0, interest: 410 });
    expect(defaultFeeComponents("not_fee", 999)).toEqual({ principal: 999, fee: 0, tax: 0, interest: 0 });
  });

  it("tolerates float residue but not a paisa of drift", () => {
    expect(feeComponentsMatchAmount({ principal: 0, fee: 20, tax: 3.6, interest: 0 }, 23.6)).toBe(true);
    expect(feeComponentsMatchAmount({ principal: 0.1, fee: 0.2, tax: 0, interest: 0 }, 0.3)).toBe(true);
    expect(feeComponentsMatchAmount({ principal: 0, fee: 20, tax: 3.59, interest: 0 }, 23.6)).toBe(false);
  });
});

describe("validateFeeClassification", () => {
  const debit = src("e1", 23.6);

  it("accepts a fee with GST folded into the same transaction", () => {
    expect(
      validateFeeClassification(
        { role: "fee", feeType: "atm_cash", components: { principal: 0, fee: 20, tax: 3.6, interest: 0 } },
        debit
      )
    ).toEqual([]);
  });

  it("accepts a purchase with an embedded convenience fee", () => {
    const s = src("e2", 1030);
    expect(
      validateFeeClassification(
        {
          role: "fee",
          feeType: "payment_upi",
          subtype: "convenience_fee",
          components: { principal: 1000, fee: 25.42, tax: 4.58, interest: 0 },
        },
        s
      )
    ).toEqual([]);
  });

  it("rejects components that do not add up or go negative", () => {
    expect(
      validateFeeClassification(
        { role: "fee", feeType: "atm_cash", components: { principal: 0, fee: 20, tax: 0, interest: 0 } },
        debit
      )
    ).toContain("components_do_not_sum");
    expect(
      validateFeeClassification(
        { role: "fee", feeType: "atm_cash", components: { principal: -5, fee: 28.6, tax: 0, interest: 0 } },
        debit
      )
    ).toContain("negative_component");
  });

  it("requires a fee type on a fee and a valid subtype for that type", () => {
    const c = defaultFeeComponents("fee", 23.6);
    expect(validateFeeClassification({ role: "fee", components: c }, debit)).toContain("fee_type_required");
    expect(
      validateFeeClassification({ role: "fee", feeType: "atm_cash", subtype: "annual_fee", components: c }, debit)
    ).toContain("invalid_subtype");
  });

  it("keeps GST-on-fee tied to a fee and out of the fee column", () => {
    const gst = src("e3", 3.6);
    expect(
      validateFeeClassification({ role: "tax_on_fee", components: defaultFeeComponents("tax_on_fee", 3.6) }, gst)
    ).toContain("link_required");
    expect(
      validateFeeClassification(
        { role: "tax_on_fee", components: { principal: 0, fee: 3.6, tax: 0, interest: 0 }, linkedTo: { kind: "expense", id: "e1" } },
        gst
      )
    ).toContain("role_component_mismatch");
    expect(
      validateFeeClassification(
        { role: "tax_on_fee", components: defaultFeeComponents("tax_on_fee", 3.6), linkedTo: { kind: "expense", id: "e1" } },
        gst
      )
    ).toEqual([]);
  });

  it("keeps interest separate from fees", () => {
    const s = src("e4", 410);
    expect(
      validateFeeClassification({ role: "interest", components: { principal: 0, fee: 410, tax: 0, interest: 0 } }, s)
    ).toContain("role_component_mismatch");
    expect(validateFeeClassification({ role: "interest", components: defaultFeeComponents("interest", 410) }, s)).toEqual([]);
  });

  it("enforces direction: fees are debits, reversals are credits", () => {
    const credit = src("i1", 23.6, "credit");
    expect(
      validateFeeClassification({ role: "fee", feeType: "atm_cash", components: defaultFeeComponents("fee", 23.6) }, credit)
    ).toContain("direction_mismatch");
    expect(
      validateFeeClassification(
        { role: "reversal", components: defaultFeeComponents("reversal", 23.6), linkedTo: { kind: "expense", id: "e1" } },
        debit
      )
    ).toContain("direction_mismatch");
  });

  it("requires a credit to name what it reverses, and forbids self-links", () => {
    const credit = src("i1", 23.6, "credit");
    expect(
      validateFeeClassification({ role: "refund", components: defaultFeeComponents("refund", 23.6) }, credit)
    ).toContain("link_required");
    expect(
      validateFeeClassification({ role: "refund", feeType: "atm_cash", components: defaultFeeComponents("refund", 23.6) }, credit)
    ).toEqual([]);
    expect(
      validateFeeClassification(
        { role: "reversal", components: defaultFeeComponents("reversal", 23.6), linkedTo: { kind: "income", id: "i1" } },
        credit
      )
    ).toContain("self_link");
  });

  it("allows not_fee only as pure principal", () => {
    expect(validateFeeClassification({ role: "not_fee", components: defaultFeeComponents("not_fee", 23.6) }, debit)).toEqual([]);
    expect(
      validateFeeClassification({ role: "not_fee", components: { principal: 20, fee: 3.6, tax: 0, interest: 0 } }, debit)
    ).toContain("role_component_mismatch");
  });
});

describe("confidence gates", () => {
  it("maps confidence to lifecycle status", () => {
    expect(feeStatusForConfidence(FEE_INFERRED_MIN_CONFIDENCE)).toBe("inferred");
    expect(feeStatusForConfidence(0.99)).toBe("inferred");
    expect(feeStatusForConfidence(FEE_CANDIDATE_MIN_CONFIDENCE)).toBe("uncertain");
    expect(feeStatusForConfidence(0.79)).toBe("uncertain");
    expect(feeStatusForConfidence(0.39)).toBeNull();
  });
});

describe("resolveFeeRecord", () => {
  const s = src("e1", 23.6);

  it("returns nothing when neither engine nor user says anything", () => {
    expect(resolveFeeRecord({ source: s })).toBeNull();
    expect(resolveFeeRecord({ source: s, inference: inference(s, { confidence: 0.2 }) })).toBeNull();
  });

  it("counts a high-confidence inference and keeps its evidence and provenance", () => {
    const r = resolved(s);
    expect(r.status).toBe("inferred");
    expect(countsTowardFeeTotals(r)).toBe(true);
    expect(r.evidence).toHaveLength(1);
    expect(r.provenance).toEqual({ origin: "rule", engineVersion: 1, ruleIds: ["kw.atm"] });
    expect(r.key).toBe("expense__e1");
  });

  it("never silently counts an ambiguous inference", () => {
    const r = resolved(s, { confidence: 0.6 });
    expect(r.status).toBe("uncertain");
    expect(r.uncertainReason).toBe("ambiguous");
    expect(countsTowardFeeTotals(r)).toBe(false);
    expect(needsFeeReview(r)).toBe(true);
  });

  it("downgrades an internally inconsistent inference even at high confidence", () => {
    const r = resolved(s, { components: { principal: 0, fee: 1, tax: 0, interest: 0 } });
    expect(r.status).toBe("uncertain");
    expect(r.uncertainReason).toBe("conflicting_signals");
  });

  it("honours an engine-raised conflict", () => {
    expect(resolved(s, { uncertainReason: "conflicting_signals" }).status).toBe("uncertain");
  });

  it("lets a confirmation win and records it as user provenance", () => {
    const r = resolved(s, { confidence: 0.6 }, { decision: "confirm", revision: 2, updatedAtMs: 50 });
    expect(r.status).toBe("confirmed");
    expect(r.confidence).toBe(1);
    expect(r.evidence[0].signal).toBe("user");
    expect(r.evidence).toHaveLength(2);
    expect(r.provenance).toMatchObject({
      origin: "user",
      reviewId: "expense__e1",
      reviewRevision: 2,
      reviewedAtMs: 50,
      ruleIds: ["kw.atm"],
    });
  });

  it("lets a correction override type, split and role", () => {
    const r = resolved(
      s,
      { feeType: "atm_cash" },
      {
        decision: "correct",
        feeType: "bank_service",
        subtype: "sms_alerts",
        components: { principal: 0, fee: 20, tax: 3.6, interest: 0 },
      }
    );
    expect(r.status).toBe("user_corrected");
    expect(r.feeType).toBe("bank_service");
    expect(r.subtype).toBe("sms_alerts");
    expect(r.components.tax).toBe(3.6);
  });

  it("makes 'not a fee' stick over a confident inference", () => {
    const r = resolved(s, { confidence: 0.99 }, { decision: "not_fee", role: "fee", feeType: "atm_cash" });
    expect(r.role).toBe("not_fee");
    expect(r.feeType).toBeUndefined();
    expect(r.components).toEqual(defaultFeeComponents("not_fee", 23.6));
    expect(countsTowardFeeTotals(r)).toBe(false);
    expect(needsFeeReview(r)).toBe(false);
  });

  it("applies a review even when the engine no longer detects anything", () => {
    expect(resolved(s, null, { decision: "confirm" }).status).toBe("confirmed");
  });

  it("drops a review to uncertain when the source amount has since changed", () => {
    const edited = src("e1", 30);
    const r = resolveFeeRecord({ source: edited, inference: inference(edited), review: review(s) });
    expect(r?.status).toBe("uncertain");
    expect(r?.uncertainReason).toBe("source_changed");
    expect(countsTowardFeeTotals(r!)).toBe(false);
  });

  it("does not re-queue a 'not a fee' decision after an amount edit", () => {
    const edited = src("e1", 30);
    const r = resolveFeeRecord({ source: edited, review: review(s, { decision: "not_fee" }) });
    expect(r?.status).toBe("user_corrected");
    expect(r?.components.principal).toBe(30);
  });
});

describe("reconcileFeeLinks", () => {
  const fee = src("fee1", 20);
  const gst = src("gst1", 3.6);
  const rev = src("rev1", 23.6, "credit");
  const gstInf = {
    role: "tax_on_fee" as const,
    feeType: undefined,
    components: defaultFeeComponents("tax_on_fee", 3.6),
    linkedTo: fee.ref,
  };

  it("keeps GST linked to a counted fee", () => {
    const out = reconcileFeeLinks([resolved(fee), resolved(gst, gstInf)]);
    expect(out.every(countsTowardFeeTotals)).toBe(true);
  });

  it("marks GST whose fee is missing or uncertain as a broken link", () => {
    const orphan = reconcileFeeLinks([resolved(gst, gstInf)]);
    expect(orphan[0].uncertainReason).toBe("broken_link");
    const weak = reconcileFeeLinks([resolved(fee, { confidence: 0.5 }), resolved(gst, gstInf)]);
    expect(weak.find((r) => r.key === "expense__gst1")?.status).toBe("uncertain");
  });

  it("stops a reversal from cancelling a fee the user said was not a fee", () => {
    const out = reconcileFeeLinks([
      resolved(fee, {}, { decision: "not_fee" }),
      resolved(rev, { role: "reversal", components: defaultFeeComponents("reversal", 23.6), linkedTo: fee.ref }),
    ]);
    expect(out.find((r) => r.key === "income__rev1")?.uncertainReason).toBe("broken_link");
  });

  it("de-duplicates by transaction key", () => {
    const a = resolved(fee);
    expect(reconcileFeeLinks([a, { ...a }])).toHaveLength(1);
  });
});

describe("feeComponentTotals", () => {
  it("separates fee, GST and interest, nets reversals, and never reads principal", () => {
    const records = reconcileFeeLinks([
      // ATM fee with GST in the same debit
      resolved(src("a", 23.6), { components: { principal: 0, fee: 20, tax: 3.6, interest: 0 } }),
      // Purchase with a convenience fee inside it — principal must not leak
      resolved(src("b", 1030), {
        feeType: "payment_upi",
        components: { principal: 1000, fee: 25.42, tax: 4.58, interest: 0 },
      }),
      // Card annual fee, with its GST posted as a separate debit
      resolved(src("c", 500), { feeType: "credit_card" }),
      resolved(src("d", 90), {
        role: "tax_on_fee",
        feeType: undefined,
        components: defaultFeeComponents("tax_on_fee", 90),
        linkedTo: { kind: "expense", id: "c" },
      }),
      // Finance charge
      resolved(src("e", 410), { role: "interest", feeType: undefined, components: defaultFeeComponents("interest", 410) }),
      // Provider reverses the ATM fee + GST
      resolved(src("f", 23.6, "credit"), {
        role: "reversal",
        components: { principal: 0, fee: 20, tax: 3.6, interest: 0 },
        linkedTo: { kind: "expense", id: "a" },
      }),
      // Ambiguous candidate — must not count
      resolved(src("g", 150), { confidence: 0.5 }),
      // Ordinary spend the user rejected
      resolved(src("h", 5000), {}, { decision: "not_fee" }),
    ]);

    expect(feeComponentTotals(records)).toEqual({
      fee: 545.42,
      tax: 98.18,
      interest: 410,
      reversedFee: 20,
      reversedTax: 3.6,
      reversedInterest: 0,
      netFee: 525.42,
      netTax: 94.58,
      netInterest: 410,
      count: 6,
    });
  });

  it("counts a duplicated record once", () => {
    const r = resolved(src("a", 20));
    expect(feeComponentTotals([r, r]).fee).toBe(20);
  });

  it("is zero for an empty history", () => {
    expect(feeComponentTotals([]).count).toBe(0);
    expect(feeComponentTotals([]).netFee).toBe(0);
  });
});

describe("buildFeeReview", () => {
  const s = src("e1", 23.6);

  it("builds a first revision with provenance from the inference", () => {
    const inf = inference(s, { confidence: 0.6 });
    const out = buildFeeReview({
      source: s,
      decision: "correct",
      classification: {
        role: "fee",
        feeType: "atm_cash",
        subtype: "other_bank_atm",
        components: { principal: 0, fee: 20, tax: 3.6, interest: 0 },
      },
      inference: inf,
      note: "  Other bank ATM in Pune  ",
      nowMs: 100,
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.docId).toBe("expense__e1");
    expect(out.review).toMatchObject({
      sourceKind: "expense",
      sourceId: "e1",
      decision: "correct",
      subtype: "other_bank_atm",
      sourceAmount: 23.6,
      inferredRole: "fee",
      inferredFeeType: "atm_cash",
      inferredConfidence: 0.6,
      engineVersion: 1,
      note: "Other bank ATM in Pune",
      revision: 1,
      createdAtMs: 100,
      updatedAtMs: 100,
    });
    expect(out.review).not.toHaveProperty("amount");
  });

  it("advances the revision and keeps the original creation time", () => {
    const out = buildFeeReview({
      source: s,
      decision: "confirm",
      classification: { role: "fee", feeType: "atm_cash", components: defaultFeeComponents("fee", 23.6) },
      previous: review(s, { revision: 3, createdAtMs: 7 }),
      nowMs: 200,
    });
    expect(out.ok && out.review.revision).toBe(4);
    expect(out.ok && out.review.createdAtMs).toBe(7);
  });

  it("keeps the previous state as correction history, oldest first and capped", () => {
    const first = buildFeeReview({
      source: s,
      decision: "confirm",
      classification: { role: "fee", feeType: "atm_cash", components: defaultFeeComponents("fee", 23.6) },
      nowMs: 10,
    });
    if (!first.ok) throw new Error("expected ok");
    expect(first.review.history).toBeUndefined();

    const second = buildFeeReview({
      source: s,
      decision: "correct",
      classification: {
        role: "fee",
        feeType: "bank_service",
        components: { principal: 0, fee: 20, tax: 3.6, interest: 0 },
      },
      previous: { ...first.review, id: first.docId },
      nowMs: 20,
    });
    if (!second.ok) throw new Error("expected ok");
    expect(second.review.history).toEqual([
      { revision: 1, decision: "confirm", role: "fee", feeType: "atm_cash", components: defaultFeeComponents("fee", 23.6), atMs: 10 },
    ]);

    const long = review(s, {
      revision: 30,
      history: Array.from({ length: FEE_REVIEW_HISTORY_LIMIT }, (_, i) => ({
        revision: i + 1,
        decision: "confirm" as const,
        role: "fee" as const,
        components: defaultFeeComponents("fee", 23.6),
        atMs: i,
      })),
    });
    const capped = buildFeeReview({
      source: s,
      decision: "not_fee",
      classification: { role: "not_fee", components: defaultFeeComponents("not_fee", 23.6) },
      previous: long,
      nowMs: 99,
    });
    if (!capped.ok) throw new Error("expected ok");
    expect(capped.review.history).toHaveLength(FEE_REVIEW_HISTORY_LIMIT);
    expect(capped.review.history?.[0].revision).toBe(2);
    expect(capped.review.history?.at(-1)?.revision).toBe(30);
  });

  it("normalises 'not a fee' to pure principal whatever the form sent", () => {
    const out = buildFeeReview({
      source: s,
      decision: "not_fee",
      classification: { role: "fee", feeType: "atm_cash", components: defaultFeeComponents("fee", 23.6) },
      nowMs: 1,
    });
    expect(out.ok && out.review.role).toBe("not_fee");
    expect(out.ok && out.review.components.principal).toBe(23.6);
    expect(out.ok && out.review.feeType).toBeUndefined();
  });

  it("refuses an inconsistent classification", () => {
    const out = buildFeeReview({
      source: s,
      decision: "correct",
      classification: { role: "fee", feeType: "atm_cash", components: defaultFeeComponents("fee", 20) },
      nowMs: 1,
    });
    expect(out).toEqual({ ok: false, issues: ["components_do_not_sum"] });
  });
});
