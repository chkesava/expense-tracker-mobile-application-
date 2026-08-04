/**
 * Chart color helpers for web and React Native.
 * Phase 0 exports portable hex constants; CSS-variable resolution is deferred to UI layers.
 */

/** Portable series used when theme tokens are unavailable. */
export const COLORS = [
  "#4f46e5", // primary-ish indigo
  "#16a34a", // success
  "#f59e0b", // warning
  "#2563eb", // info
  "#dc2626", // destructive
  "#0d9488", // teal
  "#9333ea", // violet
  "#ea580c", // orange
  "#10b981", // emerald
  "#3b82f6", // sky
  "#8b5cf6", // indigo
  "#db2777", // pink
  "#14b8a6", // cyan
  "#f97316", // amber
  "#ef4444", // crimson
];

export type ChartTokenSet = {
  primary: string;
  success: string;
  warning: string;
  info: string;
  destructive: string;
  muted: string;
  foreground: string;
  border: string;
  card: string;
  tooltipBg: string;
  tooltipBorder: string;
  series: string[];
};

/** Default chart palette from portable hex constants. */
export function chartTokens(overrides?: Partial<ChartTokenSet>): ChartTokenSet {
  const base: ChartTokenSet = {
    primary: COLORS[0],
    success: COLORS[1],
    warning: COLORS[2],
    info: COLORS[3],
    destructive: COLORS[4],
    muted: "#94a3b8",
    foreground: "#0f172a",
    border: "#e2e8f0",
    card: "#ffffff",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e2e8f0",
    series: [...COLORS],
  };
  return { ...base, ...overrides, series: overrides?.series ?? base.series };
}

export function getChartColor(index: number, tokens?: ChartTokenSet): string {
  const series = tokens?.series ?? chartTokens().series;
  return series[index % series.length];
}

export function chartTooltipStyle(tokens?: ChartTokenSet): Record<string, string | number> {
  const t = tokens ?? chartTokens();
  return {
    backgroundColor: t.tooltipBg,
    borderRadius: 12,
    border: `1px solid ${t.tooltipBorder}`,
    color: t.foreground,
    boxShadow: "none",
  };
}

export function chartAxisTick(tokens?: ChartTokenSet) {
  const t = tokens ?? chartTokens();
  return { fontSize: 11, fill: t.muted };
}
