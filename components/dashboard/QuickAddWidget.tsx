import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { BarChart3, Plus, Wallet } from "lucide-react-native";

import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface QuickAddWidgetProps {
  onAddExpense: () => void;
}

export function QuickAddWidget({ onAddExpense }: QuickAddWidgetProps) {
  const router = useRouter();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <View style={styles.quickActionsGrid}>
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
          onAddExpense();
        }}
        style={({ pressed }) => [
          styles.quickActionButton,
          {
            backgroundColor: isDark
              ? "rgba(107, 99, 255, 0.12)"
              : "rgba(79, 70, 255, 0.08)",
            borderColor: isDark
              ? "rgba(107, 99, 255, 0.3)"
              : "rgba(79, 70, 255, 0.2)",
          },
          pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
        ]}
      >
        <View
          style={[
            styles.actionIconWrap,
            { backgroundColor: theme.colors.primary },
          ]}
        >
          <Plus
            size={18}
            color={theme.colors.primaryForeground}
            strokeWidth={2.5}
          />
        </View>
        <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
          Add Expense
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          router.push("/ledger");
        }}
        style={({ pressed }) => [
          styles.quickActionButton,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
          pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
        ]}
      >
        <View
          style={[
            styles.actionIconWrap,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
            },
          ]}
        >
          <Wallet size={18} color={theme.colors.foreground} />
        </View>
        <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
          Ledger
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          Haptics.selectionAsync().catch(() => undefined);
          router.push("/insights");
        }}
        style={({ pressed }) => [
          styles.quickActionButton,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
          pressed && { transform: [{ scale: 0.96 }], opacity: 0.85 },
        ]}
      >
        <View
          style={[
            styles.actionIconWrap,
            {
              backgroundColor: isDark
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)",
            },
          ]}
        >
          <BarChart3 size={18} color={theme.colors.foreground} />
        </View>
        <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
          Insights
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  quickActionsGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  quickActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "700",
  },
});
