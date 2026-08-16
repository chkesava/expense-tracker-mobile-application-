import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, Leaf, Plus } from "lucide-react-native";

import { MacroProgressBar } from "@/components/nutrition/MacroProgressBar";
import { MealPlannerCard } from "@/components/nutrition/MealPlannerCard";
import { WaterCard } from "@/components/nutrition/WaterCard";
import { WorkoutCard } from "@/components/nutrition/WorkoutCard";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell } from "@/components/layout/PageShell";
import { Button, Card } from "@/components/ui";
import { useDailyLog } from "@/hooks/useDailyLog";
import { useNutritionProfile } from "@/hooks/useNutritionProfile";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { parseLocalDate, shiftDateKey, todayDateKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";

const MEAL_COUNTS = [2, 3, 4, 5, 6];

function formatDayLabel(dateStr: string): string {
  return parseLocalDate(dateStr).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function NutritionDashboard() {
  const { theme } = useTheme();
  const router = useRouter();
  const today = todayDateKey();
  const [dateStr, setDateStr] = useState(today);
  const { profile, goals, loading: profileLoading } = useNutritionProfile();
  const {
    dailyLog,
    meals,
    loading,
    initializeDay,
    addMealSlot,
    addWater,
    saveWorkout,
  } = useDailyLog(dateStr);

  const isToday = dateStr === today;
  const calories = dailyLog?.nutritionSummary.calories ?? 0;
  const protein = dailyLog?.nutritionSummary.protein ?? 0;
  const carbs = dailyLog?.nutritionSummary.carbs ?? 0;
  const fat = dailyLog?.nutritionSummary.fat ?? 0;

  const subtitle = useMemo(() => formatDayLabel(dateStr), [dateStr]);

  const openMeal = (mealId: string) => {
    router.push({
      pathname: "/(nutrition)/meal",
      params: { dateStr, mealId },
    } as never);
  };

  const openScanner = (mealId: string) => {
    router.push({
      pathname: "/(nutrition)/scanner",
      params: { dateStr, mealId },
    } as never);
  };

  if (profileLoading || loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!profile) {
    return (
      <PageShell hideHeaderOffset>
        <PageHeader
          title="Nutrition"
          subtitle="Set up your profile"
          icon={<Leaf size={22} color={theme.colors.success} />}
        />
        <Card
          title="Welcome"
          subtitle="Save your age, weight, and goal so we can load your existing Firebase targets — same data as the web app."
        >
          <Button onPress={() => router.push("/(nutrition)/profile" as never)}>
            Set up profile
          </Button>
        </Card>
      </PageShell>
    );
  }

  return (
    <PageShell hideHeaderOffset>
      <PageHeader
        title="Nutrition"
        subtitle={subtitle}
        icon={<Leaf size={22} color={theme.colors.success} />}
        rightElement={
          isToday ? (
            <View
              style={[
                styles.todayBadge,
                { backgroundColor: "rgba(52, 179, 122, 0.14)" },
              ]}
            >
              <Text style={{ color: theme.colors.success, fontWeight: "800", fontSize: 11 }}>
                TODAY
              </Text>
            </View>
          ) : null
        }
      />

      <View
        style={[
          styles.dateRow,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
          },
        ]}
      >
        <Pressable
          onPress={() => {
            void haptic.selection();
            setDateStr(shiftDateKey(dateStr, -1));
          }}
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.7 }]}
        >
          <ChevronLeft size={20} color={theme.colors.mutedForeground} />
        </Pressable>
        <Text
          style={{
            color: theme.colors.foreground,
            fontFamily: theme.fontFamily.semibold,
            fontSize: theme.typography.sm,
          }}
        >
          {dateStr}
        </Text>
        <Pressable
          onPress={() => {
            void haptic.selection();
            setDateStr(shiftDateKey(dateStr, 1));
          }}
          accessibilityRole="button"
          accessibilityLabel="Next day"
          style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.7 }]}
        >
          <ChevronRight size={20} color={theme.colors.mutedForeground} />
        </Pressable>
      </View>

      <Card>
        <View style={styles.macros}>
          <MacroProgressBar
            label="Calories"
            consumed={calories}
            target={goals?.targetCalories ?? 2000}
            color={theme.colors.success}
            size={96}
            strokeWidth={10}
          />
          <MacroProgressBar
            label="Protein"
            consumed={protein}
            target={goals?.proteinGrams ?? 150}
            color="#3B82F6"
          />
          <MacroProgressBar
            label="Carbs"
            consumed={carbs}
            target={goals?.carbsGrams ?? 200}
            color="#F59E0B"
          />
          <MacroProgressBar
            label="Fat"
            consumed={fat}
            target={goals?.fatGrams ?? 65}
            color="#EF4444"
          />
        </View>
      </Card>

      <View style={styles.stack}>
        <WaterCard
          currentMl={dailyLog?.waterLoggedMl ?? 0}
          targetMl={goals?.waterMl ?? 2500}
          onAdd={(amount) => {
            if (!dailyLog) {
              toast.info("Start the day first so water can be saved.");
              return;
            }
            void addWater(amount);
          }}
        />
        <WorkoutCard
          durationMinutes={dailyLog?.workoutSummary?.durationMinutes ?? 0}
          caloriesBurned={dailyLog?.workoutSummary?.caloriesBurned ?? 0}
          onSave={async (mins, cals) => {
            if (!dailyLog) {
              toast.info("Start the day first so workouts can be saved.");
              return;
            }
            await saveWorkout(mins, cals);
          }}
        />
      </View>

      {!dailyLog ? (
        <Card
          title="Ready for this day?"
          subtitle="How many meals are you planning? You can add more later. This writes to the same Firebase daily log as the web app."
        >
          <View style={styles.mealCounts}>
            {MEAL_COUNTS.map((count) => (
              <Pressable
                key={count}
                onPress={() => {
                  void haptic.impact();
                  void initializeDay(count).catch(() =>
                    toast.error("Could not start the day")
                  );
                }}
                style={({ pressed }) => [
                  styles.countBtn,
                  {
                    backgroundColor: "rgba(52, 179, 122, 0.12)",
                    borderColor: theme.colors.border,
                  },
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Start day with ${count} meals`}
              >
                <Text
                  style={{
                    color: theme.colors.success,
                    fontWeight: "800",
                    fontSize: 16,
                  }}
                >
                  {count}
                </Text>
              </Pressable>
            ))}
          </View>
          <Button
            variant="ghost"
            onPress={() => {
              void initializeDay(1).catch(() =>
                toast.error("Could not start the day")
              );
            }}
          >
            Just 1 meal
          </Button>
        </Card>
      ) : (
        <View style={styles.stack}>
          <View style={styles.sectionHead}>
            <Text
              style={{
                color: theme.colors.foreground,
                fontFamily: theme.fontFamily.bold,
                fontSize: theme.typography.md,
              }}
            >
              Meals
            </Text>
            <Pressable
              onPress={() => {
                void haptic.selection();
                void addMealSlot().catch(() => toast.error("Could not add meal"));
              }}
              style={({ pressed }) => [
                styles.addMeal,
                pressed && { opacity: 0.8 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Add meal slot"
            >
              <Plus size={16} color={theme.colors.success} />
              <Text style={{ color: theme.colors.success, fontWeight: "700" }}>
                Add
              </Text>
            </Pressable>
          </View>
          {meals.map((meal) => (
            <MealPlannerCard
              key={meal.id}
              meal={meal}
              onOpen={() => openMeal(meal.id)}
              onScan={() => openScanner(meal.id)}
            />
          ))}
        </View>
      )}
    </PageShell>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  todayBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 999,
    borderCurve: "continuous",
    paddingHorizontal: 8,
    minHeight: 48,
    marginBottom: 16,
  },
  dateBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  macros: {
    flexDirection: "row",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 8,
  },
  stack: {
    gap: 12,
    marginTop: 12,
  },
  mealCounts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  countBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addMeal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 44,
    paddingHorizontal: 8,
  },
});
