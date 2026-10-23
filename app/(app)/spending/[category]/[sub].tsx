import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { ChevronRight, Lightbulb, Store, TrendingDown, TrendingUp, X } from "lucide-react-native";

import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { ProgressIndicator } from "@/components/dashboard/ProgressIndicator";
import { RowGlyph, useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { PageShell } from "@/components/layout/PageShell";
import {
  CategoryIcon,
  DataNote,
  DrilldownTabs,
  DrilldownTopBar,
  SpendingHero,
  SurfaceCard,
} from "@/components/spending/SpendingParts";
import { SpendingTransactionList } from "@/components/spending/SpendingTransactionList";
import { SpendingTrendPanel, TransactionComparisonCards } from "@/components/spending/SpendingTrendPanel";
import { Chip } from "@/components/ui/Chip";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useExpenses } from "@/hooks/useExpenses";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useMonthExpenseRows, useSpendingSummaries } from "@/hooks/useSpendingDrilldown";
import { logError } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useGlobalMonth } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { listMerchantOverrides } from "@/services/merchant/merchantOverrideStore";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import type { MerchantOverride } from "@/shared/types/merchant";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { currentMonthKey } from "@/shared/utils/dates";
import { merchantBreakdown, rowsForMerchant } from "@/shared/utils/merchantBreakdown";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  categorizedSpendTotal,
  categoryDetailHref,
  decodeCategoryParam,
  monthlySpendSeries,
  resolveSpendingMonth,
  resolveSpendingTab,
  spendComparison,
  spendingInsights,
  subcategoryAmount,
  subcategoryLabel,
} from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

const SUB_TABS = ["overview", "merchants", "transactions"] as const;
type SubTab = (typeof SUB_TABS)[number];

const TABS: Array<{ id: SubTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "merchants", label: "Merchants" },
  { id: "transactions", label: "Transactions" },
];

/**
 * SPENDLY-579 — one subcategory's month, opened from a category page's
 * breakdown. The route carries both stored keys (`NO_SUBCATEGORY` for the
 * parent's spend under no subcategory) and the month. The total is the
 * summary's `"Parent::Sub"` figure, so the subcategories on the parent page
 * always add up to it; lists, counts and merchants use the summary's inclusion
 * rule over that month's ledger rows.
 */
