/**
 * Chart axis helpers.
 *
 * Axis ticks are deliberately lossy — they exist to give a chart scale, never
 * to state an amount. Use `Amount` for anything the user reads as money.
 */

/** 12500 -> "13K", 1_200_000 -> "1.2M". */
export function compactAxisValue(value: number): string {
  if (value <= 0) return "0";
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}M`;
  }
  if (value >= 1000) {
    const thousands = value / 1000;
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1)}K`;
  }
  return String(Math.round(value));
}
