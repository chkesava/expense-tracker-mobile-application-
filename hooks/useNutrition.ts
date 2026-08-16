import { useDailyLog } from "@/hooks/useDailyLog";
import { useNutritionProfile } from "@/hooks/useNutritionProfile";
import { calculateNutritionGoals } from "@/shared/utils/nutritionGoals";

export { calculateNutritionGoals };

/** Compatibility wrapper around the web-aligned nutrition hooks. */
export function useNutrition(dateStr: string) {
  const { profile, goals, loading: profileLoading, updateProfileAndGoals } =
    useNutritionProfile();
  const daily = useDailyLog(dateStr);

  return {
    profile,
    goals,
    dailyLog: daily.dailyLog,
    meals: daily.meals,
    loading: profileLoading || daily.loading,
    saveProfile: updateProfileAndGoals,
    logWater: daily.addWater,
    saveFoodsToMeal: daily.saveFoodsToMeal,
    initializeDay: daily.initializeDay,
  };
}
