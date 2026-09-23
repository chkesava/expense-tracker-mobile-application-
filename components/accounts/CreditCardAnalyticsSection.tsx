import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import type { Account, AccountPayment, Expense } from "@/shared/types/expense";
import type { CreditCardBill } from "@/shared/types/creditCardBill";
import {
  buildCardAnalyticsWorkspace,
  type CardAnalyticsPeriodMode,
} from "@/shared/utils/creditCardAnalytics";
import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  account: Account;
  expenses: Expense[];
  payments: AccountPayment[];
  bills: CreditCardBill[];
  today: string;
  expensesComplete: boolean;
  currency: string;
  onOpenStatement?: (billId: string) => void;
  onFocusPeriod?: (start: string, end: string) => void;
};

function MetricChip({
  label,
  value,
  currency,
  hint,
}: {
  label: string;
  value: number;
  currency: string;
  hint?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.metric,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
        {label}
      </Text>
      <Amount
        value={value}
        currency={currency}
        style={[styles.metricValue, { color: theme.colors.foreground }]}
      />
      {hint ? (
        <Text style={[styles.metricHint, { color: theme.colors.mutedForeground }]}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function CreditCardAnalyticsSection({
  account,
  expenses,
  payments,
  bills,
  today,
  expensesComplete,
  currency,
  onOpenStatement,
  onFocusPeriod,
}: Props) {
  const { theme } = useTheme();
  const [mode, setMode] = useState<CardAnalyticsPeriodMode>("billing_cycles");

  const workspace = useMemo(
    () =>
      buildCardAnalyticsWorkspace({
        account,
        expenses,
        payments,
        bills,
        today,
        expensesComplete,
        mode,
        lookback: 6,
      }),
    [account, expenses, payments, bills, today, expensesComplete, mode]
  );

  const comparison = workspace.cycleComparison;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text
          style={[styles.heading, { color: theme.colors.mutedForeground }]}
          accessibilityRole="header"
        >
          ANALYTICS & TRENDS
        </Text>
        <View style={styles.modeRow}>
          {(
            [
              ["billing_cycles", "Cycles"],
              ["calendar_months", "Months"],
            ] as const
          ).map(([value, label]) => {
            const active = mode === value;
            return (
              <Pressable
                key={value}
                onPress={() => setMode(value)}
                style={[
                  styles.modeChip,
                  {
                    backgroundColor: active
                      ? theme.colors.primary + "22"
                      : theme.colors.card,
                    borderColor: active
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: active
                      ? theme.colors.primary
                      : theme.colors.mutedForeground,
                    fontSize: 12,
                    fontWeight: "700",
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {!workspace.completeness.ready ? (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.warning,
            },
          ]}
        >
          <Text style={[styles.bannerTitle, { color: theme.colors.foreground }]}>
            Analytics paused
          </Text>
          <Text
            style={[styles.bannerBody, { color: theme.colors.mutedForeground }]}
          >
            {workspace.completeness.message}
          </Text>
        </View>
      ) : workspace.completeness.reason === "no_history" ? (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <Text style={[styles.bannerTitle, { color: theme.colors.foreground }]}>
            No history yet
          </Text>
          <Text
            style={[styles.bannerBody, { color: theme.colors.mutedForeground }]}
          >
            {workspace.completeness.message}
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.metricRow}>
            <MetricChip
              label="Unbilled"
              value={workspace.snapshot.unbilledSpend}
              currency={currency}
              hint={
                workspace.snapshot.utilizationPct != null
                  ? `${workspace.snapshot.utilizationPct}% of limit`
                  : undefined
              }
            />
            <MetricChip
              label="Statement due"
              value={workspace.snapshot.statementDue}
              currency={currency}
            />
          </View>
          <View style={styles.metricRow}>
            <MetricChip
              label="Outstanding"
              value={workspace.snapshot.totalOutstanding}
              currency={currency}
            />
            <MetricChip
              label="Cashback (cycle)"
              value={workspace.snapshot.cashbackThisCycle}
              currency={currency}
            />
          </View>

          {comparison ? (
            <Pressable
              onPress={() =>
                onFocusPeriod?.(
                  comparison.previous.periodStart,
                  comparison.current.periodEnd
                )
              }
              style={[
                styles.card,
                {
                  backgroundColor: theme.colors.card,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text
                style={[styles.cardTitle, { color: theme.colors.foreground }]}
              >
                Cycle vs previous
              </Text>
              <Text
                style={[styles.cardBody, { color: theme.colors.mutedForeground }]}
              >
                Spend{" "}
                {comparison.spendDelta >= 0 ? "+" : ""}
                <Amount value={comparison.spendDelta} currency={currency} />
                {" · "}Billed{" "}
                {comparison.billedDelta >= 0 ? "+" : ""}
                <Amount value={comparison.billedDelta} currency={currency} />
                {" · "}Cashback{" "}
                {comparison.cashbackDelta >= 0 ? "+" : ""}
                <Amount value={comparison.cashbackDelta} currency={currency} />
              </Text>
            </Pressable>
          ) : null}

          {mode === "billing_cycles" ? (
            <View style={styles.listBlock}>
              <Text
                style={[styles.subhead, { color: theme.colors.mutedForeground }]}
              >
                Billed vs payments
              </Text>
              {workspace.cycles.map((cycle) => (
                <Pressable
                  key={`${cycle.statementDate}-${cycle.periodStart}`}
                  disabled={!cycle.billId || !onOpenStatement}
                  onPress={() =>
                    cycle.billId ? onOpenStatement?.(cycle.billId) : undefined
                  }
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={styles.rowMain}>
                    <Text
                      style={[styles.rowTitle, { color: theme.colors.foreground }]}
                    >
                      {cycle.periodStart} → {cycle.periodEnd}
                      {cycle.isOpen ? " (open)" : ""}
                    </Text>
                    <Text
                      style={[
                        styles.rowMeta,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      Billed <Amount value={cycle.billed} currency={currency} />
                      {" · "}Paid{" "}
                      <Amount value={cycle.userPaid} currency={currency} />
                      {cycle.cashbackApplied > 0
                        ? ` · CB ${cycle.cashbackApplied}`
                        : ""}
                    </Text>
                  </View>
                  <Text
                    style={[styles.rowSide, { color: theme.colors.foreground }]}
                  >
                    {cycle.utilizationPct != null
                      ? `${cycle.utilizationPct}%`
                      : "—"}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <View style={styles.listBlock}>
              <Text
                style={[styles.subhead, { color: theme.colors.mutedForeground }]}
              >
                Monthly spend
              </Text>
              {workspace.monthlySpend.map((point) => (
                <View
                  key={point.month}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.rowTitle, { color: theme.colors.foreground }]}
                  >
                    {point.month}
                  </Text>
                  <Amount
                    value={point.spend}
                    currency={currency}
                    style={[styles.rowSide, { color: theme.colors.foreground }]}
                  />
                </View>
              ))}
            </View>
          )}

          {workspace.categorySummary.length > 0 ? (
            <View style={styles.listBlock}>
              <Text
                style={[styles.subhead, { color: theme.colors.mutedForeground }]}
              >
                Categories ({workspace.focusPeriod.label})
              </Text>
              {workspace.categorySummary.slice(0, 5).map((row) => (
                <View
                  key={row.category}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[styles.rowTitle, { color: theme.colors.foreground }]}
                    numberOfLines={1}
                  >
                    {row.category}
                  </Text>
                  <Amount
                    value={row.value}
                    currency={currency}
                    style={[styles.rowSide, { color: theme.colors.foreground }]}
                  />
                </View>
              ))}
            </View>
          ) : null}

          {workspace.merchantSummary.length > 0 ? (
            <View style={styles.listBlock}>
              <Text
                style={[styles.subhead, { color: theme.colors.mutedForeground }]}
              >
                Merchants
              </Text>
              {workspace.merchantSummary.slice(0, 5).map((row) => (
                <View
                  key={row.note}
                  style={[
                    styles.row,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                    },
                  ]}
                >
                  <View style={styles.rowMain}>
                    <Text
                      style={[
                        styles.rowTitle,
                        { color: theme.colors.foreground },
                      ]}
                      numberOfLines={1}
                    >
                      {row.note}
                    </Text>
                    <Text
                      style={[
                        styles.rowMeta,
                        { color: theme.colors.mutedForeground },
                      ]}
                    >
                      {row.count} txn{row.count === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Amount
                    value={row.total}
                    currency={currency}
                    style={[styles.rowSide, { color: theme.colors.foreground }]}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 12,
    marginBottom: 8,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  heading: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  modeRow: {
    flexDirection: "row",
    gap: 6,
  },
  modeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  banner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  bannerTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  bannerBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  metricRow: {
    flexDirection: "row",
    gap: 10,
  },
  metric: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
  },
  metricHint: {
    fontSize: 11,
    fontWeight: "600",
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  cardBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  listBlock: {
    gap: 8,
  },
  subhead: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  row: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rowMain: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: "600",
  },
  rowSide: {
    fontSize: 14,
    fontWeight: "800",
  },
});
