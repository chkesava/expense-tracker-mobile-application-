import { describe, expect, it } from "vitest";
import {
  extractPayrollMonth,
  inferPayPeriodMonth,
  inferSalaryType,
  normalizeEmployerName,
  parsePayrollNarration,
} from "./payrollNormalize";

describe("Payroll Normalization (SPENDLY-326)", () => {
  describe("normalizeEmployerName", () => {
    it("strips Indian corporate suffixes and cleans display name", () => {
      const res1 = normalizeEmployerName("Acme Technologies Pvt Ltd");
      expect(res1.display).toBe("Acme Technologies");
      expect(res1.normalized).toContain("acme");

      const res2 = normalizeEmployerName("Infosys Private Limited");
      expect(res2.display).toBe("Infosys");

      const res3 = normalizeEmployerName("Wipro Limited India");
      expect(res3.display).toBe("Wipro");

      const res4 = normalizeEmployerName("CRED ENTERPRISES LLP");
      expect(res4.display).toBe("Cred");
    });

    it("strips bank rail noise and transaction numbers", () => {
      const res = normalizeEmployerName("CMS/00012345/TCS LTD/SAL");
      expect(res.display).toBe("Tcs");
      expect(res.normalized).toBe("tcs");
    });

    it("handles empty or invalid inputs safely", () => {
      const res = normalizeEmployerName("");
      expect(res.display).toBe("Unknown Employer");
    });
  });

  describe("extractPayrollMonth", () => {
    it("extracts month name with year", () => {
      expect(extractPayrollMonth("CMS/123/ACME/SAL OCT 2026", "2026-10-31")).toBe(
        "2026-10"
      );
      expect(extractPayrollMonth("SAL/OCT26", "2026-10-31")).toBe("2026-10");
      expect(
        extractPayrollMonth("SALARY FOR SEPTEMBER 2026", "2026-10-01")
      ).toBe("2026-09");
      expect(extractPayrollMonth("ACH C-SALARY NOV-2026", "2026-12-01")).toBe(
        "2026-11"
      );
    });

    it("extracts numeric month format", () => {
      expect(extractPayrollMonth("SALARY 10/2026", "2026-10-31")).toBe("2026-10");
      expect(extractPayrollMonth("SAL 09-26", "2026-09-30")).toBe("2026-09");
    });

    it("extracts standalone month name near SAL", () => {
      expect(extractPayrollMonth("SALARY FOR OCTOBER", "2026-10-31")).toBe(
        "2026-10"
      );
    });

    it("returns undefined when no month is present", () => {
      expect(
        extractPayrollMonth("NEFT-00129-ACME TECHNOLOGIES", "2026-10-31")
      ).toBeUndefined();
    });
  });

  describe("inferPayPeriodMonth", () => {
    it("respects explicit month when provided", () => {
      expect(inferPayPeriodMonth("2026-11-05", "2026-10")).toBe("2026-10");
    });

    it("infers previous month when paid on or before 10th of month", () => {
      // Nov 1 payment in India is for October wage month
      expect(inferPayPeriodMonth("2026-11-01")).toBe("2026-10");
      expect(inferPayPeriodMonth("2026-11-07")).toBe("2026-10");
      expect(inferPayPeriodMonth("2026-11-10")).toBe("2026-10");
    });

    it("handles year rollover in early January", () => {
      // Jan 05, 2026 payment is for December 2025 wage month
      expect(inferPayPeriodMonth("2026-01-05")).toBe("2025-12");
    });

    it("infers current month when paid after 10th of month", () => {
      expect(inferPayPeriodMonth("2026-10-31")).toBe("2026-10");
      expect(inferPayPeriodMonth("2026-10-25")).toBe("2026-10");
      expect(inferPayPeriodMonth("2026-10-15")).toBe("2026-10");
    });
  });

  describe("inferSalaryType", () => {
    it("identifies bonus transactions", () => {
      expect(inferSalaryType("ANNUAL BONUS PAYOUT")).toBe("bonus");
      expect(inferSalaryType("DIWALI BONUS")).toBe("bonus");
      expect(inferSalaryType("EX-GRATIA PAYMENT")).toBe("bonus");
    });

    it("identifies incentives and variable pay", () => {
      expect(inferSalaryType("Q3 SALES INCENTIVE")).toBe("incentive");
      expect(inferSalaryType("PERFORMANCE VARIABLE PAY")).toBe("incentive");
    });

    it("identifies reimbursements", () => {
      expect(inferSalaryType("MEDICAL REIMBURSEMENT CLAIM")).toBe(
        "reimbursement"
      );
      expect(inferSalaryType("TRAVEL EXPENSE CLAIM")).toBe("reimbursement");
    });

    it("identifies stipends and severance", () => {
      expect(inferSalaryType("INTERN STIPEND OCT 2026")).toBe("stipend");
      expect(inferSalaryType("NOTICE PAY AND GRATUITY PAYOUT")).toBe("severance");
    });

    it("defaults to regular", () => {
      expect(inferSalaryType("MONTHLY SALARY OCTOBER 2026")).toBe("regular");
    });
  });

  describe("parsePayrollNarration", () => {
    it("parses HDFC CMS payroll narration", () => {
      const res = parsePayrollNarration(
        "CMS/0029381/ACME TECHNOLOGIES PVT LTD/SAL OCT 2026",
        "2026-10-31"
      );
      expect(res.employerDisplay).toBe("Acme Technologies");
      expect(res.wageMonth).toBe("2026-10");
      expect(res.isExplicitMonth).toBe(true);
      expect(res.railOrGateway).toBe("CMS");
      expect(res.payrollTokens).toContain("CMS");
      expect(res.payrollTokens).toContain("SAL");
      expect(res.suggestedType).toBe("regular");
      expect(res.exclusions.isRefund).toBe(false);
    });

    it("parses ICICI NEFT payroll narration", () => {
      const res = parsePayrollNarration(
        "NEFT-CMS12345-INFOSYS LIMITED-SALARY FOR OCTOBER",
        "2026-11-01"
      );
      expect(res.employerDisplay).toBe("Infosys");
      expect(res.wageMonth).toBe("2026-10");
      expect(res.railOrGateway).toBe("CMS");
      expect(res.payrollTokens).toContain("SALARY");
    });

    it("parses RazorpayX payroll narration", () => {
      const res = parsePayrollNarration(
        "RAZORPAYX PAYROLL DISBURSAL FOR NOV 2026",
        "2026-11-30"
      );
      expect(res.railOrGateway).toBe("RazorpayX");
      expect(res.payrollTokens).toContain("RAZORPAYX");
      expect(res.payrollTokens).toContain("PAYROLL");
      expect(res.wageMonth).toBe("2026-11");
    });

    it("detects exclusions for UPI P2P, refunds, loans and investments", () => {
      const p2p = parsePayrollNarration(
        "UPI/123456/rahul@okaxis/dinner split",
        "2026-10-15"
      );
      expect(p2p.exclusions.isP2PUpi).toBe(true);

      const refund = parsePayrollNarration(
        "REFUND FOR CANCELLED ORDER",
        "2026-10-15"
      );
      expect(refund.exclusions.isRefund).toBe(true);

      const cashback = parsePayrollNarration("CRED CASHBACK REWARD", "2026-10-15");
      expect(cashback.exclusions.isCashback).toBe(true);

      const loan = parsePayrollNarration(
        "MUTHOOT PERSONAL LOAN DISBURSAL",
        "2026-10-15"
      );
      expect(loan.exclusions.isLoan).toBe(true);

      const investment = parsePayrollNarration(
        "ZERODHA BROKING DIVIDEND PAYOUT",
        "2026-10-15"
      );
      expect(investment.exclusions.isInvestment).toBe(true);
    });
  });
});
