import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Calendar, ChevronRight, Repeat } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { computeMonthlyCommitments } from "@/shared/utils/subscriptionProcessor";
import { useTheme } from "@/theme/ThemeProvider";

export interface SubscriptionsWidgetProps {
  currency: string;
}

export function SubscriptionsWidget({ currency }: SubscriptionsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const { subscriptions } = useSubscriptions();

  const commitments = useMemo(() => {
    return computeMonthlyCommitments(subscriptions);
  }, [subscriptions]);

  return (
    <Card
      title="Recurring Subscriptions"
      subtitle={`${commitments.activeCount} active · ${currency} ${commitments.totalMonthly.toLocaleString()} / mo`}
      headerRight={
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/ledger");
          }}
          style={styles.viewBtn}
        >
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
        <View style={styles.row}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Repeat size={16} color={theme.colors.primary} />
            <Text
              style={{
                fontSize: theme.typography.sm,
                color: theme.colors.foreground,
                fontWeight: "600",
              }}
            >
              Monthly Auto-Commitment
            </Text>
          </View>
          <Amount
            value={commitments.totalMonthly}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "700",
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
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
