import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { ArrowLeftRight } from "lucide-react-native";

import {
  ACCOUNT_GREEN,
  ACCOUNT_GREEN_BORDER,
  ACCOUNT_GREEN_GLOW,
  ACCOUNT_RED,
} from "@/components/accounts/accountScreenTheme";
import { Amount } from "@/components/common/Amount";
import { useSettings } from "@/providers/SettingsProvider";
import { currencySymbol, formatAmountNumber } from "@/shared/utils/formatCurrency";
import type { HoldingWithMetrics, PortfolioSummary } from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

interface PortfolioSummaryCardProps {
  summary: PortfolioSummary;
  currency: string;
  onManageCash?: () => void;
}

function pnlColor(value: number, isDark: boolean, muted: string) {
  if (value > 0) return isDark ? ACCOUNT_GREEN : "#16A34A";
  if (value < 0) return isDark ? ACCOUNT_RED : "#DC2626";
  return muted;
}

function pnlArrow(value: number) {
  if (value > 0) return "↗";
  if (value < 0) return "↘";
  return "→";
}

function signedPercent(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

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
        ••••••
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
  const negative = value < 0;

  return (
    <View
      accessible
      accessibilityLabel={`Amount ${value}`}
      style={styles.heroAmountRow}
    >
      <Text
        style={[
          styles.heroSymbol,
          { color: theme.colors.foreground, fontFamily: theme.fontFamily.bold },
        ]}
      >
        {negative ? `-${symbol}` : symbol}
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
            {
              color: theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.semibold,
            },
          ]}
        >
          {frac}
        </Text>
      ) : null}
    </View>
  );
}

function MoverChip({
  holding,
  muted,
  isDark,
  foreground,
}: {
  holding: HoldingWithMetrics;
  muted: string;
  isDark: boolean;
  foreground: string;
}) {
  const tone = pnlColor(holding.dayChangePercent, isDark, muted);
  return (
    <View
      style={[
        styles.moverChip,
        {
          backgroundColor: isDark ? "rgba(15, 23, 42, 0.55)" : "rgba(15, 23, 42, 0.05)",
          borderColor: isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.08)",
        },
      ]}
    >
      <Text style={[styles.moverSymbol, { color: foreground }]} numberOfLines={1}>
        {holding.symbol}
      </Text>
      <Text style={[styles.moverReturn, { color: tone }]}>
        {signedPercent(holding.dayChangePercent)}
      </Text>
    </View>
  );
}

