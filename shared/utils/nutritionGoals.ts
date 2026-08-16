import type { NutritionGoals, NutritionProfile } from "@/shared/types/nutrition";

/** Mifflin-St Jeor goals — same formula as the web nutrition app. */
export function calculateNutritionGoals(profile: NutritionProfile): NutritionGoals {
  const { weightKg, heightCm, age, gender, activityLevel, goal } = profile;

  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  if (gender === "male") bmr += 5;
  else if (gender === "female") bmr -= 161;
  else bmr -= 78;

  const activityMultipliers = {
    sedentary: 1.2,
    light: 1.375,
    moderate: 1.55,
    active: 1.725,
    very_active: 1.9,
  } as const;

  const maintenanceCalories = Math.round(
    bmr * activityMultipliers[activityLevel]
  );
  let targetCalories = maintenanceCalories;

  switch (goal) {
    case "fat_loss":
      targetCalories -= 500;
      break;
    case "muscle_gain":
      targetCalories += 300;
      break;
    case "lean_bulk":
      targetCalories += 200;
      break;
    default:
      break;
  }

  const proteinGrams = Math.round(weightKg * 2);
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  const remainingCals = targetCalories - proteinGrams * 4 - fatGrams * 9;
  const carbsGrams = Math.max(0, Math.round(remainingCals / 4));
  const waterMl = Math.round(weightKg * 35);

  return {
    maintenanceCalories,
    targetCalories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    waterMl,
  };
}
