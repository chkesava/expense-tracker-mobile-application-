import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { Card } from "@/components/ui/Card";
import type { Expense } from "@/shared/types/expense";
import {
  buildSmartInsights,
  type SmartInsight,
} from "@/shared/utils/smartInsights";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export interface SmartInsightsWidgetProps {
  expenses: Expense[];
  monthlyBudget?: number;
  currency: string;
  todayKey: string;
}

function toneColor(
  tone: SmartInsight["tone"],
  colors: {
    foreground: string;
    destructive: string;
    success: string;
    warning: string;
  }
): string {
  if (tone === "warning") return colors.destructive;
  if (tone === "down") return colors.success;
  if (tone === "up") return colors.warning;
  return colors.foreground;
}

export function SmartInsightsWidget({
  expenses,
  monthlyBudget = 0,
  currency,
  todayKey,
}: SmartInsightsWidgetProps) {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const insights = useMemo(
    () =>
      buildSmartInsights({
        expenses,
        monthlyBudget,
        currency,
        today: todayKey,
      }),
    [expenses, monthlyBudget, currency, todayKey]
  );

  if (insights.length === 0) return null;

  return (
    <Card title="Smart Insights" subtitle="From this week's spending">
      <View style={styles.list}>
        {insights.map((insight) => (
          <View
            key={insight.id}
            style={[
              styles.row,
              {
                backgroundColor: isDark
                  ? "rgba(255,255,255,0.04)"
                  : "rgba(0,0,0,0.03)",
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text
              style={[
                styles.text,
                { color: toneColor(insight.tone, theme.colors) },
              ]}
            >
              {insight.text}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderCurve: "continuous",
  },
  text: {
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
  },
});
