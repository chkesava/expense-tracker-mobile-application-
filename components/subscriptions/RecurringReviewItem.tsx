import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Amount } from "@/components/common/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { formatRecurringCadence } from "@/services/sms/smsRecurringDetector";
import type { RecurringPattern } from "@/services/sms/smsRecurringDetector";
import { useTheme } from "@/theme/ThemeProvider";

export type RecurringReviewItemProps = {
  pattern: RecurringPattern;
  currency: string;
  busy: boolean;
  onReview: (key: string) => void;
  onDecline: (key: string) => void;
};

export const RecurringReviewItem = memo(function RecurringReviewItem({
  pattern,
  currency,
  busy,
  onReview,
  onDecline,
}: RecurringReviewItemProps) {
  const { theme } = useTheme();
  const cadence = formatRecurringCadence(pattern);
  const times =
    pattern.occurrences === 1 ? "1 time" : `${pattern.occurrences} times`;

  return (
    <Card radius="lg" style={styles.card}>
      <View style={styles.body}>
        <Amount
          value={pattern.amount}
          currency={currency}
          ghostable
          style={[styles.amount, { color: theme.colors.foreground }]}
        />
        <Text
          style={[styles.merchant, { color: theme.colors.foreground }]}
          numberOfLines={1}
        >
          {pattern.merchant}
        </Text>
        <Text
          style={[styles.meta, { color: theme.colors.mutedForeground }]}
          numberOfLines={1}
        >
          {times} · {cadence}
        </Text>
      </View>
      <View style={styles.actions}>
        <View style={styles.actionSlot}>
          <Button
            size="sm"
            variant="primary"
            loading={busy}
            disabled={busy}
            onPress={() => onReview(pattern.key)}
            style={styles.actionButton}
          >
            Review
          </Button>
        </View>
        <View style={styles.actionSlot}>
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onPress={() => onDecline(pattern.key)}
            style={styles.actionButton}
          >
            Decline
          </Button>
        </View>
      </View>
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    marginBottom: 0,
  },
  body: {
    gap: 4,
    marginBottom: 14,
  },
  amount: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  merchant: {
    fontSize: 16,
    fontWeight: "700",
  },
  meta: {
    fontSize: 13,
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
