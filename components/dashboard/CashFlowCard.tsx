import { memo, useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Banknote } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { DASH_RADIUS, useSurfaces } from "@/components/dashboard/primitives";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { isInMonth } from "@/shared/utils/dates";
import { buildCashFlowSummary } from "@/shared/utils/dashboard/cashFlowCard";
import { useTheme } from "@/theme/ThemeProvider";

export interface CashFlowCardProps {
  /** Only a live figure for the current month — see the card's own note. */
  isCurrentMonth: boolean;
  monthlyIncome: number;
  monthlyExpense: number;
  /** The month's live cash-on-hand (`useUnifiedNetWorth`'s `liquidBankAssets`). */
  liquidBankAssets: number;
  currency: string;
  activeMonth: string;
  loading?: boolean;
  fill?: boolean;
}

/**
 * Opening balance, income, expenses, transfers and closing balance for the
 * active month. Every figure traces to data the dashboard already loads —
 * `useDashboardCashFlow`'s income/expense totals and `useUnifiedNetWorth`'s
 * live cash balance — nothing here recomputes a total independently.
 *
 * Transfers are shown as their own line, never folded into income or
 * expenses (`buildCashFlowSummary` enforces this), satisfying the
 * no-double-counting invariant.
 */
export const CashFlowCard = memo(function CashFlowCard({
  isCurrentMonth,
  monthlyIncome,
  monthlyExpense,
  liquidBankAssets,
  currency,
  activeMonth,
  loading = false,
  fill = false,
}: CashFlowCardProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { transfers } = useAccountTransfers();

  const transfersTotal = useMemo(
    () => transfers.filter((t) => isInMonth(t, activeMonth)).reduce((sum, t) => sum + t.amount, 0),
    [transfers, activeMonth]
  );

  const summary = useMemo(
    () => buildCashFlowSummary({ income: monthlyIncome, expenses: monthlyExpense, transfersTotal, closing: liquidBankAssets }),
    [monthlyIncome, monthlyExpense, transfersTotal, liquidBankAssets]
  );

  return (
    <Card
      variant="outlined"
      style={fill ? styles.fill : undefined}
      contentStyle={styles.content}
      testID="dash-cash-flow-card"
    >
      <View style={styles.header}>
        <View style={[styles.glyph, { backgroundColor: surfaces.wash(theme.colors.primary) }]}>
          <Banknote size={16} color={theme.colors.primary} strokeWidth={2.3} />
        </View>
        <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
          Cash Flow
        </Text>
      </View>

      {!isCurrentMonth ? (
        <Text style={[styles.note, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
          Opening and closing balances are only shown for the current month.
        </Text>
      ) : (
        <View style={styles.rows}>
          <Row label="Opening balance" value={summary.opening} currency={currency} loading={loading} />
          <Row label="Total income" value={summary.income} currency={currency} loading={loading} tone="good" />
          <Row label="Total expenses" value={-summary.expenses} currency={currency} loading={loading} tone="bad" />
          <Row label="Transfers" value={summary.transfersTotal} currency={currency} loading={loading} neutral />
          <View style={[styles.divider, { backgroundColor: surfaces.divider }]} />
          <Row label="Closing balance" value={summary.closing} currency={currency} loading={loading} emphasis />
        </View>
      )}
    </Card>
  );
});

function Row({
  label,
  value,
  currency,
  loading,
  tone,
  neutral,
  emphasis,
}: {
  label: string;
  value: number;
  currency: string;
  loading: boolean;
  tone?: "good" | "bad";
  neutral?: boolean;
  emphasis?: boolean;
}) {
  const { theme } = useTheme();
  const color = neutral
    ? theme.colors.mutedForeground
    : tone === "good"
      ? theme.colors.success
      : tone === "bad"
        ? theme.colors.destructive
        : theme.colors.foreground;

  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.rowLabel,
          { color: theme.colors.mutedForeground, fontFamily: emphasis ? theme.fontFamily.semibold : theme.fontFamily.regular },
        ]}
      >
        {label}
      </Text>
      {loading ? null : (
        <Amount
          value={value}
          currency={currency}
          ghostable
          numberOfLines={1}
          style={{
            fontSize: emphasis ? 16 : 14,
            fontFamily: emphasis ? theme.fontFamily.bold : theme.fontFamily.semibold,
            color: emphasis ? theme.colors.foreground : color,
            fontVariant: ["tabular-nums"],
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 12,
  },
  fill: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 15,
  },
  note: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  rows: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  rowLabel: {
    fontSize: 13,
    flexShrink: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
    borderRadius: DASH_RADIUS.tile,
  },
});
