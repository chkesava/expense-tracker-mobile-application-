import { Pressable, Text, View } from "react-native";

import type { PermanentFundSummary } from "@/shared/types/ganesh";
import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export function PermanentFundCard({
  fund,
  onPress,
}: {
  fund: PermanentFundSummary;
  onPress?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 24,
        padding: 20,
        gap: 10,
      }}
    >
      <Text
        style={{
          color: theme.colors.mutedForeground,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 1,
        }}
      >
        PERMANENT PANDAL FUND
      </Text>
      <Text style={{ color: theme.colors.primary, fontSize: 32, fontWeight: "800" }}>
        {formatInr(fund.total)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        <Text style={{ color: theme.colors.mutedForeground }}>Cash {formatInr(fund.cash)}</Text>
        <Text style={{ color: theme.colors.mutedForeground }}>UPI {formatInr(fund.upi)}</Text>
        <Text style={{ color: theme.colors.mutedForeground }}>Bank {formatInr(fund.bank)}</Text>
        <Text style={{ color: theme.colors.mutedForeground }}>Other {formatInr(fund.other)}</Text>
      </View>
      {onPress ? (
        <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>View fund</Text>
      ) : null}
    </Pressable>
  );
}
