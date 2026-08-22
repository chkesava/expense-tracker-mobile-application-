import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BarChart3,
  Plus,
  Repeat,
  Users,
  Wallet,
} from "lucide-react-native";

import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { HorizontalSwipeBoundary } from "@/components/navigation/HorizontalSwipeBoundary";

export interface QuickAddWidgetProps {
  onAddExpense: () => void;
}

/**
 * Horizontal action rail. One filled primary action, the rest quiet outlined
 * chips so the row reads as a single control group rather than five cards.
 */
export function QuickAddWidget({ onAddExpense }: QuickAddWidgetProps) {
  const router = useRouter();
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const go = (path: string) => () => {
    void haptic.selection();
    router.push(path as never);
  };

  const chips = [
    {
      id: "add",
      label: "Log Expense",
      icon: Plus,
      featured: true,
      onPress: () => {
        void haptic.impact();
        onAddExpense();
      },
    },
    { id: "ledger", label: "Ledger", icon: Wallet, onPress: go("/ledger") },
    {
      id: "insights",
      label: "Insights",
      icon: BarChart3,
      onPress: go("/insights"),
    },
    {
      id: "splits",
      label: "Split Bills",
      icon: Users,
      onPress: go("/vaults?tab=splits"),
    },
    {
      id: "subscriptions",
      label: "Recurring",
      icon: Repeat,
      onPress: go("/ledger?tab=subscriptions"),
    },
  ];

  /** Deep navy in light mode, elevated surface in dark — the "primary" identity. */
  const featuredBg = surfaces.isDark ? theme.colors.primary : "#1E293B";

  return (
    <HorizontalSwipeBoundary>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {chips.map((chip) => {
          const Icon = chip.icon;
          const color = chip.featured ? "#FFFFFF" : theme.colors.foreground;
          return (
            <Pressable
              key={chip.id}
              onPress={chip.onPress}
              android_ripple={{
                color: chip.featured
                  ? "rgba(255,255,255,0.2)"
                  : withAlpha(theme.colors.primary, 0.12),
                borderless: false,
              }}
              style={({ pressed }) => [
                styles.chip,
                chip.featured
                  ? { backgroundColor: featuredBg }
                  : {
                      backgroundColor: theme.colors.card,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: surfaces.divider,
                    },
                pressed && { opacity: 0.9 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
            >
              {chip.featured ? (
                <View style={styles.featuredGlyph}>
                  <Icon size={14} color={color} strokeWidth={2.6} />
                </View>
              ) : (
                <Icon size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
              )}
              <Text
                style={[
                  styles.label,
                  { color, fontFamily: theme.fontFamily.semibold },
                ]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </HorizontalSwipeBoundary>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 2,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 15,
    borderRadius: 999,
    minHeight: 46,
  },
  featuredGlyph: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  label: {
    fontSize: 13.5,
    letterSpacing: 0.1,
  },
});
