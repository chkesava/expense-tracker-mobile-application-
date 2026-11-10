import { describe, expect, it } from "vitest";

import type { EpfContribution } from "@/shared/features/epf/types";
import type { SalaryRecord } from "../types";
import {
  analyzeEpfDeduction,
  analyzeTaxDeduction,
  buildSalaryBreakdownWaterfall,
} from "./breakdown";

function createMockSalaryRecord(overrides: Partial<SalaryRecord> = {}): SalaryRecord {
  return {
    id: "sal_rec_test_1",
    month: "2026-10",
    payPeriod: {
      month: "2026-10",
      startDate: "2026-10-01",
      endDate: "2026-10-31",
    },
    employer: {
      name: "Acme Corp India",
      normalizedName: "Acme Corp India",
      epfEstablishmentId: "est_acme_123",
    },
    netAmount: 117600,
    grossAmount: 140000,
    currency: "INR",
    paymentDate: "2026-10-31",
    type: "regular",
    status: "confirmed",
    provenance: {
      source: "detection",
    },
    createdAtMs: 1729000000000,
    updatedAtMs: 1729000000000,
    ...overrides,
  };
}

describe("Salary Breakdown & Waterfall Engine", () => {
  it("computes full reconciled waterfall when all components match", () => {
    const record = createMockSalaryRecord({
      grossAmount: 140000,
      netAmount: 117600,
      breakdown: {
        grossSalary: 140000,
        netSalary: 117600,
        allowances: {
          basic: 60000,
          hra: 30000,
          special: 40000,
        },
        variablePay: 10000,
        deductions: {
          epf: 7200,
          tds: 15000,
          professionalTax: 200,
        },
      },
    });

    const waterfall = buildSalaryBreakdownWaterfall(record, {
      todayKey: "2026-11-05",
    });

    expect(waterfall.isNetOnly).toBe(false);
    expect(waterfall.grossSalary).toBe(140000);
    expect(waterfall.isGrossCalculated).toBe(false);
    expect(waterfall.variablePay).toBe(10000);
    expect(waterfall.totalEarnings).toBe(140000);
    expect(waterfall.totalDeductions).toBe(22400); // 7200 + 15000 + 200
    expect(waterfall.netSalary).toBe(117600);
    expect(waterfall.reconciliationStatus).toBe("reconciled");
    expect(waterfall.discrepancyAmount).toBeUndefined();

    // Source supported earnings (basic, hra, special, variablePay)
    expect(waterfall.earningsItems).toHaveLength(4);
    expect(waterfall.earningsItems.map((i) => i.key)).toEqual([
      "basic",
      "hra",
      "special",
      "variable_pay",
    ]);
    expect(waterfall.earningsItems.every((i) => !i.isCalculated)).toBe(true);

    // Source supported deductions
    expect(waterfall.deductionsItems).toHaveLength(3);
    expect(waterfall.deductionsItems.map((i) => i.key)).toEqual([
      "epf",
      "tds",
      "professional_tax",
    ]);
    expect(waterfall.deductionsItems.every((i) => !i.isCalculated)).toBe(true);
  });

  it("does not fabricate missing earnings or deductions", () => {
    // Only basic and TDS are provided; HRA, special, EPF, PT are absent
    const record = createMockSalaryRecord({
      grossAmount: 70000,
      netAmount: 65000,
      breakdown: {
        netSalary: 65000,
        grossSalary: 70000,
        allowances: {
          basic: 50000,
        },
        deductions: {
          tds: 5000,
        },
      },
    });

    const waterfall = buildSalaryBreakdownWaterfall(record);

    expect(waterfall.earningsItems).toHaveLength(1);
    expect(waterfall.earningsItems[0].key).toBe("basic");
    expect(waterfall.earningsItems[0].amount).toBe(50000);

    expect(waterfall.deductionsItems).toHaveLength(1);
    expect(waterfall.deductionsItems[0].key).toBe("tds");
    expect(waterfall.deductionsItems[0].amount).toBe(5000);
  });

  it("labels gross as calculated when derived from allowances sum", () => {
    const record = createMockSalaryRecord({
      grossAmount: null,
      netAmount: 75000,
      breakdown: {
        netSalary: 75000,
        allowances: {
          basic: 50000,
          hra: 25000,
          special: 10000,
        },
        deductions: {
          epf: 6000,
          tds: 4000,
        },
      },
    });

    const waterfall = buildSalaryBreakdownWaterfall(record);

    expect(waterfall.grossSalary).toBe(85000); // 50000 + 25000 + 10000
    expect(waterfall.isGrossCalculated).toBe(true);
    expect(waterfall.reconciliationStatus).toBe("reconciled"); // 85000 - 10000 = 75000
  });

  it("detects mathematical discrepancy between Gross - Deductions and Net", () => {
    const record = createMockSalaryRecord({
      grossAmount: 100000,
      netAmount: 80000, // Discrepancy: 100k - 10k = 90k != 80k
      breakdown: {
        netSalary: 80000,
        grossSalary: 100000,
        deductions: {
          epf: 6000,
          tds: 4000,
        },
      },
    });

    const waterfall = buildSalaryBreakdownWaterfall(record);

    expect(waterfall.reconciliationStatus).toBe("discrepancy");
    expect(waterfall.discrepancyAmount).toBe(10000); // 90000 - 80000
  });

  it("handles partial breakdown when only gross and net are known", () => {
    const record = createMockSalaryRecord({
      grossAmount: 100000,
      netAmount: 85000,
      breakdown: undefined,
    });

    const waterfall = buildSalaryBreakdownWaterfall(record);

    expect(waterfall.isNetOnly).toBe(false);
    expect(waterfall.reconciliationStatus).toBe("partial");
    expect(waterfall.grossSalary).toBe(100000);
    expect(waterfall.totalDeductions).toBe(15000);
    expect(waterfall.earningsItems).toHaveLength(0);
    expect(waterfall.deductionsItems).toHaveLength(0);
  });

  it("handles net-only records gracefully (bank SMS without gross or breakdown)", () => {
    const record = createMockSalaryRecord({
      grossAmount: null,
      netAmount: 95000,
      breakdown: undefined,
    });

    const waterfall = buildSalaryBreakdownWaterfall(record);

    expect(waterfall.isNetOnly).toBe(true);
    expect(waterfall.reconciliationStatus).toBe("net_only");
    expect(waterfall.grossSalary).toBeNull();
    expect(waterfall.totalEarnings).toBe(95000);
    expect(waterfall.totalDeductions).toBe(0);
    expect(waterfall.earningsItems).toHaveLength(0);
    expect(waterfall.deductionsItems).toHaveLength(0);
  });
});

