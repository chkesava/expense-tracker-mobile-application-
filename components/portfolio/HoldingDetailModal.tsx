import { useMemo, type ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Info, MoreHorizontal } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import { Amount } from "@/components/common/Amount";
import { appDialog } from "@/lib/appDialog";
import { haptic } from "@/lib/haptics";
import type {
  HoldingWithMetrics,
  InstrumentType,
  PortfolioTransaction,
} from "@/shared/features/portfolio/types";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { todayDateKey } from "@/shared/utils/dates";
import { formatSignedPercent } from "@/shared/utils/investmentPresentation";
import { computeHoldingXirr } from "@/shared/utils/portfolioXirr";
import { tradeCashEffect } from "@/shared/features/portfolio/utils/tradeCharges";
import { useSettings } from "@/providers/SettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";
import { HoldingAdjustmentModal } from "./HoldingAdjustmentModal";
import { useState } from "react";

function formatQuantity(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("en-IN", { maximumFractionDigits: 4 });
}

export function HoldingDetailModal({
  visible,
  holding,
  transactions,
  currency,
  onClose,
  onBuy,
  onSell,
}: {
  visible: boolean;
  holding: HoldingWithMetrics | null;
  transactions: PortfolioTransaction[];
  currency: string;
  onClose: () => void;
  onBuy: () => void;
  onSell: () => void;
}) {
  const { theme } = useTheme();
  const colors = usePortfolioColors();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const muted = theme.colors.mutedForeground;
  const asOfDate = todayDateKey();
  
  const [isAdjustVisible, setIsAdjustVisible] = useState(false);

  const trades = useMemo(
    () =>
      transactions
        .filter(
          (tx) =>
            (tx.type === "BUY" || tx.type === "SELL" || tx.type === "ADJUSTMENT") &&
            tx.orderStatus !== "cancelled" &&
            tx.orderStatus !== "pending"
        )
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [transactions]
  );

  const xirr = useMemo(() => {
    if (!holding) return null;
    return computeHoldingXirr({
      transactions,
      currentValue: holding.currentValue,
      asOfDate,
    });
  }, [asOfDate, holding, transactions]);

  if (!holding) return null;

  const instrumentColor = colors.instrument(holding.instrumentType);
  const letter = (holding.name || holding.symbol).trim().charAt(0).toUpperCase();
  const shareDayChange =
    holding.quantity > 0 ? holding.dayChange / holding.quantity : 0;
  const quoteTone = colors.pnl(shareDayChange);
  const xirrTone = xirr == null ? muted : colors.pnl(xirr);
  const divider = { borderColor: colors.hairline };

  const explainXirr = () => {
    void haptic.selection();
    appDialog.alert(
      "XIRR",
      "Annualised return from this holding's buy and sell cashflows, including today's market value. Imported lots without trades show NA."
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.screen,
          {
            backgroundColor: theme.colors.background,
            paddingTop: insets.top,
          },
        ]}
      >
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              void haptic.selection();
              onClose();
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Close holding details"
          >
            <ChevronLeft size={24} color={theme.colors.foreground} />
          </Pressable>
          <Text
            style={[styles.headerTitle, { color: theme.colors.foreground }]}
          >
            Holding details
          </Text>
          <Pressable
            onPress={() => {
              void haptic.selection();
              setIsAdjustVisible(true);
            }}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel="Adjust holding"
          >
            <MoreHorizontal size={24} color={theme.colors.foreground} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.identity}>
            <View style={[styles.avatar, { backgroundColor: withAlpha(instrumentColor, 0.2) }]}>
              <Text style={[styles.avatarLetter, { color: instrumentColor }]}>
                {letter}
              </Text>
            </View>
            <View style={styles.identityText}>
              <Text
                style={[styles.name, { color: theme.colors.foreground }]}
                numberOfLines={1}
              >
                {holding.name || holding.symbol}
              </Text>
              <View style={styles.quoteRow}>
                <Amount
                  value={holding.currentPrice}
                  currency={currency}
                  style={[styles.quotePrice, { color: theme.colors.foreground }]}
                  ghostable
                />
                <FinancialAmount value={shareDayChange} currency={currency} size="sm" sign="auto" tone="auto" weight="semibold" />
                <Text style={[styles.quoteChange, { color: quoteTone }]}>
                  ({formatSignedPercent(holding.dayChangePercent, 2)})
                </Text>
              </View>
            </View>
          </View>

          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.heroRow}>
              <View style={styles.heroCol}>
                <Text style={[styles.heroLabel, { color: muted }]}>Current</Text>
                <Amount
                  value={holding.currentValue}
                  currency={currency}
                  style={[styles.heroValue, { color: theme.colors.foreground }]}
                  ghostable
                />
              </View>
              <View style={[styles.heroCol, styles.heroEnd]}>
                <Text style={[styles.heroLabel, { color: muted }]}>Invested</Text>
                <Amount
                  value={holding.investedValue}
                  currency={currency}
                  style={[styles.heroValue, { color: theme.colors.foreground }]}
                  ghostable
                />
              </View>
            </View>

            <MetricRow
              label="Unrealised returns"
              muted={muted}
              amount={holding.profit}
              percent={holding.profitPercent}
              currency={currency}
            />
            <MetricRow
              label="1D returns"
              muted={muted}
              amount={holding.dayChange}
              percent={holding.dayChangePercent}
              currency={currency}
            />

            <View style={[styles.rule, divider]} />

            <SpecRow label="Mkt price" muted={muted}>
              <Amount
                value={holding.currentPrice}
                currency={currency}
                style={[styles.specValue, { color: theme.colors.foreground }]}
                ghostable
              />
            </SpecRow>
            <SpecRow label="Avg price" muted={muted}>
              <Amount
                value={holding.averageBuyPrice}
                currency={currency}
                style={[styles.specValue, { color: theme.colors.foreground }]}
                ghostable
              />
            </SpecRow>
            <SpecRow label="Total qty" muted={muted}>
              <Text style={[styles.specValue, { color: theme.colors.foreground }]}>
                {formatQuantity(holding.quantity)}
              </Text>
            </SpecRow>
            <SpecRow
              label="XIRR"
              muted={muted}
              trailing={
                <Pressable
                  onPress={explainXirr}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="What is XIRR"
                >
                  <Info size={14} color={muted} />
                </Pressable>
              }
            >
              {xirr == null ? (
                <Text style={[styles.specValue, { color: muted }]}>NA</Text>
              ) : (
                <Text style={[styles.specValue, { color: xirrTone }]}>
                  {formatSignedPercent(xirr * 100, 2)}
                </Text>
              )}
            </SpecRow>

            <View style={[styles.rule, divider]} />

            <Text style={[styles.historyTitle, { color: theme.colors.foreground }]}>
              Order history
            </Text>
            {trades.length === 0 ? (
              <Text style={[styles.emptyHistory, { color: muted }]}>
                No trades recorded yet. Imported lots stay here until you buy or
                sell.
              </Text>
            ) : (
              trades.map((tx) => {
                const buy = tx.type === "BUY";
                const isTrade = tx.type === "BUY" || tx.type === "SELL";
                // SPENDLY-526: value, recorded charges and the net cash effect.
                const effect = isTrade ? tradeCashEffect(tx) : null;
                return (
                  <View key={tx.id} style={styles.historyItem}>
                    <View style={styles.historyRow}>
                      <View style={styles.historyLeft}>
                        <Text
                          style={[
                            styles.historyType,
                            { color: buy ? colors.buy : tx.type === "ADJUSTMENT" ? colors.adjust : colors.sell },
                          ]}
                        >
                          {tx.type === "ADJUSTMENT" ? "ADJ" : tx.type}
                        </Text>
                        {tx.type === "ADJUSTMENT" ? (
                          <Text style={[styles.historyMeta, { color: muted }]}>
                            Cost base:{" "}
                            {/* SPENDLY-543: prefix="+" replaced the currency symbol. */}
                            <FinancialAmount value={tx.price} currency={currency} size="xs" sign="auto" tone="muted" />
                          </Text>
                        ) : (
                          <>
                            <Text style={[styles.historyMeta, { color: muted }]}>
                              {formatQuantity(tx.quantity)} @{" "}
                            </Text>
                            <Amount
                              value={tx.price}
                              currency={currency}
                              ghostable
                              style={[styles.historyMeta, { color: muted }]}
                            />
                          </>
                        )}
                      </View>
                      <Text style={[styles.historyDate, { color: muted }]}>
                        {formatDisplayDate(tx.date, settings.dateFormat)}
                      </Text>
                    </View>
                    {effect ? (
                      <Text style={[styles.historyBreakdown, { color: muted }]}>
                        Value <Amount value={effect.gross} currency={currency} ghostable style={[styles.historyBreakdown, { color: muted }]} />
                        {" · "}Charges <Amount value={effect.fees} currency={currency} ghostable style={[styles.historyBreakdown, { color: muted }]} />
                        {" · "}{buy ? "Total cost" : "Net proceeds"}{" "}
                        <Amount
                          value={effect.net}
                          currency={currency}
                          ghostable
                          style={[styles.historyBreakdown, { color: theme.colors.foreground, fontWeight: "700" }]}
                        />
                      </Text>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        <View
          style={[
            styles.footer,
            {
              borderTopColor: colors.hairline,
              paddingBottom: Math.max(insets.bottom, 12),
              backgroundColor: theme.colors.background,
            },
          ]}
        >
          <Pressable
            onPress={() => {
              void haptic.selection();
              onSell();
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.sell, opacity: pressed ? 0.88 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Sell ${holding.symbol}`}
          >
            <Text style={[styles.actionLabel, { color: theme.colors.destructiveForeground }]}>Sell</Text>
          </Pressable>
          <Pressable
            onPress={() => {
              void haptic.selection();
              onBuy();
            }}
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.buy, opacity: pressed ? 0.88 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Buy ${holding.symbol}`}
          >
            <Text style={[styles.actionLabel, { color: theme.colors.successForeground }]}>Buy</Text>
          </Pressable>
        </View>
      </View>
      {isAdjustVisible && (
        <HoldingAdjustmentModal
          visible={isAdjustVisible}
          holding={holding}
          currency={currency}
          onClose={() => setIsAdjustVisible(false)}
        />
      )}
    </Modal>
  );
}

function MetricRow({
  label,
  muted,
  amount,
  percent,
  currency,
}: {
  label: string;
  muted: string;
  amount: number;
  percent: number;
  currency: string;
}) {
  const tone = usePortfolioColors().pnl(amount);
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.metricLabel, { color: muted }]}>{label}</Text>
      <View style={styles.metricValues}>
        <FinancialAmount value={amount} currency={currency} size="sm" sign="auto" tone="auto" weight="semibold" />
        <Text style={[styles.metricPercent, { color: tone }]}>
          ({formatSignedPercent(percent, 2)})
        </Text>
      </View>
    </View>
  );
}

function SpecRow({
  label,
  muted,
  trailing,
  children,
}: {
  label: string;
  muted: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.specRow}>
      <View style={styles.specLabelRow}>
        <Text style={[styles.specLabel, { color: muted }]}>{label}</Text>
        {trailing ? trailing : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    minHeight: 48,
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    fontWeight: "700",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "800",
  },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
  },
  quoteRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  quotePrice: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  quoteChange: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    borderCurve: "continuous",
    padding: 16,
    gap: 14,
  },
  heroRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  heroCol: {
    flex: 1,
    gap: 4,
  },
  heroEnd: {
    alignItems: "flex-end",
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  heroValue: {
    fontSize: 22,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  metricLabel: {
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  metricValues: {
    alignItems: "flex-end",
    gap: 2,
  },
  metricPercent: {
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  rule: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  specRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  specLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  specLabel: {
    fontSize: 14,
    fontWeight: "500",
  },
  specValue: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyHistory: {
    fontSize: 13,
    lineHeight: 18,
  },
  historyItem: {
    gap: 2,
  },
  historyBreakdown: {
    fontSize: 12,
    fontWeight: "500",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  historyLeft: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
  },
  historyType: {
    fontSize: 12,
    fontWeight: "800",
    width: 40,
  },
  historyMeta: {
    fontSize: 13,
    fontWeight: "500",
  },
  historyDate: {
    fontSize: 12,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: "800",
  },
  pressed: {
    opacity: 0.7,
  },
});
