import { useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  HelpCircle,
  Info,
  Layers,
  Sparkles,
  TrendingUp,
} from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { useSettings } from "@/providers/SettingsProvider";
import type { SalaryProfile, SalaryRecord } from "@/shared/features/salary/types";
import {
  buildSalaryForecast,
  type ForecastConfidence,
  type ProjectedPaycheck,
} from "@/shared/features/salary/utils/forecast";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { formatMonthName } from "@/shared/features/salary/utils/timeline";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

export interface SalaryForecastCardProps {
  records: SalaryRecord[];
  todayKey?: string;
  profile?: SalaryProfile;
  employerName?: string;
  onAddToCalendar?: (paycheck: ProjectedPaycheck) => void;
  testID?: string;
}

export function SalaryForecastCard({
  records,
  todayKey,
  profile,
  employerName,
  onAddToCalendar,
  testID,
}: SalaryForecastCardProps) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const surfaces = useSurfaces();
  const { settings } = useSettings();

  const forecast = useMemo(
    () =>
      buildSalaryForecast(records, {
        todayKey,
        profile,
        employerName,
        monthsAhead: 3,
      }),
    [records, todayKey, profile, employerName]
  );

  const {
    hasSufficientData,
    nextExpectedPaycheck,
    upcomingProjections,
    baselineRegularNet,
    historicalBonusAverageMonthly,
    disclaimer,
    insufficientHistoryReason,
  } = forecast;

  if (!hasSufficientData || !nextExpectedPaycheck) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        testID={testID}
      >
        <View style={styles.header}>
          <View style={styles.headerTitles}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Salary Forecast
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Upcoming income projections
            </Text>
          </View>
        </View>

        <View
          style={[
            styles.emptyBox,
            { backgroundColor: surfaces.tile, borderColor: colors.border },
          ]}
        >
          <Info size={24} color={colors.mutedForeground} />
          <View style={styles.emptyTextGroup}>
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Not Enough Historical Data
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              {insufficientHistoryReason ||
                "Requires at least 2 confirmed regular paychecks to generate an explainable salary forecast."}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const nextDateFormatted = formatDisplayDate(
    nextExpectedPaycheck.expectedDate,
    settings?.dateFormat
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID={testID}
    >
      {/* ── 1. Header & Confidence Badge ──────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitles}>
          <Text style={[styles.title, { color: colors.foreground }]}>
            Salary Forecast & Next Payday
          </Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            {forecast.primaryEmployer} • Conservative regular baseline
          </Text>
        </View>
        <ConfidenceBadge
          confidence={nextExpectedPaycheck.confidence}
          score={nextExpectedPaycheck.confidenceScore}
        />
      </View>

      {/* ── 2. Next Expected Paycheck Hero ────────────────────────────────── */}
      <View
        style={[
          styles.heroCard,
          { backgroundColor: surfaces.tile, borderColor: colors.border },
        ]}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroAmountCol}>
            <Text style={[styles.heroLabel, { color: colors.mutedForeground }]}>
              Expected Next Net Pay (Est.)
            </Text>
            <Amount
              value={nextExpectedPaycheck.projectedRegularNet}
              currency="INR"
              style={[styles.heroAmount, { color: colors.foreground }]}
            />
          </View>

          <View style={styles.heroDateCol}>
            <View style={styles.heroDateBadge}>
              <Calendar size={13} color={colors.primary} />
              <Text style={[styles.heroDateText, { color: colors.primary }]}>
                {nextDateFormatted}
              </Text>
            </View>
            <Text style={[styles.heroWindowText, { color: colors.mutedForeground }]}>
              Window: {nextExpectedPaycheck.expectedWindow.startDay}th–
              {nextExpectedPaycheck.expectedWindow.endDay}th
            </Text>
          </View>
        </View>

        <View style={[styles.heroDivider, { backgroundColor: colors.border }]} />

        <View style={styles.heroFooter}>
          <Text style={[styles.heroFooterText, { color: colors.mutedForeground }]}>
            For {formatMonthName(nextExpectedPaycheck.wageMonth)} compensation
          </Text>
          {onAddToCalendar ? (
            <Button
              variant="outline"
              size="sm"
              onPress={() => onAddToCalendar(nextExpectedPaycheck)}
            >
              Add to Calendar
            </Button>
          ) : null}
        </View>
      </View>

      {/* ── 3. Multi-Month Projection Series ──────────────────────────────── */}
      {upcomingProjections.length > 1 ? (
        <View style={styles.seriesSection}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Upcoming 3-Month Projection
          </Text>

          <View style={styles.seriesList}>
            {upcomingProjections.map((proj) => (
              <View
                key={proj.id}
                style={[
                  styles.seriesRow,
                  { backgroundColor: surfaces.tile, borderColor: colors.border },
                ]}
              >
                <View style={styles.seriesLeft}>
                  <Text style={[styles.seriesMonth, { color: colors.foreground }]}>
                    {formatMonthName(proj.wageMonth)}
                  </Text>
                  <Text style={[styles.seriesDate, { color: colors.mutedForeground }]}>
                    Est. arrival:{" "}
                    {formatDisplayDate(proj.expectedDate, settings?.dateFormat)}
                  </Text>
                </View>

                <View style={styles.seriesRight}>
                  <Amount
                    value={proj.projectedRegularNet}
                    currency="INR"
                    style={[styles.seriesAmount, { color: colors.foreground }]}
                  />
                  <Text style={[styles.seriesTag, { color: colors.mutedForeground }]}>
                    Estimated
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {/* ── 4. Assumptions & Transparency Box ─────────────────────────────── */}
      <View
        style={[
          styles.assumptionsBox,
          { backgroundColor: surfaces.tile, borderColor: colors.border },
        ]}
      >
        <View style={styles.assumptionsHeader}>
          <Info size={14} color={colors.primary} />
          <Text style={[styles.assumptionsTitle, { color: colors.foreground }]}>
            Calculation Assumptions
          </Text>
        </View>

        <View style={styles.assumptionsList}>
          {nextExpectedPaycheck.assumptions.map((item, idx) => (
            <Text
              key={idx}
              style={[styles.assumptionItem, { color: colors.mutedForeground }]}
            >
              • {item}
            </Text>
          ))}
          {historicalBonusAverageMonthly > 0 ? (
            <Text style={[styles.assumptionItem, { color: "#f59e0b" }]}>
              • Historical variable pay averaged ₹{historicalBonusAverageMonthly}
              /month over the past year (excluded from guaranteed base forecast).
            </Text>
          ) : null}
        </View>
      </View>

      {/* ── 5. Legal & Accuracy Disclaimer Footnote ───────────────────────── */}
      <View style={styles.disclaimerRow}>
        <HelpCircle size={12} color={colors.mutedForeground} />
        <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
          {disclaimer}
        </Text>
      </View>
    </View>
  );
}

function ConfidenceBadge({
  confidence,
  score,
}: {
  confidence: ForecastConfidence;
  score: number;
}) {
  if (confidence === "high") {
    return (
      <View
        style={[
          styles.confidenceBadge,
          { backgroundColor: "rgba(16, 185, 129, 0.12)" },
        ]}
      >
        <CheckCircle2 size={12} color="#10b981" />
        <Text style={[styles.confidenceBadgeText, { color: "#10b981" }]}>
          High ({score}%)
        </Text>
      </View>
    );
  }

  if (confidence === "medium") {
    return (
      <View
        style={[
          styles.confidenceBadge,
          { backgroundColor: "rgba(59, 130, 246, 0.12)" },
        ]}
      >
        <Clock size={12} color="#3b82f6" />
        <Text style={[styles.confidenceBadgeText, { color: "#3b82f6" }]}>
          Medium ({score}%)
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.confidenceBadge,
        { backgroundColor: "rgba(245, 158, 11, 0.12)" },
      ]}
    >
      <AlertCircle size={12} color="#f59e0b" />
      <Text style={[styles.confidenceBadgeText, { color: "#f59e0b" }]}>
        Low ({score}%)
      </Text>
    </View>
  );
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
  confidenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confidenceBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  heroCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 12,
  },
  heroTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  heroAmountCol: {
    gap: 2,
  },
  heroLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  heroAmount: {
    fontSize: 22,
    fontWeight: "800",
  },
  heroDateCol: {
    alignItems: "flex-end",
    gap: 4,
  },
  heroDateBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(59, 130, 246, 0.12)",
  },
  heroDateText: {
    fontSize: 12,
    fontWeight: "700",
  },
  heroWindowText: {
    fontSize: 10,
  },
  heroDivider: {
    height: 1,
  },
  heroFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heroFooterText: {
    fontSize: 12,
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
  seriesLeft: {
    gap: 2,
  },
  seriesMonth: {
    fontSize: 13,
    fontWeight: "600",
  },
  seriesDate: {
    fontSize: 11,
  },
  seriesRight: {
    alignItems: "flex-end",
    gap: 2,
  },
  seriesAmount: {
    fontSize: 14,
    fontWeight: "700",
  },
  seriesTag: {
    fontSize: 10,
  },
  assumptionsBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  assumptionsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  assumptionsTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  assumptionsList: {
    gap: 4,
  },
  assumptionItem: {
    fontSize: 11,
    lineHeight: 15,
  },
  disclaimerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingTop: 2,
  },
  disclaimerText: {
    fontSize: 10,
    flex: 1,
    lineHeight: 14,
  },
  emptyBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  emptyTextGroup: {
    flex: 1,
    gap: 2,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
});
