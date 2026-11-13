import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, LineChart } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Skeleton } from "@/components/common/Skeleton";
import { Card } from "@/components/ui/Card";
import { useSurfaces } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import type { UnifiedNetWorthSummary } from "@/hooks/useUnifiedNetWorth";
import { useTheme } from "@/theme/ThemeProvider";

export interface InvestmentsSummaryWidgetProps {
  netWorth: UnifiedNetWorthSummary;
  currency: string;
  fill?: boolean;
}

/**
 * Current portfolio value (stocks + fixed/recurring deposits), reading
 * straight from `useUnifiedNetWorth` — the same aggregate `AccountSummaryWidget`
 * uses — so this never opens a second investments/portfolio listener or
 * recomputes a holdings valuation of its own.
 */
export const InvestmentsSummaryWidget = memo(function InvestmentsSummaryWidget({
  netWorth,
  currency,
  fill = false,
}: InvestmentsSummaryWidgetProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const total = netWorth.totalStocksValue + netWorth.investmentsValue;

  const openInvestments = () => {
    void haptic.selection();
    router.push("/investments" as Href);
  };

  return (
    <Pressable onPress={openInvestments} accessibilityRole="link" accessibilityHint="Opens investments">
      <Card variant="outlined" style={fill ? styles.fill : undefined} contentStyle={styles.content} testID="dash-investments-summary">
        <View style={styles.header}>
          <View style={[styles.glyph, { backgroundColor: surfaces.wash(theme.colors.primary) }]}>
            <LineChart size={16} color={theme.colors.primary} strokeWidth={2.3} />
          </View>
          <Text style={[styles.title, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}>
            Investments
          </Text>
          <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
        </View>

        {netWorth.loading ? (
          <Skeleton width="60%" height={26} borderRadius={6} />
        ) : (
          <Amount
            value={Math.round(total)}
            currency={currency}
            fractionDigits={0}
            ghostable
            numberOfLines={1}
            style={{ fontSize: 24, fontFamily: theme.fontFamily.bold, color: theme.colors.foreground }}
          />
        )}

        <View style={styles.breakdown}>
          <BreakdownRow label="Stocks" value={netWorth.totalStocksValue} currency={currency} loading={netWorth.loading} />
          <BreakdownRow label="Deposits" value={netWorth.investmentsValue} currency={currency} loading={netWorth.loading} />
        </View>
      </Card>
    </Pressable>
  );
});

function BreakdownRow({
  label,
  value,
  currency,
  loading,
}: {
  label: string;
  value: number;
  currency: string;
  loading: boolean;
}) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}>
        {label}
      </Text>
      {loading ? null : (
        <Amount
          value={Math.round(value)}
          currency={currency}
          fractionDigits={0}
          ghostable
          numberOfLines={1}
          style={{ fontSize: 13, fontFamily: theme.fontFamily.medium, color: theme.colors.foreground }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 10,
  },
  fill: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  glyph: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 15,
  },
  breakdown: {
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowLabel: {
    fontSize: 12.5,
  },
});
