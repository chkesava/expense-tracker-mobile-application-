import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Hourglass } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";

/**
 * Entry to Financial Runway from Money & Accounts (SPENDLY-210). A link only:
 * it computes nothing, so the accounts list pays no cost for it.
 */
export function RunwayEntryRow() {
  const { theme } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/runway" as Href)}
      accessibilityRole="button"
      accessibilityLabel="Financial runway. See how long your spendable money lasts."
      style={({ pressed }) => [
        styles.row,
        {
          gap: theme.space.md,
          padding: theme.space.md,
          borderRadius: theme.radius.md,
          borderColor: theme.colors.border,
          backgroundColor: pressed ? theme.colors.muted : theme.colors.card,
        },
      ]}
    >
      <Hourglass size={18} color={theme.colors.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>Financial runway</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          How long your spendable money lasts
        </Text>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 56 },
});
