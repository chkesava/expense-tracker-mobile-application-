/**
 * SPENDLY-562 — the `paymentRequests/{slug}` document a Collect request
 * writes. Optional fields the caller doesn't have (a profile photo, a note's
 * split link…) are left out instead of being sent as `undefined`, which
 * Firestore rejects ("Unsupported field value: undefined"). That rejection
 * made every user without a profile photo — all email/password sign-ups —
 * unable to create a payment request.
 */

import type { PaymentRequest, PaymentRequestInput } from "../types/paymentRequest";
import type { QrStyleId } from "./qrStyles";
import { omitUndefined } from "./firestorePayload";

export function buildPaymentRequestDoc(
  input: PaymentRequestInput,
  ctx: {
    slug: string;
    createdBy: string;
    nowMs: number;
    /** Used when the input has no QR style. */
    fallbackQrStyleId: QrStyleId;
    /** Carried on the doc so the signed-out public page can show it. */
    fallbackCurrency: string;
  }
): Omit<PaymentRequest, "id"> {
  return omitUndefined({
    ...input,
    slug: ctx.slug,
    createdBy: ctx.createdBy,
    createdAt: ctx.nowMs,
    status: "active" as const,
    qrStyleId: input.qrStyleId || ctx.fallbackQrStyleId,
    currency: input.currency || ctx.fallbackCurrency,
  });
}
