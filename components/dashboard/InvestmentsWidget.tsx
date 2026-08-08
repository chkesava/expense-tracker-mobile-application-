import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { ChevronRight } from "lucide-react-native";

import { Amount } from "@/components/common/Amount";
import { Card } from "@/components/ui/Card";
import { useUnifiedNetWorth } from "@/hooks/useUnifiedNetWorth";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface InvestmentsWidgetProps {
  liquidBalance?: number;
  currency: string;
}

export function InvestmentsWidget({
  currency,
}: InvestmentsWidgetProps) {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const netWorth = useUnifiedNetWorth();

  const red = isDark ? "#f87171" : "#dc2626";
  const green = isDark ? "#4ade80" : "#16a34a";
  const blue = isDark ? "#60a5fa" : "#2563eb";

  return (
    <Card
      title="Asset Allocation"
      subtitle="Complete net worth & liabilities breakdown"
      headerRight={
        <Pressable
          onPress={() => {
            Haptics.selectionAsync().catch(() => undefined);
            router.push("/ledger?tab=investments");
          }}
          style={styles.viewBtn}
        >
          <Text
            style={[
              styles.viewBtnText,
              { color: theme.colors.primary, fontSize: theme.typography.xs },
            ]}
          >
            Investments
          </Text>
          <ChevronRight size={14} color={theme.colors.primary} />
        </Pressable>
      }
    >
      <View style={styles.content}>
        {/* Liquid Bank Accounts */}
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
            value={netWorth.liquidBankAssets}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "700",
              color: theme.colors.foreground,
            }}
          />
        </View>

        {/* Fixed Investments (FD / RD) */}
        <View style={styles.row}>
          <Text
            style={{
              fontSize: theme.typography.sm,
              color: theme.colors.mutedForeground,
            }}
          >
            Investments Value (FD/RD)
          </Text>
          <Amount
            value={netWorth.investmentsValue}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "700",
              color: green,
            }}
          />
        </View>

        {/* Stocks & Demat Cash */}
        <View style={styles.row}>
          <Text
            style={{
              fontSize: theme.typography.sm,
              color: theme.colors.mutedForeground,
            }}
          >
            Stocks & Demat
          </Text>
          <Amount
            value={netWorth.totalStocksValue}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "700",
              color: blue,
            }}
          />
        </View>

        {/* Liabilities (Credit Cards & Overdrafts) */}
        {netWorth.totalLiabilities > 0 && (
          <View style={styles.row}>
            <Text
              style={{
                fontSize: theme.typography.sm,
                color: red,
                fontWeight: "600",
              }}
            >
              Liabilities (Credit Cards)
            </Text>
            <Amount
              value={netWorth.totalLiabilities}
              currency={currency}
              prefix="-"
              ghostable
              style={{
                fontSize: theme.typography.sm,
                fontWeight: "700",
                color: red,
              }}
            />
          </View>
        )}

        {/* Total Net Worth */}
        <View
          style={[
            styles.row,
            {
              paddingTop: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.colors.border,
            },
          ]}
        >
          <Text
            style={{
              fontSize: theme.typography.sm,
              fontWeight: "800",
              color: theme.colors.foreground,
            }}
          >
            Total Net Worth
          </Text>
          <Amount
            value={netWorth.totalNetWorth}
            currency={currency}
            ghostable
            style={{
              fontSize: theme.typography.md,
              fontWeight: "900",
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
