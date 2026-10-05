import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MoreVertical } from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import { currencySymbol, formatAmount } from "@/shared/utils/formatCurrency";
import type { HoldingWithMetrics, InstrumentType } from "@/shared/features/portfolio/types";
import { holdingA11yLabel } from "@/shared/features/portfolio/utils/portfolioMetrics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const INSTRUMENT_COLORS: Record<InstrumentType | string, string> = {
  stock: "#3B82F6",
  etf: "#14B8A6",
  mutual_fund: "#8B5CF6",
  crypto: "#F59E0B",
  gold: "#EAB308",
};

/** Column flex for the wide (tablet / web) table row and its header. */
const COLUMNS = { holding: 2.2, qty: 1.4, invested: 1.3, current: 1.3, pnl: 1.4, day: 1.3 } as const;
const MENU_WIDTH = 32;

function pnlColor(value: number, isDark: boolean, muted: string) {
  if (value > 0) return isDark ? ACCOUNT_GREEN : "#16A34A";
  if (value < 0) return isDark ? ACCOUNT_RED : "#DC2626";
  return muted;
}

function signedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function signedPrefix(value: number, symbol: string) {
  return value > 0 ? `+${symbol}` : value < 0 ? `-${symbol}` : symbol;
}

/** Column titles above the wide holdings table (SPENDLY-388). */
export function HoldingTableHeader() {
  const { theme } = useTheme();
  const muted = theme.colors.mutedForeground;
  const cell = (label: string, flex: number, end = true) => (
    <Text style={[styles.headerCell, { flex, color: muted, textAlign: end ? "right" : "left" }]} numberOfLines={1}>
      {label}
    </Text>
  );
  return (
    <View style={styles.headerRow} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      {cell("Holding", COLUMNS.holding, false)}
      {cell("Qty / Avg", COLUMNS.qty)}
      {cell("Invested", COLUMNS.invested)}
      {cell("Current", COLUMNS.current)}
      {cell("P&L", COLUMNS.pnl)}
      {cell("Day", COLUMNS.day)}
      <View style={{ width: MENU_WIDTH }} />
    </View>
  );
}

/**
 * One holding (SPENDLY-388): Invested and Current side by side, with P&L and
 * today's move. Values come straight from the shared HoldingWithMetrics; this
 * component never recalculates. `wide` renders the dense table row.
 */
