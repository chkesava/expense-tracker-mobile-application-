import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  CreditCard,
} from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_RED,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import type { CreditCardBill } from "@/shared/types/creditCardBill";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export type CreditCardRowModel = {
  id: string;
  name: string;
  identityLine: string;
  smsWarning: string | null;
  daysRemaining: number;
  usedThisCycle: number;
  availableCredit: number;
  limit: number;
  utilization: number;
  accent: string;
  openBill: CreditCardBill | null;
};

export const CreditCardListItem = memo(function CreditCardListItem({
  row,
  currency,
  onPress,
  onLongPress,
  onAddStatement,
  onPay,
}: {
  row: CreditCardRowModel;
  currency: string;
  onPress: (id: string) => void;
  onLongPress: (id: string) => void;
  onAddStatement: (id: string) => void;
  onPay: (id: string) => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const usedColor = row.usedThisCycle > 0
    ? isDark
      ? ACCOUNT_RED
      : theme.colors.destructive
    : theme.colors.foreground;
  const utilizationPercent = Math.round(Math.min(100, Math.max(0, row.utilization)));

  return (
    <Pressable
      onPress={() => onPress(row.id)}
      onLongPress={() => onLongPress(row.id)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? "#10141C" : theme.colors.card,
          borderColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border,
          opacity: pressed ? 0.94 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${row.name}, ${utilizationPercent} percent used`}
    >
      <View style={styles.topRow}>
        <View style={styles.identity}>
          <LinearGradient
            colors={[row.accent, shadeAccent(row.accent)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.plastic}
          >
            <View style={styles.chip} />
            <CreditCard size={16} color="#FFFFFF" strokeWidth={2.2} />
          </LinearGradient>
          <View style={styles.copy}>
            <Text
              style={[styles.name, { color: theme.colors.foreground }]}
              numberOfLines={1}
            >
              {row.name}
            </Text>
            <Text
              style={[styles.identityLine, { color: theme.colors.mutedForeground }]}
              numberOfLines={1}
            >
              {row.identityLine}
            </Text>
            {row.smsWarning ? (
              <View style={styles.warningRow}>
                <AlertTriangle size={12} color={CARD_ORANGE} strokeWidth={2.4} />
                <Text style={styles.warningText} numberOfLines={1}>
                  {row.smsWarning}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View
          style={[
            styles.resetBadge,
            {
              backgroundColor: isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.05)",
              borderColor: isDark ? "rgba(148,163,184,0.14)" : theme.colors.border,
            },
          ]}
        >
          <Calendar size={12} color={theme.colors.mutedForeground} />
          <Text style={[styles.resetText, { color: theme.colors.mutedForeground }]}>
            Resets in {row.daysRemaining}d
          </Text>
        </View>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metricCol}>
          <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
            Current Used
          </Text>
          <Amount
            value={row.usedThisCycle}
            currency={currency}
            ghostable
            style={[styles.metricValue, { color: usedColor }]}
          />
        </View>
        <View style={[styles.metricCol, styles.metricRight]}>
          <Text style={[styles.metricLabel, { color: theme.colors.mutedForeground }]}>
            Available Limit
          </Text>
          <Amount
            value={row.availableCredit}
            currency={currency}
            ghostable
            style={[
              styles.metricValue,
              { color: isDark ? ACCOUNT_GREEN : theme.colors.success },
            ]}
          />
        </View>
      </View>

      <View style={styles.utilRow}>
        <View
          style={[
            styles.track,
            { backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.08)" },
          ]}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${Math.min(100, Math.max(0, row.utilization))}%`,
                backgroundColor: row.accent,
              },
            ]}
          />
        </View>
        <Text style={[styles.utilLabel, { color: theme.colors.mutedForeground }]}>
          {utilizationPercent}% Used
        </Text>
      </View>

      {row.openBill ? (
        <View
          style={[
            styles.statement,
            { borderTopColor: isDark ? "rgba(148,163,184,0.12)" : theme.colors.border },
          ]}
        >
          <Text style={[styles.statementKicker, { color: theme.colors.mutedForeground }]}>
            Statement · {row.openBill.status.replaceAll("_", " ")}
          </Text>
          <View style={styles.statementRow}>
            <Amount
              value={row.openBill.statementAmount}
              currency={currency}
              ghostable
            />
            <Text style={[styles.due, { color: theme.colors.mutedForeground }]}>
              Due {row.openBill.dueDate}
            </Text>
          </View>
        </View>
      ) : (
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onAddStatement(row.id);
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Add statement bill"
        >
          <Text style={styles.addStatement}>+ Add statement bill</Text>
        </Pressable>
      )}

      <View style={styles.footer}>
        <Text style={[styles.limit, { color: theme.colors.mutedForeground }]}>
          Limit
        </Text>
        <Amount
          value={row.limit}
          currency={currency}
          ghostable
          style={[styles.limitAmount, { color: theme.colors.mutedForeground }]}
        />
        <View style={{ flex: 1 }} />
        <Pressable
          onPress={(event) => {
            event.stopPropagation();
            onPay(row.id);
          }}
          style={[
            styles.payBtn,
            {
              backgroundColor: isDark ? "rgba(74, 222, 128, 0.12)" : "rgba(22, 163, 74, 0.1)",
              borderColor: isDark ? "rgba(74, 222, 128, 0.35)" : theme.colors.success,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Pay bill"
        >
          <CheckCircle2 size={13} color={isDark ? ACCOUNT_GREEN : theme.colors.success} />
          <Text
            style={[
              styles.payLabel,
              { color: isDark ? ACCOUNT_GREEN : theme.colors.success },
            ]}
          >
            Pay Bill
          </Text>
        </Pressable>
      </View>
    </Pressable>
  );
});

function shadeAccent(hex: string): string {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((char) => char + char)
          .join("")
      : raw;
  if (full.length !== 6 || Number.isNaN(Number.parseInt(full, 16))) {
    return "#312E81";
  }
  const value = Number.parseInt(full, 16);
  const r = Math.max(0, ((value >> 16) & 255) - 36);
  const g = Math.max(0, ((value >> 8) & 255) - 42);
  const b = Math.max(0, (value & 255) - 18);
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 14,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  identity: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  plastic: {
    width: 48,
    height: 36,
    borderRadius: 10,
    borderCurve: "continuous",
    padding: 6,
    justifyContent: "space-between",
  },
  chip: {
    width: 10,
    height: 8,
    borderRadius: 2,
    backgroundColor: "rgba(253, 230, 138, 0.92)",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
  },
  identityLine: {
    fontSize: 12,
    fontWeight: "500",
  },
  warningRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
  },
  warningText: {
    flex: 1,
    color: CARD_ORANGE,
    fontSize: 12,
    fontWeight: "700",
  },
  resetBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    gap: 4,
    flexShrink: 0,
  },
  resetText: {
    fontSize: 10,
    fontWeight: "700",
  },
  metrics: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  metricCol: {
    gap: 4,
    flex: 1,
  },
  metricRight: {
    alignItems: "flex-end",
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: "500",
  },
  metricValue: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  utilRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  utilLabel: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  statement: {
    gap: 4,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  statementKicker: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statementRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  due: {
    fontSize: 13,
  },
  addStatement: {
    color: CARD_ORANGE,
    fontSize: 13,
    fontWeight: "700",
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  limit: {
    fontSize: 11,
    fontWeight: "600",
  },
  limitAmount: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 5,
  },
  payLabel: {
    fontSize: 11,
    fontWeight: "700",
  },
});
