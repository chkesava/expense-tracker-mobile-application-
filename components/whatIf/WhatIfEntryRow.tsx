import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, FlaskConical } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";

/**
 * Entry to What If from related screens (SPENDLY-387). A link only: it
 * computes nothing, so the host screen pays no cost for it.
 */
export function WhatIfEntryRow({ subtitle, template }: { subtitle: string; template?: string }) {
  const { theme } = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push((template ? `/what-if/edit?template=${template}` : "/what-if") as Href)}
      accessibilityRole="button"
      accessibilityLabel={`What If. ${subtitle}`}
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
      <FlaskConical size={18} color={theme.colors.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.sm }}>Try a What If</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>{subtitle}</Text>
      </View>
      <ChevronRight size={16} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 56 },
});
