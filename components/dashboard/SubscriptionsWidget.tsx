import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronRight, Repeat } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { computeMonthlyCommitments } from "@/shared/utils/subscriptionProcessor";
import { useTheme } from "@/theme/ThemeProvider";

export interface SubscriptionsWidgetProps {
  currency: string;
}

const PREVIEW_LIMIT = 4;

export function SubscriptionsWidget({ currency }: SubscriptionsWidgetProps) {
  const { push } = useRouter();
  const { theme } = useTheme();
  const { subscriptions } = useSubscriptions();

  const commitments = useMemo(() => {
    return computeMonthlyCommitments(subscriptions);
  }, [subscriptions]);

  const preview = useMemo(() => {
    return subscriptions
      .filter((sub) => sub.isActive && !sub.isCompleted)
      .slice(0, PREVIEW_LIMIT);
  }, [subscriptions]);

  const openSubscriptions = () => {
    Haptics.selectionAsync().catch(() => undefined);
    push("/ledger?tab=subscriptions");
  };

  return (
    <Card
      title="Recurring Payments"
      subtitle={`${commitments.activeCount} active · ${currency} ${commitments.totalMonthly.toLocaleString()} / mo`}
      headerRight={
        <Pressable onPress={openSubscriptions} style={styles.viewBtn}>
          <Text
            style={[
              styles.viewBtnText,
              { color: theme.colors.primary, fontSize: theme.typography.xs },
            ]}
          >
            Manage
          </Text>
          <ChevronRight size={14} color={theme.colors.primary} />
        </Pressable>
      }
    >
      <View style={styles.content}>
        {preview.length > 0 ? (
          preview.map((sub) => (
            <Pressable
              key={sub.id || sub.name}
              onPress={openSubscriptions}
              style={styles.row}
            >
              <View style={styles.nameRow}>
                <Repeat size={14} color={theme.colors.primary} />
                <Text
                  style={{
                    fontSize: theme.typography.sm,
                    color: theme.colors.foreground,
                    fontWeight: "600",
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {sub.name}
                </Text>
              </View>
              <Amount
                value={sub.amount}
                currency={currency}
                ghostable
                style={{
                  fontSize: theme.typography.sm,
                  fontWeight: "700",
                  color: theme.colors.foreground,
                }}
              />
            </Pressable>
          ))
        ) : (
          <Text
            style={{
              fontSize: theme.typography.sm,
              color: theme.colors.mutedForeground,
            }}
          >
            Repeating merchants like Netflix will show up here.
          </Text>
        )}
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
    paddingVertical: 4,
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
});