export function PortfolioSummaryCard({
  summary,
  currency,
  onManageCash,
}: PortfolioSummaryCardProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const muted = theme.colors.mutedForeground;
  const line = isDark ? "rgba(148, 163, 184, 0.16)" : "rgba(15, 23, 42, 0.1)";
  const symbol = currencySymbol(currency);

  const todayColor = pnlColor(summary.todayGainLoss, isDark, muted);
  const overallColor = pnlColor(summary.overallGainLoss, isDark, muted);
  const todayPrefix =
    summary.todayGainLoss > 0
      ? `+${symbol}`
      : summary.todayGainLoss < 0
        ? `-${symbol}`
        : symbol;
  const overallPrefix =
    summary.overallGainLoss > 0
      ? `+${symbol}`
      : summary.overallGainLoss < 0
        ? `-${symbol}`
        : symbol;

  const movers: HoldingWithMetrics[] = [];
  if (summary.topGainer) movers.push(summary.topGainer);
  if (
    summary.topLoser &&
    summary.topLoser.id !== summary.topGainer?.id
  ) {
    movers.push(summary.topLoser);
  }

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? "#0B100E" : "#F4FBF6",
          borderColor: isDark ? ACCOUNT_GREEN_BORDER : "rgba(22, 163, 74, 0.28)",
        },
      ]}
    >
      <LinearGradient
        pointerEvents="none"
        colors={
          isDark
            ? ["rgba(74,222,128,0.16)", "rgba(12,22,18,0.35)", "#070B09"]
            : ["rgba(22,163,74,0.10)", "rgba(244,251,246,0.45)", "#F8FAFC"]
        }
        start={{ x: 0.1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Svg pointerEvents="none" style={styles.pattern} width="100%" height="100%">
        <Circle
          cx="88%"
          cy="22%"
          r="72"
          stroke={isDark ? "rgba(74,222,128,0.11)" : "rgba(22,163,74,0.12)"}
          strokeWidth="1"
          fill="none"
        />
        <Circle
          cx="88%"
          cy="22%"
          r="48"
          stroke={isDark ? "rgba(74,222,128,0.07)" : "rgba(22,163,74,0.10)"}
          strokeWidth="1"
          fill="none"
        />
      </Svg>
      <View
        pointerEvents="none"
        style={[
          styles.glow,
          { backgroundColor: isDark ? ACCOUNT_GREEN_GLOW : "rgba(22, 163, 74, 0.1)" },
        ]}
      />

      <View style={styles.body}>
        <View style={styles.hero}>
          <Text style={[styles.kicker, { color: muted }]}>Total Portfolio Value</Text>
          <HeroCurrencyAmount value={summary.portfolioValue} currency={currency} />
          <View style={styles.todayRow}>
            <Text style={[styles.todayArrow, { color: todayColor }]}>
              {pnlArrow(summary.todayGainLoss)}
            </Text>
            <Amount
              value={Math.abs(summary.todayGainLoss)}
              currency={currency}
              prefix={todayPrefix}
              style={[styles.todayAmount, { color: todayColor }]}
              ghostable
            />
            <Text style={[styles.todayPercent, { color: todayColor }]}>
              ({signedPercent(summary.todayGainLossPercent)})
            </Text>
            <Text style={[styles.todayLabel, { color: muted }]}>Today</Text>
          </View>
        </View>

        <View style={[styles.metrics, { borderTopColor: line }]}>
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: muted }]} numberOfLines={1}>
              Overall P&L
            </Text>
            <Amount
              value={Math.abs(summary.overallGainLoss)}
              currency={currency}
              prefix={overallPrefix}
              style={[styles.metricValue, { color: overallColor }]}
              ghostable
            />
            <Text style={[styles.metricPercent, { color: overallColor }]}>
              ({signedPercent(summary.overallGainLossPercent)})
            </Text>
          </View>
          <View style={[styles.vRule, { backgroundColor: line }]} />
          <Pressable
            onPress={onManageCash}
            disabled={!onManageCash}
            style={({ pressed }) => [
              styles.metricCol,
              onManageCash && pressed ? styles.pressed : null,
            ]}
            accessibilityRole={onManageCash ? "button" : undefined}
            accessibilityLabel="Cash balance"
          >
            <View style={styles.cashLabelRow}>
              <Text style={[styles.metricLabel, { color: muted }]} numberOfLines={1}>
                Cash Balance
              </Text>
              {onManageCash ? (
                <ArrowLeftRight size={11} color={isDark ? ACCOUNT_GREEN : theme.colors.success} />
              ) : null}
            </View>
            <Amount
              value={summary.cashBalance}
              currency={currency}
              style={[styles.metricValue, { color: theme.colors.foreground }]}
              ghostable
            />
          </Pressable>
          <View style={[styles.vRule, { backgroundColor: line }]} />
          <View style={styles.metricCol}>
            <Text style={[styles.metricLabel, { color: muted }]} numberOfLines={1}>
              Holdings
            </Text>
            <Text
              style={[
                styles.metricValue,
                {
                  color:
                    summary.totalHoldings > 0
                      ? isDark
                        ? ACCOUNT_GREEN
                        : theme.colors.success
                      : theme.colors.foreground,
                },
              ]}
              numberOfLines={1}
            >
              {summary.totalHoldings}
            </Text>
          </View>
        </View>

        {movers.length > 0 ? (
          <View style={styles.movers}>
            {movers.map((holding) => (
              <MoverChip
                key={holding.id}
                holding={holding}
                muted={muted}
                isDark={isDark}
                foreground={theme.colors.foreground}
              />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderCurve: "continuous",
    borderWidth: 1,
    overflow: "hidden",
  },
  pattern: {
    ...StyleSheet.absoluteFill,
  },
  glow: {
    position: "absolute",
    right: -40,
    top: -56,
    width: 200,
    height: 200,
    borderRadius: 100,
    opacity: 0.45,
  },
  body: {
    padding: 18,
    gap: 16,
    zIndex: 1,
  },
  hero: {
    alignItems: "center",
    gap: 6,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  heroAmountRow: {
    flexDirection: "row",
    alignItems: "flex-end",
  },
  heroSymbol: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  heroWhole: {
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.2,
    fontVariant: ["tabular-nums"],
  },
  heroFrac: {
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: -0.4,
    fontVariant: ["tabular-nums"],
    paddingBottom: 4,
  },
  todayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  todayArrow: {
    fontSize: 15,
    fontWeight: "800",
  },
  todayAmount: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  todayPercent: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  todayLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginLeft: 2,
  },
  metrics: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 14,
    gap: 0,
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
  metricLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  metricValue: {
    fontSize: 14,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  metricPercent: {
    fontSize: 12,
    fontWeight: "700",
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
    gap: 8,
  },
  moverChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderCurve: "continuous",
    borderWidth: 1,
    maxWidth: "100%",
  },
  moverSymbol: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  moverReturn: {
    fontSize: 11,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  pressed: {
    opacity: 0.78,
  },
});
