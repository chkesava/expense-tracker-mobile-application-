import { Text, View } from "react-native";

import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export function MetricGrid({
  items,
}: {
  items: Array<{ label: string; value: number | string }>;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {items.map((item) => (
        <View
          key={item.label}
          style={{
            flexGrow: 1,
            minWidth: "45%",
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: 16,
            padding: 14,
            gap: 4,
          }}
        >
          <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
            {item.label}
          </Text>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "800" }}>
            {typeof item.value === "number" ? formatInr(item.value) : item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
