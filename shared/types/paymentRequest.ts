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
};

export type PaymentRequestInput = Omit<
  PaymentRequest,
  "id" | "slug" | "createdBy" | "createdAt" | "status"
>;
