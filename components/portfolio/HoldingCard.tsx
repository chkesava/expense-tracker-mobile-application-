import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { currencySymbol } from "@/shared/utils/formatCurrency";
import type { HoldingWithMetrics, InstrumentType } from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const INSTRUMENT_COLORS: Record<InstrumentType | string, string> = {
  stock: "#3B82F6",
  etf: "#14B8A6",
  mutual_fund: "#8B5CF6",
  crypto: "#F59E0B",
  gold: "#EAB308",
};

function pnlColor(value: number, isDark: boolean, muted: string) {
  if (value > 0) return isDark ? ACCOUNT_GREEN : "#16A34A";
  if (value < 0) return isDark ? ACCOUNT_RED : "#DC2626";
  return muted;
}

function signedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export const HoldingCard = memo(function HoldingCard({
  holding,
  currency,
  onPress,
}: {
  holding: HoldingWithMetrics;
  currency: string;
  onPress: (id: string) => void;
}) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const muted = theme.colors.mutedForeground;
  const tone = pnlColor(holding.dayChange, isDark, muted);
  const symbol = currencySymbol(currency);
  const dayPrefix =
    holding.dayChange > 0
      ? `+${symbol}`
      : holding.dayChange < 0
        ? `-${symbol}`
        : symbol;
  const instrumentColor = INSTRUMENT_COLORS[holding.instrumentType] || "#94A3B8";
  const liveColor = holding.hasLiveQuote
    ? isDark
      ? ACCOUNT_GREEN
      : "#16A34A"
    : "#9CA3AF";

  return (
    <Pressable
      onPress={() => onPress(holding.id)}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: isDark ? "#10141C" : theme.colors.card,
          borderColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border,
          opacity: pressed ? 0.94 : 1,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${holding.symbol}, ${holding.name}`}
    >
      <View style={styles.left}>
        <View style={styles.symbolRow}>
          <View style={[styles.dot, { backgroundColor: instrumentColor }]} />
          <Text
            style={[styles.symbol, { color: theme.colors.foreground }]}
            numberOfLines={1}
          >
            {holding.symbol}
          </Text>
          {holding.exchange ? (
            <View
              style={[
                styles.exchange,
                {
                  backgroundColor: isDark
                    ? "rgba(148, 163, 184, 0.12)"
                    : theme.colors.muted,
                },
              ]}
            >
              <Text style={[styles.exchangeText, { color: muted }]}>
                {holding.exchange}
              </Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.name, { color: muted }]} numberOfLines={1}>
          {holding.name}
        </Text>
        <View style={styles.qtyRow}>
          <Text style={[styles.qty, { color: muted }]}>{holding.quantity} @ </Text>
          <Amount
            value={holding.averageBuyPrice}
            currency={currency}
            style={[styles.qty, { color: muted }]}
          />
        </View>
      </View>

      <View style={styles.right}>
        <View style={styles.valueRow}>
          <Amount
            value={holding.currentValue}
            currency={currency}
            style={[styles.value, { color: theme.colors.foreground }]}
            ghostable
          />
          <View style={[styles.live, { backgroundColor: liveColor }]} />
        </View>
        <View
          style={[
            styles.pnlBadge,
            {
              backgroundColor:
                holding.dayChange > 0
                  ? isDark
                    ? "rgba(74, 222, 128, 0.12)"
                    : "rgba(22, 163, 74, 0.1)"
                  : holding.dayChange < 0
                    ? isDark
                      ? "rgba(248, 113, 113, 0.12)"
                      : "rgba(220, 38, 38, 0.1)"
                    : isDark
                      ? "rgba(148, 163, 184, 0.1)"
                      : "rgba(100, 116, 139, 0.1)",
            },
          ]}
        >
          <Amount
            value={Math.abs(holding.dayChange)}
            currency={currency}
            prefix={dayPrefix}
            style={[styles.pnlValue, { color: tone }]}
            ghostable
          />
          <Text style={[styles.pnlPercent, { color: tone }]}>
            ({signedPercent(holding.dayChangePercent)})
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 10,
  },
  left: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  symbolRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  symbol: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  exchange: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderCurve: "continuous",
  },
  exchangeText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  name: {
    fontSize: 13,
    fontWeight: "500",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  qty: {
    fontSize: 12,
    fontWeight: "500",
  },
  right: {
    alignItems: "flex-end",
    gap: 6,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  value: {
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  live: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pnlBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderCurve: "continuous",
  },
  pnlValue: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  pnlPercent: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
});
