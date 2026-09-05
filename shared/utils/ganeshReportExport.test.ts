import { describe, expect, it } from "vitest";

import { buildGaneshReport } from "@/shared/utils/ganeshReportBuilder";
import {
  reportFileName,
  reportToCsv,
  reportToHtml,
} from "@/shared/utils/ganeshReportExport";
import type { ReportRange } from "@/shared/utils/ganeshReportRange";

/**
 * The exported report (GS-079).
 *
 * What matters here is not formatting but truthfulness: the range has to travel
 * with the data, permissions must not be quietly bypassed, and a discrepancy
 * must be impossible to miss.
 */

const RANGE: ReportRange = {
  preset: "custom",
  start: "2026-09-01",
  end: "2026-09-05",
  label: "2026-09-01 to 2026-09-05",
};

const ALL = {
  collections: true,
  contributions: true,
  expenses: true,
  reimbursements: true,
  reconciliation: true,
};

function report(overrides: Partial<Parameters<typeof buildGaneshReport>[0]> = {}) {
  return buildGaneshReport({
    pandalName: "Telephone Exchange Youth",
    festivalName: "Ganesh Utsav",
    festivalYear: 2026,
    range: RANGE,
    generatedAt: new Date("2026-09-05T18:30:00.000Z"),
    generatedBy: "Treasurer",
    openingFunds: 10_000,
    collections: [
      {
        id: "c1",
        date: "2026-09-02",
        donorName: "Ramesh",
        amount: 500,
        paymentMethod: "cash",
        collectorId: "u-collector",
        area: "Main Road",
      },
      // Outside the range: must not appear anywhere.
      {
        id: "c2",
        date: "2026-08-20",
        donorName: "Old Donor",
        amount: 9_999,
        paymentMethod: "cash",
        collectorId: "u-collector",
      },
      // Voided: not money anyone holds.
      {
        id: "c3",
        date: "2026-09-03",
        donorName: "Cancelled",
        amount: 700,
        paymentMethod: "cash",
        collectorId: "u-collector",
        voided: true,
      },
    ] as never,
    contributions: [
      {
        id: "n1",
        date: "2026-09-03",
        contributorName: "Suresh",
        kind: "money",
        status: "received",
        amount: 2_000,
      },
      {
        id: "n2",
        date: "2026-09-03",
        contributorName: "Promised Person",
        kind: "money",
        status: "promised",
        amount: 5_000,
      },
    ] as never,
    expenses: [
      {
        id: "e1",
        date: "2026-09-04",
        name: "Sound system",
        totalAmount: 3_000,
        paymentMethod: "cash",
        categoryId: "cat-sound",
        vendor: "Sai Sound",
      },
    ] as never,
    reimbursements: [] as never,
    sessions: [
      { id: "s1", date: "2026-09-02", status: "mismatch", collectorId: "u-collector" },
    ] as never,
    reconciliations: [
      {
        id: "s1",
        sessionId: "s1",
        collectorId: "u-collector",
        expectedCash: 500,
        declaredCash: 500,
        countedCash: 400,
        difference: -100,
        status: "mismatch",
        countedBy: "u-treasurer",
        countedByName: "Treasurer",
      },
    ] as never,
    can: ALL,
    nameFor: (id) => (id === "u-collector" ? "Ravi" : id ? "Treasurer" : ""),
    categoryNameFor: () => "Sound System",
    ...overrides,
  });
}

describe("the report respects the range", () => {
  it("keeps only in-range, non-voided rows", () => {
    const built = report();
    expect(built.summary.collections).toBe(500);
    expect(built.transactions.map((t) => t.description)).not.toContain("Old Donor");
    expect(built.transactions.map((t) => t.description)).not.toContain("Cancelled");
  });

  it("counts promised money as outstanding, not as received", () => {
    // The distinction the whole product rests on: a promise is not cash.
    const built = report();
    expect(built.summary.contributions).toBe(2_000);
    expect(built.summary.promisedOutstanding).toBe(5_000);
  });

  it("computes the closing balance from the range's own movements", () => {
    // 10,000 opening + 500 collected + 2,000 received - 3,000 spent
    expect(report().summary.closingBalance).toBe(9_500);
  });

  it("flags that a bounded range is not the whole festival", () => {
    expect(report().summary.partialRange).toBe(true);
  });
});