describe("EPF Statutory Remittance Analysis", () => {
  it("marks awaiting_deposit when before statutory due date (15th of next month)", () => {
    const analysis = analyzeEpfDeduction({
      wageMonth: "2026-10",
      epfDeductionAmount: 7200,
      employerEpfId: "est_1",
      todayKey: "2026-11-05", // before 2026-11-15
    });

    expect(analysis).toBeDefined();
    expect(analysis?.status).toBe("awaiting_deposit");
    expect(analysis?.statutoryDueDate).toBe("2026-11-15");
    expect(analysis?.expectedWindow).toEqual({
      from: "2026-11-15",
      to: "2026-11-25",
    });
    expect(analysis?.statusDescription).toContain("Statutory deposit expected by 2026-11-15");
    expect(analysis?.deepLink).toBe("/epf/est_1");
  });

  it("marks in remittance window during grace period (15th to 25th of next month)", () => {
    const analysis = analyzeEpfDeduction({
      wageMonth: "2026-10",
      epfDeductionAmount: 7200,
      employerEpfId: "est_1",
      todayKey: "2026-11-20", // between 2026-11-15 and 2026-11-25
    });

    expect(analysis).toBeDefined();
    expect(analysis?.status).toBe("awaiting_deposit");
    expect(analysis?.statusLabel).toBe("In Remittance Window");
    expect(analysis?.statusDescription).toContain("Employer filing window active");
  });

  it("marks overdue when after grace window (25th of next month) without credit", () => {
    const analysis = analyzeEpfDeduction({
      wageMonth: "2026-10",
      epfDeductionAmount: 7200,
      employerEpfId: "est_1",
      todayKey: "2026-11-26", // past 2026-11-25
    });

    expect(analysis).toBeDefined();
    expect(analysis?.status).toBe("overdue");
    expect(analysis?.statusLabel).toBe("Deposit Overdue");
    expect(analysis?.statusDescription).toContain("Statutory due date was 2026-11-15");
  });

  it("marks deposited when matching EPF contribution is credited in passbook", () => {
    const mockContributions: EpfContribution[] = [
      {
        id: "est_1_2026-10",
        establishmentId: "est_1",
        month: "2026-10",
        wage: 50000,
        employeeShare: 6000,
        employerShare: 6000,
        epsShare: 1250,
        employerEpfShare: 4750,
        totalContribution: 12000,
        epfCredit: 10750,
        status: "credited",
        source: "imported",
        epsEligible: true,
      },
    ];

    const analysis = analyzeEpfDeduction({
      wageMonth: "2026-10",
      epfDeductionAmount: 6000,
      employerEpfId: "est_1",
      epfContributions: mockContributions,
      todayKey: "2026-11-26",
    });

    expect(analysis).toBeDefined();
    expect(analysis?.status).toBe("deposited");
    expect(analysis?.statusLabel).toBe("Deposited to EPFO");
    expect(analysis?.statusDescription).toContain("Passbook credit verified");
    expect(analysis?.matchedContribution?.employeeShare).toBe(6000);
    expect(analysis?.matchedContribution?.totalContribution).toBe(12000);
  });

  it("marks overdue if EPF contribution is explicitly marked missed", () => {
    const mockContributions: EpfContribution[] = [
      {
        id: "est_1_2026-10",
        establishmentId: "est_1",
        month: "2026-10",
        wage: 50000,
        employeeShare: 6000,
        employerShare: 6000,
        epsShare: 1250,
        employerEpfShare: 4750,
        totalContribution: 12000,
        epfCredit: 10750,
        status: "missed",
        source: "imported",
        epsEligible: true,
      },
    ];

    const analysis = analyzeEpfDeduction({
      wageMonth: "2026-10",
      epfDeductionAmount: 6000,
      employerEpfId: "est_1",
      epfContributions: mockContributions,
      todayKey: "2026-11-10",
    });

    expect(analysis?.status).toBe("overdue");
    expect(analysis?.statusLabel).toBe("Deposit Missed");
  });

  it("returns not_enrolled when employer has establishment link but no EPF deduction", () => {
    const analysis = analyzeEpfDeduction({
      wageMonth: "2026-10",
      epfDeductionAmount: null,
      employerEpfId: "est_1",
      todayKey: "2026-11-05",
    });

    expect(analysis).toBeDefined();
    expect(analysis?.status).toBe("not_enrolled");
    expect(analysis?.statusLabel).toBe("Not Deducted");
    expect(analysis?.deepLink).toBe("/epf/est_1");
  });

  it("returns undefined when record has neither EPF deduction nor establishment", () => {
    const analysis = analyzeEpfDeduction({
      wageMonth: "2026-10",
      epfDeductionAmount: null,
      employerEpfId: undefined,
      todayKey: "2026-11-05",
    });

    expect(analysis).toBeUndefined();
  });
});

describe("Tax (TDS Section 192) Analysis", () => {
  it("generates tax analysis and deep-link for TDS deduction", () => {
    const analysis = analyzeTaxDeduction({
      wageMonth: "2026-10",
      paymentDate: "2026-10-31",
      tdsAmount: 15000,
    });

    expect(analysis).toBeDefined();
    expect(analysis?.tdsAmount).toBe(15000);
    expect(analysis?.financialYear).toBe("2026-27");
    expect(analysis?.financialYearLabel).toBe("FY 2026-27");
    expect(analysis?.deepLink).toBe("/tax/2026-27/tds");
    expect(analysis?.statusDescription).toContain("Section 192 TDS deduction");
  });

  it("returns undefined when no TDS deduction is present", () => {
    const analysis = analyzeTaxDeduction({
      wageMonth: "2026-10",
      paymentDate: "2026-10-31",
      tdsAmount: 0,
    });

    expect(analysis).toBeUndefined();
  });
});
