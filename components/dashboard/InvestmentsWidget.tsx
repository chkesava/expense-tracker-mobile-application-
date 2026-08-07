import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronRight, TrendingUp } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useInvestments } from "@/hooks/useInvestments";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useMarketQuotes } from "@/hooks/useMarketQuotes";
import { getInvestmentValuation } from "@/shared/utils/investmentInterest";
import { useTheme } from "@/theme/ThemeProvider";

export interface InvestmentsWidgetProps {
  liquidBalance: number;
  currency: string;
}

export function InvestmentsWidget({
  liquidBalance,
  currency,
}: InvestmentsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { investments } = useInvestments();
  const { holdings } = usePortfolio();

  // Gather symbols for quotes
  const symbolRequests = useMemo(
    () =>
      holdings.map((h) => ({
        symbol: h.yahooSymbol || h.symbol,
        instrumentType: h.instrumentType,
      })),
    [holdings]
  );
  const { quotes } = useMarketQuotes(symbolRequests);

  const portfolioTotal = useMemo(() => {
    return holdings.reduce((sum, h) => {
      const quote = quotes.get(h.yahooSymbol || h.symbol);
      const currentPrice = quote?.currentPrice ?? h.averageBuyPrice;
      return sum + currentPrice * h.quantity;
    }, 0);
  }, [holdings, quotes]);

  const today = new Date().toISOString().slice(0, 10);
  const investmentTotal = useMemo(() => {
    return investments
      .filter((i) => i.status === "active")
      .reduce((sum, inv) => sum + getInvestmentValuation(inv, today).totalValue, 0);
  }, [investments, today]);

  const totalAssets = liquidBalance + investmentTotal + portfolioTotal;

  return (
    <Card
      title="Asset Allocation"
      subtitle="Liquid accounts & portfolio overview"
      headerRight={
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/ledger?tab=investments");
          }}
          style={styles.viewBtn}
        >
          <Text
            style={[
              styles.viewBtnText,
              { color: theme.colors.primary, fontSize: theme.typography.xs },
            ]}
          >
            Investments
          </Text>
          <ChevronRight size={14} color={theme.colors.primary} />
        </Pressable>
      }
    >
      <View style={styles.content}>
        <View style={styles.row}>
          <Text
            style={{
              fontSize: theme.typography.sm,
              color: theme.colors.mutedForeground,
            }}
          >
            Liquid Holdings
          </Text>
          <Amount
            value={liquidBalance}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "700",
              color: theme.colors.foreground,
            }}
          />
        </View>

        <View style={styles.row}>
          <Text
            style={{
              fontSize: theme.typography.sm,
              color: theme.colors.mutedForeground,
            }}
          >
            Investments Value
          </Text>
          <Amount
            value={investmentTotal}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "700",
              color: "#10B981",
            }}
          />
        </View>

        <View style={styles.row}>
          <Text
            style={{
              fontSize: theme.typography.sm,
              color: theme.colors.mutedForeground,
            }}
          >
            Portfolio Holdings
          </Text>
          <Amount
            value={portfolioTotal}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "700",
              color: "#3B82F6",
            }}
          />
        </View>

        <View
          style={[
            styles.row,
            {
              paddingTop: 8,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "800",
              color: theme.colors.foreground,
            }}
          >
            Total Net Worth
          </Text>
          <Amount
            value={totalAssets}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "900",
              color: theme.colors.foreground,
            }}
          />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  viewBtnText: {
    fontWeight: "700",
  },
  content: {
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
