import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronRight, TrendingUp } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useTheme } from "@/theme/ThemeProvider";

export interface InvestmentsWidgetProps {
  liquidBalance: number;
  currency: string;
}

export function InvestmentsWidget({
  liquidBalance,
  currency,
}: InvestmentsWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();

  return (
    <Card
      title="Asset Allocation"
      subtitle="Liquid accounts & portfolio overview"
      headerRight={
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/vaults");
          }}
          style={styles.viewBtn}
        >
          <Text
            style={[
              styles.viewBtnText,
              { color: theme.colors.primary, fontSize: theme.typography.xs },
            ]}
          >
            Vaults
          </Text>
          <ChevronRight size={14} color={theme.colors.primary} />
        </Pressable>
      }
    >
      <View style={styles.content}>
        <View style={styles.row}>
          <Text
            style={{
              fontSize: theme.typography.sm,
              color: theme.colors.mutedForeground,
            }}
          >
            Liquid Holdings
          </Text>
          <Amount
            value={liquidBalance}
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
    gap: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
});
