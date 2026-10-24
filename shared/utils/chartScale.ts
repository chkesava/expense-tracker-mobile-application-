/**
 * SPENDLY-574 — a round top for a chart's value axis, so its gridlines read
 * 0 / 5K / 10K / 15K / 20K instead of 0 / 4.6K / 9.3K. The top is `intervals`
 * equal steps, each a 1, 2, 2.5, 3 or 5 × 10ⁿ value, with a little headroom so the
 * tallest bar never touches the frame. Pure.
 */
export function niceAxisMax(value: number, intervals = 4, headroom = 1.05): number {
  const steps = Math.max(1, Math.round(intervals));
  if (!Number.isFinite(value) || value <= 0) return steps;
  const rawStep = (value * headroom) / steps;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = [1, 2, 2.5, 3, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? 10 * magnitude;
  return step * steps;
}
