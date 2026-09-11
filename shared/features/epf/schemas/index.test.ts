import { describe, expect, it } from "vitest";

import {
  epfBackfillSetupSchema,
  epfContributionRowFormSchema,
  epfEstablishmentFormSchema,
  epfProfileFormSchema,
  epfWageSchema,
  monthKeySchema,
  uanSchema,
} from "@/shared/features/epf/schemas";

const validEstablishment = {
  employerName: "Acme Pvt Ltd",
  establishmentNumber: "MHBAN0012345000",
  memberId: "MHBAN00123450000012345",
  dateJoined: "2020-01-01",
};

describe("uanSchema", () => {
  it("accepts exactly 12 digits", () => {
    expect(uanSchema.parse("100123456789")).toBe("100123456789");
  });

  it("normalizes separators before validating", () => {
    expect(uanSchema.parse("1001 2345 6789")).toBe("100123456789");
    expect(uanSchema.parse("1001-2345-6789")).toBe("100123456789");
  });

  it("rejects the wrong number of digits", () => {
    expect(uanSchema.safeParse("10012345678").success).toBe(false);
    expect(uanSchema.safeParse("1001234567890").success).toBe(false);
  });

  it("rejects non-numeric and empty values", () => {
    expect(uanSchema.safeParse("10012345678A").success).toBe(false);
    expect(uanSchema.safeParse("").success).toBe(false);
  });

  it("explains the rule in the message", () => {
    const result = uanSchema.safeParse("123");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("UAN must be exactly 12 digits");
    }
  });
});

