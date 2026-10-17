import type { CreditCardBillStatus } from "../types/creditCardBill";

export type PresentationTone = "positive" | "warning" | "negative" | "accent" | "muted";

/**
 * SPENDLY-535 — credit utilisation as a word and a tone, so the Cards screens
 * never signal it by colour alone. Same bands as before: up to 30% is low,
 * over 70% is high.
 */
export function creditUtilizationBand(ratePct: number): {
  level: "low" | "moderate" | "high";
  word: string;
  tone: PresentationTone;
} {
  if (ratePct > 70) return { level: "high", word: "High", tone: "negative" };
  if (ratePct > 30) return { level: "moderate", word: "Moderate", tone: "warning" };
  return { level: "low", word: "Low", tone: "positive" };
}

/** SPENDLY-535 — a card bill's status as a readable word and a tone. */
export function billStatusPresentation(status: CreditCardBillStatus): {
  word: string;
  tone: PresentationTone;
} {
  switch (status) {
    case "OVERDUE":
      return { word: "Overdue", tone: "negative" };
    case "DUE_TODAY":
      return { word: "Due today", tone: "warning" };
    case "DUE_SOON":
      return { word: "Due soon", tone: "warning" };
    case "PARTIALLY_PAID":
      return { word: "Partly paid", tone: "accent" };
    case "PAID":
      return { word: "Paid", tone: "positive" };
    case "UPCOMING":
      return { word: "Upcoming", tone: "muted" };
    default: {
      const raw = String(status).replaceAll("_", " ").toLowerCase();
      return { word: raw.charAt(0).toUpperCase() + raw.slice(1), tone: "muted" };
    }
  }
}
