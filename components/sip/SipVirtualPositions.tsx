import { View, Text, StyleSheet, FlatList } from "react-native";
import { VirtualPositionWithMetrics } from "@/shared/features/sip/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";

export type SipVirtualPositionsProps = {
  positions: VirtualPositionWithMetrics[];
  currency?: string;
};

export function SipVirtualPositions({ positions, currency = "INR" }: SipVirtualPositionsProps) {
  const { theme } = useTheme();

  const renderItem = ({ item }: { item: VirtualPositionWithMetrics }) => {
    const isProfit = item.profit >= 0;
    const profitColor = isProfit ? theme.colors.success : theme.colors.destructive;

    return (
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={[styles.assetName, { color: theme.colors.cardForeground }]}>
            {item.assetName} ({item.symbol})
          </Text>
          <View style={[styles.typeBadge, { backgroundColor: theme.colors.primary + "20" }]}>
            <Text style={[styles.typeText, { color: theme.colors.primary }]}>
              {item.assetType.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.gridCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Units</Text>
            <Text style={[styles.value, { color: theme.colors.foreground }]}>{item.totalUnits.toFixed(4)}</Text>
          </View>
          <View style={styles.gridCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Avg Buy</Text>
            <Amount value={item.averageBuyPrice} currency={currency} style={styles.value} />
          </View>
          <View style={styles.gridCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>CMP</Text>
            <Amount value={item.currentPrice} currency={currency} style={styles.value} />
          </View>
        </View>

        <View style={styles.grid}>
          <View style={styles.gridCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Invested</Text>
            <Amount value={item.totalInvested} currency={currency} style={styles.value} />
          </View>
          <View style={styles.gridCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Current</Text>
            <Amount value={item.currentValue} currency={currency} style={styles.value} />
          </View>
          <View style={styles.gridCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Returns</Text>
            <View style={styles.returnsRow}>
              <Amount 
                value={Math.abs(item.profit)} 
                currency={currency} 
                prefix={isProfit ? "+" : "-"} 
                style={[styles.value, { color: profitColor }]} 
              />
              <Text style={[styles.returnsPercent, { color: profitColor }]}>
                ({isProfit ? "+" : "-"}{Math.abs(item.profitPercent).toFixed(2)}%)
              </Text>
            </View>
          </View>
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.listContent}>
      {positions.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground, textAlign: "center", marginTop: 24 }}>
          No virtual positions yet.
        </Text>
      ) : (
        positions.map((item) => (
          <View key={item.id}>
            {renderItem({ item })}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingBottom: 24,
  },
  card: {
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  assetName: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  typeText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  gridCol: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    marginBottom: 4,
  },
  value: {
    fontSize: 13,
    fontWeight: "600",
  },
  returnsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  returnsPercent: {
    fontSize: 11,
    marginLeft: 4,
    fontWeight: "bold",
  },
});
