import { Pressable, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

export function AdminLinkRow({
  title,
  subtitle,
  badge,
  tone = "normal",
  onPress,
}: {
  title: string;
  subtitle?: string;
  badge?: string;
  tone?: "normal" | "attention" | "critical";
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const badgeColor =
    tone === "critical"
      ? theme.colors.destructive
      : tone === "attention"
        ? theme.colors.primary
        : theme.colors.mutedForeground;

  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: theme.colors.card,
        borderColor: theme.colors.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 14,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.foreground, fontWeight: "700", flex: 1 }}>{title}</Text>
        {badge ? (
          <Text style={{ color: badgeColor, fontWeight: "800" }}>{badge}</Text>
        ) : (
          <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Open</Text>
        )}
      </View>
      {subtitle ? (
        <Text style={{ color: theme.colors.mutedForeground, lineHeight: 20 }}>{subtitle}</Text>
      ) : null}
    </Pressable>
  );
}
