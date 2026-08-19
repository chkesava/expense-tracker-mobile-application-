import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowDownLeft, ArrowUpRight, ChevronRight } from "lucide-react-native";

import {
  ACCOUNT_RED,
  ACCOUNT_RED_DIM,
  ACCOUNT_GREEN_DIM,
  EXPENSE_BADGE_BG,
  EXPENSE_BADGE_FG,
  INCOME_BADGE_BG,
  INCOME_BADGE_FG,
  accountAccent,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { currencySymbol } from "@/shared/utils/formatCurrency";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type TransactionRowProps = {
  id: string;
  title: string;
  subtype: string;
  isCredit: boolean;
  dateLabel: string;
  timeLabel?: string;
  amount: number;
  runningBalance?: number;
  currency: string;
  compact: boolean;
  showRunningBalance: boolean;
  onPress: (id: string) => void;
};

export const TransactionRow = memo(function TransactionRow({
  id,
  title,
  subtype,
  isCredit,
  dateLabel,
  timeLabel,
  amount,
  runningBalance,
  currency,
  compact,
  showRunningBalance,
  onPress,
}: TransactionRowProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const accent = accountAccent(isDark);
  const amountColor = isCredit ? accent : isDark ? ACCOUNT_RED : theme.colors.destructive;
  const badgeBg = isCredit ? INCOME_BADGE_BG : EXPENSE_BADGE_BG;
  const badgeFg = isCredit ? INCOME_BADGE_FG : EXPENSE_BADGE_FG;
  const iconBg = isCredit ? ACCOUNT_GREEN_DIM : ACCOUNT_RED_DIM;
  const prefix = `${isCredit ? "+ " : "- "}${currencySymbol(currency)}`;

  return (
    <Pressable
      onPress={() => onPress(id)}
      style={[
        styles.row,
        {
          backgroundColor: isDark ? "rgba(12,15,20,0.92)" : theme.colors.card,
          borderColor: isDark ? "rgba(148,163,184,0.08)" : theme.colors.border,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${dateLabel}${timeLabel ? `, ${timeLabel}` : ""}, ${isCredit ? "income" : "expense"} ${amount}`}
    >
      <View style={[styles.icon, { backgroundColor: iconBg }]}>
        {isCredit ? (
          <ArrowDownLeft size={16} color={accent} strokeWidth={2.4} />
        ) : (
          <ArrowUpRight size={16} color={amountColor} strokeWidth={2.4} />
        )}
      </View>

      {compact ? (
        <View style={styles.compactBody}>
          <View style={styles.compactTop}>
            <View style={styles.compactCopy}>
              <Text
                style={[styles.title, { color: theme.colors.foreground }]}
                numberOfLines={1}
              >
                {title}
              </Text>
              <View style={styles.metaLine}>
                <Text style={[styles.subtype, { color: theme.colors.mutedForeground }]} numberOfLines={1}>
                  {subtype}
                </Text>
                <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                  <Text style={[styles.badgeText, { color: badgeFg }]}>
                    {isCredit ? "Income" : "Expense"}
                  </Text>
                </View>
              </View>
            </View>
            <Amount
              value={amount}
              currency={currency}
              prefix={prefix}
              ghostable
              fractionDigits={2}
              style={[styles.amount, { color: amountColor }]}
            />
          </View>
          <View style={styles.compactBottom}>
            <Text style={[styles.time, { color: theme.colors.mutedForeground }]}>
              {dateLabel}
              {timeLabel ? ` · ${timeLabel}` : ""}
            </Text>
            {showRunningBalance && runningBalance != null ? (
              <View style={styles.compactBalance}>
                <Text style={[styles.balanceLabel, { color: theme.colors.mutedForeground }]}>
                  Balance after
                </Text>
                <Amount
                  value={runningBalance}
                  currency={currency}
                  ghostable
                  fractionDigits={2}
                  style={[styles.balance, { color: theme.colors.foreground }]}
                />
              </View>
            ) : null}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.wideCopy}>
            <Text
              style={[styles.title, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {title}
            </Text>
            <View style={styles.metaLine}>
              <Text style={[styles.subtype, { color: theme.colors.mutedForeground }]} numberOfLines={1}>
                {subtype}
              </Text>
              <View style={[styles.badge, { backgroundColor: badgeBg }]}>
                <Text style={[styles.badgeText, { color: badgeFg }]}>
                  {isCredit ? "Income" : "Expense"}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.wideTime}>
            <Text style={[styles.date, { color: theme.colors.foreground }]}>{dateLabel}</Text>
            {timeLabel ? (
              <Text style={[styles.time, { color: theme.colors.mutedForeground }]}>
                {timeLabel}
              </Text>
            ) : null}
          </View>
          <View style={styles.wideAmount}>
            <Amount
              value={amount}
              currency={currency}
              prefix={prefix}
              ghostable
              fractionDigits={2}
              style={[styles.amount, { color: amountColor }]}
            />
          </View>
          {showRunningBalance ? (
            <View style={styles.wideBalance}>
              {runningBalance != null ? (
                <Amount
                  value={runningBalance}
                  currency={currency}
                  ghostable
                  fractionDigits={2}
                  style={[styles.balance, { color: theme.colors.foreground }]}
                />
              ) : (
                <Text style={[styles.time, { color: theme.colors.mutedForeground }]}>—</Text>
              )}
            </View>
          ) : null}
        </>
      )}

      <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderCurve: "continuous",
    borderWidth: 1,
    minHeight: 72,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  compactBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  compactTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  compactCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  compactBottom: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
  },
  compactBalance: {
    alignItems: "flex-end",
    gap: 1,
  },
  balanceLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  wideCopy: {
    flex: 1.4,
    minWidth: 0,
    gap: 4,
  },
  wideTime: {
    width: 78,
    gap: 2,
  },
  wideAmount: {
    width: 88,
    alignItems: "flex-end",
  },
  wideBalance: {
    width: 88,
    alignItems: "flex-end",
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
  },
  metaLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  subtype: {
    fontSize: 11,
    fontWeight: "500",
    flexShrink: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  date: {
    fontSize: 12,
    fontWeight: "600",
  },
  time: {
    fontSize: 11,
    fontWeight: "500",
  },
  amount: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  balance: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
