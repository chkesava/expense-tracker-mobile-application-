import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MoreVertical } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";
import { formatAmount } from "@/shared/utils/formatCurrency";
import { formatSignedPercent } from "@/shared/utils/investmentPresentation";
import type { HoldingWithMetrics } from "@/shared/features/portfolio/types";
import { holdingA11yLabel } from "@/shared/features/portfolio/utils/portfolioMetrics";
import { useTheme } from "@/theme/ThemeProvider";

/** Column flex for the wide (tablet / web) table row and its header. */
const COLUMNS = { holding: 2.2, qty: 1.4, invested: 1.3, current: 1.3, pnl: 1.4, day: 1.3 } as const;
const MENU_WIDTH = 32;

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
  const { theme } = useTheme();
  const { settings } = useSettings();
  const colors = usePortfolioColors();
  const muted = theme.colors.mutedForeground;
  const foreground = theme.colors.foreground;
  const pnlTone = colors.pnl(holding.profit);
  const dayTone = colors.pnl(holding.dayChange);
  const instrumentColor = colors.instrument(holding.instrumentType);
  const liveColor = holding.hasLiveQuote ? colors.live : colors.stale;
  const a11yLabel = holdingA11yLabel(holding, (n) => formatAmount(n, currency), !!settings?.ghostMode);

  const identity = (
    <View style={styles.identity}>
      <View style={styles.symbolRow}>
        <View style={[styles.dot, { backgroundColor: instrumentColor }]} />
        <Text style={[styles.symbol, { color: foreground }]} numberOfLines={1}>
          {holding.symbol}
        </Text>
        {holding.exchange ? (
          <View style={[styles.exchange, { backgroundColor: colors.inset }]}>
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
      {/* SPENDLY-543: prefix-based signs vanished in ghost mode. */}
      <FinancialAmount value={value} currency={currency} size="sm" sign="auto" tone="auto" weight="semibold" />
      <Text style={[styles.percent, { color }]} numberOfLines={1}>
        {formatSignedPercent(percent, 2)}
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
      backgroundColor: colors.card,
      borderColor: colors.border,
      opacity: pressed ? 0.94 : 1,
    },
  ];
  const open = () => {
    void haptic.selection();
    onPress(holding.id);
  };

  if (wide) {
    return (
      // SPENDLY-543: the menu is a sibling, not a child, of the card
      // button (a <button> inside a <button> is invalid HTML on web).
      <View style={styles.wrap}>
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
          <View style={styles.menuSpace} />
        </Pressable>
        <View style={[styles.menuSlot, styles.menuSlotWide]}>{menu}</View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Pressable onPress={open} style={cardStyle} accessibilityRole="button" accessibilityLabel={a11yLabel}>
        <View style={styles.topRow}>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            {identity}
            {qtyAvg}
          </View>
          <View style={styles.menuSpace} />
        </View>
        <View style={[styles.metricsRow, { borderTopColor: colors.hairline }]}>
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
          <FinancialAmount value={holding.dayChange} currency={currency} size="xs" sign="auto" tone="auto" weight="semibold" />
          <Text style={[styles.percent, { color: dayTone }]}>({formatSignedPercent(holding.dayChangePercent, 2)})</Text>
        </View>
      </Pressable>
      <View style={styles.menuSlot}>{menu}</View>
    </View>
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
  wrap: {
    position: "relative",
  },
  menuSpace: {
    width: MENU_WIDTH,
  },
  // Sits over the card's top-right spacer.
  menuSlot: {
    position: "absolute",
    top: 10,
    right: 10,
  },
  menuSlotWide: {
    top: 0,
    bottom: 0,
    justifyContent: "center",
  },
  menuPressed: {
    opacity: 0.7,
  },
});
