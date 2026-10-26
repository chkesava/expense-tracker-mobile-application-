import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Redirect, useRouter, type Href } from "expo-router";
import { BarChart3 } from "lucide-react-native";

import { BarChart } from "@/components/charts/BarChart";
import { DateField } from "@/components/common/DateField";
import { ErrorState } from "@/components/common/ErrorState";
import { ReadModelFreshnessBadge } from "@/components/common/ReadModelFreshnessBadge";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { Section } from "@/components/dashboard/primitives";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { RowSwitch } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useGoalAnalyticsEvents } from "@/hooks/useGoalAnalyticsEvents";
import { useReadModelFreshness } from "@/hooks/useReadModelFreshness";
import { useSaveGoalsEnabled } from "@/hooks/useSaveGoalsEnabled";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { useUnlockedGoalIds } from "@/lib/goalLockSession";
import { toast } from "@/lib/toast";
import { useSettings } from "@/providers/SettingsProvider";
import { deliverGoalsCsv, deliverGoalsPdf } from "@/services/goals/goalExportDelivery";
import { GOAL_STATUSES, type GoalStatus } from "@/shared/types/goal";
import { todayDateKey } from "@/shared/utils/dates";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { formatAmount } from "@/shared/utils/formatCurrency";
import {
  analyticsSummaryText,
  analyzeGoals,
  comparePeriods,
  goalRange,
  goalsInScope,
  reconcileGoals,
  type GoalRangePreset,
} from "@/shared/utils/goalAnalytics";
import type { GoalExportInput } from "@/shared/utils/goalExport";
import { GOAL_STATUS_LABELS } from "@/shared/utils/goalMessages";
import { useTheme } from "@/theme/ThemeProvider";

