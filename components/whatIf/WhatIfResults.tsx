import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronDown, ChevronUp, FlaskConical, Info } from "lucide-react-native";

import { HeroSection, MetaLabel, Pill, Section, SectionAction } from "@/components/dashboard/primitives";

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
 *
 * SPENDLY-546: the headline is the deep hero; the rest are `Section`s. `fmt`
 * is the ghost-aware formatter, so every figure and label masks in ghost mode.
 */
export function WhatIfResults({ run, fmt, compact = false }: { run: WhatIfRun; fmt: (n: number) => string; compact?: boolean }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const [showAllMetrics, setShowAllMetrics] = useState(false);
  const [showAbout, setShowAbout] = useState(true);
  const headline = useMemo(() => whatIfHeadline(run.comparison, fmt), [run, fmt]);
  const metrics = useMemo(() => whatIfMetricRows(run.comparison, fmt), [run, fmt]);
  const timeline = useMemo(() => whatIfTimelineRows(run.comparison, fmt), [run, fmt]);

  const toneColor = (tone: WhatIfTone) =>
    tone === "better" ? theme.colors.success : tone === "worse" ? theme.colors.destructive : theme.colors.mutedForeground;
  const text = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const muted = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const num = { fontVariant: ["tabular-nums" as const] };

  const headlineCard = (
    <HeroSection
      variant="deep"
      title="Scenario result"
      subtitle="Compared with your current path"
      icon={<FlaskConical size={16} color={theme.colors.primary} />}
      action={<Pill label="Estimate" tone={headline.tone === "better" ? "positive" : headline.tone === "worse" ? "negative" : "muted"} />}
    >
      <View style={{ gap: 6 }} accessible accessibilityRole="summary" accessibilityLabel={`${headline.title}. ${headline.detail}`}>
        <Text style={[num, { color: toneColor(headline.tone), fontFamily: theme.fontFamily.bold, fontSize: theme.typography.xxl }]}>{headline.title}</Text>
        <Text style={[text, { color: theme.colors.mutedForeground }]}>{headline.detail}</Text>
      </View>
    </HeroSection>
  );
  if (compact) return headlineCard;

  const visibleMetrics = showAllMetrics ? metrics : metrics.filter((m) => PRIMARY_METRICS.includes(m.key));
  const maxBalance = Math.max(1, ...timeline.flatMap((r) => [Math.abs(r.baseline), Math.abs(r.scenario)]));
  const drivers = run.comparison.drivers;

  return (
    <View style={{ gap: theme.space.lg }}>
      {headlineCard}

      <Section title="Key numbers" subtitle="Your current path and this scenario">
        {visibleMetrics.map((m, i) => (
          <View
            key={m.key}
            accessible
            accessibilityLabel={m.accessibilityLabel}
            style={[styles.metric, i < visibleMetrics.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surfaces.divider }]}
          >
            <View style={styles.rowBetween}>
              <Text style={[text, { flex: 1, fontFamily: theme.fontFamily.medium }]}>{m.label}</Text>
              <Text style={[muted, num, { color: toneColor(m.tone), fontFamily: theme.fontFamily.semibold }]}>{m.delta}</Text>
            </View>
            <View style={[styles.rowBetween, { alignItems: "flex-end" }]}>
              <View style={{ flexShrink: 1 }}>
                <MetaLabel>Now</MetaLabel>
                <Text style={[text, num, { color: theme.colors.mutedForeground }]}>{m.baseline}</Text>
              </View>
              <View style={{ flexShrink: 1, alignItems: "flex-end" }}>
                <MetaLabel>Scenario</MetaLabel>
                <Text style={[text, num, { fontFamily: theme.fontFamily.semibold }]}>{m.scenario}</Text>
              </View>
            </View>
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
          <Text style={[text, { color: theme.colors.primary, fontFamily: theme.fontFamily.semibold }]}>{showAllMetrics ? "Fewer numbers" : "More numbers"}</Text>
        </Pressable>
      </Section>

      {timeline.length ? (
        <Section title="Month by month" contentStyle={{ gap: theme.space.sm }}>
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
                <Text style={[muted, num, { color: toneColor(row.tone), fontFamily: theme.fontFamily.semibold }]}>
                  {row.tone === "same" ? "No change" : `${row.delta > 0 ? "+" : "−"}${fmt(Math.abs(row.delta))}`}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: surfaces.track }]}>
                <View style={[styles.bar, { width: `${(Math.max(0, row.baseline) / maxBalance) * 100}%`, backgroundColor: theme.colors.mutedForeground }]} />
              </View>
              <View style={[styles.track, { backgroundColor: surfaces.track }]}>
                <View style={[styles.bar, { width: `${(Math.max(0, row.scenario) / maxBalance) * 100}%`, backgroundColor: theme.colors.primary }]} />
              </View>
              <View style={styles.rowBetween}>
                <Text style={[muted, num]}>{fmt(row.baseline)}</Text>
                <Text style={[muted, num, { color: theme.colors.foreground }]}>{fmt(row.scenario)}</Text>
              </View>
            </View>
          ))}
        </Section>
      ) : null}

      {drivers.length ? (
        <Section title="What makes the difference">
          {drivers.map((d, i) => (
            <View
              key={d.id}
              style={[styles.rowBetween, styles.driver, i < drivers.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surfaces.divider }]}
              accessible
              accessibilityLabel={`${d.label}: ${d.delta > 0 ? "plus" : "minus"} ${fmt(Math.abs(d.delta))} ${d.direction === "in" ? "money in" : "money out"} over the projection.`}
            >
              <Text style={[text, { flex: 1 }]} numberOfLines={2}>{d.label}</Text>
              <Text style={[text, num, { fontFamily: theme.fontFamily.semibold, color: d.direction === "in" ? theme.colors.success : theme.colors.destructive }]}>
                {d.direction === "in" ? "+" : "−"}
                {fmt(Math.abs(d.delta))}
              </Text>
            </View>
          ))}
        </Section>
      ) : null}

      <Section
        title="About these numbers"
        icon={<Info size={16} color={theme.colors.mutedForeground} />}
        action={<SectionAction label={showAbout ? "Hide" : "Show"} onPress={() => setShowAbout((v) => !v)} accessibilityLabel={`${showAbout ? "Hide" : "Show"} about these numbers`} />}
      >
        {showAbout ? (
          <View style={{ gap: 4 }}>
            {WHAT_IF_DISCLOSURES.map((line) => (
              <Text key={line} style={muted}>{`• ${line}`}</Text>
            ))}
            {run.comparison.issues.length ? <Text style={muted}>{`Notes: ${run.comparison.issues.join("; ")}`}</Text> : null}
          </View>
        ) : null}
      </Section>
    </View>
  );
}

const styles = StyleSheet.create({
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  rowStart: { flexDirection: "row", alignItems: "center", gap: 6 },
  legend: { width: 10, height: 10, borderRadius: 2 },
  track: { height: 6, borderRadius: 3, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3 },
  metric: { gap: 6, paddingVertical: 10 },
  driver: { minHeight: 44, paddingVertical: 8 },
});