describe("epfProfileFormSchema", () => {
  it("accepts a complete profile", () => {
    const result = epfProfileFormSchema.safeParse({
      employeeName: "Kesava Chintha",
      uan: "1001 2345 6789",
      notes: "",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.uan).toBe("100123456789");
  });

  it("requires an employee name and trims it", () => {
    expect(
      epfProfileFormSchema.safeParse({ employeeName: "   ", uan: "100123456789" }).success
    ).toBe(false);

    const result = epfProfileFormSchema.safeParse({
      employeeName: "  Kesava  ",
      uan: "100123456789",
    });
    if (result.success) expect(result.data.employeeName).toBe("Kesava");
  });

  it("rejects an over-long employee name", () => {
    expect(
      epfProfileFormSchema.safeParse({ employeeName: "a".repeat(81), uan: "100123456789" }).success
    ).toBe(false);
  });

  it("rejects over-long notes", () => {
    expect(
      epfProfileFormSchema.safeParse({
        employeeName: "Kesava",
        uan: "100123456789",
        notes: "a".repeat(501),
      }).success
    ).toBe(false);
  });
});

describe("epfEstablishmentFormSchema", () => {
  it("accepts an open-ended (current) employment", () => {
    expect(epfEstablishmentFormSchema.safeParse(validEstablishment).success).toBe(true);
  });

  it("accepts an empty-string leaving date as still employed", () => {
    expect(
      epfEstablishmentFormSchema.safeParse({ ...validEstablishment, dateLeft: "" }).success
    ).toBe(true);
  });

  it("requires employer name, establishment number and member ID", () => {
    for (const field of ["employerName", "establishmentNumber", "memberId"] as const) {
      const result = epfEstablishmentFormSchema.safeParse({ ...validEstablishment, [field]: "" });
      expect(result.success, `${field} should be required`).toBe(false);
    }
  });

  it("rejects a malformed date", () => {
    expect(
      epfEstablishmentFormSchema.safeParse({ ...validEstablishment, dateJoined: "01-01-2020" })
        .success
    ).toBe(false);
    expect(
      epfEstablishmentFormSchema.safeParse({ ...validEstablishment, dateLeft: "2020/01/01" })
        .success
    ).toBe(false);
  });

  it("rejects a leaving date before the joining date, on the dateLeft path", () => {
    const result = epfEstablishmentFormSchema.safeParse({
      ...validEstablishment,
      dateLeft: "2019-12-31",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((item) => item.path[0] === "dateLeft");
      expect(issue?.message).toBe("Leaving date must be on or after the joining date");
    }
  });

  it("accepts leaving on the joining date", () => {
    expect(
      epfEstablishmentFormSchema.safeParse({ ...validEstablishment, dateLeft: "2020-01-01" })
        .success
    ).toBe(true);
  });
});

const validRow = {
  month: "2021-06",
  employeeShare: 3000,
  employerShare: 3000,
  epsShare: 1250,
  employerEpfShare: 1750,
};

describe("monthKeySchema", () => {
  it("accepts a well-formed month", () => {
    expect(monthKeySchema.safeParse("2021-06").success).toBe(true);
  });

  it("rejects an impossible month number or a date key", () => {
    expect(monthKeySchema.safeParse("2021-13").success).toBe(false);
    expect(monthKeySchema.safeParse("2021-00").success).toBe(false);
    expect(monthKeySchema.safeParse("2021-06-01").success).toBe(false);
  });
});

describe("epfWageSchema", () => {
  it("accepts zero and coerces a numeric string", () => {
    expect(epfWageSchema.safeParse(0).success).toBe(true);
    const parsed = epfWageSchema.safeParse("25000");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe(25000);
  });

  it("rejects negative, non-numeric and absurd values", () => {
    expect(epfWageSchema.safeParse(-1).success).toBe(false);
    expect(epfWageSchema.safeParse("abc").success).toBe(false);
    expect(epfWageSchema.safeParse(99_000_000).success).toBe(false);
  });
});

describe("epfBackfillSetupSchema", () => {
  const base = {
    monthlyWage: 25000,
    epsEligible: true,
    startMonth: "2021-06",
    endMonth: "2024-08",
    prorateEdgeMonths: true,
  };

  it("accepts a well-formed setup", () => {
    expect(epfBackfillSetupSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an end month before the start month", () => {
    const result = epfBackfillSetupSchema.safeParse({ ...base, endMonth: "2020-01" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "endMonth")).toBe(true);
    }
  });
});

describe("epfContributionRowFormSchema", () => {
  it("accepts a well-formed row", () => {
    expect(epfContributionRowFormSchema.safeParse(validRow).success).toBe(true);
  });

  it("rejects negative amounts", () => {
    expect(
      epfContributionRowFormSchema.safeParse({ ...validRow, employeeShare: -1 }).success
    ).toBe(false);
  });

  it("rejects a pension share above the employer contribution", () => {
    const result = epfContributionRowFormSchema.safeParse({
      ...validRow,
      epsShare: 5000,
      employerEpfShare: 0,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path[0] === "epsShare")).toBe(true);
    }
  });

  it("rejects an employer split that does not add up", () => {
    const result = epfContributionRowFormSchema.safeParse({
      ...validRow,
      employerEpfShare: 100,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((issue) => issue.path[0] === "employerEpfShare")
      ).toBe(true);
    }
  });

  it("tolerates a one-rupee rounding gap in the employer split", () => {
    expect(
      epfContributionRowFormSchema.safeParse({ ...validRow, employerEpfShare: 1751 }).success
    ).toBe(true);
  });

  it("requires a reason for a fully zero month", () => {
    const zero = {
      month: "2021-06",
      employeeShare: 0,
      employerShare: 0,
      epsShare: 0,
      employerEpfShare: 0,
    };
    expect(epfContributionRowFormSchema.safeParse(zero).success).toBe(false);
    expect(
      epfContributionRowFormSchema.safeParse({ ...zero, zeroReason: "Loss of pay" }).success
    ).toBe(true);
  });

  it("rejects a malformed credit date but allows an empty one", () => {
    expect(
      epfContributionRowFormSchema.safeParse({ ...validRow, creditDate: "15-08-2021" }).success
    ).toBe(false);
    expect(
      epfContributionRowFormSchema.safeParse({ ...validRow, creditDate: "" }).success
    ).toBe(true);
  });
});