export const HoldingCard = memo(function HoldingCard({
  holding,
  currency,
  onPress,
  onMenu,
  wide = false,
}: {
  holding: HoldingWithMetrics;
  currency: string;
  onPress: (id: string) => void;
  onMenu: (id: string) => void;
  wide?: boolean;
}) {
  const { theme, themeName } = useTheme();
  const { settings } = useSettings();
  const isDark = themeUsesDarkPalette(themeName);
  const muted = theme.colors.mutedForeground;
  const foreground = theme.colors.foreground;
  const symbol = currencySymbol(currency);
  const pnlTone = pnlColor(holding.profit, isDark, muted);
  const dayTone = pnlColor(holding.dayChange, isDark, muted);
  const instrumentColor = INSTRUMENT_COLORS[holding.instrumentType] || "#94A3B8";
  const liveColor = holding.hasLiveQuote ? (isDark ? ACCOUNT_GREEN : "#16A34A") : "#9CA3AF";
  const a11yLabel = holdingA11yLabel(holding, (n) => formatAmount(n, currency), !!settings?.ghostMode);

  const identity = (
    <View style={styles.identity}>
      <View style={styles.symbolRow}>
        <View style={[styles.dot, { backgroundColor: instrumentColor }]} />
        <Text style={[styles.symbol, { color: foreground }]} numberOfLines={1}>
          {holding.symbol}
        </Text>
        {holding.exchange ? (
          <View style={[styles.exchange, { backgroundColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.muted }]}>
            <Text style={[styles.exchangeText, { color: muted }]}>{holding.exchange}</Text>
          </View>
        ) : null}
        <View style={[styles.live, { backgroundColor: liveColor }]} />
      </View>
      <Text style={[styles.name, { color: muted }]} numberOfLines={1}>
        {holding.name}
      </Text>
    </View>
  );

  const qtyAvg = (
    <View style={styles.qtyRow}>
      <Text style={[styles.qty, { color: muted }]}>
        {holding.quantity} {holding.quantity === 1 ? "unit" : "units"} @{" "}
      </Text>
      <Amount value={holding.averageBuyPrice} currency={currency} style={[styles.qty, { color: muted }]} ghostable />
    </View>
  );

  const money = (value: number, color: string, bold = false) => (
    <Amount value={value} currency={currency} style={[bold ? styles.valueStrong : styles.value, { color }]} ghostable numberOfLines={1} />
  );
  const signed = (value: number, percent: number, color: string) => (
    <View style={styles.signed}>
      <Amount value={Math.abs(value)} currency={currency} prefix={signedPrefix(value, symbol)} style={[styles.value, { color }]} ghostable numberOfLines={1} />
      <Text style={[styles.percent, { color }]} numberOfLines={1}>
        {signedPercent(percent)}
      </Text>
    </View>
  );

  const menu = (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onMenu(holding.id);
      }}
      hitSlop={8}
      style={({ pressed }) => [styles.menuHit, pressed && styles.menuPressed]}
      accessibilityRole="button"
      accessibilityLabel={`Actions for ${holding.symbol}`}
    >
      <MoreVertical size={18} color={muted} />
    </Pressable>
  );

  const cardStyle = ({ pressed }: { pressed: boolean }) => [
    styles.card,
    wide ? styles.cardWide : null,
    {
      backgroundColor: isDark ? "#10141C" : theme.colors.card,
      borderColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border,
      opacity: pressed ? 0.94 : 1,
    },
  ];
  const open = () => {
    void haptic.selection();
    onPress(holding.id);
  };

  if (wide) {
    return (
      <Pressable onPress={open} style={cardStyle} accessibilityRole="button" accessibilityLabel={a11yLabel}>
        <View style={{ flex: COLUMNS.holding, minWidth: 0 }}>{identity}</View>
        <View style={[styles.cellEnd, { flex: COLUMNS.qty }]}>{qtyAvg}</View>
        <View style={[styles.cellEnd, { flex: COLUMNS.invested }]}>{money(holding.investedValue, foreground)}</View>
        <View style={[styles.cellEnd, { flex: COLUMNS.current }]}>
          {money(holding.currentValue, foreground, true)}
          {!holding.hasLiveQuote ? <Text style={[styles.hint, { color: muted }]} numberOfLines={1}>last price</Text> : null}
        </View>
        <View style={[styles.cellEnd, { flex: COLUMNS.pnl }]}>{signed(holding.profit, holding.profitPercent, pnlTone)}</View>
        <View style={[styles.cellEnd, { flex: COLUMNS.day }]}>{signed(holding.dayChange, holding.dayChangePercent, dayTone)}</View>
        {menu}
      </Pressable>
    );
  }

  return (
    <Pressable onPress={open} style={cardStyle} accessibilityRole="button" accessibilityLabel={a11yLabel}>
      <View style={styles.topRow}>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          {identity}
          {qtyAvg}
        </View>
        {menu}
      </View>
      <View style={[styles.metricsRow, { borderTopColor: isDark ? "rgba(148, 163, 184, 0.12)" : theme.colors.border }]}>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: muted }]} numberOfLines={1}>Invested</Text>
          {money(holding.investedValue, foreground)}
        </View>
        <View style={styles.metric}>
          <Text style={[styles.metricLabel, { color: muted }]} numberOfLines={1}>Current</Text>
          {money(holding.currentValue, foreground, true)}
          {!holding.hasLiveQuote ? <Text style={[styles.hint, { color: muted }]} numberOfLines={1}>last price</Text> : null}
        </View>
        <View style={[styles.metric, styles.metricEnd]}>
          <Text style={[styles.metricLabel, { color: muted }]} numberOfLines={1}>P&L</Text>
          {signed(holding.profit, holding.profitPercent, pnlTone)}
        </View>
      </View>
      <View style={styles.dayRow}>
        <Text style={[styles.metricLabel, { color: muted }]}>Today</Text>
        <Amount value={Math.abs(holding.dayChange)} currency={currency} prefix={signedPrefix(holding.dayChange, symbol)} style={[styles.percent, { color: dayTone }]} ghostable />
        <Text style={[styles.percent, { color: dayTone }]}>({signedPercent(holding.dayChangePercent)})</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: 1,
    gap: 10,
  },
  cardWide: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 14,
    gap: 12,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  identity: {
    gap: 2,
    minWidth: 0,
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
  live: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  name: {
    fontSize: 13,
    fontWeight: "500",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
  },
  qty: {
    fontSize: 12,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  metricsRow: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    gap: 8,
  },
  metric: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metricEnd: {
    alignItems: "flex-end",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  hint: {
    fontSize: 10,
    fontWeight: "600",
  },
  value: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  valueStrong: {
    fontSize: 15,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  signed: {
    alignItems: "flex-end",
  },
  percent: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  cellEnd: {
    alignItems: "flex-end",
    minWidth: 0,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingBottom: 6,
    paddingTop: 4,
  },
  headerCell: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  menuHit: {
    width: MENU_WIDTH,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    marginRight: -4,
  },
  menuPressed: {
    opacity: 0.7,
  },
});
