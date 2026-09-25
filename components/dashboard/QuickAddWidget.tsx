import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BarChart3,
  Plus,
  Repeat,
  Users,
  Wallet,
} from "lucide-react-native";

import { Chip } from "@/components/ui/Chip";
import { withAlpha } from "@/theme/surfaces";
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

  const go = (path: string) => () => {
    void haptic.selection();
    router.push(path as never);
  };

  const chips = [
    {
      id: "add",
      label: "Add",
      icon: Plus,
      featured: true,
      onPress: () => {
        void haptic.impact();
        onAddExpense();
      },
    },
    { id: "ledger", label: "Money", icon: Wallet, onPress: go("/ledger") },
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

  return (
    <HorizontalSwipeBoundary>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {chips.map((chip) => {
          const Icon = chip.icon;
          return (
            <Chip
              key={chip.id}
              label={chip.label}
              // The one filled primary action; the rest stay quiet.
              selected={chip.featured}
              haptic={false}
              onPress={chip.onPress}
              style={styles.chip}
              icon={(color) =>
                chip.featured ? (
                  <View
                    style={[
                      styles.featuredGlyph,
                      { backgroundColor: withAlpha(color, 0.22) },
                    ]}
                  >
                    <Icon size={14} color={color} strokeWidth={2.6} />
                  </View>
                ) : (
                  <Icon size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
                )
              }
            />
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
    gap: 8,
    paddingHorizontal: 15,
    minHeight: 46,
  },
  featuredGlyph: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
});
