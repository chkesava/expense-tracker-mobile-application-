import { describe, expect, it } from "vitest";

import {
  salaryComponentBreakdownSchema,
  salaryProfileSchema,
  salaryRecordSchema,
  salaryReviewSchema,
} from "../schemas";
import {
  SalaryComponentBreakdown,
  SalaryProfile,
  SalaryRecord,
  SalaryReview,
} from "../types";
import {
  buildSalaryProfile,
  buildSalaryRecord,
  buildSalaryReview,
  reconcileSalaryBreakdown,
  softDeleteSalaryRecord,
  updateSalaryRecord,
} from "./builders";

describe("Salary Domain Builders & Invariants (SPENDLY-325)", () => {
  const baseRecordDraft: Omit<SalaryRecord, "createdAtMs" | "updatedAtMs"> = {
    id: "rec_2026_10",
    month: "2026-10",
    payPeriod: {
      month: "2026-10",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    },
    employer: {
      name: "Acme India Pvt Ltd",
      rawName: "ACME INDIA CORP SAL",
      normalizedName: "Acme India",
    },
    netAmount: 125000,
    grossAmount: 150000,
    currency: "INR",
    paymentDate: "2026-10-31",
    transactionId: "inc_999",
    type: "regular",
    status: "detected",
    confidence: "high",
    evidence: ["Narration contains SAL", "Matches recurring payday pattern"],
    provenance: {
      source: "detection",
      detectionRule: "payroll_narration_recurring",
    },
  };

  it("builds a canonical salary record stamping createdAtMs and updatedAtMs", () => {
    const now = 1790000000000;
    const record = buildSalaryRecord(baseRecordDraft, now);

    expect(record.createdAtMs).toBe(now);
    expect(record.updatedAtMs).toBe(now);
    expect(record.netAmount).toBe(125000);
    expect(record.grossAmount).toBe(150000);
    expect(record.type).toBe("regular");

    const parsed = salaryRecordSchema.safeParse(record);
    expect(parsed.success).toBe(true);
  });

  it("never conflates gross and net: bank credits are strictly netAmount", () => {
    const netOnlyDraft: Omit<SalaryRecord, "createdAtMs" | "updatedAtMs"> = {
      ...baseRecordDraft,
      grossAmount: null,
      breakdown: undefined,
    };
    const record = buildSalaryRecord(netOnlyDraft);

    expect(record.netAmount).toBe(125000);
    expect(record.grossAmount).toBeNull();
    expect(record.breakdown).toBeUndefined();

    // Net must be positive; gross can be null/absent when not known
    const parsed = salaryRecordSchema.safeParse(record);
    expect(parsed.success).toBe(true);
  });

  it("separately represents variable pay and supports breakdown reconciliation", () => {
    const breakdown: SalaryComponentBreakdown = {
      grossSalary: 150000,
      variablePay: 10000,
      allowances: {
        basic: 75000,
        hra: 35000,
        special: 40000,
      },
      deductions: {
        tds: 20000,
        epf: 9000,
        professionalTax: 200,
        other: 5800,
      },
      netSalary: 125000, // 150000 + 10000 - (20000 + 9000 + 200 + 5800) = 160000 - 35000 = 125000
    };

    expect(reconcileSalaryBreakdown(breakdown)).toBe(true);

    const record = buildSalaryRecord({
      ...baseRecordDraft,
      breakdown,
    });
    expect(record.breakdown?.reconciled).toBe(true);
  });

  it("allows pay periods to differ from payment dates (e.g. Sep salary paid on Oct 1)", () => {
    const sepRecord = buildSalaryRecord({
      ...baseRecordDraft,
      payPeriod: {
        month: "2026-09",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
      },
      paymentDate: "2026-10-01", // Paid on 1st of next month
    });

    expect(sepRecord.payPeriod.month).toBe("2026-09");
    expect(sepRecord.paymentDate).toBe("2026-10-01");
    expect(salaryRecordSchema.safeParse(sepRecord).success).toBe(true);
  });

  it("soft deletes salary record preserving createdAtMs", () => {
    const record = buildSalaryRecord(baseRecordDraft, 1000);
    const deleted = softDeleteSalaryRecord(record, "2026-11-01", 2000);

    expect(deleted.deletedAt).toBe("2026-11-01");
    expect(deleted.createdAtMs).toBe(1000);
    expect(deleted.updatedAtMs).toBe(2000);
  });

  it("builds a salary profile and validates expected payday window", () => {
    const profileDraft: Omit<SalaryProfile, "createdAtMs" | "updatedAtMs"> = {
      id: "primary",
      primaryEmployer: "Acme India Pvt Ltd",
      expectedPaydayWindow: {
        startDay: 28,
        endDay: 31,
      },
      frequency: "monthly",
      notificationEnabled: true,
      notes: "Direct deposit to HDFC Salary Account",
    };

    const profile = buildSalaryProfile(profileDraft, 1790000000000);
    expect(profile.frequency).toBe("monthly");
    expect(profile.expectedPaydayWindow.startDay).toBe(28);

    const parsed = salaryProfileSchema.safeParse(profile);
    expect(parsed.success).toBe(true);
  });

  it("builds a candidate review override with deterministic id", () => {
    const reviewDraft: Omit<SalaryReview, "id" | "createdAtMs" | "updatedAtMs"> = {
      refKey: "income:inc_123",
      decision: "reject",
      rejectionReason: "transfer",
      sourceAmount: 50000,
      sourceDate: "2026-10-15",
    };

    const review = buildSalaryReview(reviewDraft, 1790000000000);
    expect(review.id).toBe("income__inc_123");
    expect(review.decision).toBe("reject");
    expect(review.rejectionReason).toBe("transfer");

    const parsed = salaryReviewSchema.safeParse(review);
    expect(parsed.success).toBe(true);
  });
});