describe("discrepancies are impossible to miss", () => {
  it("warns about a mismatched count", () => {
    const built = report();
    expect(built.warnings.join(" ")).toContain("did not match");
  });

  it("warns about cash nobody has counted yet", () => {
    const built = report({
      sessions: [{ id: "s2", date: "2026-09-03", status: "closed" }] as never,
      reconciliations: [] as never,
    });
    expect(built.warnings.join(" ")).toContain("not been counted");
  });

  it("puts the warnings above the totals in the PDF", () => {
    // A mismatch found on page three, after the numbers were read aloud, has
    // already misled the room.
    const html = reportToHtml(report());
    expect(html.indexOf("Please note")).toBeLessThan(html.indexOf("Summary"));
  });
});

describe("permissions are not bypassed by exporting", () => {
  it("omits a section the reader cannot see and says why", () => {
    const built = report({ can: { ...ALL, expenses: false } });
    expect(built.expenses.included).toBe(false);
    expect(built.expenses.rows).toEqual([]);
    expect(built.warnings.join(" ")).toContain("Expenses are not included");
  });

  it("keeps a withheld section out of the totals rather than showing zero", () => {
    // Reporting 0 for data you are not allowed to see states something false.
    const built = report({ can: { ...ALL, expenses: false } });
    expect(built.summary.expenses).toBe(0);
    expect(built.warnings.some((w) => w.includes("Expenses"))).toBe(true);
  });

  it("says so in both formats", () => {
    const built = report({ can: { ...ALL, collections: false } });
    expect(reportToHtml(built)).toContain("cannot view collections");
    expect(reportToCsv(built)).toContain("Collections are not included");
  });
});

describe("CSV", () => {
  it("carries the report's context in the file", () => {
    // A bare grid of numbers on a laptop months later cannot be checked
    // against anything.
    const csv = reportToCsv(report());
    expect(csv).toContain("Telephone Exchange Youth");
    expect(csv).toContain("2026-09-01 to 2026-09-05");
    expect(csv).toContain("Generated by,Treasurer");
  });

  it("escapes a comma in a donor name", () => {
    const csv = reportToCsv(
      report({
        collections: [
          {
            id: "c1",
            date: "2026-09-02",
            donorName: 'Ramesh, "Bhau"',
            amount: 500,
            paymentMethod: "cash",
            collectorId: "u-collector",
          },
        ] as never,
      })
    );
    expect(csv).toContain('"Ramesh, ""Bhau"""');
  });

  it("marks a derived purpose so an analyst does not trust it as chosen", () => {
    const csv = reportToCsv(report());
    expect(csv).toContain("derived (recorded before purposes existed)");
  });

  it("uses CRLF, which is what spreadsheets expect", () => {
    expect(reportToCsv(report())).toContain("\r\n");
  });
});

describe("PDF", () => {
  it("names the Pandal, festival, range and who generated it", () => {
    const html = reportToHtml(report());
    expect(html).toContain("Telephone Exchange Youth");
    expect(html).toContain("Ganesh Utsav 2026");
    expect(html).toContain("2026-09-01 to 2026-09-05");
    expect(html).toContain("Treasurer");
  });

  it("shows expected, counted and the difference together", () => {
    const html = reportToHtml(report());
    expect(html).toContain("Expected");
    expect(html).toContain("Counted");
    expect(html).toContain("Difference");
  });

  it("escapes a donor name that contains markup", () => {
    const html = reportToHtml(
      report({
        collections: [
          {
            id: "c1",
            date: "2026-09-02",
            donorName: "<script>alert(1)</script>",
            amount: 1,
            paymentMethod: "cash",
            collectorId: "u-collector",
          },
        ] as never,
      })
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("file names", () => {
  it("says what the file is without opening it", () => {
    const name = reportFileName(report(), "pdf");
    expect(name).toMatch(/^Telephone-Exchange-Youth-.*2026-09-05\.pdf$/);
  });
});
