import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter, type Href } from "expo-router";
import { ChevronRight, Landmark } from "lucide-react-native";

import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Entry point to the Tax & ITR Readiness Center from Insights (SPENDLY-290).
 * Shown only when the center is enabled for this user (flag, D9). Static on
 * purpose: it reads nothing until the user goes in (SPENDLY-406).
 */
export function TaxEntryCard() {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const router = useRouter();
  const { enabled } = useTaxCenterFlag();
  if (!enabled) return null;
  return (
    <Pressable
      onPress={() => router.push("/tax" as Href)}
      accessibilityRole="button"
      accessibilityLabel="Tax and ITR readiness. Organise your income and tax records for the year"
      style={({ pressed }) => [
        styles.card,
        { borderColor: theme.colors.border, backgroundColor: pressed ? surfaces.tile : theme.colors.card, borderRadius: theme.radius.lg, padding: theme.space.lg, gap: theme.space.md },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: surfaces.tile, borderRadius: theme.radius.md }]}>
        <Landmark size={20} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold, fontSize: theme.typography.md }}>Tax & ITR readiness</Text>
        <Text style={{ color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular, fontSize: theme.typography.xs }}>
          Get your income and tax records ready for the year
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
