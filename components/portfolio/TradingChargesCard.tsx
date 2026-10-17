import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { useSettings } from "@/providers/SettingsProvider";
import type { PortfolioTransaction } from "@/shared/features/portfolio/types";
import {
  TRADE_CHARGE_PERIODS,
  isValidTradeChargeRange,
  summarizeTradeCharges,
  tradeChargeRange,
  type TradeChargePeriod,
} from "@/shared/features/portfolio/utils/tradeCharges";
import { todayDateKey } from "@/shared/utils/dates";
import { useGhostMoney } from "@/hooks/useGhostMoney";
import { useTheme } from "@/theme/ThemeProvider";

interface TradingChargesCardProps {
  /** The already-loaded `portfolioTransactions` (no extra Firestore read). */
  transactions: PortfolioTransaction[];
  currency: string;
}

/**
 * SPENDLY-526: what the user has paid in trading charges, BUY and SELL.
 * Reads only the recorded `fees` on executed trades; nothing is estimated.
 */
export function TradingChargesCard({ transactions, currency }: TradingChargesCardProps) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const muted = theme.colors.mutedForeground;
  const [period, setPeriod] = useState<TradeChargePeriod>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const today = todayDateKey(settings?.timezone);
  const customValid = isValidTradeChargeRange({
    from: customFrom.trim() || undefined,
    to: customTo.trim() || undefined,
  });

  const summary = useMemo(() => {
    const custom = { from: customFrom.trim() || undefined, to: customTo.trim() || undefined };
    if (period === "custom" && !isValidTradeChargeRange(custom)) return null;
    return summarizeTradeCharges(transactions, tradeChargeRange(period, today, custom));
  }, [transactions, period, customFrom, customTo, today]);
  const tradeCount = summary ? summary.buyCount + summary.sellCount : 0;
  // SPENDLY-543: the label read the amounts aloud in ghost mode.
  const money = useGhostMoney(currency);
  const a11ySummary = summary
    ? `Trading charges ${money(summary.total)}. Buy ${money(summary.buy)}, sell ${money(summary.sell)}.`
    : "Trading charges. Enter a valid date range.";

  return (
    <View
      style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: theme.colors.foreground }]}>Trading charges</Text>
        <Text style={[styles.caption, { color: muted }]}>BUY + SELL</Text>
      </View>

      <View style={styles.chips} accessibilityRole="radiogroup">
        {TRADE_CHARGE_PERIODS.map((p) => (
          <Chip
            key={p.id}
            label={p.label}
            size="sm"
            selected={period === p.id}
            onPress={() => setPeriod(p.id)}
            accessibilityRole="radio"
          />
        ))}
      </View>

      {period === "custom" ? (
        <View style={styles.rangeRow}>
          <Input
            label="From"
            placeholder="YYYY-MM-DD"
            value={customFrom}
            onChangeText={setCustomFrom}
            containerStyle={styles.rangeInput}
            autoCapitalize="none"
          />
          <Input
            label="To"
            placeholder="YYYY-MM-DD"
            value={customTo}
            onChangeText={setCustomTo}
            containerStyle={styles.rangeInput}
            autoCapitalize="none"
            error={customValid ? undefined : "Use YYYY-MM-DD, From before To"}
          />
        </View>
      ) : null}

      <View accessible accessibilityLabel={a11ySummary}>
        {summary ? (
          <>
            <Amount
              value={summary.total}
              currency={currency}
              style={[styles.total, { color: theme.colors.foreground }]}
              ghostable
            />
            <View style={[styles.split, { borderTopColor: theme.colors.border }]}>
              <View style={styles.splitCol}>
                <Text style={[styles.splitLabel, { color: muted }]}>Buy charges</Text>
                <Amount
                  value={summary.buy}
                  currency={currency}
                  style={[styles.splitValue, { color: theme.colors.foreground }]}
                  ghostable
                />
                <Text style={[styles.caption, { color: muted }]}>
                  {summary.buyCount} {summary.buyCount === 1 ? "trade" : "trades"}
                </Text>
              </View>
              <View style={[styles.vRule, { backgroundColor: theme.colors.border }]} />
              <View style={[styles.splitCol, styles.splitColEnd]}>
                <Text style={[styles.splitLabel, { color: muted }]}>Sell charges</Text>
                <Amount
                  value={summary.sell}
                  currency={currency}
                  style={[styles.splitValue, { color: theme.colors.foreground }]}
                  ghostable
                />
                <Text style={[styles.caption, { color: muted }]}>
                  {summary.sellCount} {summary.sellCount === 1 ? "trade" : "trades"}
                </Text>
              </View>
            </View>
            {tradeCount === 0 ? (
              <Text style={[styles.caption, { color: muted }]}>No trades in this period.</Text>
            ) : summary.total === 0 ? (
              <Text style={[styles.caption, { color: muted }]}>
                No charges were recorded on these trades.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={[styles.caption, { color: muted }]}>Enter a valid date range.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  caption: {
    fontSize: 12,
    fontWeight: "500",
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  rangeRow: {
    flexDirection: "row",
    gap: 8,
  },
  rangeInput: {
    flex: 1,
  },
  total: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  split: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    marginTop: 8,
  },
  splitCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  splitColEnd: {
    alignItems: "flex-end",
  },
  splitLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  splitValue: {
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  vRule: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 12,
  },
});
