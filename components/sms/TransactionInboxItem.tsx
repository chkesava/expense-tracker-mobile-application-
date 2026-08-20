import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/theme/ThemeProvider";

export type TransactionInboxItemProps = {
  id: string;
  amount: number;
  merchant: string;
  categoryLabel: string;
  busy: boolean;
  onAdd: (id: string) => void;
  onIgnore: (id: string) => void;
  ignoreLabel?: string;
};

export const TransactionInboxItem = memo(function TransactionInboxItem({
  id,
  amount,
  merchant,
  categoryLabel,
  busy,
  onAdd,
  onIgnore,
  ignoreLabel = "Ignore",
}: TransactionInboxItemProps) {
  const { theme } = useTheme();

  return (
    <Card radius="lg" style={styles.card}>
      <View style={styles.body}>
        <Amount
          value={amount}
          style={[styles.amount, { color: theme.colors.foreground }]}
        />
        <Text
          style={[styles.merchant, { color: theme.colors.foreground }]}
          numberOfLines={1}
        >
          {merchant}
        </Text>
        <Text
          style={[styles.category, { color: theme.colors.mutedForeground }]}
          numberOfLines={1}
        >
          {categoryLabel}
        </Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.actionSlot}>
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            disabled={busy}
            onPress={() => onAdd(id)}
            style={styles.actionButton}
          >
            Add
          </Button>
        </View>
        <View style={styles.actionSlot}>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onPress={() => onIgnore(id)}
            style={styles.actionButton}
          >
            {ignoreLabel}
          </Button>
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  body: {
    gap: 4,
    marginBottom: 14,
  },
  amount: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  merchant: {
    fontSize: 17,
    fontWeight: "700",
  },
  category: {
    fontSize: 14,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  actionSlot: {
    flex: 1,
  },
  actionButton: {
    width: "100%",
  },
});
