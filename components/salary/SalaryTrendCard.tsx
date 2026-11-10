import { useMemo } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  ChevronRight,
  HelpCircle,
  Layers,
  Minus,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import type { SalaryRecord } from "@/shared/features/salary/types";
import {
  buildSalaryAnalytics,
  type IncomeStabilityClassification,
  type MetricComparison,
  type MonthlySalaryPoint,
  type SalaryInsight,
  type TrendDirection,
} from "@/shared/features/salary/utils/analytics";
import { formatMonthName } from "@/shared/features/salary/utils/timeline";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface SalaryTrendCardProps {
  records: SalaryRecord[];
  targetMonth?: string;
  employerName?: string;
  canonicalOnly?: boolean;
  onSelectMonth?: (month: string) => void;
  testID?: string;
}

export function SalaryTrendCard({
  records,
  targetMonth,
  employerName,
  canonicalOnly = true,
  onSelectMonth,
  testID,
}: SalaryTrendCardProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const surfaces = useSurfaces();

  const analytics = useMemo(
    () =>
      buildSalaryAnalytics(records, {
        targetMonth,
        employerName,
        canonicalOnly,
      }),
    [records, targetMonth, employerName, canonicalOnly]
  );

  const {
    targetMonth: currentTargetMonth,
    latestPoint,
    mom,
    yoy,
    stability,
    baseline,
    series,
    totalRegularNet,
    totalVariableNet,
    variableSharePct,
    insights,
  } = analytics;

  const targetMonthLabel = currentTargetMonth
    ? formatMonthName(currentTargetMonth)
    : "No records";

  // Last 6 months for the mini trend list
  const recentSeries = useMemo(() => series.slice(-6), [series]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID={testID}
    >
      {/* ── 1. Header ────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Salary Growth & Stability
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {targetMonthLabel} • Factual historical income analytics
          </Text>
        </View>
        <StabilityBadge classification={stability.classification} label={stability.classificationLabel} />
      </View>

      {/* ── 2. Top 3 Metric Cards (MoM, YoY, Stability) ──────────────────── */}
      <View style={styles.metricsGrid}>
        {/* Month-over-Month Card */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: surfaces.tile, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
            Base MoM
          </Text>
          {mom.hasPreviousData && mom.regular ? (
            <View style={styles.metricValRow}>
              <TrendIcon direction={mom.regular.direction} size={16} />
              <Text
                style={[
                  styles.metricValue,
                  { color: getTrendColor(mom.regular.direction, colors) },
                ]}
              >
                {mom.regular.direction === "up" ? "+" : ""}
                {mom.regular.pct}%
              </Text>
            </View>
          ) : (
            <Text style={[styles.metricMuted, { color: colors.mutedForeground }]}>
              —
            </Text>
          )}
          <Text
            numberOfLines={2}
            style={[styles.metricSubtext, { color: colors.mutedForeground }]}
          >
            {mom.hasPreviousData && mom.regular
              ? `vs ${formatMonthName(mom.previousMonth)}`
              : mom.insufficientHistoryReason || "Needs 2+ months"}
          </Text>
        </View>

        {/* Year-over-Year Card */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: surfaces.tile, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
            Annual (YoY)
          </Text>
          {yoy.hasLastYearData && yoy.regular ? (
            <View style={styles.metricValRow}>
              <TrendIcon direction={yoy.regular.direction} size={16} />
              <Text
                style={[
                  styles.metricValue,
                  { color: getTrendColor(yoy.regular.direction, colors) },
                ]}
              >
                {yoy.regular.direction === "up" ? "+" : ""}
                {yoy.regular.pct}%
              </Text>
            </View>
          ) : (
            <Text style={[styles.metricMuted, { color: colors.mutedForeground }]}>
              —
            </Text>
          )}
          <Text
            numberOfLines={2}
            style={[styles.metricSubtext, { color: colors.mutedForeground }]}
          >
            {yoy.hasLastYearData && yoy.regular
              ? `vs ${formatMonthName(yoy.sameMonthLastYear)}`
              : yoy.insufficientHistoryReason || "Needs 12+ months"}
          </Text>
        </View>

        {/* Stability Index Card */}
        <View
          style={[
            styles.metricCard,
            { backgroundColor: surfaces.tile, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>
            Stability Index
          </Text>
          {stability.classification !== "insufficient_data" ? (
            <Text style={[styles.metricValue, { color: colors.foreground }]}>
              {roundToTenth(stability.coefficientOfVariation * 100)}%
            </Text>
          ) : (
            <Text style={[styles.metricMuted, { color: colors.mutedForeground }]}>
              —
            </Text>
          )}
          <Text
            numberOfLines={2}
            style={[styles.metricSubtext, { color: colors.mutedForeground }]}
          >
            {stability.classification !== "insufficient_data"
              ? `${stability.monthsEvaluated} mo. variance`
              : "Needs 3+ paychecks"}
          </Text>
        </View>
      </View>

      {/* ── 3. Variable vs Regular Stream Composition ─────────────────────── */}
      {totalVariableNet > 0 ? (
        <View
          style={[
            styles.variableSection,
            { backgroundColor: surfaces.tile, borderColor: colors.border },
          ]}
        >
          <View style={styles.variableHeader}>
            <View style={styles.variableTitleRow}>
              <Layers size={14} color={colors.primary} />
              <Text style={[styles.variableTitle, { color: colors.foreground }]}>
                Income Composition
              </Text>
            </View>
            <Text style={[styles.variableShareText, { color: colors.mutedForeground }]}>
              {variableSharePct}% Variable Pay
            </Text>
          </View>

          {/* Composition Proportion Bar */}
          <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.barFillRegular,
                {
                  flex: Math.max(1, 100 - variableSharePct),
                  backgroundColor: colors.primary,
                },
              ]}
            />
            <View
              style={[
                styles.barFillVariable,
                { flex: Math.max(1, variableSharePct), backgroundColor: "#f59e0b" },
              ]}
            />
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: colors.primary }]}
              />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
                Base: <Amount value={totalRegularNet} currency="INR" style={styles.boldText} />
              </Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: "#f59e0b" }]}
              />
              <Text style={[styles.legendLabel, { color: colors.mutedForeground }]}>
                Bonus / Var:{" "}
                <Amount value={totalVariableNet} currency="INR" style={styles.boldText} />
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* ── 4. Rolling Baseline Comparison ───────────────────────────────── */}
      {baseline.rolling6MonthAvg != null ? (
        <View
          style={[
            styles.baselineBox,
            { backgroundColor: surfaces.tile, borderColor: colors.border },
          ]}
        >
          <View style={styles.baselineLeft}>
            <Activity size={16} color={colors.primary} />
            <View style={styles.baselineTexts}>
              <Text style={[styles.baselineTitle, { color: colors.foreground }]}>
                6-Month Rolling Baseline:{" "}
                <Amount
                  value={baseline.rolling6MonthAvg}
                  currency="INR"
                  style={styles.boldText}
                />
              </Text>
              <Text style={[styles.baselineDesc, { color: colors.mutedForeground }]}>
                {baseline.explanation}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      {/* ── 5. Recent Monthly Salary Series ───────────────────────────────── */}
      {recentSeries.length > 0 ? (
        <View style={styles.seriesSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recent Monthly History
          </Text>

          <View style={styles.seriesList}>
            {recentSeries.map((point) => {
              const isSelected = point.month === currentTargetMonth;
              return (
                <Pressable
                  key={point.month}
                  style={[
                    styles.seriesRow,
                    {
                      backgroundColor: isSelected
                        ? surfaces.control
                        : surfaces.tile,
                      borderColor: isSelected ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => onSelectMonth?.(point.month)}
                >
                  <View style={styles.seriesMonthCol}>
                    <Text
                      style={[
                        styles.seriesMonthText,
                        {
                          color: isSelected
                            ? colors.primary
                            : colors.foreground,
                          fontWeight: isSelected ? "700" : "500",
                        },
                      ]}
                    >
                      {formatMonthName(point.month)}
                    </Text>
                    {point.variableNet > 0 ? (
                      <Text style={[styles.seriesBonusTag, { color: "#f59e0b" }]}>
                        +<Amount value={point.variableNet} currency="INR" /> variable
                      </Text>
                    ) : null}
                  </View>

                  <View style={styles.seriesAmountCol}>
                    <Amount
                      value={point.totalNet}
                      currency="INR"
                      style={[
                        styles.seriesAmountValue,
                        { color: colors.foreground },
                      ]}
                    />
                    <ChevronRight size={14} color={colors.mutedForeground} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* ── 6. Factual Insights List ──────────────────────────────────────── */}
      {insights.length > 0 ? (
        <View style={styles.insightsSection}>
          <View style={styles.insightsHeader}>
            <Sparkles size={14} color={colors.primary} />
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              Financial Observations
            </Text>
          </View>

          <View style={styles.insightsList}>
            {insights.map((insight) => (
              <View
                key={insight.id}
                style={[
                  styles.insightCard,
                  { backgroundColor: surfaces.tile, borderColor: colors.border },
                ]}
              >
                <Text style={[styles.insightTitle, { color: colors.foreground }]}>
                  {insight.title}
                </Text>
                <Text
                  style={[styles.insightBody, { color: colors.mutedForeground }]}
                >
                  {insight.body}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── 7. Privacy & Invariant Note ───────────────────────────────────── */}
      <View style={styles.privacyNote}>
        <HelpCircle size={12} color={colors.mutedForeground} />
        <Text style={[styles.privacyNoteText, { color: colors.mutedForeground }]}>
          Calculated strictly from confirmed net salary credits. No performance or
          career appraisals are inferred.
        </Text>
      </View>
    </View>
  );
}

function StabilityBadge({
  classification,
  label,
}: {
  classification: IncomeStabilityClassification;
  label: string;
}) {
  if (classification === "high_stability") {
    return (
      <View style={[styles.stabilityBadge, { backgroundColor: "rgba(16, 185, 129, 0.12)" }]}>
        <CheckCircle2 size={12} color="#10b981" />
        <Text style={[styles.stabilityBadgeText, { color: "#10b981" }]}>{label}</Text>
      </View>
    );
  }

  if (classification === "moderate_stability") {
    return (
      <View style={[styles.stabilityBadge, { backgroundColor: "rgba(59, 130, 246, 0.12)" }]}>
        <Activity size={12} color="#3b82f6" />
        <Text style={[styles.stabilityBadgeText, { color: "#3b82f6" }]}>{label}</Text>
      </View>
    );
  }

  if (classification === "variable_income") {
    return (
      <View style={[styles.stabilityBadge, { backgroundColor: "rgba(245, 158, 11, 0.12)" }]}>
        <AlertCircle size={12} color="#f59e0b" />
        <Text style={[styles.stabilityBadgeText, { color: "#f59e0b" }]}>{label}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.stabilityBadge, { backgroundColor: "rgba(107, 114, 128, 0.12)" }]}>
      <Text style={[styles.stabilityBadgeText, { color: "#6b7280" }]}>{label}</Text>
    </View>
  );
}

function TrendIcon({ direction, size }: { direction: TrendDirection; size: number }) {
  if (direction === "up") {
    return <ArrowUpRight size={size} color="#10b981" />;
  }
  if (direction === "down") {
    return <ArrowDownRight size={size} color="#ef4444" />;
  }
  return <Minus size={size} color="#6b7280" />;
}

function getTrendColor(direction: TrendDirection, colors: any): string {
  if (direction === "up") return "#10b981";
  if (direction === "down") return "#ef4444";
  return colors.mutedForeground;
}

function roundToTenth(val: number): string {
  return (Math.round(val * 10) / 10).toFixed(1);
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  headerTitles: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 12,
  },
  stabilityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  stabilityBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  metricsGrid: {
    flexDirection: "row",
    gap: 8,
  },
  metricCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  metricValRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: "800",
  },
  metricMuted: {
    fontSize: 16,
    fontWeight: "600",
  },
  metricSubtext: {
    fontSize: 10,
    lineHeight: 13,
  },
  variableSection: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  variableHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  variableTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  variableTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  variableShareText: {
    fontSize: 11,
    fontWeight: "500",
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  barFillRegular: {
    height: "100%",
  },
  barFillVariable: {
    height: "100%",
  },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 11,
  },
  boldText: {
    fontWeight: "700",
  },
  baselineBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  baselineLeft: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  baselineTexts: {
    flex: 1,
    gap: 2,
  },
  baselineTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  baselineDesc: {
    fontSize: 11,
    lineHeight: 15,
  },
  seriesSection: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  seriesList: {
    gap: 6,
  },
  seriesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  seriesMonthCol: {
    gap: 2,
  },
  seriesMonthText: {
    fontSize: 13,
  },
  seriesBonusTag: {
    fontSize: 11,
    fontWeight: "600",
  },
  seriesAmountCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  seriesAmountValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  insightsSection: {
    gap: 8,
  },
  insightsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  insightsList: {
    gap: 6,
  },
  insightCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    gap: 2,
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: "700",
  },
  insightBody: {
    fontSize: 11,
    lineHeight: 15,
  },
  privacyNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingTop: 4,
  },
  privacyNoteText: {
    fontSize: 11,
    flex: 1,
    lineHeight: 14,
  },
});
