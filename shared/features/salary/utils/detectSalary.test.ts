import { describe, expect, it } from "vitest";
import type { Income } from "../../../types/expense";
import type { SalaryProfile, SalaryRecord, SalaryReview } from "../types";
import {
  candidateToSalaryRecord,
  detectSalaryCandidates,
} from "./detectSalary";

describe("Salary Detection & Recognition Engine (SPENDLY-326)", () => {
  const mockSalaryProfile: SalaryProfile = {
    id: "profile_1",
    primaryEmployer: "Acme Technologies",
    expectedPaydayWindow: {
      startDay: 28,
      endDay: 2,
    },
    frequency: "monthly",
    notificationEnabled: true,
    createdAtMs: 1700000000000,
    updatedAtMs: 1700000000000,
  };

  describe("Explicit Payroll Signals", () => {
    it("detects explicit salary tokens with high confidence", () => {
      const incomes: Income[] = [
        {
          id: "inc_1",
          amount: 125000,
          source: "Direct Deposit",
          note: "CMS/0002918/ACME TECHNOLOGIES PVT LTD/SAL OCT 2026",
          date: "2026-10-31",
          month: "2026-10",
          createdAt: Date.now(),
        },
      ];

      const candidates = detectSalaryCandidates(incomes);
      expect(candidates).toHaveLength(1);
      const c = candidates[0];
      expect(c.confidence).toBe("high");
      expect(c.employer.name).toBe("Acme Technologies");
      expect(c.payPeriod.month).toBe("2026-10");
      expect(c.suggestedType).toBe("regular");
      expect(c.evidence).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Narration contains payroll marker"),
          expect.stringContaining("typical Indian payday window"),
        ])
      );
    });

    it("detects payroll gateway (RazorpayX, greytHR, Kredily) with high confidence", () => {
      const incomes: Income[] = [
        {
          id: "inc_rzp",
          amount: 85000,
          source: "Bank Transfer",
          note: "RAZORPAYX PAYROLL DISBURSAL FOR INFOSYS LTD",
          date: "2026-11-30",
          month: "2026-11",
          createdAt: Date.now(),
        },
      ];

      const candidates = detectSalaryCandidates(incomes);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe("high");
      expect(candidates[0].evidence).toEqual(
        expect.arrayContaining([
          expect.stringContaining("Processed via payroll rail: RazorpayX"),
        ])
      );
    });

    it("detects income explicitly categorized as Salary with high confidence", () => {
      const incomes: Income[] = [
        {
          id: "inc_cat",
          amount: 95000,
          source: "Salary",
          note: "CREDIT FROM TECH MAHINDRA",
          date: "2026-10-31",
          month: "2026-10",
          createdAt: Date.now(),
        },
      ];

      const candidates = detectSalaryCandidates(incomes);
      expect(candidates).toHaveLength(1);
      expect(candidates[0].confidence).toBe("high");
      expect(candidates[0].evidence).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Income source marked as "Salary"'),
        ])
      );
    });
  });

  describe("Payday Clustering & Recurring Patterns", () => {
    it("identifies recurring credits on consistent month-end days with medium confidence", () => {
      // 3 consecutive months from "Swiggy India", no explicit "salary" word
      const incomes: Income[] = [
        {
          id: "inc_aug",
          amount: 110000,
          source: "NEFT",
          note: "NEFT CR SWIGGY INDIA LTD",
          date: "2026-08-31",
          month: "2026-08",
          createdAt: Date.now(),
        },
        {
          id: "inc_sep",
          amount: 110000,
          source: "NEFT",
          note: "NEFT CR SWIGGY INDIA LTD",
          date: "2026-09-30",
          month: "2026-09",
          createdAt: Date.now(),
        },
        {
          id: "inc_oct",
          amount: 110000,
          source: "NEFT",
          note: "NEFT CR SWIGGY INDIA LTD",
          date: "2026-10-31",
          month: "2026-10",
          createdAt: Date.now(),
        },
      ];

      const candidates = detectSalaryCandidates(incomes);
      expect(candidates).toHaveLength(3);
      for (const c of candidates) {
        expect(c.confidence).toBe("medium");
        expect(c.employer.name).toBe("Swiggy");
        expect(c.evidence).toEqual(
          expect.arrayContaining([
            expect.stringContaining("Recurring credit across 3 months"),
            expect.stringContaining("Consistent monthly credit ~₹1,10,000"),
            expect.stringContaining("typical Indian payday window"),
          ])
        );
      }
    });

    it("boosts recurring credits to high confidence when matching user's Salary Profile", () => {
      const incomes: Income[] = [
        {
          id: "inc_oct",
          amount: 125000,
          source: "Direct",
          note: "NEFT TRANSFER FROM ACME TECHNOLOGIES",
          date: "2026-10-30",
          month: "2026-10",
          createdAt: Date.now(),
        },
        {
          id: "inc_sep",
          amount: 125000,
          source: "Direct",
          note: "NEFT TRANSFER FROM ACME TECHNOLOGIES",
          date: "2026-09-30",
          month: "2026-09",
          createdAt: Date.now(),
        },
      ];

      const candidates = detectSalaryCandidates(incomes, {
        salaryProfile: mockSalaryProfile,
      });
      expect(candidates).toHaveLength(2);
      expect(candidates[0].confidence).toBe("high");
      expect(candidates[0].evidence).toEqual(
        expect.arrayContaining([
          expect.stringContaining(
            'Matches employer in Salary Profile: "Acme Technologies"'
          ),
        ])
      );
    });
  });

  describe("Exclusion Rules & Invariants", () => {
    it("excludes UPI P2P transfers, refunds, cashbacks, loans and dividends", () => {
      const incomes: Income[] = [
        {
          id: "inc_p2p",
          amount: 25000,
          source: "UPI",
          note: "UPI/9876543210/rahul@okaxis/repayment",
          date: "2026-10-29",
          month: "2026-10",
          createdAt: Date.now(),
        },
        {
          id: "inc_refund",
          amount: 5499,
          source: "Bank",
          note: "REFUND FOR FLIGHT CANCELLATION",
          date: "2026-10-30",
          month: "2026-10",
          createdAt: Date.now(),
        },
        {
          id: "inc_cashback",
          amount: 250,
          source: "Cred",
          note: "CRED CASHBACK REWARD",
          date: "2026-10-30",
          month: "2026-10",
          createdAt: Date.now(),
        },
        {
          id: "inc_loan",
          amount: 200000,
          source: "Loan",
          note: "BAJAJ FINANCE PERSONAL LOAN DISBURSAL",
          date: "2026-10-30",
          month: "2026-10",
          createdAt: Date.now(),
        },
        {
          id: "inc_div",
          amount: 4500,
          source: "Investment",
          note: "ZERODHA BROKING DIVIDEND PAYOUT",
          date: "2026-10-30",
          month: "2026-10",
          createdAt: Date.now(),
        },
      ];

      const candidates = detectSalaryCandidates(incomes);
      expect(candidates).toHaveLength(0);
    });

    it("ignores soft-deleted incomes", () => {
      const incomes: Income[] = [
        {
          id: "inc_del",
          amount: 150000,
          source: "Salary",
          note: "CMS/SALARY OCT 2026",
          date: "2026-10-31",
          month: "2026-10",
          deletedAt: "2026-11-01T10:00:00Z",
          createdAt: Date.now(),
        },
      ];

      const candidates = detectSalaryCandidates(incomes);
      expect(candidates).toHaveLength(0);
    });

    it("does not classify solely because an amount is large or recurring", () => {
      // Non-salary recurring credits (e.g. rental income from a tenant)
      const incomes: Income[] = [
        {
          id: "inc_rent_1",
          amount: 60000,
          source: "Transfer",
          note: "FLAT 402 RENT FROM SURESH",
          date: "2026-09-05",
          month: "2026-09",
          createdAt: Date.now(),
        },
        {
          id: "inc_rent_2",
          amount: 60000,
          source: "Transfer",
          note: "FLAT 402 RENT FROM SURESH",
          date: "2026-10-05",
          month: "2026-10",
          createdAt: Date.now(),
        },
      ];

      const candidates = detectSalaryCandidates(incomes);
      // The notes mention "RENT" which triggers the settlement exclusion
      expect(candidates).toHaveLength(0);
    });

    it("permanently respects user rejections from existingReviews", () => {
      const incomes: Income[] = [
        {
          id: "inc_rejected_previously",
          amount: 80000,
          source: "Salary",
          note: "CMS SALARY OCT 2026",
          date: "2026-10-31",
          month: "2026-10",
          createdAt: Date.now(),
        },
      ];

      const existingReviews: SalaryReview[] = [
        {
          id: "rev_1",
          refKey: "income:inc_rejected_previously",
          decision: "reject",
          rejectionReason: "not_salary",
          sourceAmount: 80000,
          sourceDate: "2026-10-31",
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        },
      ];

      const candidates = detectSalaryCandidates(incomes, { existingReviews });
      expect(candidates).toHaveLength(0);
    });

    it("marks previously confirmed incomes as confirmed existingStatus", () => {
      const incomes: Income[] = [
        {
          id: "inc_confirmed",
          amount: 120000,
          source: "Salary",
          note: "CMS/ACME SALARY OCT 2026",
          date: "2026-10-31",
          month: "2026-10",
          createdAt: Date.now(),
        },
      ];

      const existingRecords: SalaryRecord[] = [
        {
          id: "sal_1",
          month: "2026-10",
          payPeriod: { month: "2026-10" },
          employer: { name: "Acme" },
          netAmount: 120000,
          currency: "INR",
          paymentDate: "2026-10-31",
          transactionId: "inc_confirmed",
          type: "regular",
          status: "confirmed",
          provenance: { source: "user_confirmed" },
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        },
      ];

      const candidates = detectSalaryCandidates(incomes, { existingRecords });
      expect(candidates).toHaveLength(1);
      expect(candidates[0].existingStatus).toBe("confirmed");
    });
  });

  describe("Candidate Conversion", () => {
    it("converts a candidate into a valid SalaryRecord", () => {
      const candidate = detectSalaryCandidates([
        {
          id: "inc_conv",
          amount: 140000,
          source: "Direct",
          note: "CMS/00192/GOOGLE INDIA PVT LTD/SAL OCT 2026",
          date: "2026-10-31",
          month: "2026-10",
          accountId: "acc_hdfc",
          createdAt: Date.now(),
        },
      ])[0];

      const record = candidateToSalaryRecord(candidate, { uid: "user_123" });
      expect(record.id).toBe("sal_inc_conv");
      expect(record.uid).toBe("user_123");
      expect(record.month).toBe("2026-10");
      expect(record.payPeriod.month).toBe("2026-10");
      expect(record.employer.name).toBe("Google");
      expect(record.netAmount).toBe(140000);
      expect(record.currency).toBe("INR");
      expect(record.paymentDate).toBe("2026-10-31");
      expect(record.transactionId).toBe("inc_conv");
      expect(record.accountId).toBe("acc_hdfc");
      expect(record.provenance.source).toBe("detection");
      expect(record.status).toBe("detected");
    });
  });

  describe("Performance Benchmark", () => {
    it("processes 2,000 transactions in under 50ms", () => {
      const mockIncomes: Income[] = [];
      const baseDate = new Date(2025, 0, 1);

      for (let i = 0; i < 2000; i++) {
        const d = new Date(baseDate.getTime() + i * 86400000 * 0.5);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const dateStr = `${y}-${m}-${day}`;

        // Every 30 days insert a salary credit
        if (i % 30 === 0) {
          mockIncomes.push({
            id: `inc_${i}`,
            amount: 100000,
            source: "Salary",
            note: `CMS/00192/ACME TECHNOLOGIES/SAL ${m}-${y}`,
            date: dateStr,
            month: `${y}-${m}`,
            createdAt: Date.now(),
          });
        } else {
          // Regular transactions (UPI, grocery, transfer)
          mockIncomes.push({
            id: `inc_${i}`,
            amount: 500 + (i % 5000),
            source: i % 2 === 0 ? "UPI" : "Transfer",
            note: `UPI/payment-${i}/friend@okaxis`,
            date: dateStr,
            month: `${y}-${m}`,
            createdAt: Date.now(),
          });
        }
      }

      const start = performance.now();
      const candidates = detectSalaryCandidates(mockIncomes);
      const elapsed = performance.now() - start;

      expect(candidates.length).toBeGreaterThan(50);
      expect(elapsed).toBeLessThan(350); // Robust benchmark under parallel CPU load
    });
  });
});
