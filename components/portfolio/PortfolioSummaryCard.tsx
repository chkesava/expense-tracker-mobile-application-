import { Pressable, StyleSheet, Text, View } from "react-native";
import { ArrowLeftRight, BarChart3 } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { HeroSection, MetaLabel } from "@/components/dashboard/primitives";
import { usePortfolioColors } from "@/components/portfolio/portfolioColors";
import { useSettings } from "@/providers/SettingsProvider";
import { currencySymbol, formatAmount, formatAmountNumber } from "@/shared/utils/formatCurrency";
import { formatSignedPercent } from "@/shared/utils/investmentPresentation";
import type { HoldingWithMetrics, PortfolioSummary } from "@/shared/features/portfolio/types";
import { portfolioSummaryA11yLabel } from "@/shared/features/portfolio/utils/portfolioMetrics";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

interface PortfolioSummaryCardProps {
  summary: PortfolioSummary;
  currency: string;
  onManageCash?: () => void;
}

function pnlArrow(value: number) {
  if (value > 0) return "↗";
  if (value < 0) return "↘";
  return "→";
}

/** The hero figure with smaller paise, e.g. "₹4,82,310" + ".45". */
function HeroCurrencyAmount({
  value,
  currency,
}: {
  value: number;
  currency: string;
}) {
  const { theme } = useTheme();
  const { settings } = useSettings();
  const isGhosted = !!settings?.ghostMode;

  if (isGhosted) {
    return (
      <Text
        accessibilityLabel="Hidden amount"
        style={[
          styles.heroWhole,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
        ]}
      >
        {value < 0 ? "-" : ""}••••••
      </Text>
    );
  }

  const formatted = formatAmountNumber(Math.abs(value), currency, {
    fractionDigits: 2,
    numberFormatStyle: settings?.numberFormat || "auto",
  });
  const dot = formatted.lastIndexOf(".");
  const whole = dot >= 0 ? formatted.slice(0, dot) : formatted;
  const frac = dot >= 0 ? formatted.slice(dot) : "";
  const symbol = currencySymbol(currency);

  return (
    <View style={styles.heroAmountRow}>
      <Text
        style={[
          styles.heroSymbol,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
        ]}
      >
        {value < 0 ? `-${symbol}` : symbol}
      </Text>
      <Text
        style={[
          styles.heroWhole,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
        ]}
      >
        {whole}
      </Text>
      {frac ? (
        <Text
          style={[
            styles.heroFrac,
            { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.semibold },
          ]}
        >
          {frac}
        </Text>
      ) : null}
    </View>
  );
}

