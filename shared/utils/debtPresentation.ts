import type { BorrowingStatus } from "../types/borrowing";
import type { ReceivableStatus } from "../types/receivable";
import type { PresentationTone } from "./creditCardPresentation";

/**
 * SPENDLY-536 — one tone per borrowing / money-lent status. The words stay the
 * types' own labels; this only replaces the fixed hex colours the cards used.
 */
export function debtStatusTone(status: BorrowingStatus | ReceivableStatus): PresentationTone {
  switch (status) {
    case "OVERDUE":
      return "negative";
    case "PARTIALLY_SETTLED":
      return "warning";
    case "FULLY_SETTLED":
      return "positive";
    case "ACTIVE":
      return "accent";
    default:
      return "muted";
  }
}

/** Share of `total` that `done` covers, as a 0–100 percentage (0 when there is no total). */
export function settledPercent(done: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(done)) return 0;
  return Math.max(0, Math.min(100, (done / total) * 100));
}
