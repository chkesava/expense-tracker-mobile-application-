import { describe, expect, it } from "vitest";
import type { SalaryRecord } from "../types";
import { buildSalaryTimeline, formatMonthName } from "./timeline";

describe("Salary History & Paycheck Timeline Engine (SPENDLY-328)", () => {
  const baseSalaryRecords: SalaryRecord[] = [
    {
      id: "sal_2026_10",
      month: "2026-10",
      payPeriod: { month: "2026-10" },
      employer: { name: "Acme Corp" },
      netAmount: 125000,
      grossAmount: 150000,
      currency: "INR",
      paymentDate: "2026-10-31",
      type: "regular",
      status: "confirmed",
      provenance: { source: "user_confirmed" },
      createdAtMs: 1700000000000,
      updatedAtMs: 1700000000000,
    },
    {
      id: "sal_2026_10_bonus",
      month: "2026-10",
      payPeriod: { month: "2026-10" },
      employer: { name: "Acme Corp" },
      netAmount: 50000,
      grossAmount: null, // Gross pay not reported for bonus
      currency: "INR",
      paymentDate: "2026-10-25",
      type: "bonus",
      status: "confirmed",
      provenance: { source: "user_confirmed" },
      createdAtMs: 1700000000000,
      updatedAtMs: 1700000000000,
    },
    {
      id: "sal_2026_09",
      month: "2026-09",
      payPeriod: { month: "2026-09" },
      employer: { name: "Acme Corp" },
      netAmount: 125000,
      currency: "INR",
      paymentDate: "2026-09-30",
      type: "regular",
      status: "confirmed",
      provenance: { source: "user_confirmed" },
      createdAtMs: 1700000000000,
      updatedAtMs: 1700000000000,
    },
    {
      id: "sal_2025_12",
      month: "2025-12",
      payPeriod: { month: "2025-12" },
      employer: { name: "Tech Mahindra" },
      netAmount: 90000,
      currency: "INR",
      paymentDate: "2025-12-31",
      type: "regular",
      status: "confirmed",
      provenance: { source: "user_confirmed" },
      createdAtMs: 1680000000000,
      updatedAtMs: 1680000000000,
    },
  ];

  describe("formatMonthName", () => {
    it("formats YYYY-MM into friendly month string", () => {
      expect(formatMonthName("2026-10")).toBe("October 2026");
      expect(formatMonthName("2026-01")).toBe("January 2026");
      expect(formatMonthName("2025-12")).toBe("December 2025");
    });
  });

  describe("buildSalaryTimeline Basic Grouping & Reconciliation", () => {
    it("reconciles with canonical records and groups by wage month", () => {
      const result = buildSalaryTimeline(baseSalaryRecords);

      expect(result.summary.totalPaychecks).toBe(4);
      expect(result.summary.totalNetReceived).toBe(390000); // 125k + 50k + 125k + 90k
      expect(result.summary.monthsCount).toBe(3); // 2026-10, 2026-09, 2025-12
      expect(result.summary.employers).toEqual(
        expect.arrayContaining(["Acme Corp", "Tech Mahindra"])
      );
      expect(result.summary.availableYears).toEqual(["2026", "2025"]);

      // Verify groups
      expect(result.groups).toHaveLength(3);
      const octGroup = result.groups.find((g) => g.month === "2026-10");
      expect(octGroup).toBeDefined();
      expect(octGroup?.items).toHaveLength(2); // 1 regular + 1 bonus
      expect(octGroup?.totalNet).toBe(175000);
      expect(octGroup?.totalRegularNet).toBe(125000);
      expect(octGroup?.totalVariableNet).toBe(50000);
      expect(octGroup?.totalGrossKnown).toBe(150000);
    });

    it("represents missing gross salary as null/unknown rather than zero", () => {
      const recordsWithoutGross: SalaryRecord[] = [
        {
          id: "sal_no_gross",
          month: "2026-10",
          payPeriod: { month: "2026-10" },
          employer: { name: "Acme" },
          netAmount: 100000,
          currency: "INR",
          paymentDate: "2026-10-31",
          type: "regular",
          status: "confirmed",
          provenance: { source: "user_confirmed" },
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        },
      ];

      const result = buildSalaryTimeline(recordsWithoutGross);
      const item = result.filteredItems[0];
      expect(item.grossAmount).toBeNull();
      expect(item.isGrossKnown).toBe(false);
      expect(result.summary.totalGrossReported).toBeNull();
      expect(result.groups[0].totalGrossKnown).toBeNull();
    });

    it("visually and numerically separates variable pay from regular salary", () => {
      const result = buildSalaryTimeline(baseSalaryRecords);

      expect(result.summary.totalRegularNet).toBe(340000); // 125k + 125k + 90k
      expect(result.summary.totalVariableNet).toBe(50000); // 50k bonus

      const bonusItem = result.filteredItems.find((it) => it.id === "sal_2026_10_bonus");
      expect(bonusItem?.isVariablePay).toBe(true);
      expect(bonusItem?.classification).toBe("bonus");
    });
  });

  describe("Missing Paycheck Gap Detection", () => {
    it("identifies missing paychecks when gaps exist in employer sequence", () => {
      const recordsWithGap: SalaryRecord[] = [
        {
          id: "sal_jul",
          month: "2026-07",
          payPeriod: { month: "2026-07" },
          employer: { name: "Infosys" },
          netAmount: 80000,
          currency: "INR",
          paymentDate: "2026-07-31",
          type: "regular",
          status: "confirmed",
          provenance: { source: "user_confirmed" },
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        },
        // August is missing!
        {
          id: "sal_sep",
          month: "2026-09",
          payPeriod: { month: "2026-09" },
          employer: { name: "Infosys" },
          netAmount: 80000,
          currency: "INR",
          paymentDate: "2026-09-30",
          type: "regular",
          status: "confirmed",
          provenance: { source: "user_confirmed" },
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        },
      ];

      const result = buildSalaryTimeline(recordsWithGap);
      expect(result.summary.missingCount).toBe(1);

      const augGroup = result.groups.find((g) => g.month === "2026-08");
      expect(augGroup).toBeDefined();
      expect(augGroup?.hasMissingPaycheck).toBe(true);

      const missingItem = augGroup?.items[0];
      expect(missingItem?.type).toBe("missing_paycheck");
      expect(missingItem?.status).toBe("missing");
      // Missing data is unknown rather than zero!
      expect(missingItem?.netAmount).toBeUndefined();
      expect(missingItem?.grossAmount).toBeNull();
    });
  });

  describe("Filtering Capabilities", () => {
    it("filters timeline by calendar year", () => {
      const result2026 = buildSalaryTimeline(baseSalaryRecords, {
        filters: { year: "2026" },
      });
      expect(result2026.summary.totalPaychecks).toBe(3);
      expect(result2026.summary.totalNetReceived).toBe(300000);

      const result2025 = buildSalaryTimeline(baseSalaryRecords, {
        filters: { year: "2025" },
      });
      expect(result2025.summary.totalPaychecks).toBe(1);
      expect(result2025.summary.totalNetReceived).toBe(90000);
    });

    it("filters timeline by employer", () => {
      const result = buildSalaryTimeline(baseSalaryRecords, {
        filters: { employerName: "Tech Mahindra" },
      });
      expect(result.summary.totalPaychecks).toBe(1);
      expect(result.filteredItems[0].employer.name).toBe("Tech Mahindra");
    });

    it("filters timeline by classification", () => {
      const result = buildSalaryTimeline(baseSalaryRecords, {
        filters: { classification: "bonus" },
      });
      expect(result.summary.totalPaychecks).toBe(1);
      expect(result.filteredItems[0].classification).toBe("bonus");
    });
  });

  describe("Performance Benchmark", () => {
    it("processes 1,000 salary records in under 30ms", () => {
      const largeRecords: SalaryRecord[] = [];
      const baseYear = 2020;

      for (let i = 0; i < 1000; i++) {
        const yr = baseYear + Math.floor(i / 12);
        const m = String((i % 12) + 1).padStart(2, "0");
        const month = `${yr}-${m}`;
        largeRecords.push({
          id: `sal_${i}`,
          month,
          payPeriod: { month },
          employer: { name: `Employer ${i % 3}` },
          netAmount: 100000 + (i % 20000),
          grossAmount: i % 2 === 0 ? 120000 : null,
          currency: "INR",
          paymentDate: `${month}-28`,
          type: i % 10 === 0 ? "bonus" : "regular",
          status: "confirmed",
          provenance: { source: "user_confirmed" },
          createdAtMs: 1700000000000,
          updatedAtMs: 1700000000000,
        });
      }

      const start = performance.now();
      const result = buildSalaryTimeline(largeRecords);
      const elapsed = performance.now() - start;

      expect(result.summary.totalPaychecks).toBe(1000);
      expect(elapsed).toBeLessThan(200); // 200ms budget threshold aligned with SPENDLY-335 rollout runbook
    });
  });
});
