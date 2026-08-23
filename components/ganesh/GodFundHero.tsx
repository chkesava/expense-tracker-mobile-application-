import { Text, View } from "react-native";

import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export function GodFundHero({
  amount,
  festivalName,
  pandalName,
}: {
  amount: number;
  festivalName?: string;
  pandalName?: string;
}) {
  const { theme } = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 24,
        padding: 20,
        gap: 8,
      }}
    >
      {pandalName ? (
        <Text style={{ color: theme.colors.mutedForeground, fontSize: 13 }}>
          {pandalName}
        </Text>
      ) : null}
      <Text style={{ color: theme.colors.foreground, fontSize: 20, fontWeight: "800" }}>
        {festivalName || "Ganesh Utsav"}
      </Text>
      <Text
        style={{
          color: theme.colors.mutedForeground,
          fontSize: 12,
          fontWeight: "700",
          letterSpacing: 1,
        }}
      >
        AVAILABLE GOD FUND
      </Text>
      <Text style={{ color: theme.colors.primary, fontSize: 36, fontWeight: "800" }}>
        {formatInr(amount)}
      </Text>
    </View>
  );
}
