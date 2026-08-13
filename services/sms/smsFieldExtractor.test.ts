import { describe, expect, it } from "vitest";

import {
  extractBank,
  extractSmsFields,
} from "@/services/sms/smsFieldExtractor";
import { parseBankSms } from "@/services/sms/smsParser";
import { adaptParsedSmsToWritePayload } from "@/services/sms/expenseAdapter";

describe("extractBank catalog identifiers", () => {
  it("keeps SBI and HDFC from existing SMS fixtures", () => {
    expect(
      extractBank(
        "Your A/c XX4521 has been debited for Rs.450 towards Swiggy via UPI. -SBI",
        "VK-SBIINB"
      )
    ).toBe("SBI");
    expect(extractBank("INR 120 spent at Zomato via UPI", "AX-HDFCBK")).toBe(
      "HDFC"
    );
  });

  it("resolves Super Money from SMS sender without using a display name", () => {
    expect(extractBank("INR 200 spent on Super Card ending 4521", "VM-SUPER")).toBe(
      "Super Money"
    );
    expect(extractBank("INR 200 spent on Super Card ending 4521", "AD-SUPER")).toBe(
      "Super Money"
    );
  });
});

describe("extractSmsFields", () => {
  it("extracts amount, merchant, bank, UPI, date, account, and ref", () => {
    const fields = extractSmsFields({
      address: "VK-SBIINB",
      body:
        "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI",
      receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
    });

    expect(fields.amount).toBe(450);
    expect(fields.merchant?.toLowerCase()).toContain("swiggy");
    expect(fields.bank).toBe("SBI");
    expect(fields.paymentMethod).toBe("UPI");
    expect(fields.date).toBe("2026-08-12");
    expect(fields.accountLast4).toBe("4521");
    expect(fields.externalRef).toBe("987654321012");
  });

  it("falls back to SMS timestamp when body has no date", () => {
    const fields = extractSmsFields({
      address: "AX-HDFCBK",
      body: "INR 120 spent at Zomato via UPI",
      receivedAtMs: Date.parse("2026-07-01T08:30:00+05:30"),
    });
    expect(fields.amount).toBe(120);
    expect(fields.merchant?.toLowerCase()).toContain("zomato");
    expect(fields.paymentMethod).toBe("UPI");
    expect(fields.date).toMatch(/^2026-07-0[12]$/);
  });
});

describe("parseBankSms Phase 5", () => {
  it("builds Swiggy expense draft with structured fields", () => {
    const parsed = parseBankSms({
      id: "42",
      address: "VK-SBIINB",
      body:
        "Your A/c XX4521 has been debited for Rs.450 on 12-08-2026 towards Swiggy via UPI. Ref No 987654321012. -SBI",
      receivedAtMs: Date.parse("2026-08-12T10:00:00+05:30"),
    });

    expect(parsed.kind).toBe("expense");
    expect(parsed.amount).toBe(450);
    expect(parsed.merchant).toBe("Swiggy");
    expect(parsed.bank).toBe("SBI");
    expect(parsed.paymentMethod).toBe("UPI");
    expect(parsed.accountLast4).toBe("4521");
    expect(parsed.externalRef).toBe("987654321012");
    expect(parsed.date).toBe("2026-08-12");
    expect(parsed.note).toMatch(/Swiggy/i);
    expect(parsed.note).toMatch(/UPI/);
    expect(parsed.templateId).toBe("phase7-parser");
    expect(parsed.category).toBe("Food & Dining");
    expect(parsed.subcategory).toBe("Food Delivery");

    const write = adaptParsedSmsToWritePayload(parsed);
    expect(write?.collection).toBe("expenses");
    if (write?.collection === "expenses") {
      expect(write.payload.amount).toBe(450);
      expect(write.payload.category).toBe("Food & Dining");
      expect(write.payload.subcategory).toBe("Food Delivery");
      expect(write.payload.tags).toEqual(
        expect.arrayContaining(["sms", "upi", "sbi"])
      );
    }
  });
});
