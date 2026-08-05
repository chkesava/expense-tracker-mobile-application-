import { StyleSheet, Text, View } from "react-native";
import { Award, Flame, Sparkles } from "lucide-react-native";

import { Card } from "@/components/ui/Card";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface GamificationWidgetProps {
  streak: number;
  budgetHealthScore: number;
}

export function GamificationWidget({
  streak,
  budgetHealthScore,
}: GamificationWidgetProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return (
    <Card
      title="Financial Health & Streak"
      subtitle="Logging consistency and budget discipline"
    >
      <View style={styles.grid}>
        {/* Streak Box */}
        <View
          style={[
            styles.statBox,
            {
              backgroundColor: isDark
                ? "rgba(249, 115, 22, 0.12)"
                : "rgba(249, 115, 22, 0.08)",
              borderColor: "rgba(249, 115, 22, 0.25)",
            },
          ]}
        >
          <View style={styles.iconRow}>
            <Flame size={16} color="#F97316" />
            <Text style={[styles.boxLabel, { color: "#F97316" }]}>
              LOGGING STREAK
            </Text>
          </View>
          <Text
            style={[
              styles.boxValue,
              { color: theme.colors.foreground, fontSize: theme.typography.lg },
            ]}
          >
            {streak} {streak === 1 ? "day" : "days"}
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: theme.colors.mutedForeground,
            }}
          >
            Keep logging daily!
          </Text>
        </View>

        {/* Health Score Box */}
        <View
          style={[
            styles.statBox,
            {
              backgroundColor: isDark
                ? "rgba(34, 197, 94, 0.12)"
                : "rgba(34, 197, 94, 0.08)",
              borderColor: "rgba(34, 197, 94, 0.25)",
            },
          ]}
        >
          <View style={styles.iconRow}>
            <Award size={16} color={theme.colors.success} />
            <Text style={[styles.boxLabel, { color: theme.colors.success }]}>
              HEALTH SCORE
            </Text>
          </View>
          <Text
            style={[
              styles.boxValue,
              { color: theme.colors.foreground, fontSize: theme.typography.lg },
            ]}
          >
            {budgetHealthScore}/100
          </Text>
          <Text
            style={{
              fontSize: 10,
              color: theme.colors.mutedForeground,
            }}
          >
            {budgetHealthScore >= 80
              ? "Excellent discipline"
              : budgetHealthScore >= 60
                ? "Good on track"
                : "Watch your spending"}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    gap: 10,
  },
  statBox: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
  },
  iconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  boxLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  boxValue: {
    fontWeight: "800",
  },
});
