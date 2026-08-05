import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Calendar, ChevronRight, Repeat } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { useTheme } from "@/theme/ThemeProvider";

export interface SubscriptionsWidgetProps {
  currency: string;
}

export function SubscriptionsWidget({ currency }: SubscriptionsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <Card
      title="Recurring Subscriptions"
      subtitle="Upcoming renewals & auto-debits"
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
              Subscription Auto-Tracker
            </Text>
          </View>
          <Text
            style={{
              fontSize: theme.typography.xs,
              color: theme.colors.mutedForeground,
            }}
          >
            Active
          </Text>
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