function MoverChip({ holding }: { holding: HoldingWithMetrics }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const colors = usePortfolioColors();
  return (
    <View style={[styles.moverChip, { backgroundColor: surfaces.tile }]}>
      <Text
        style={[styles.moverSymbol, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
        numberOfLines={1}
      >
        {holding.symbol}
      </Text>
      <Text style={[styles.moverReturn, { color: colors.pnl(holding.dayChangePercent), fontFamily: theme.fontFamily.semibold }]}>
        {formatSignedPercent(holding.dayChangePercent, 2)}
      </Text>
    </View>
  );
}

/**
 * SPENDLY-543: the Stocks hero on the shared deep `HeroSection` (the
 * dashboard's net-worth surface) instead of a fixed green card. Gains and
 * losses are signed `FinancialAmount`s, so ghost mode keeps "+" / "-".
 */
export function PortfolioSummaryCard({
  summary,
  currency,
  onManageCash,
}: PortfolioSummaryCardProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const colors = usePortfolioColors();
  const { settings } = useSettings();
  const muted = theme.colors.mutedForeground;
  const heroLabel = portfolioSummaryA11yLabel(summary, (n) => formatAmount(n, currency), !!settings?.ghostMode);
  const line = surfaces.divider;
  const todayColor = colors.pnl(summary.todayGainLoss);
  const overallColor = colors.pnl(summary.overallGainLoss);

  const movers: HoldingWithMetrics[] = [];
  if (summary.topGainer) movers.push(summary.topGainer);
  if (summary.topLoser && summary.topLoser.id !== summary.topGainer?.id) {
    movers.push(summary.topLoser);
  }

  return (
    <HeroSection
      variant="deep"
      title="Stock portfolio"
      subtitle={`${summary.totalHoldings} holding${summary.totalHoldings === 1 ? "" : "s"}`}
      icon={<BarChart3 size={16} color={theme.colors.primary} />}
    >
      <View style={styles.body}>
        <View style={styles.hero} accessible accessibilityRole="summary" accessibilityLabel={heroLabel}>
          <MetaLabel>Current value</MetaLabel>
          <HeroCurrencyAmount value={summary.portfolioValue} currency={currency} />
          <View style={styles.todayRow}>
            <Text style={[styles.todayArrow, { color: todayColor }]}>{pnlArrow(summary.todayGainLoss)}</Text>
            <FinancialAmount value={summary.todayGainLoss} currency={currency} size="sm" sign="auto" tone="auto" weight="semibold" />
            <Text style={[styles.todayPercent, { color: todayColor, fontFamily: theme.fontFamily.semibold }]}>
              ({formatSignedPercent(summary.todayGainLossPercent, 2)})
            </Text>
            <Text style={[styles.todayLabel, { color: muted, fontFamily: theme.fontFamily.medium }]}>today</Text>
          </View>
        </View>

        {/* SPENDLY-388: the two core values first, cash and count second. */}
        <View style={[styles.metrics, { borderTopColor: line }]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={styles.metricCol}>
            <MetaLabel>Invested</MetaLabel>
            <FinancialAmount value={summary.totalInvested} currency={currency} size="md" weight="semibold" />
          </View>
          <View style={[styles.vRule, { backgroundColor: line }]} />
          <View style={[styles.metricCol, styles.metricColEnd]}>
            <MetaLabel>Overall P&L</MetaLabel>
            <View style={styles.pnlInline}>
              <FinancialAmount value={summary.overallGainLoss} currency={currency} size="md" sign="auto" tone="auto" weight="semibold" />
              <Text style={[styles.metricPercent, { color: overallColor, fontFamily: theme.fontFamily.semibold }]}>
                ({formatSignedPercent(summary.overallGainLossPercent, 2)})
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.metrics, styles.metricsSecondary, { borderTopColor: line }]}>
          <Pressable
            onPress={onManageCash}
            disabled={!onManageCash}
            style={({ pressed }) => [styles.metricCol, onManageCash && pressed ? styles.pressed : null]}
            accessibilityRole={onManageCash ? "button" : undefined}
            accessibilityLabel={
              settings?.ghostMode
                ? "Cash balance hidden. Manage cash"
                : `Cash balance ${formatAmount(summary.cashBalance, currency)}. Not part of portfolio value.${onManageCash ? " Manage cash" : ""}`
            }
          >
            <View style={styles.cashLabelRow}>
              <MetaLabel>Cash balance</MetaLabel>
              {onManageCash ? <ArrowLeftRight size={11} color={theme.colors.primary} /> : null}
            </View>
            <FinancialAmount value={summary.cashBalance} currency={currency} size="sm" weight="semibold" />
          </Pressable>
          <View style={[styles.vRule, { backgroundColor: line }]} />
          <View style={[styles.metricCol, styles.metricColEnd]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            <MetaLabel>Holdings</MetaLabel>
            <Text style={[styles.metricValue, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]} numberOfLines={1}>
              {summary.totalHoldings}
            </Text>
          </View>
        </View>

        {movers.length > 0 ? (
          <View style={styles.movers}>
            <Text style={[styles.moversLabel, { color: muted, fontFamily: theme.fontFamily.medium }]}>Today's movers</Text>
            {movers.map((holding) => (
              <MoverChip key={holding.id} holding={holding} />
            ))}
          </View>
        ) : null}
      </View>
    </HeroSection>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  hero: {
    gap: 6,
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  heroSymbol: {
    fontSize: 28,
    letterSpacing: -0.6,
  },
  heroWhole: {
    fontSize: 36,
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"],
  },
  heroFrac: {
    fontSize: 20,
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
    paddingBottom: 4,
  },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  todayArrow: {
    fontSize: 15,
    fontWeight: "800",
  },
  todayPercent: {
    fontSize: 13.5,
    fontVariant: ["tabular-nums"],
  },
  todayLabel: {
    fontSize: 13,
    marginLeft: 2,
  },
  metrics: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
  },
  metricCol: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cashLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metricsSecondary: {
    paddingTop: 10,
  },
  metricColEnd: {
    alignItems: "flex-end",
  },
  pnlInline: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: 4,
  },
  metricValue: {
    fontSize: 14,
    fontVariant: ["tabular-nums"],
  },
  metricPercent: {
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },
  vRule: {
    width: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    alignSelf: "stretch",
  },
  movers: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  moversLabel: {
    fontSize: 12,
  },
  moverChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderCurve: "continuous",
    maxWidth: "100%",
  },
  moverSymbol: {
    fontSize: 11.5,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  moverReturn: {
    fontSize: 11.5,
    fontVariant: ["tabular-nums"],
  },
  pressed: {
    opacity: 0.78,
  },
});