export default function SubcategoryDetailScreen() {
  const params = useLocalSearchParams<{ category?: string; sub?: string; month?: string; tab?: string; merchant?: string }>();
  const router = useRouter();
  const { theme } = useTheme();
  const { settings } = useSettings();
  const { globalMonth } = useGlobalMonth();
  const currency = useDisplayCurrency();
  const money = useGhostMoney(currency);
  const { isFromCache } = useExpenses();

  const category = decodeCategoryParam(params.category);
  const subcategory = decodeCategoryParam(params.sub);
  const thisMonth = currentMonthKey(settings.timezone);
  const month = resolveSpendingMonth(params.month, globalMonth || thisMonth);
  const tab = resolveSpendingTab(params.tab, SUB_TABS, "overview");
  const merchantFilter = typeof params.merchant === "string" && params.merchant ? params.merchant : null;
  const { summaries, current, previous, loading, error } = useSpendingSummaries(month, 6);

  const goBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace((category ? categoryDetailHref(category, month) : "/spending") as Href);
  const setMonth = (next: string) => router.setParams({ month: next });
  const setTab = (next: SubTab) => router.setParams({ tab: next });
  const header = <DrilldownTopBar onBack={goBack} month={month} maxMonth={thisMonth} onChangeMonth={setMonth} />;

  if (!category || !subcategory) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <EmptyState
          illustration="analytics"
          title="Subcategory not found"
          description="This link doesn't name a category and subcategory."
          primaryAction={{ label: "See all spending", onPress: () => router.replace(`/spending?month=${month}` as Href) }}
        />
      </PageShell>
    );
  }
  if (error && !current) {
    return (
      <PageShell contentContainerStyle={styles.content}>
        {header}
        <ErrorState title="Couldn't load this subcategory" description={error.message} />
      </PageShell>
    );
  }

  const label = subcategoryLabel(subcategory);
  const total = subcategoryAmount(current?.categoryTotals, category, subcategory);
  const parentTotal = Math.max(0, current?.categoryTotals?.[category] ?? 0);
  const overall = categorizedSpendTotal(current?.categoryTotals);
  const change = spendComparison(total, previous ? subcategoryAmount(previous.categoryTotals, category, subcategory) : null);
  const shareParts = [
    parentTotal > 0 ? `${Math.round((total / parentTotal) * 100)}% of ${category}` : null,
    overall > 0 ? `${Math.round((total / overall) * 100)}% of all spending` : null,
  ].filter(Boolean);

  return (
    <PageShell contentContainerStyle={styles.content}>
      {header}
      {loading ? (
        <>
          <DashboardSkeleton variant="hero" />
          <DashboardSkeleton variant="section" rows={4} />
        </>
      ) : (
        <>
          <SpendingHero
            testID="subcategory-hero"
            icon={<CategoryIcon category={category} color={theme.colors.primary} size={52} />}
            title={label}
            caption={`In ${category} · ${monthLabel(month)}`}
            amount={total}
            currency={currency}
            change={change}
            previousLabel={change ? `${money(change.previous)} last month` : undefined}
          />
          {total > 0 && shareParts.length > 0 ? (
            <Text style={[styles.shares, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
              {shareParts.join("  ·  ")}
            </Text>
          ) : null}

          {isFromCache ? <DataNote offline>You're offline — showing the figures saved on this device.</DataNote> : null}

          <DrilldownTabs tabs={TABS} value={tab} onChange={setTab} />

          {tab === "overview" ? (
            <OverviewTab category={category} subcategory={subcategory} label={label} month={month} summaries={summaries} currency={currency} />
          ) : tab === "merchants" ? (
            <MerchantsTab
              category={category}
              subcategory={subcategory}
              month={month}
              currency={currency}
              onMerchant={(id) => router.setParams({ tab: "transactions", merchant: id })}
            />
          ) : (
            <TransactionsTab
              category={category}
              subcategory={subcategory}
              month={month}
              total={total}
              currency={currency}
              merchant={merchantFilter}
              onClearMerchant={() => router.setParams({ merchant: "" })}
            />
          )}
        </>
      )}
    </PageShell>
  );
}

/* ----------------------------------------------------------------- Overview */

function OverviewTab({
  category,
  subcategory,
  label,
  month,
  summaries,
  currency,
}: {
  category: string;
  subcategory: string;
  label: string;
  month: string;
  summaries: DashboardPeriodSummary[];
  currency: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings } = useSettings();
  const money = useGhostMoney(currency);
  const { rows, loading } = useMonthExpenseRows(month, category, subcategory);
  const series = useMemo(() => monthlySpendSeries(summaries, month, 6, category, subcategory), [summaries, month, category, subcategory]);
  const { insights, insufficientHistory } = useMemo(
    () =>
      spendingInsights({
        label,
        series,
        rows,
        formatMoney: money,
        formatDate: (d) => formatDisplayDate(d, settings?.dateFormat),
      }),
    [label, series, rows, money, settings?.dateFormat]
  );

  return (
    <>
      <SpendingTrendPanel summaries={summaries} month={month} category={category} subcategory={subcategory} currency={currency} />
      <TransactionComparisonCards month={month} category={category} subcategory={subcategory} currency={currency} />
      {loading ? null : insights.length > 0 ? (
        <SurfaceCard title="What stands out">
          {insights.map((insight, index) => {
            const Icon = insight.tone === "up" ? TrendingUp : insight.tone === "down" ? TrendingDown : Lightbulb;
            const color = insight.tone === "up" ? theme.colors.destructive : insight.tone === "down" ? theme.colors.success : theme.colors.info;
            return (
              <View
                key={insight.id}
                style={[styles.insightRow, index < insights.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border }]}
              >
                <RowGlyph tint={surfaces.wash(color)}>
                  <Icon size={16} color={color} />
                </RowGlyph>
                <View style={styles.grow}>
                  <Text style={[styles.rowTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>{insight.title}</Text>
                  <Text style={[styles.rowBody, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>{insight.body}</Text>
                </View>
              </View>
            );
          })}
        </SurfaceCard>
      ) : null}
      {insufficientHistory ? (
        <DataNote>Averages need at least three earlier months with spending here, so they're not shown yet.</DataNote>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- Merchants */

function MerchantsTab({
  category,
  subcategory,
  month,
  currency,
  onMerchant,
}: {
  category: string;
  subcategory: string;
  month: string;
  currency: string;
  onMerchant: (id: string) => void;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const money = useGhostMoney(currency);
  const { rows, loading } = useMonthExpenseRows(month, category, subcategory);
  const overrides = useMerchantOverrides();
  const { merchants, total } = useMemo(() => merchantBreakdown(rows, overrides), [rows, overrides]);

  if (loading) return <DashboardSkeleton variant="section" rows={4} />;
  if (merchants.length === 0) {
    return (
      <EmptyState
        illustration="analytics"
        compact
        title="No merchants this month"
        description="Merchants appear once there are transactions here."
      />
    );
  }
  const recognisedShare = total > 0 ? (merchants.filter((m) => m.recognised).reduce((s, m) => s + m.amount, 0) / total) * 100 : 0;
  return (
    <>
      <SurfaceCard title="Merchant breakdown" meta={`${Math.round(recognisedShare)}% recognised`}>
        {merchants.map((m, i) => {
          const color = m.recognised ? theme.colors.primary : theme.colors.mutedForeground;
          return (
            <Pressable
              key={m.id}
              onPress={() => {
                void haptic.selection();
                onMerchant(m.id);
              }}
              android_ripple={{ color: surfaces.control, borderless: false }}
              style={({ pressed }) => [
                styles.merchantRow,
                i < merchants.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
                pressed && styles.pressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${m.name}: ${money(m.amount)}, ${Math.round(m.percentage)}%, ${m.count} transactions. Show them`}
            >
              <View style={[styles.merchantIcon, { backgroundColor: withAlpha(color, surfaces.isDark ? 0.18 : 0.1) }]}>
                <Store size={17} color={color} />
              </View>
              <View style={styles.grow}>
                <View style={styles.merchantTop}>
                  <Text style={[styles.rowTitle, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]} numberOfLines={1}>
                    {m.name}
                  </Text>
                  <FinancialAmount value={m.amount} currency={currency} size="sm" weight="semibold" />
                </View>
                <View style={styles.merchantTop}>
                  <ProgressIndicator pct={m.percentage} color={color} height={5} style={styles.grow} />
                  <Text style={[styles.merchantPct, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
                    {`${Math.round(m.percentage)}% · ${m.count}`}
                  </Text>
                </View>
              </View>
              <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
            </Pressable>
          );
        })}
      </SurfaceCard>
      <Text style={[styles.footnote, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
        Merchants are recognised from each transaction's note. Ones Spendly can't name are grouped as "Not recognised".
      </Text>
    </>
  );
}

/** The user's merchant corrections, read once when the merchant view needs them. */
function useMerchantOverrides(): MerchantOverride[] {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<MerchantOverride[]>([]);
  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    listMerchantOverrides(user.uid)
      .then((list) => alive && setOverrides(list))
      .catch((error) => logError("subcategory.merchantOverrides", error));
    return () => {
      alive = false;
    };
  }, [user?.uid]);
  return overrides;
}

/* ------------------------------------------------------------- Transactions */

function TransactionsTab({
  category,
  subcategory,
  month,
  total,
  currency,
  merchant,
  onClearMerchant,
}: {
  category: string;
  subcategory: string;
  month: string;
  total: number;
  currency: string;
  merchant: string | null;
  onClearMerchant: () => void;
}) {
  const { theme } = useTheme();
  const { rows, loading, monthLoaded } = useMonthExpenseRows(month, category, subcategory);
  const overrides = useMerchantOverrides();
  const breakdown = useMemo(() => (merchant ? merchantBreakdown(rows, overrides) : null), [merchant, rows, overrides]);
  const scoped = useMemo(
    () => (merchant && breakdown ? rowsForMerchant(rows, breakdown.merchantOf, merchant) : rows),
    [merchant, breakdown, rows]
  );
  const merchantName = breakdown?.merchants.find((m) => m.id === merchant)?.name;

  return (
    <>
      {merchant ? (
        <View style={styles.filterRow}>
          <Chip
            label={merchantName ? `Merchant: ${merchantName}` : "Merchant filter"}
            selected
            appearance="outline"
            trailing={(color) => <X size={14} color={color} />}
            onPress={onClearMerchant}
            accessibilityLabel={`Filtered to ${merchantName ?? "a merchant"}. Clear the filter`}
          />
        </View>
      ) : null}
      <SpendingTransactionList
        key={merchant ?? "all"}
        rows={scoped}
        loading={loading}
        monthLoaded={monthLoaded}
        // A merchant filter is a subset by design, so only the full list reconciles.
        summaryTotal={merchant ? scoped.reduce((s, r) => s + r.amount, 0) : total}
        currency={currency}
        filterLabel="Subcategory"
        filterOptions={[]}
        filterKey="subcategory"
        emptyTitle={merchant ? "No transactions with this merchant" : `No ${subcategoryLabel(subcategory)} transactions this month`}
      />
      <Text style={[styles.footnote, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
        {`${category} › ${subcategoryLabel(subcategory)} · ${monthLabel(month, "long")}`}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: 14 },
  pressed: { opacity: 0.8 },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: "auto", gap: 3 },
  shares: { fontSize: 13, paddingHorizontal: 4, marginTop: -6 },
  insightRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 12 },
  rowTitle: { fontSize: 14.5 },
  rowBody: { fontSize: 13, lineHeight: 18 },
  merchantRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, minHeight: 60 },
  merchantIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  merchantTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  merchantPct: { fontSize: 12, fontVariant: ["tabular-nums"] },
  filterRow: { flexDirection: "row" },
  footnote: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
});
