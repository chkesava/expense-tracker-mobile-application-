import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, ChevronDown, TrendingUp } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { LazyMount } from "@/components/common/LazyMount";
import { Skeleton } from "@/components/common/Skeleton";
import { BarChart, type BarChartItem } from "@/components/charts/BarChart";
import {
  MetaLabel,
  Section,
  TrendText,
  useSurfaces,
} from "@/components/dashboard/primitives";
import { Chip } from "@/components/ui/Chip";
import { signedCurrencyPrefix } from "@/shared/utils/formatCurrency";
import type { MonthCashFlow } from "@/shared/utils/spendlyBudget";
import { useTheme } from "@/theme/ThemeProvider";

export interface QuickInsightsWidgetProps {
  monthlySpent: number;
  monthlyIncome: number;
  previousSpent: number;
  previousIncome: number;
  /** Oldest → newest months from the materialized dashboard summaries. */
  cashFlow: MonthCashFlow[];
  currency: string;
  loading?: boolean;
  /**
   * Set when the month's materialized summary is absent ("missing") or its
   * listener failed ("error"). The figures then read "—" instead of a ₹0 the
   * data layer never vouched for.
   */
  unavailable?: "missing" | "error" | null;
  monthLabel?: string;
  onOpenMonthPicker?: () => void;
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthShort(monthKey: string): string {
  const index = Number(monthKey.slice(5, 7)) - 1;
  return MONTHS_SHORT[index] ?? monthKey;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) {
    if (current <= 0) return 0;
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Income & expenses for the selected month (SPENDLY-532): income, spending,
 * net cash flow, and the last six months as paired bars. Every number comes
 * from the dashboard period summaries the screen already listens to.
 */
export const QuickInsightsWidget = memo(function QuickInsightsWidget({
  monthlySpent,
  monthlyIncome,
  previousSpent,
  previousIncome,
  cashFlow,
  currency,
  loading = false,
  unavailable = null,
  monthLabel = "This Month",
  onOpenMonthPicker,
}: QuickInsightsWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const net = monthlyIncome - monthlySpent;
  const savingsRate =
    monthlyIncome > 0 ? Math.max(0, Math.round((net / monthlyIncome) * 100)) : null;

  const incomeColor = theme.colors.success;
  const spendColor = theme.colors.info;

  const chartData = useMemo<BarChartItem[]>(
    () =>
      cashFlow.map((row) => ({
        label: monthShort(row.month),
        value: row.spent,
        secondaryValue: row.income,
      })),
    [cashFlow]
  );
  const hasChartData = chartData.some((d) => d.value > 0 || (d.secondaryValue ?? 0) > 0);

  return (
    <Section
      title="Income & expenses"
      subtitle="Month to date"
      icon={<TrendingUp size={16} color={theme.colors.primary} strokeWidth={2.3} />}
      iconTint={surfaces.wash(theme.colors.primary)}
      action={
        onOpenMonthPicker ? (
          <Chip
            size="sm"
            label={monthLabel}
            onPress={onOpenMonthPicker}
            accessibilityLabel={`Change month, currently ${monthLabel}`}
            trailing={() => (
              <ChevronDown size={12} color={theme.colors.mutedForeground} />
            )}
          />
        ) : null
      }
    >
      <View style={styles.row}>
        <Metric
          label="Income"
          icon={<ArrowDownLeft size={12} color={incomeColor} strokeWidth={2.6} />}
          tint={surfaces.wash(incomeColor)}
          loading={loading}
          unavailable={Boolean(unavailable)}
        >
          <Amount
            value={monthlyIncome}
            currency={currency}
            ghostable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.value, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
          />
          <TrendText delta={pctChange(monthlyIncome, previousIncome)} />
        </Metric>
        <View style={[styles.vDivider, { backgroundColor: surfaces.divider }]} />
        <Metric
          label="Spent"
          icon={<ArrowUpRight size={12} color={spendColor} strokeWidth={2.6} />}
          tint={surfaces.wash(spendColor)}
          loading={loading}
          unavailable={Boolean(unavailable)}
        >
          <Amount
            value={monthlySpent}
            currency={currency}
            ghostable
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.value, { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold }]}
          />
          <TrendText delta={pctChange(monthlySpent, previousSpent)} invert />
        </Metric>
      </View>

      <View style={[styles.netRow, { backgroundColor: surfaces.tile }]}>
        <View style={styles.netText}>
          <MetaLabel>Net cash flow</MetaLabel>
          {loading ? null : (
            <Text
              style={[styles.netCaption, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
              numberOfLines={2}
            >
              {unavailable === "error"
                ? "Couldn't load this month's totals"
                : unavailable === "missing"
                  ? "Totals for this month aren't ready yet"
                  : savingsRate !== null
                ? net >= 0
                  ? `Saved ${savingsRate}% of income`
                  : "Spent more than earned"
                : net < 0
                  ? "No income recorded yet"
                  : "No activity yet"}
            </Text>
          )}
        </View>
        {loading ? (
          <Skeleton width={90} height={20} borderRadius={5} />
        ) : unavailable ? (
          <UnavailableValue />
        ) : (
          <Amount
            value={Math.abs(net)}
            currency={currency}
            prefix={
              net > 0
                ? signedCurrencyPrefix("+", currency)
                : net < 0
                  ? signedCurrencyPrefix("-", currency)
                  : undefined
            }
            ghostable
            numberOfLines={1}
            style={{
              fontSize: 17,
              letterSpacing: -0.3,
              fontFamily: theme.fontFamily.bold,
              color: net < 0 ? theme.colors.destructive : net > 0 ? theme.colors.success : theme.colors.foreground,
            }}
          />
        )}
      </View>

      {hasChartData ? (
        <View style={[styles.chartBlock, { borderTopColor: surfaces.divider }]}>
          <MetaLabel>Last {cashFlow.length} months</MetaLabel>
          {/* The SVG chart is the heaviest node here; let the figures paint first. */}
          <LazyMount delayMs={80} minHeight={176}>
            <BarChart
              data={chartData}
              height={150}
              currency={currency}
              primaryLabel="Spent"
              secondaryLabel="Income"
              primaryColor={spendColor}
              secondaryColor={incomeColor}
            />
          </LazyMount>
        </View>
      ) : null}
    </Section>
  );
});

function UnavailableValue() {
  const { theme } = useTheme();
  return (
    <Text
      style={[styles.value, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.bold }]}
      accessibilityLabel="Not available"
    >
      —
    </Text>
  );
}

function Metric({
  label,
  icon,
  tint,
  loading,
  unavailable,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  tint: string;
  loading: boolean;
  unavailable: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.metric}>
      <View style={styles.metricLabel}>
        <View style={[styles.glyph, { backgroundColor: tint }]}>{icon}</View>
        <MetaLabel>{label}</MetaLabel>
      </View>
      {loading ? (
        <View style={{ marginVertical: 4 }}>
          <Skeleton width="80%" height={22} borderRadius={5} />
        </View>
      ) : unavailable ? (
        <UnavailableValue />
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  vDivider: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  metricLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  glyph: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 20,
    letterSpacing: -0.5,
  },
  netRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderCurve: "continuous",
  },
  netText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  netCaption: {
    fontSize: 11.5,
  },
  chartBlock: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 6,
  },
});
