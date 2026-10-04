import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Scale } from "lucide-react-native";

import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Entry point to Money Decisions from Insights (SPENDLY-363). Static on
 * purpose: it opens a listener only once the user goes in.
 */
export function DecisionsEntryCard() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/decisions" as Href)}
      accessibilityRole="button"
      accessibilityLabel="Money Decisions. Record and revisit important money decisions"
      style={({ pressed }) => [
        styles.card,
        { borderColor: theme.colors.border, backgroundColor: pressed ? surfaces.tile : theme.colors.card, borderRadius: theme.radius.lg, padding: theme.space.lg, gap: theme.space.md },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
        <Scale size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>Money Decisions</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          Record why you chose, then see how it turned out
        </Text>
      </View>
      <ChevronRight size={18} color={theme.colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", borderWidth: StyleSheet.hairlineWidth, minHeight: 64, marginBottom: 12 },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
});
