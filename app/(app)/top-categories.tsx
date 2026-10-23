import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronRight, Lightbulb, ListOrdered, TrendingDown, TrendingUp } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { RowGlyph, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { PageShell } from "@/components/layout/PageShell";
import { spendingSliceColor } from "@/components/spending/palette";
import {
  CategoryIcon,
  DataNote,
  DrilldownTopBar,
  SpendingHero,
  SurfaceCard,
} from "@/components/spending/SpendingParts";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useSpendingSummaries } from "@/hooks/useSpendingDrilldown";
import { haptic } from "@/lib/haptics";
import { useGlobalMonth } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { currentMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  categoryDetailHref,
  resolveSpendingMonth,
  resolveSpendingTab,
  spendComparison,
} from "@/shared/utils/spendingDrilldown";
import {
  TOP_PERIODS,
  TOP_PERIOD_LABELS,
  categoryMonthForPeriod,
  periodCategoryTotals,
  periodMonths,
  previousPeriodMonths,
  rankCategories,
  topCategoriesWindow,
  topCategoryInsights,
  type TopPeriod,
} from "@/shared/utils/topCategories";
import { useTheme } from "@/theme/ThemeProvider";

function rangeLabel(months: readonly string[]): string {
  if (months.length === 1) return monthLabel(months[0], "long");
  return `${monthLabel(months[0])} – ${monthLabel(months[months.length - 1])}`;
}

/**
 * SPENDLY-580 — Highest Spending Categories, opened from the dashboard. Every
 * period is whole months summed from the `dashboard_{YYYY-MM}` summaries the
 * dashboard reads (one bounded window), ranked by the donut's own rule and
 * denominator. A category opens the SPENDLY-574 category page, whose
 * subcategories open SPENDLY-579's page — no second category implementation.
 */