const PRESETS: { id: GoalRangePreset; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "This quarter" },
  { id: "year", label: "This year" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Goal analytics and exports (SPENDLY-611, FRD FR-09/FR-10).
 *
 * Covers every status (filterable, archived and cancelled included), for
 * all-time / month / quarter / year / custom ranges with a comparison to the
 * previous period. History is read once per range through the `goals` read
 * path (Firestore by default); goal summaries come from the shared listener.
 * Every total is computed by shared/utils/goalAnalytics from those rows, and
 * the chart has a plain-text alternative.
 */
export default function GoalAnalyticsScreen() {
  const enabled = useSaveGoalsEnabled();
  const { theme } = useTheme();
  const router = useRouter();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { settings } = useSettings();
  const { goals, loading: goalsLoading } = useFinancialGoals();
  const [preset, setPreset] = useState<GoalRangePreset>("month");
  const [customFrom, setCustomFrom] = useState(() => todayDateKey().slice(0, 8) + "01");
  const [customTo, setCustomTo] = useState(() => todayDateKey());
  const [statuses, setStatuses] = useState<GoalStatus[]>([]);
  const [compare, setCompare] = useState(true);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  // Ranges are recomputed only when their inputs change, so "now" doesn't drift on every render.
  const range = useMemo(() => goalRange(preset, Date.now(), { from: customFrom, to: customTo }), [preset, customFrom, customTo]);
  const previous = compare && range?.previous ? range.previous : null;
  const { current, previous: prevRead, loading, error, reload, newestMs } = useGoalAnalyticsEvents(range, previous);
  const freshness = useReadModelFreshness("goals", ["goalEvents"], newestMs);

  const scope = useMemo(() => goalsInScope(goals, statuses), [goals, statuses]);
  const unlockedIds = useUnlockedGoalIds();
  const lockedIds = useMemo(() => new Set(goals.filter((g) => g.locked).map((g) => g.id)), [goals]);
  const analytics = useMemo(
    () => (range && current ? analyzeGoals(goals, current.events, { statuses, range }) : null),
    [goals, current, statuses, range]
  );
  const comparison = useMemo(
    () => (analytics && prevRead && range?.previous ? comparePeriods(analytics, analyzeGoals(goals, prevRead.events, { statuses, range: range.previous })) : null),
    [analytics, prevRead, goals, statuses, range]
  );
  // Reconciliation needs the complete history: all-time, untruncated, all statuses in scope.
  const mismatches = useMemo(
    () => (preset === "all" && current && !current.truncated ? reconcileGoals(scope, current.events) : null),
    [preset, current, scope]
  );

  if (!enabled) return <Redirect href={"/settings/money" as Href} />;

  const meta = { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs };
  const body = { color: theme.colors.foreground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.sm };
  const statusLabel = statuses.length === 0 ? "All statuses" : statuses.map((s) => GOAL_STATUS_LABELS[s]).join(", ");
  const toggleStatus = (s: GoalStatus) => setStatuses((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]));
  const pct = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${Math.round(v * 100)}%`);

  const runExport = async (kind: "csv" | "pdf") => {
    if (!analytics || !current || !range || exporting) return;
    setExporting(kind);
    const input: GoalExportInput = {
      title: "Savings goals report",
      rangeLabel: range.label,
      statusLabel,
      range,
      goals: scope,
      events: current.events,
      analytics,
      includeNotes,
      truncated: current.truncated,
      // Exports carry real figures: ghost mode hides amounts on screen, not in a file the user asked for.
      formatMoney: (n) => formatAmount(n, currency),
      formatDate: (ms) => formatDisplayDate(new Date(ms), settings.dateFormat),
      currency,
      generatedAtMs: Date.now(),
    };
    try {
      await (kind === "csv" ? deliverGoalsCsv(input) : deliverGoalsPdf(input));
    } catch (failure) {
      logError("goalAnalytics.export", failure, { kind });
      toast.error(friendlyErrorMessage(failure, kind === "csv" ? "Couldn't export the CSV." : "Couldn't create the PDF."));
    } finally {
      setExporting(null);
    }
  };

  const header = (
    <PageHeader
      title="Goal analytics"
      subtitle={range ? `${range.label} · ${statusLabel}` : "Choose a valid date range"}
      icon={<BarChart3 size={20} color={theme.colors.primary} />}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/goals" as Href))}
    />
  );

  const filters = (
    <View style={{ gap: theme.space.sm }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Date range">
        {PRESETS.map((p) => (
          <Chip key={p.id} label={p.label} appearance="outline" selected={preset === p.id} onPress={() => setPreset(p.id)} accessibilityRole="radio" />
        ))}
      </ScrollView>
      {preset === "custom" ? (
        <View style={styles.dates}>
          <View style={styles.flex}>
            <DateField label="From" value={customFrom} onChange={setCustomFrom} maxDate={customTo} />
          </View>
          <View style={styles.flex}>
            <DateField label="To" value={customTo} onChange={setCustomTo} minDate={customFrom} />
          </View>
        </View>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.space.sm }} accessibilityLabel="Goal status filter">
        <Chip label="All statuses" size="sm" selected={statuses.length === 0} onPress={() => setStatuses([])} />
        {GOAL_STATUSES.map((s) => (
          <Chip key={s} label={GOAL_STATUS_LABELS[s]} size="sm" selected={statuses.includes(s)} onPress={() => toggleStatus(s)} />
        ))}
      </ScrollView>
      {range?.previous ? <RowSwitch label={`Compare with ${range.previous.label}`} value={compare} onValueChange={setCompare} /> : null}
      <ReadModelFreshnessBadge freshness={freshness} />
    </View>
  );

  let content;
  if (!range) {
    content = <Text style={[body, { color: theme.colors.destructive }]}>The start date must be on or before the end date.</Text>;
  } else if (error) {
    content = <ErrorState title="Couldn't load goal history" description={error} onRetry={reload} />;
  } else if ((loading && !current) || goalsLoading) {
    content = <DashboardSkeleton variant="section" rows={4} />;
  } else if (analytics) {
    const tiles: { label: string; value: number; tone?: "positive" | "negative" }[] = [
      { label: "Saved", value: analytics.increased, tone: "positive" },
      { label: "Taken out", value: analytics.decreased, tone: "negative" },
      { label: "Net growth", value: analytics.net },
    ];
    content = (
      <View style={{ gap: theme.space.md }}>
        {current?.truncated ? (
          <Text style={[meta, { color: theme.colors.warning }]} accessibilityLiveRegion="polite">
            This range has a lot of history; only the most recent entries are included. Choose a shorter range for complete totals.
          </Text>
        ) : null}
        <Section title="Summary" subtitle={`${analytics.goalCount} ${analytics.goalCount === 1 ? "goal" : "goals"}`}>
          <View style={{ gap: theme.space.sm }}>
            <View style={styles.tiles}>
              {tiles.map((t) => (
                <View key={t.label} style={[styles.tile, { borderColor: theme.colors.border, borderRadius: theme.radius.md }]} accessible accessibilityLabel={`${t.label}: ${money(t.value)}`}>
                  <Text style={meta}>{t.label}</Text>
                  <FinancialAmount value={t.value} currency={currency} size="md" tone={t.tone ?? "auto"} />
                </View>
              ))}
            </View>
            <Text style={body}>
              {analytics.contributionCount} {analytics.contributionCount === 1 ? "contribution" : "contributions"}
              {analytics.averageContribution !== null ? ` · average ${money(analytics.averageContribution)}` : ""} · {analytics.reductionCount} taken out
            </Text>
            <Text style={body}>
              {analytics.completions} completed in this period · {analytics.milestonesReached} milestones reached
              {analytics.milestonesLost ? ` · ${analytics.milestonesLost} dropped below` : ""}
            </Text>
            {analytics.completionRate !== null ? (
              <Text style={body}>
                Completion rate: {Math.round(analytics.completionRate * 100)}% ({analytics.statusCounts.completed} of {analytics.goalCount} goals completed)
              </Text>
            ) : null}
          </View>
        </Section>

        {comparison && range.previous ? (
          <Section title={`Compared with ${range.previous.label}`}>
            <View style={{ gap: theme.space.xs }} accessible accessibilityLabel={`Net growth ${money(comparison.net.current)} versus ${money(comparison.net.previous)}, change ${pct(comparison.net.change)}`}>
              <Text style={body}>
                Net growth: {money(comparison.net.current)} vs {money(comparison.net.previous)} ({pct(comparison.net.change)})
              </Text>
              <Text style={body}>
                Saved: {money(comparison.increased.current)} vs {money(comparison.increased.previous)} ({pct(comparison.increased.change)})
              </Text>
              <Text style={body}>
                Contributions: {comparison.contributions.current} vs {comparison.contributions.previous}
              </Text>
            </View>
          </Section>
        ) : null}

        <Section title="Savings over time">
          {analytics.months.length === 0 ? (
            <Text style={meta}>No money moved in this period.</Text>
          ) : (
            <View style={{ gap: theme.space.sm }}>
              <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <BarChart
                  data={analytics.months.map((m) => ({
                    label: MONTH_SHORT[Number(m.key.slice(5, 7)) - 1] ?? m.key,
                    detailLabel: m.key,
                    value: m.increased,
                    secondaryValue: m.decreased,
                  }))}
                  currency={currency}
                  primaryLabel="Saved"
                  secondaryLabel="Taken out"
                  primaryColor={theme.colors.success}
                  secondaryColor={theme.colors.destructive}
                  showLegend
                />
              </View>
              {/* Accessible chart alternative (FRD FR-09/FR-15). */}
              <Text style={meta} accessibilityRole="summary">
                {analyticsSummaryText(analytics, range.label, money)}
              </Text>
            </View>
          )}
        </Section>

        {analytics.perGoal.length > 0 ? (
          <Section title="By goal">
            <View style={{ gap: theme.space.xs }}>
              {analytics.perGoal.map((r) => {
                // SPENDLY-614: a locked goal's own figures stay hidden here too (totals still include it).
                const locked = lockedIds.has(r.goalId) && !unlockedIds.has(r.goalId);
                return locked ? (
                  <View key={r.goalId} style={styles.goalRow} accessible accessibilityLabel={`${r.name}, locked`}>
                    <Text style={[body, styles.flex, { fontFamily: theme.fontFamily.medium }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    <Text style={meta}>Locked</Text>
                  </View>
                ) : (
                  <View key={r.goalId} style={styles.goalRow} accessible accessibilityLabel={`${r.name}, ${GOAL_STATUS_LABELS[r.status]}, net ${money(r.net)}`}>
                    <View style={styles.flex}>
                      <Text style={[body, { fontFamily: theme.fontFamily.medium }]} numberOfLines={1}>
                        {r.name}
                      </Text>
                      <Text style={meta}>
                        {GOAL_STATUS_LABELS[r.status]} · saved {money(r.increased)} · taken out {money(r.decreased)}
                      </Text>
                    </View>
                    <FinancialAmount value={r.net} currency={currency} size="sm" tone="auto" />
                  </View>
                );
              })}
            </View>
          </Section>
        ) : null}

        {mismatches !== null ? (
          <Text style={[meta, mismatches.length ? { color: theme.colors.warning } : null]} accessibilityLiveRegion="polite">
            {mismatches.length === 0
              ? "Every goal's saved amount matches its history."
              : `History doesn't explain the saved amount for: ${mismatches.map((m) => m.name).join(", ")}.`}
          </Text>
        ) : null}

        <Section title="Export">
          <View style={{ gap: theme.space.sm }}>
            <Text style={meta}>Exports use the filters above: {range.label}, {statusLabel}. Amounts are shown in full even with ghost mode on.</Text>
            <RowSwitch label="Include notes" value={includeNotes} onValueChange={setIncludeNotes} />
            <View style={styles.dates}>
              <Button variant="secondary" style={styles.flex} onPress={() => void runExport("csv")} loading={exporting === "csv"} disabled={exporting !== null}>
                Export CSV
              </Button>
              <Button variant="secondary" style={styles.flex} onPress={() => void runExport("pdf")} loading={exporting === "pdf"} disabled={exporting !== null}>
                Export PDF
              </Button>
            </View>
          </View>
        </Section>
      </View>
    );
  }

  return (
    <PageShell>
      {header}
      <View style={{ gap: theme.space.md, paddingBottom: theme.space.xl }}>
        {filters}
        {content}
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dates: { flexDirection: "row", gap: 12 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: { borderWidth: StyleSheet.hairlineWidth, padding: 10, minWidth: 100, flexGrow: 1, gap: 2 },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
});
