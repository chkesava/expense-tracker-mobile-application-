import React, { useMemo } from "react";
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { Card } from "@/components/ui";
import { MacroProgressBar } from "@/components/nutrition/MacroProgressBar";
import { MealPlannerCard } from "@/components/nutrition/MealPlannerCard";
import { Droplet, Activity, TrendingDown } from "lucide-react-native";
import type { Meal } from "@/shared/types/nutrition";
import { useRouter } from "expo-router";
import { useNutrition } from "@/hooks/useNutrition";
import { todayDateKey } from "@/shared/utils/dates";

const EMPTY_MEALS: Meal[] = [
  {
    id: "breakfast",
    name: "Breakfast",
    order: 1,
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    foods: [],
  },
  {
    id: "lunch",
    name: "Lunch",
    order: 2,
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    foods: [],
  },
  {
    id: "dinner",
    name: "Dinner",
    order: 3,
    totals: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    foods: [],
  },
];

export default function NutritionDashboard() {
  const { theme } = useTheme();
  const router = useRouter();
  const today = todayDateKey();
  const { profile, goals, dailyLog, loading, logWater } = useNutrition(today);

  const meals: Meal[] = useMemo(() => {
    if (dailyLog?.meals && dailyLog.meals.length > 0) return dailyLog.meals;
    return EMPTY_MEALS;
  }, [dailyLog]);

  const macros = {
    calories: {
      consumed: dailyLog?.nutritionSummary.calories ?? 0,
      target: goals?.targetCalories ?? 2000,
      color: theme.colors.primary,
    },
    protein: {
      consumed: dailyLog?.nutritionSummary.protein ?? 0,
      target: goals?.proteinGrams ?? 100,
      color: "#34B37A",
    },
    carbs: {
      consumed: dailyLog?.nutritionSummary.carbs ?? 0,
      target: goals?.carbsGrams ?? 200,
      color: "#F59E0B",
    },
    fats: {
      consumed: dailyLog?.nutritionSummary.fat ?? 0,
      target: goals?.fatGrams ?? 70,
      color: "#EF4444",
    },
  };

  const waterLogged = dailyLog?.waterLoggedMl ?? 0;
  const waterTarget = goals?.waterMl ?? 3000;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    content: {
      padding: theme.space.md,
    },
    sectionTitle: {
      fontSize: theme.typography.lg,
      fontWeight: "bold",
      color: theme.colors.foreground,
      marginTop: theme.space.md,
      marginBottom: theme.space.sm,
    },
    macrosCard: {
      padding: theme.space.md,
      marginBottom: theme.space.md,
      flexDirection: "row",
      justifyContent: "space-around",
      flexWrap: "wrap",
    },
    waterCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      padding: theme.space.md,
      marginBottom: theme.space.md,
    },
    waterInfo: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space.md,
    },
    waterText: {
      color: theme.colors.foreground,
      fontSize: theme.typography.md,
      fontWeight: "600",
    },
    waterSubText: {
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.sm,
    },
    addWaterBtn: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: theme.space.md,
      paddingVertical: theme.space.sm,
      borderRadius: theme.radius.full,
    },
    addWaterText: {
      color: theme.colors.primaryForeground,
      fontWeight: "bold",
    },
    summaryCards: {
      flexDirection: "row",
      gap: theme.space.md,
      marginBottom: theme.space.md,
    },
    summaryCard: {
      flex: 1,
      padding: theme.space.md,
      alignItems: "center",
    },
    summaryValue: {
      fontSize: theme.typography.xl,
      fontWeight: "bold",
      color: theme.colors.foreground,
      marginVertical: theme.space.xs,
    },
    summaryLabel: {
      fontSize: theme.typography.xs,
      color: theme.colors.mutedForeground,
    },
    hint: {
      color: theme.colors.mutedForeground,
      marginBottom: theme.space.md,
    },
  });

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Today's Progress</Text>
      {!profile ? (
        <Text style={styles.hint}>
          Complete your nutrition profile to personalize targets.
        </Text>
      ) : null}
      <Card style={styles.macrosCard}>
        <MacroProgressBar
          label="Calories"
          consumed={macros.calories.consumed}
          target={macros.calories.target}
          color={macros.calories.color}
          size={100}
          strokeWidth={10}
        />
        <MacroProgressBar
          label="Protein"
          consumed={macros.protein.consumed}
          target={macros.protein.target}
          color={macros.protein.color}
        />
        <MacroProgressBar
          label="Carbs"
          consumed={macros.carbs.consumed}
          target={macros.carbs.target}
          color={macros.carbs.color}
        />
        <MacroProgressBar
          label="Fats"
          consumed={macros.fats.consumed}
          target={macros.fats.target}
          color={macros.fats.color}
        />
      </Card>

      <Card style={styles.waterCard}>
        <View style={styles.waterInfo}>
          <Droplet color="#3b82f6" size={32} />
          <View>
            <Text style={styles.waterText}>
              {waterLogged} / {waterTarget} ml
            </Text>
            <Text style={styles.waterSubText}>Daily Water Goal</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addWaterBtn}
          onPress={() => {
            void logWater(250);
          }}
        >
          <Text style={styles.addWaterText}>+ 250ml</Text>
        </TouchableOpacity>
      </Card>

      <View style={styles.summaryCards}>
        <Card style={styles.summaryCard}>
          <Activity color={theme.colors.success} size={24} />
          <Text style={styles.summaryValue}>
            {dailyLog?.workoutSummary?.caloriesBurned ?? 0}
          </Text>
          <Text style={styles.summaryLabel}>Active Cals</Text>
        </Card>
        <Card style={styles.summaryCard}>
          <TrendingDown color={theme.colors.primary} size={24} />
          <Text style={styles.summaryValue}>
            {profile?.weightKg != null ? `${profile.weightKg} kg` : "—"}
          </Text>
          <Text style={styles.summaryLabel}>Current Weight</Text>
        </Card>
      </View>

      <Text style={styles.sectionTitle}>Meals</Text>
      {meals.map((meal) => (
        <MealPlannerCard
          key={meal.id}
          meal={meal}
          onAddFood={() => router.push("/(nutrition)/log")}
        />
      ))}
    </ScrollView>
  );
}
