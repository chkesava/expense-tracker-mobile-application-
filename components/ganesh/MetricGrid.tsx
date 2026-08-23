import { Pressable, Text, View } from "react-native";

import { formatInr } from "@/shared/utils/ganeshMoney";
import { useTheme } from "@/theme/ThemeProvider";

export function MetricGrid({
  items,
}: {
  items: Array<{ label: string; value: number | string; onPress?: () => void }>;
}) {
  const { theme } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
      {items.map((item) => {
        const cardStyle = {
          flexGrow: 1,
          minWidth: "45%" as const,
          backgroundColor: theme.colors.card,
          borderColor: theme.colors.border,
          borderWidth: 1,
          borderRadius: 16,
          padding: 14,
          gap: 4,
        };
        const body = (
          <>
            <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
              {item.label}
            </Text>
            <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "800" }}>
              {typeof item.value === "number" ? formatInr(item.value) : item.value}
            </Text>
          </>
        );
        if (item.onPress) {
          return (
            <Pressable key={item.label} onPress={item.onPress} style={cardStyle}>
              {body}
            </Pressable>
          );
        }
        return (
          <View key={item.label} style={cardStyle}>
            {body}
          </View>
        );
      })}
    </View>
  );
}
