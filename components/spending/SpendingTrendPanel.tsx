import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Hash, ReceiptText } from "lucide-react-native";

import { BarChart } from "@/components/charts/BarChart";
import { SpendingCurveChart } from "@/components/charts/SpendingCurveChart";
import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { withAlpha } from "@/components/dashboard/primitives";
import { ComparisonStat, DataNote, MonthlySpendBars, SurfaceCard } from "@/components/spending/SpendingParts";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useMonthExpenseRows, useMonthlyTransactionCounts } from "@/hooks/useSpendingDrilldown";
import type { DashboardPeriodSummary } from "@/shared/types/financialSummary";
import { shiftMonthKey } from "@/shared/utils/dates";
import { monthLabel } from "@/shared/utils/monthLabel";
import {
  monthWindow,
  monthlySpendSeries,
  spendComparison,
  transactionStats,
} from "@/shared/utils/spendingDrilldown";
import { useTheme } from "@/theme/ThemeProvider";

type TrendView = "amount" | "transactions" | "trend";

const VIEWS = [
  { value: "amount" as const, label: "Amount" },
  { value: "transactions" as const, label: "Transactions" },
  { value: "trend" as const, label: "Trend" },
];

/**
 * SPENDLY-574 — the drill-downs' trend panel: an Amount / Transactions / Trend
 * switch over the last `months` months. Amount and Trend read the month
 * summaries; Transactions counts ledger rows, so only that view asks the store
 * for the earlier months.
 */
export function SpendingTrendPanel({
  summaries,
  month,
  category,
  currency,
  months = 6,
}: {
  summaries: DashboardPeriodSummary[];
  month: string;
  /** One category's trend; the whole month's when omitted. */
  category?: string;
  currency: string;
  months?: number;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const [view, setView] = useState<TrendView>("amount");
  const series = useMemo(() => monthlySpendSeries(summaries, month, months, category), [summaries, month, months, category]);
  const windowMonths = useMemo(() => monthWindow(month, months), [month, months]);
  const counts = useMonthlyTransactionCounts(windowMonths, category, view === "transactions");
  const accent = theme.colors.primary;
  const formatCount = (n: number) => `${Math.round(n)} transaction${Math.round(n) === 1 ? "" : "s"}`;

  const title = view === "transactions" ? "Transactions per month" : "Spending trend";
  const meta = `Last ${months} months`;
  const hasAny = series.some((p) => p.hasData);

  return (
    <>
      <SegmentedControl options={VIEWS} value={view} onChange={setView} testID="spending-trend-view" />
      <SurfaceCard title={title} meta={meta}>
        {view === "amount" ? (
          <MonthlySpendBars series={series} currency={currency} formatMoney={money} />
        ) : view === "transactions" ? (
          counts.loading ? (
            <DashboardSkeleton variant="section" rows={2} />
          ) : (
            <View
              accessible
              accessibilityLabel={`Transactions per month. ${counts.series
                .map((p) => `${monthLabel(p.month, "long")}: ${p.amount}`)
                .join(", ")}`}
            >
              <BarChart
                data={counts.series.map((p, i) => ({
                  label: monthLabel(p.month).slice(0, 3),
                  value: p.amount,
                  color: i === counts.series.length - 1 ? accent : withAlpha(accent, 0.28),
                }))}
                height={180}
                currency={currency}
                primaryLabel="Count"
                primaryColor={accent}
                showLegend={false}
                showYAxis
                formatValue={formatCount}
              />
            </View>
          )
        ) : hasAny ? (
          <View
            accessible
            accessibilityLabel={`Spending trend. ${series
              .map((p) => `${monthLabel(p.month, "long")}: ${p.hasData ? money(p.amount) : "no data"}`)
              .join(", ")}`}
          >
            <SpendingCurveChart
              points={series.map((p) => ({ date: monthLabel(p.month).slice(0, 3), amount: p.amount }))}
              height={180}
              currency={currency}
              lineColor={accent}
              showYAxis
              xTickCount={series.length}
            />
          </View>
        ) : (
          <DataNote>No spending history for these months yet.</DataNote>
        )}
      </SurfaceCard>
    </>
  );
}

/**
 * SPENDLY-574 — "Transactions" and "Average per transaction" for the month,
 * each against last month. Both months come from ledger rows under the
 * summary's inclusion rule; a comparison shows only when last month had rows.
 */
export function TransactionComparisonCards({
  month,
  category,
  currency,
}: {
  month: string;
  category?: string;
  currency: string;
}) {
  const { theme } = useTheme();
  const money = useGhostMoney(currency);
  const current = useMonthExpenseRows(month, category);
  const previous = useMonthExpenseRows(shiftMonthKey(month, -1), category);
  const now = transactionStats(current.rows);
  const before = transactionStats(previous.rows);
  const previousReady = previous.monthLoaded && before.count > 0;
  const countChange = previousReady ? spendComparison(now.count, before.count) : null;
  const averageChange =
    previousReady && now.average !== null && before.average !== null ? spendComparison(now.average, before.average) : null;

  if (current.loading) return <DashboardSkeleton variant="section" rows={1} />;

  return (
    <View style={styles.cards}>
      <ComparisonStat
        icon={<Hash size={18} color={theme.colors.primary} strokeWidth={2.2} />}
        tint={theme.colors.primary}
        label="Transactions"
        value={<StatFigure value={String(now.count)} />}
        change={countChange}
        footnote={previousReady ? `${before.count} last month` : "None last month"}
      />
      <ComparisonStat
        icon={<ReceiptText size={18} color={theme.colors.success} strokeWidth={2.2} />}
        tint={theme.colors.success}
        label="Average spend"
        value={
          now.average === null ? (
            <StatFigure value="—" />
          ) : (
            <FinancialAmount value={now.average} currency={currency} size="xl" weight="bold" fit />
          )
        }
        change={averageChange}
        footnote={previousReady && before.average !== null ? `${money(before.average)} last month` : undefined}
      />
    </View>
  );
}

/** A plain figure in the stat cards' value style. */
function StatFigure({ value }: { value: string }) {
  const { theme } = useTheme();
  return (
    <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.8 }}>
      {value}
    </Text>
  );
}

const styles = StyleSheet.create({
  cards: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