export default function TopCategoriesScreen() {
  const params = useLocalSearchParams<{ month?: string; period?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const { globalMonth } = useGlobalMonth();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { isFromCache } = useExpenses();

  const thisMonth = currentMonthKey(settings.timezone);
  const month = resolveSpendingMonth(params.month, globalMonth || thisMonth);
  const period = resolveSpendingTab(params.period, TOP_PERIODS, "this_month");
  const { summaries, loading, error } = useSpendingSummaries(month, topCategoriesWindow(period, month));

  const months = useMemo(() => periodMonths(period, month), [period, month]);
  const current = useMemo(() => periodCategoryTotals(summaries, months), [summaries, months]);
  const previous = useMemo(
    () => periodCategoryTotals(summaries, previousPeriodMonths(period, month)),
    [summaries, period, month]
  );
  const { ranked, total } = useMemo(() => rankCategories(current.categoryTotals), [current]);
  const previousTotal = rankCategories(previous.categoryTotals).total;
  const comparable = previous.missingMonths.length === 0 && current.missingMonths.length === 0;
  const change = comparable ? spendComparison(total, previousTotal) : null;
  const periodLabel = TOP_PERIOD_LABELS[period];
  const { insights } = useMemo(
    () => topCategoryInsights({ current, previous, periodLabel, formatMoney: money }),
    [current, previous, periodLabel, money]
  );
  const detailMonth = categoryMonthForPeriod(period, month);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace("/dashboard" as Href));
  const header = (
    <DrilldownTopBar onBack={goBack} month={month} maxMonth={thisMonth} onChangeMonth={(next) => router.setParams({ month: next })} />
  );

  if (error && summaries.length === 0) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <ErrorState title="Couldn't load your categories" description={error.message} />
      </PageShell>
    );
  }

  // `loading` from the hook waits for the anchor month; a "last month" view
  // can be ready without it, so only block on the first snapshot.
  const firstLoad = loading && summaries.length === 0;

  return (
    <PageShell contentContainerStyle={styles.content}>
      {header}

      <SpendingHero
        testID="top-categories-hero"
        icon={
          <View style={[styles.heroIcon, { backgroundColor: withAlpha(theme.colors.primary, surfaces.isDark ? 0.18 : 0.1) }]}>
            <ListOrdered size={24} color={theme.colors.primary} strokeWidth={2} />
          </View>
        }
        title="Highest Spending Categories"
        caption={`${periodLabel} · ${rangeLabel(months)}`}
        amount={total}
        currency={currency}
        change={change}
        previousLabel={change ? `${money(change.previous)} the period before` : undefined}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periods} accessibilityRole="tablist">
        {TOP_PERIODS.map((p) => (
          <Chip
            key={p}
            label={TOP_PERIOD_LABELS[p]}
            selected={period === p}
            appearance="outline"
            accessibilityRole="tab"
            onPress={() => router.setParams({ period: p })}
          />
        ))}
      </ScrollView>

      {isFromCache ? <DataNote offline>You're offline — showing the figures saved on this device.</DataNote> : null}
      {!firstLoad && current.missingMonths.length > 0 && current.missingMonths.length < months.length ? (
        <DataNote>{`No data for ${current.missingMonths.map((m) => monthLabel(m)).join(", ")} — those months aren't in these totals.`}</DataNote>
      ) : null}

      {firstLoad ? (
        <DashboardSkeleton variant="section" rows={6} />
      ) : ranked.length === 0 ? (
        <EmptyState
          illustration="analytics"
          title={`No spending ${periodLabel.toLowerCase()}`}
          description="Categories are ranked here once there is spending in this period."
        />
      ) : (
        <>
          <SurfaceCard title="Ranked by amount" meta="Share of total spending">
            {ranked.map((c, i) => {
              const color = spendingSliceColor(i, c.category, theme.colors, "");
              return (
                <Pressable
                  key={c.category}
                  onPress={() => {
                    void haptic.selection();
                    router.push(categoryDetailHref(c.category, detailMonth) as Href);
                  }}
                  android_ripple={{ color: surfaces.control, borderless: false }}
                  style={({ pressed }) => [
                    styles.row,
                    i < ranked.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                    pressed && styles.pressed,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Number ${c.rank}, ${c.category}: ${money(c.amount)}, ${Math.round(c.percentage)}% of total spending. Open category`}
                >
                  <Text style={[styles.rank, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold }]}>{c.rank}</Text>
                  <CategoryIcon category={c.category} color={color} size={40} />
                  <View style={styles.body}>
                    <View style={styles.top}>
                      <Text style={[styles.name, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]} numberOfLines={1}>
                        {c.category}
                      </Text>
                      <FinancialAmount value={c.amount} currency={currency} size="sm" weight="semibold" />
                    </View>
                    <View style={styles.top}>
                      <ProgressIndicator pct={c.percentage} color={color} height={5} style={styles.bar} />
                      <Text style={[styles.pct, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
                        {`${Math.round(c.percentage)}%`}
                      </Text>
                    </View>
                  </View>
                  <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                </Pressable>
              );
            })}
          </SurfaceCard>

          {insights.length > 0 ? (
            <SurfaceCard title="Key insights">
              {insights.map((insight, index) => {
                const Icon = insight.tone === "up" ? TrendingUp : insight.tone === "down" ? TrendingDown : Lightbulb;
                const color = insight.tone === "up" ? theme.colors.destructive : insight.tone === "down" ? theme.colors.success : theme.colors.warning;
                return (
                  <View
                    key={insight.id}
                    style={[styles.insight, index < insights.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
                  >
                    <RowGlyph tint={surfaces.wash(color)}>
                      <Icon size={16} color={color} />
                    </RowGlyph>
                    <View style={styles.body}>
                      <Text style={[styles.name, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{insight.title}</Text>
                      <Text style={[styles.note, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>{insight.body}</Text>
                    </View>
                  </View>
                );
              })}
            </SurfaceCard>
          ) : null}
          {!comparable ? (
            <DataNote>The previous period isn't fully recorded, so changes against it aren't shown.</DataNote>
          ) : null}
          {months.length > 1 ? (
            <Text style={[styles.note, styles.footnote, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              {`A category opens on ${monthLabel(detailMonth, "long")}; its page shows one month at a time.`}
            </Text>
          ) : null}
        </>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  pressed: { opacity: 0.8 },
  heroIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  periods: { flexDirection: "row", gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, minHeight: 64 },
  rank: { width: 18, fontSize: 13, textAlign: "center", fontVariant: ["tabular-nums"] },
  body: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 6 },
  top: { flexDirection: "row", alignItems: "center", gap: 10 },
  name: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", fontSize: 14.5 },
  bar: { flexGrow: 1, flexShrink: 1, flexBasis: "auto" },
  pct: { fontSize: 12, minWidth: 32, textAlign: "right", fontVariant: ["tabular-nums"] },
  insight: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  note: { fontSize: 13, lineHeight: 18 },
  footnote: { paddingHorizontal: 4 },
});
