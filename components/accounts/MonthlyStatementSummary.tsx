import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import {
  accountAccent,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import type { AccountMonthSummary } from "@/shared/utils/accountMonthSummary";

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  month: "long",
  year: "numeric",
});

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return month;
  return MONTH_LABEL_FORMATTER.format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

/**
 * Compact monthly statement for one account. Every figure comes from
 * `summarizeAccountMonth()`; this component only presents them.
 */
export function MonthlyStatementSummary({
  summary,
  currency,
  canGoOlder,
  canGoNewer,
  onOlder,
  onNewer,
  onDrillDown,
  isDrilledDown,
}: {
  summary: AccountMonthSummary;
  currency: string;
  canGoOlder: boolean;
  canGoNewer: boolean;
  onOlder: () => void;
  onNewer: () => void;
  onDrillDown: () => void;
  /** True when the transaction list below is already scoped to this month. */
  isDrilledDown: boolean;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);

  const label = useMemo(() => monthLabel(summary.month), [summary.month]);
  const transfersTotal = summary.transfersIn - summary.transfersOut;
  const hasBalances =
    summary.openingBalance !== undefined && summary.closingBalance !== undefined;

  const step = (goOlder: boolean, enabled: boolean) => (
    <Pressable
      onPress={() => {
        if (!enabled) return;
        void haptic.selection();
        (goOlder ? onOlder : onNewer)();
      }}
      disabled={!enabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ disabled: !enabled }}
      accessibilityLabel={goOlder ? "Previous month" : "Next month"}
      style={[
        styles.step,
        {
          backgroundColor: isDark
            ? "rgba(255,255,255,0.04)"
            : "rgba(15,23,42,0.04)",
          borderColor: isDark
            ? "rgba(148,163,184,0.16)"
            : "rgba(15,23,42,0.08)",
          opacity: enabled ? 1 : 0.35,
        },
      ]}
    >
      {goOlder ? (
        <ChevronLeft size={16} color={theme.colors.mutedForeground} />
      ) : (
        <ChevronRight size={16} color={theme.colors.mutedForeground} />
      )}
    </Pressable>
  );

  const row = (
    key: string,
    labelText: string,
    value: number | undefined,
    color?: string
  ) => (
    <View key={key} style={styles.row}>
      <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>
        {labelText}
      </Text>
      {value === undefined ? (
        <Text style={[styles.value, { color: theme.colors.mutedForeground }]}>
          —
        </Text>
      ) : (
        <Amount
          value={value}
          currency={currency}
          ghostable
          style={[styles.value, color ? { color } : undefined]}
        />
      )}
    </View>
  );

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
        },
      ]}
    >
      <View style={styles.header}>
        {step(true, canGoOlder)}
        <View style={styles.headerText}>
          <Text
            style={[
              styles.title,
              {
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.semibold,
              },
            ]}
          >
            {label}
          </Text>
          <Text style={[styles.subtitle, { color: theme.colors.mutedForeground }]}>
            {summary.activityCount === 0
              ? "No activity"
              : `${summary.activityCount} ${
                  summary.activityCount === 1 ? "activity" : "activities"
                }`}
          </Text>
        </View>
        {step(false, canGoNewer)}
      </View>

      <View style={styles.details}>
        {hasBalances ? row("opening", "Opening balance", summary.openingBalance) : null}
        {row("income", "Income", summary.income, summary.income > 0 ? accent : undefined)}
        {row(
          "expenses",
          "Expenses",
          summary.expenses,
          summary.expenses > 0 ? ACCOUNT_RED : undefined
        )}
        {row("transfers", "Transfers", transfersTotal)}
        {row(
          "net",
          "Net change",
          summary.netChange,
          summary.netChange === 0
            ? undefined
            : summary.netChange > 0
              ? accent
              : ACCOUNT_RED
        )}
        {hasBalances ? row("closing", "Closing balance", summary.closingBalance) : null}
      </View>

      {hasBalances ? null : (
        <Text style={[styles.note, { color: theme.colors.mutedForeground }]}>
          Balances are not shown for this month.
        </Text>
      )}

      <Pressable
        onPress={() => {
          void haptic.selection();
          onDrillDown();
        }}
        disabled={summary.activityCount === 0}
        accessibilityRole="button"
        accessibilityLabel={
          isDrilledDown
            ? `Show all transactions instead of ${label}`
            : `Show ${label} transactions`
        }
        style={{ opacity: summary.activityCount === 0 ? 0.35 : 1 }}
      >
        <Text
          style={[
            styles.action,
            { color: accent, fontFamily: theme.fontFamily.medium },
          ]}
        >
          {isDrilledDown ? "Show all transactions" : `Show ${label} transactions`}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerText: {
    flex: 1,
    alignItems: "center",
  },
  title: {
    fontSize: 15,
  },
  subtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  details: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  label: {
    fontSize: 13,
    flexShrink: 1,
  },
  value: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  note: {
    fontSize: 11,
  },
  action: {
    fontSize: 13,
  },
});
