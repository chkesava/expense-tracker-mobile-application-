import { describe, expect, it } from "vitest";
import type { SalaryCandidate, SalaryRecord, SalaryReview } from "../types";
import {
  applySalaryRecordCorrection,
  buildConfirmedRecordFromCandidate,
  buildReviewDocId,
  buildSalaryReviewDoc,
  resolveCandidateResolution,
} from "./review";

describe("Salary Review & Correction Utilities (SPENDLY-327)", () => {
  const baseCandidate: SalaryCandidate = {
    incomeId: "inc_001",
    amount: 120000,
    date: "2026-10-31",
    payPeriod: { month: "2026-10" },
    employer: {
      name: "Acme Technologies",
      rawName: "ACME CORP SAL",
      normalizedName: "acme technologies",
    },
    confidence: "high",
    evidence: ["Narration contains SAL"],
    detectionRule: "rule_explicit_payroll_signal",
    suggestedType: "regular",
    rawNarration: "CMS/001/ACME CORP SAL OCT 2026",
  };

  describe("buildConfirmedRecordFromCandidate", () => {
    it("builds confirmed record with user_confirmed provenance when no overrides are given", () => {
      const record = buildConfirmedRecordFromCandidate(
        baseCandidate,
        undefined,
        "u1",
        1700000000000
      );

      expect(record.id).toBe("sal_inc_001");
      expect(record.status).toBe("confirmed");
      expect(record.provenance.source).toBe("user_confirmed");
      expect(record.provenance.reviewedAtMs).toBe(1700000000000);
      expect(record.provenance.originalValues).toEqual({
        netAmount: 120000,
        month: "2026-10",
        employerName: "Acme Technologies",
        salaryType: "regular",
      });
      expect(record.employer.name).toBe("Acme Technologies");
      expect(record.month).toBe("2026-10");
      expect(record.type).toBe("regular");
    });

    it("applies user overrides and flags user_corrected provenance", () => {
      const record = buildConfirmedRecordFromCandidate(
        baseCandidate,
        {
          employerName: "Acme Global Solutions",
          payPeriodMonth: "2026-09",
          salaryType: "bonus",
          grossAmount: 150000,
          breakdown: {
            grossSalary: 150000,
            netSalary: 120000,
            deductions: { tds: 30000 },
          },
          notes: "Quarterly performance bonus",
        },
        "u1",
        1700000000000
      );

      expect(record.status).toBe("confirmed");
      expect(record.provenance.source).toBe("user_corrected");
      expect(record.employer.name).toBe("Acme Global Solutions");
      expect(record.month).toBe("2026-09");
      expect(record.payPeriod.month).toBe("2026-09");
      expect(record.type).toBe("bonus");
      expect(record.grossAmount).toBe(150000);
      expect(record.breakdown?.reconciled).toBe(true);
      expect(record.notes).toBe("Quarterly performance bonus");
      // Original values are preserved!
      expect(record.provenance.originalValues).toEqual({
        netAmount: 120000,
        month: "2026-10",
        employerName: "Acme Technologies",
        salaryType: "regular",
      });
    });
  });

  describe("buildSalaryReviewDoc", () => {
    it("creates confirmation review doc", () => {
      const review = buildSalaryReviewDoc(
        { incomeId: "inc_001", amount: 120000, date: "2026-10-31" },
        "confirm",
        { salaryType: "regular" },
        "u1",
        1700000000000
      );

      expect(review.id).toBe(buildReviewDocId("inc_001"));
      expect(review.refKey).toBe("income:inc_001");
      expect(review.decision).toBe("confirm");
      expect(review.sourceAmount).toBe(120000);
    });

    it("creates rejection review doc with reason", () => {
      const review = buildSalaryReviewDoc(
        { incomeId: "inc_002", amount: 25000, date: "2026-10-31" },
        "reject",
        { rejectionReason: "transfer" },
        "u1",
        1700000000000
      );

      expect(review.decision).toBe("reject");
      expect(review.rejectionReason).toBe("transfer");
    });
  });

  describe("applySalaryRecordCorrection", () => {
    it("applies updates to an existing record and preserves originalValues", () => {
      const existing: SalaryRecord = {
        id: "sal_1",
        month: "2026-10",
        payPeriod: { month: "2026-10" },
        employer: { name: "Acme", normalizedName: "acme" },
        netAmount: 100000,
        grossAmount: 120000,
        currency: "INR",
        paymentDate: "2026-10-31",
        type: "regular",
        status: "confirmed",
        provenance: { source: "user_confirmed" },
        createdAtMs: 1690000000000,
        updatedAtMs: 1690000000000,
      };

      const corrected = applySalaryRecordCorrection(
        existing,
        {
          employer: { name: "Acme Systems" },
          grossAmount: 130000,
          salaryType: "bonus",
        },
        1700000000000
      );

      expect(corrected.employer.name).toBe("Acme Systems");
      expect(corrected.grossAmount).toBe(130000);
      expect(corrected.type).toBe("bonus");
      expect(corrected.provenance.source).toBe("user_corrected");
      expect(corrected.provenance.reviewedAtMs).toBe(1700000000000);
      expect(corrected.createdAtMs).toBe(1690000000000);
      expect(corrected.updatedAtMs).toBe(1700000000000);
      expect(corrected.provenance.originalValues).toEqual({
        netAmount: 100000,
        month: "2026-10",
        employerName: "Acme",
        salaryType: "regular",
      });
    });
  });

  describe("resolveCandidateResolution", () => {
    it("resolves to pending when no record or review exists", () => {
      const res = resolveCandidateResolution(baseCandidate, [], []);
      expect(res.status).toBe("pending");
      expect(res.isOverridden).toBe(false);
    });

    it("resolves to rejected when review decision is reject", () => {
      const reviews: SalaryReview[] = [
        {
          id: "income__inc_001",
          refKey: "income:inc_001",
          decision: "reject",
          rejectionReason: "not_salary",
          sourceAmount: 120000,
          sourceDate: "2026-10-31",
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        },
      ];
      const res = resolveCandidateResolution(baseCandidate, [], reviews);
      expect(res.status).toBe("rejected");
      expect(res.matchingReview).toBeDefined();
    });

    it("resolves to confirmed when confirmed record exists", () => {
      const records: SalaryRecord[] = [
        {
          id: "sal_inc_001",
          month: "2026-10",
          payPeriod: { month: "2026-10" },
          employer: { name: "Acme" },
          netAmount: 120000,
          currency: "INR",
          paymentDate: "2026-10-31",
          transactionId: "inc_001",
          type: "regular",
          status: "confirmed",
          provenance: { source: "user_confirmed" },
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        },
      ];
      const res = resolveCandidateResolution(baseCandidate, records, []);
      expect(res.status).toBe("confirmed");
      expect(res.isOverridden).toBe(false);
    });

    it("resolves to corrected when record has user_corrected provenance", () => {
      const records: SalaryRecord[] = [
        {
          id: "sal_inc_001",
          month: "2026-10",
          payPeriod: { month: "2026-10" },
          employer: { name: "Acme" },
          netAmount: 120000,
          currency: "INR",
          paymentDate: "2026-10-31",
          transactionId: "inc_001",
          type: "regular",
          status: "confirmed",
          provenance: { source: "user_corrected" },
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        },
      ];
      const res = resolveCandidateResolution(baseCandidate, records, []);
      expect(res.status).toBe("corrected");
      expect(res.isOverridden).toBe(true);
    });
  });
});
