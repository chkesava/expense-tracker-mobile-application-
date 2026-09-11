import { describe, expect, it } from "vitest";

import {
  epfEstablishmentFormSchema,
  epfProfileFormSchema,
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
