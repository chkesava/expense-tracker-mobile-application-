import { useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Droplets, Flame, PieChart } from "lucide-react-native";

import { NutritionValue } from "@/components/nutrition/NutritionValue";
import { SimpleBarChart } from "@/components/nutrition/SimpleBarChart";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Card } from "@/components/ui";
import { useNutritionHistory } from "@/hooks/useNutritionHistory";
import { useNutritionProfile } from "@/hooks/useNutritionProfile";
import { parseLocalDate } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

export default function NutritionAnalyticsScreen() {
  const { theme } = useTheme();
  const { logs, loading } = useNutritionHistory(7);
  const { goals } = useNutritionProfile();

  const calorieData = useMemo(
    () =>
      logs.map((log) => ({
        label: parseLocalDate(log.date).toLocaleDateString(undefined, {
          weekday: "short",
        }),
        value: Math.round(log.nutritionSummary?.calories || 0),
      })),
    [logs]
  );

  const macroAverages = useMemo(() => {
    if (logs.length === 0) return [];
    let protein = 0;
    let carbs = 0;
    let fat = 0;
    logs.forEach((log) => {
      protein += log.nutritionSummary?.protein || 0;
      carbs += log.nutritionSummary?.carbs || 0;
      fat += log.nutritionSummary?.fat || 0;
    });
    const days = logs.length;
    return [
      { name: "Protein", value: Math.round(protein / days), color: "#3B82F6" },
      { name: "Carbs", value: Math.round(carbs / days), color: "#F59E0B" },
      { name: "Fat", value: Math.round(fat / days), color: "#EF4444" },
    ];
  }, [logs]);

  const avgWater = useMemo(() => {
    if (logs.length === 0) return 0;
    const total = logs.reduce((sum, log) => sum + (log.waterLoggedMl || 0), 0);
    return Math.round(total / logs.length);
  }, [logs]);

  const avgCalories = useMemo(() => {
    if (logs.length === 0) return 0;
    const total = logs.reduce(
      (sum, log) => sum + (log.nutritionSummary?.calories || 0),
      0
    );
    return Math.round(total / logs.length);
  }, [logs]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <PageShell hideHeaderOffset>
      <PageHeader
        title="Analytics"
        subtitle="Last 7 days from Firebase"
        icon={<PieChart size={22} color={theme.colors.success} />}
      />

      <View style={styles.stack}>
        <Card
          title="Calorie intake"
          subtitle={`Daily average vs ${goals?.targetCalories ?? 2000} kcal target`}
          icon={
            <View style={[styles.icon, { backgroundColor: "rgba(52, 179, 122, 0.16)" }]}>
              <Flame size={20} color={theme.colors.success} />
            </View>
          }
        >
          {calorieData.length > 0 ? (
            <SimpleBarChart
              data={calorieData}
              maxValue={Math.max(
                goals?.targetCalories ?? 0,
                ...calorieData.map((item) => item.value),
                1
              )}
              color={theme.colors.success}
            />
          ) : (
            <Text style={{ color: theme.colors.mutedForeground }}>
              No daily logs yet. Start a day on Home to see charts.
            </Text>
          )}
          <View style={styles.avgRow}>
            <Text style={{ color: theme.colors.mutedForeground }}>Average</Text>
            <NutritionValue
              value={avgCalories}
              unit="kcal"
              style={{ color: theme.colors.foreground, fontWeight: "800" }}
            />
          </View>
        </Card>

        <Card title="Average macros">
          <View style={styles.macroRow}>
            {macroAverages.map((item) => (
              <View key={item.name} style={styles.macroCell}>
                <Text style={{ color: theme.colors.mutedForeground, fontSize: 12 }}>
                  {item.name}
                </Text>
                <NutritionValue
                  value={item.value}
                  unit="g"
                  style={{ color: item.color, fontWeight: "800", fontSize: 18 }}
                />
              </View>
            ))}
          </View>
        </Card>

        <Card
          title="Water"
          icon={
            <View style={[styles.icon, { backgroundColor: "rgba(59, 130, 246, 0.16)" }]}>
              <Droplets size={20} color="#3B82F6" />
            </View>
          }
        >
          <NutritionValue
            value={avgWater}
            unit="ml / day"
            style={{
              color: theme.colors.foreground,
              fontSize: 22,
              fontWeight: "800",
            }}
          />
        </Card>
      </View>
    </PageShell>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stack: {
    gap: 12,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  avgRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  macroRow: {
    flexDirection: "row",
    gap: 8,
  },
  macroCell: {
    flex: 1,
    gap: 4,
  },
});
