import { View, Text, StyleSheet } from "react-native";
import { Card } from "@/components/ui/Card";
import { Amount } from "@/components/common/Amount";
import { SipPortfolioSummary } from "@/shared/features/sip/types";
import { useTheme } from "@/theme/ThemeProvider";

export type SipSummaryCardProps = {
  summary: SipPortfolioSummary;
  monthlyCommitment: number;
  currency: string;
};

export function SipSummaryCard({ summary, monthlyCommitment, currency }: SipSummaryCardProps) {
  const { theme } = useTheme();
  
  const isProfit = summary.profit >= 0;
  const profitColor = isProfit ? theme.colors.success : theme.colors.destructive;
  
  return (
    <Card title="SIP Portfolio Summary">
      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Current Value</Text>
          <Amount value={summary.currentValue} currency={currency} style={{ fontSize: theme.typography.xl }} />
        </View>
        <View style={styles.col}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Total Invested</Text>
          <Amount value={summary.totalInvested} currency={currency} style={{ fontSize: theme.typography.lg, color: theme.colors.mutedForeground }} />
        </View>
      </View>
      
      <View style={[styles.row, { marginTop: theme.space.md }]}>
        <View style={styles.col}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Total Profit/Loss</Text>
          <View style={styles.profitRow}>
            <Amount 
              value={Math.abs(summary.profit)} 
              currency={currency} 
              prefix={isProfit ? "+" : "-"} 
              style={{ color: profitColor }} 
            />
            <Text style={[styles.percent, { color: profitColor }]}>
              ({isProfit ? "+" : "-"}{Math.abs(summary.profitPercent).toFixed(2)}%)
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />

      <View style={styles.row}>
        <View style={styles.col}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Active Plans</Text>
          <Text style={[styles.statValue, { color: theme.colors.foreground }]}>{summary.activeCount}</Text>
        </View>
        <View style={styles.col}>
          <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Monthly Commitment</Text>
          <Amount value={monthlyCommitment} currency={currency} style={{ fontSize: theme.typography.md }} />
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  col: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    marginBottom: 4,
  },
  profitRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  percent: {
    fontSize: 12,
    marginLeft: 8,
    fontWeight: "bold",
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "600",
  },
});
