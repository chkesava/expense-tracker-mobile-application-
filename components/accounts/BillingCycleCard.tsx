import { Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar, ChevronRight } from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_RED,
  CARD_ORANGE,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import type { CreditBillStatus } from "@/shared/utils/accountBalance";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

function statusPresentation(
  status: CreditBillStatus,
  overdue: boolean
): { label: string; backgroundColor: string; color: string } {
  if (status === "paid") {
    return { label: "PAID", backgroundColor: "#16A34A", color: "#FFFFFF" };
  }
  if (status === "partiallyPaid") {
    return {
      label: "PARTIALLY PAID",
      backgroundColor: CARD_ORANGE,
      color: "#111111",
    };
  }
  if (overdue) {
    return { label: "OVERDUE", backgroundColor: "#DC2626", color: "#FFFFFF" };
  }
  return { label: "UNPAID", backgroundColor: ACCOUNT_RED, color: "#FFFFFF" };
}

export function BillingCycleCard({
  rangeLabel,
  billedAmount,
  paidAmount,
  remainingAmount,
  paymentDate,
  currency,
  status,
  overdue,
  onPress,
}: {
  rangeLabel: string;
  billedAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentDate?: string;
  currency: string;
  status: CreditBillStatus;
  overdue: boolean;
  onPress?: () => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const presentation = statusPresentation(status, overdue);
  const showRemaining = remainingAmount > 0 && status !== "paid";

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? "#10141C" : theme.colors.card,
          borderColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border,
        },
        pressed && onPress ? styles.pressed : null,
      ]}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${rangeLabel}, ${presentation.label}`}
    >
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Calendar size={16} color="#FFFFFF" strokeWidth={2.2} />
        </View>
        <View style={styles.copy}>
          <Text
            style={[styles.range, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {rangeLabel}
          </Text>
          <View style={styles.amounts}>
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              Billed:{" "}
            </Text>
            <Amount
              value={billedAmount}
              currency={currency}
              ghostable
              style={[styles.metaAmount, { color: theme.colors.mutedForeground }]}
            />
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              {"  "}• Paid:{" "}
            </Text>
            <Amount
              value={paidAmount}
              currency={currency}
              ghostable
              style={[styles.metaAmount, { color: theme.colors.mutedForeground }]}
            />
          </View>
          {showRemaining ? (
            <View style={styles.amounts}>
              <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
                Remaining:{" "}
              </Text>
              <Amount
                value={remainingAmount}
                currency={currency}
                ghostable
                style={[styles.metaAmount, { color: presentation.backgroundColor }]}
              />
            </View>
          ) : null}
          {paymentDate ? (
            <Text style={[styles.meta, { color: theme.colors.mutedForeground }]}>
              Paid on {paymentDate}
            </Text>
          ) : null}
          <View
            style={[
              styles.statusPill,
              { backgroundColor: presentation.backgroundColor },
              overdue ? styles.overduePill : null,
            ]}
          >
            <Text style={[styles.statusLabel, { color: presentation.color }]}>
              {presentation.label}
            </Text>
          </View>
        </View>
        <ChevronRight
          size={18}
          color={onPress ? theme.colors.mutedForeground : "rgba(148,163,184,0.35)"}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    padding: 14,
    minHeight: 88,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: ACCOUNT_GREEN,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  range: {
    fontSize: 14,
    fontWeight: "700",
  },
  amounts: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  meta: {
    fontSize: 12,
    fontWeight: "500",
  },
  metaAmount: {
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  statusPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 2,
  },
  overduePill: {
    boxShadow: "0 0 10px rgba(220, 38, 38, 0.45)",
  },
  statusLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.7,
  },
  pressed: {
    opacity: 0.86,
  },
});
