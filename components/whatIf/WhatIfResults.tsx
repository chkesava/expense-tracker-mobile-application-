import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, Info } from "lucide-react-native";

import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";
import {
  WHAT_IF_DISCLOSURES,
  whatIfHeadline,
  whatIfMetricRows,
  whatIfTimelineRows,
  type WhatIfRun,
  type WhatIfTone,
} from "@/shared/utils/whatIfView";

/** Metrics shown up front; the rest sit behind "More numbers". */
const PRIMARY_METRICS = ["closing_balance", "minimum_balance", "runway_months"];

/**
 * What-If results (SPENDLY-387): headline answer, key numbers, the
 * month-by-month comparison and what drives the difference. Read-only.
 * `compact` renders just the headline, for the editor's live preview.
 */
export function WhatIfResults({ run, fmt, compact = false }: { run: WhatIfRun; fmt: (n: number) => string; compact?: boolean }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const headline = useMemo(() => whatIfHeadline(run.comparison, fmt), [run, fmt]);
  const metrics = useMemo(() => whatIfMetricRows(run.comparison, fmt), [run, fmt]);
  const timeline = useMemo(() => whatIfTimelineRows(run.comparison, fmt), [run, fmt]);

  const toneColor = (tone: WhatIfTone) =>
    tone === "better" ? theme.colors.success : tone === "worse" ? theme.colors.destructive : theme.colors.mutedForeground;
  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const h2 = { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md };
  const card = {
    backgroundColor: theme.colors.card,
    borderColor: theme.colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    gap: theme.space.sm,
  };

  const headlineCard = (
    <View
      style={[card, { backgroundColor: surfaces.tile }]}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`${headline.title}. ${headline.detail}`}
    >
      <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>COMPARED WITH YOUR CURRENT PATH</Text>
      <Text style={{ color: toneColor(headline.tone), fontFamily: theme.fontFamily.bold, fontSize: theme.typography.xxl }}>{headline.title}</Text>
      <Text style={text}>{headline.detail}</Text>
      <Text style={muted}>Estimate</Text>
    </View>
  );
  if (compact) return headlineCard;

  const visibleMetrics = showAllMetrics ? metrics : metrics.filter((m) => PRIMARY_METRICS.includes(m.key));
  const maxBalance = Math.max(1, ...timeline.flatMap((r) => [Math.abs(r.baseline), Math.abs(r.scenario)]));
  const drivers = run.comparison.drivers;

  return (
    <View style={{ gap: theme.space.lg }}>
      {headlineCard}

      <View style={card}>
        <Text style={h2} accessibilityRole="header">Key numbers</Text>
        <View style={styles.rowBetween}>
          <Text style={[muted, { flex: 1.4 }]} />
          <Text style={[muted, styles.cell]}>Now</Text>
          <Text style={[muted, styles.cell]}>Scenario</Text>
        </View>
        {visibleMetrics.map((m) => (
          <View key={m.key} accessible accessibilityLabel={m.accessibilityLabel} style={{ gap: 2 }}>
            <View style={styles.rowBetween}>
              <Text style={[text, { flex: 1.4 }]}>{m.label}</Text>
              <Text style={[text, styles.cell]}>{m.baseline}</Text>
              <Text style={[text, styles.cell, { fontFamily: theme.fontFamily.semibold }]}>{m.scenario}</Text>
            </View>
            <Text style={[muted, { color: toneColor(m.tone), textAlign: "right" }]}>{m.delta}</Text>
          </View>
        ))}
        <Pressable
          onPress={() => setShowAllMetrics((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={showAllMetrics ? "Show fewer numbers" : "Show more numbers"}
          hitSlop={8}
          style={[styles.rowStart, { minHeight: 44 }]}
        >
          {showAllMetrics ? <ChevronUp size={16} color={theme.colors.primary} /> : <ChevronDown size={16} color={theme.colors.primary} />}
          <Text style={[text, { color: theme.colors.primary }]}>{showAllMetrics ? "Fewer numbers" : "More numbers"}</Text>
        </Pressable>
      </View>

      {timeline.length ? (
        <View style={card}>
          <Text style={h2} accessibilityRole="header">Month by month</Text>
          <View style={[styles.rowStart, { gap: theme.space.md }]} importantForAccessibility="no-hide-descendants">
            <View style={styles.rowStart}>
              <View style={[styles.legend, { backgroundColor: theme.colors.mutedForeground }]} />
              <Text style={muted}>Current path</Text>
            </View>
            <View style={styles.rowStart}>
              <View style={[styles.legend, { backgroundColor: theme.colors.primary }]} />
              <Text style={muted}>Scenario</Text>
            </View>
          </View>
          {timeline.map((row) => (
            <View key={row.month} accessible accessibilityLabel={row.accessibilityLabel} style={{ gap: 4, paddingVertical: 2 }}>
              <View style={styles.rowBetween}>
                <Text style={[text, { fontFamily: theme.fontFamily.semibold }]}>{row.label}</Text>
                <Text style={[muted, { color: toneColor(row.tone) }]}>
                  {row.tone === "same" ? "No change" : `${row.delta > 0 ? "+" : "−"}${fmt(Math.abs(row.delta))}`}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: theme.colors.muted }]}>
                <View style={[styles.bar, { width: `${(Math.max(0, row.baseline) / maxBalance) * 100}%`, backgroundColor: theme.colors.mutedForeground }]} />
              </View>
              <View style={[styles.track, { backgroundColor: theme.colors.muted }]}>
                <View style={[styles.bar, { width: `${(Math.max(0, row.scenario) / maxBalance) * 100}%`, backgroundColor: theme.colors.primary }]} />
              </View>
              <View style={styles.rowBetween}>
                <Text style={muted}>{fmt(row.baseline)}</Text>
                <Text style={[muted, { color: theme.colors.foreground }]}>{fmt(row.scenario)}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {drivers.length ? (
        <View style={card}>
          <Text style={h2} accessibilityRole="header">What makes the difference</Text>
          {drivers.map((d) => (
            <View
              key={d.id}
              style={styles.rowBetween}
              accessible
              accessibilityLabel={`${d.label}: ${d.delta > 0 ? "plus" : "minus"} ${fmt(Math.abs(d.delta))} ${d.direction === "in" ? "money in" : "money out"} over the projection.`}
            >
              <Text style={[text, { flex: 1 }]} numberOfLines={2}>{d.label}</Text>
              <Text style={[text, { color: d.direction === "in" ? theme.colors.success : theme.colors.destructive }]}>
                {d.direction === "in" ? "+" : "−"}
                {fmt(Math.abs(d.delta))}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={[card, { backgroundColor: surfaces.tile }]}>
        <View style={styles.rowStart}>
          <Info size={16} color={theme.colors.mutedForeground} />
          <Text style={[muted, { fontFamily: theme.fontFamily.semibold }]}>About these numbers</Text>
        </View>
        {WHAT_IF_DISCLOSURES.map((line) => (
          <Text key={line} style={muted}>{`• ${line}`}</Text>
        ))}
        {run.comparison.issues.length ? <Text style={muted}>{`Notes: ${run.comparison.issues.join("; ")}`}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 6 },
  cell: { flex: 1, textAlign: "right" },
  legend: { width: 10, height: 10, borderRadius: 2 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
});
