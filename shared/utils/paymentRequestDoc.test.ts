import { describe, expect, it } from "vitest";

import type { PaymentRequestInput } from "../types/paymentRequest";
import { containsUndefined } from "./firestorePayload";
import { buildPaymentRequestDoc } from "./paymentRequestDoc";

const ctx = {
  slug: "abc123def0",
  createdBy: "uid-1",
  nowMs: 1_792_000_000_000,
  fallbackQrStyleId: "indigo" as const,
  fallbackCurrency: "INR",
};

const base: PaymentRequestInput = {
  amount: 500,
  note: "Dinner",
  notePrefix: "Payment",
  payeeName: "Demo User",
  upiId: "demo@upi",
  qrStyleId: "indigo" as const,
};

describe("buildPaymentRequestDoc (SPENDLY-562)", () => {
  it("omits payeePhotoUrl for a user without a profile photo", () => {
    const doc = buildPaymentRequestDoc({ ...base, payeePhotoUrl: undefined }, ctx);
    expect(doc).not.toHaveProperty("payeePhotoUrl");
    expect(containsUndefined(doc)).toBe(false);
    expect(doc).toMatchObject({
      slug: "abc123def0",
      createdBy: "uid-1",
      createdAt: ctx.nowMs,
      status: "active",
      amount: 500,
      currency: "INR",
    });
  });

  it("keeps payeePhotoUrl unchanged for a user with a photo", () => {
    const doc = buildPaymentRequestDoc({ ...base, payeePhotoUrl: "https://example.com/me.png" }, ctx);
    expect(doc.payeePhotoUrl).toBe("https://example.com/me.png");
  });

  it("drops every other undefined optional field and fills the fallbacks", () => {
    const doc = buildPaymentRequestDoc(
      { ...base, note: undefined, splitId: undefined, participantKey: undefined, currency: undefined, qrStyleId: "" as PaymentRequestInput["qrStyleId"] },
      ctx
    );
    expect(containsUndefined(doc)).toBe(false);
    expect(doc).not.toHaveProperty("note");
    expect(doc).not.toHaveProperty("splitId");
    expect(doc.qrStyleId).toBe("indigo");
    expect(doc.currency).toBe("INR");
  });

  it("never lets the input override identity fields", () => {
    const doc = buildPaymentRequestDoc({ ...base, currency: "USD" }, { ...ctx, slug: "zzz" });
    expect(doc.slug).toBe("zzz");
    expect(doc.createdBy).toBe("uid-1");
    expect(doc.currency).toBe("USD");
  });
});
