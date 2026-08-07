import { View, Text, StyleSheet, FlatList } from "react-native";
import { SipTransaction } from "@/shared/features/sip/types";
import { useTheme } from "@/theme/ThemeProvider";
import { Amount } from "@/components/common/Amount";

export type SipHistoryListProps = {
  transactions: SipTransaction[];
  currency?: string;
};

export function SipHistoryList({ transactions, currency = "INR" }: SipHistoryListProps) {
  const { theme } = useTheme();

  const getStatusColor = (status: SipTransaction["status"]) => {
    switch (status) {
      case "executed":
        return theme.colors.success;
      case "skipped":
        return theme.colors.warning;
      case "failed":
        return theme.colors.destructive;
      default:
        return theme.colors.mutedForeground;
    }
  };

  const renderItem = ({ item }: { item: SipTransaction }) => {
    const statusColor = getStatusColor(item.status);

    return (
      <View
        style={[
          styles.itemContainer,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <View style={styles.topRow}>
          <Text style={[styles.assetName, { color: theme.colors.cardForeground }]}>
            {item.assetName} ({item.symbol})
          </Text>
          <View style={[styles.badge, { backgroundColor: statusColor + "20", borderColor: statusColor }]}>
            <Text style={[styles.badgeText, { color: statusColor }]}>
              {item.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <View style={styles.detailCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Date</Text>
            <Text style={[styles.value, { color: theme.colors.foreground }]}>{item.date}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Amount</Text>
            <Amount value={item.investmentAmount} currency={currency} style={styles.value} />
          </View>
          <View style={styles.detailCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Units</Text>
            <Text style={[styles.value, { color: theme.colors.foreground }]}>{item.unitsPurchased.toFixed(4)}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={[styles.label, { color: theme.colors.mutedForeground }]}>Price</Text>
            <Amount value={item.marketPrice} currency={currency} style={styles.value} />
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.listContent}>
      {transactions.length === 0 ? (
        <Text style={{ color: theme.colors.mutedForeground, textAlign: "center", marginTop: 24 }}>
          No SIP history found.
        </Text>
      ) : (
        transactions.map((item) => (
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
  itemContainer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  assetName: {
    fontSize: 16,
    fontWeight: "700",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "bold",
  },
  detailsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  detailCol: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    marginBottom: 4,
  },
  value: {
    fontSize: 13,
    fontWeight: "500",
  },
});
