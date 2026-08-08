import { ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  BarChart3,
  CreditCard,
  Plus,
  Repeat,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface QuickAddWidgetProps {
  onAddExpense: () => void;
}

export function QuickAddWidget({ onAddExpense }: QuickAddWidgetProps) {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const chips = [
    {
      id: "add",
      label: "Log Expense",
      icon: Plus,
      color: theme.colors.primary,
      onPress: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
        onAddExpense();
      },
      featured: true,
    },
    {
      id: "ledger",
      label: "Ledger",
      icon: Wallet,
      color: theme.colors.foreground,
      onPress: () => {
        Haptics.selectionAsync().catch(() => undefined);
        router.push("/ledger");
      },
    },
    {
      id: "insights",
      label: "Insights",
      icon: BarChart3,
      color: theme.colors.foreground,
      onPress: () => {
        Haptics.selectionAsync().catch(() => undefined);
        router.push("/insights");
      },
    },
    {
      id: "splits",
      label: "Split Bills",
      icon: Users,
      color: "#22C55E",
      onPress: () => {
        Haptics.selectionAsync().catch(() => undefined);
        router.push("/ledger?tab=splits");
      },
    },
    {
      id: "subscriptions",
      label: "Recurring",
      icon: Repeat,
      color: "#EC4899",
      onPress: () => {
        Haptics.selectionAsync().catch(() => undefined);
        router.push("/ledger?tab=subscriptions");
      },
    },
  ];

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContainer}
    >
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <Pressable
            key={chip.id}
            onPress={chip.onPress}
            android_ripple={{
              color: chip.featured ? "rgba(255, 255, 255, 0.25)" : theme.colors.primary + "18",
              borderless: false,
            }}
            style={({ pressed }) => [
              styles.actionChip,
              chip.featured
                ? [
                    styles.featuredChip,
                    theme.elevation[2],
                    {
                      backgroundColor: theme.colors.primary,
                      borderColor: theme.colors.primary,
                    },
                  ]
                : [
                    styles.standardChip,
                    {
                      backgroundColor: theme.colors.card,
                      borderColor: theme.colors.border,
                    },
                  ],
              pressed && { opacity: 0.88, transform: [{ scale: 0.97 }] },
            ]}
            accessibilityRole="button"
          >
            <View
              style={[
                styles.iconWrap,
                {
                  backgroundColor: chip.featured
                    ? "rgba(255, 255, 255, 0.2)"
                    : isDark
                      ? "rgba(255, 255, 255, 0.08)"
                      : "rgba(0, 0, 0, 0.04)",
                },
              ]}
            >
              <Icon
                size={16}
                color={chip.featured ? theme.colors.primaryForeground : chip.color}
                strokeWidth={2.4}
              />
            </View>
            <Text
              style={[
                styles.chipLabel,
                {
                  color: chip.featured
                    ? theme.colors.primaryForeground
                    : theme.colors.foreground,
                },
              ]}
            >
              {chip.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollContainer: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  actionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 48,
  },
  featuredChip: {},
  standardChip: {},
  iconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
});
