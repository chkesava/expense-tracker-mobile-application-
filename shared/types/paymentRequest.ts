import type { QrStyleId } from "../utils/qrStyles";

export type PaymentRequest = {
  id: string;
  /** Public path segment: /payment/:slug */
  slug: string;
  createdBy: string;
  createdAt: number;
  amount: number;
  note?: string;
  notePrefix: string;
  payeeName: string;
  payeePhotoUrl?: string;
  upiId: string;
  qrStyleId: QrStyleId;
  status: "active" | "cancelled";
  /** Set when this request was created for a collect-mode split. */
  splitId?: string;
  participantKey?: string;
};

export type PaymentRequestInput = Omit<
  PaymentRequest,
  "id" | "slug" | "createdBy" | "createdAt" | "status"
>;
