/**
 * SPENDLY-572 — short money figures for tight spots (the net-worth card's
 * footer): "₹10.20L", "₹1.78L", "₹2.35Cr" for rupees, "$12.5K" / "$3.2M"
 * elsewhere. Below one lakh (or one thousand) the whole-rupee figure is shown
 * as is. Display only — never used for arithmetic or storage.
 */

import { currencySymbol } from "./formatCurrency";

const LAKH = 100_000;
const CRORE = 10_000_000;

/** One decimal, trailing ".0" dropped: 12.5, 3.2, 2. */
function oneDecimal(value: number): string {
  return String(Number(value.toFixed(1)));
}

/** Magnitude only; callers add a sign. */
export function compactAmountNumber(value: number, currencyCode = "INR"): string {
  const abs = Math.abs(value);
  if (!Number.isFinite(abs)) return "0";
  if (currencyCode === "INR") {
    if (abs >= CRORE) return `${(abs / CRORE).toFixed(2)}Cr`;
    if (abs >= LAKH) return `${(abs / LAKH).toFixed(2)}L`;
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(abs));
  }
  if (abs >= 1_000_000_000) return `${oneDecimal(abs / 1_000_000_000)}B`;
  if (abs >= 1_000_000) return `${oneDecimal(abs / 1_000_000)}M`;
  if (abs >= 10_000) return `${oneDecimal(abs / 1_000)}K`;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(abs));
}

export function compactAmount(value: number, currencyCode = "INR"): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}${currencySymbol(currencyCode || "INR")}${compactAmountNumber(value, currencyCode)}`;
}
