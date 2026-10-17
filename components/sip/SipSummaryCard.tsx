import { StyleSheet, Text, View } from "react-native";
import { PiggyBank } from "lucide-react-native";

import { FinancialAmount } from "@/components/dashboard/FinancialAmount";
import { MetaLabel, Section, StatTile } from "@/components/dashboard/primitives";
import { SipPortfolioSummary } from "@/shared/features/sip/types";
import { formatSignedPercent } from "@/shared/utils/investmentPresentation";
import { useTheme } from "@/theme/ThemeProvider";

export type SipSummaryCardProps = {
  summary: SipPortfolioSummary;
  monthlyCommitment: number;
  currency: string;
};

/**
 * SPENDLY-542: on the dashboard foundations. Every amount is ghost-aware, and
 * profit/loss carries its sign with the currency ("+₹1,200"). The old
 * `Amount prefix="+"` replaced the currency symbol and ignored ghost mode.
 */
export function SipSummaryCard({ summary, monthlyCommitment, currency }: SipSummaryCardProps) {
  const { theme } = useTheme();
  const loss = summary.profit < 0;

  return (
    <Section
      title="Virtual SIP portfolio"
      subtitle={`${summary.activeCount} active plan${summary.activeCount === 1 ? "" : "s"}`}
      icon={<PiggyBank size={16} color={theme.colors.primary} />}
    >
      <View style={styles.body}>
        <View style={styles.top}>
          <View style={styles.col}>
            <MetaLabel>Current value</MetaLabel>
            <FinancialAmount value={summary.currentValue} currency={currency} size="xl" weight="bold" fit />
          </View>
          <View style={[styles.col, styles.end]}>
            <MetaLabel>{loss ? "Total loss" : "Total profit"}</MetaLabel>
            <FinancialAmount
              value={summary.profit}
              currency={currency}
              size="md"
              sign="auto"
              tone="auto"
              weight="semibold"
            />
            <Text style={[styles.pct, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium }]}>
              {formatSignedPercent(summary.profitPercent, 2)}
            </Text>
          </View>
        </View>

        <View style={styles.tiles}>
          <StatTile label="Total invested" style={styles.tile}>
            <FinancialAmount value={summary.totalInvested} currency={currency} size="sm" weight="semibold" />
          </StatTile>
          <StatTile label="Per month" style={styles.tile}>
            <FinancialAmount value={monthlyCommitment} currency={currency} size="sm" weight="semibold" />
          </StatTile>
        </View>
      </View>
    </Section>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 16,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  col: {
    gap: 3,
    flexShrink: 1,
  },
  end: {
    alignItems: "flex-end",
  },
  pct: {
    fontSize: 12,
  },
  tiles: {
    flexDirection: "row",
    gap: 10,
  },
  tile: {
    flex: 1,
  },
});
