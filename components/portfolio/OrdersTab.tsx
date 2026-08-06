import { Pressable, StyleSheet, Text, View } from "react-native";
import { Clock3, X } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import type { PortfolioOrder } from "@/shared/features/portfolio/types";
import { useTheme } from "@/theme/ThemeProvider";

export interface OrdersTabProps {
  orders: PortfolioOrder[];
  currency: string;
  onCancel: (id: string) => Promise<boolean>;
}

export function OrdersTab({ orders, currency, onCancel }: OrdersTabProps) {
  const { theme } = useTheme();
  const pending = orders.filter((order) => order.status === "pending");
  return (
    <View style={styles.container}>
      <View style={styles.titleRow}>
        <Clock3 size={18} color={theme.colors.primary} />
        <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "800" }}>Mock orders</Text>
      </View>
      {orders.length === 0 ? (
        <View style={[styles.empty, { borderColor: theme.colors.border }]}>
          <Clock3 size={32} color={theme.colors.mutedForeground} />
          <Text style={{ color: theme.colors.foreground, fontWeight: "800" }}>No orders</Text>
          <Text style={{ color: theme.colors.mutedForeground, textAlign: "center" }}>Limit buy orders placed from a holding appear here.</Text>
        </View>
      ) : orders.map((order) => (
        <View key={order.id} style={[styles.item, { borderColor: theme.colors.border, backgroundColor: theme.colors.card }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.colors.foreground, fontWeight: "800" }}>{order.type} {order.symbol}</Text>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>{order.quantity} units · {order.orderType}</Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 4 }}>
            <Amount value={order.targetPrice} currency={currency} ghostable style={{ color: theme.colors.foreground, fontWeight: "800", fontSize: 13 }} />
            <Text style={{ color: order.status === "pending" ? "#D97706" : theme.colors.mutedForeground, fontSize: 11, fontWeight: "800", textTransform: "uppercase" }}>{order.status}</Text>
          </View>
          {order.status === "pending" ? <Pressable onPress={() => void onCancel(order.id)} hitSlop={10} style={styles.cancel}><X size={16} color={theme.colors.destructive} /></Pressable> : null}
        </View>
      ))}
      {pending.length > 0 ? <Text style={{ color: theme.colors.mutedForeground, fontSize: 11 }}>Limit orders are simulated and can be cancelled here before execution.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  empty: { alignItems: "center", borderWidth: 1, borderRadius: 14, gap: 8, padding: 24 },
  item: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, gap: 10, padding: 12 },
  cancel: { marginLeft: 2, padding: 6 },
});
