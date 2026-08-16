import { describe, expect, it } from "vitest";

import type { NutritionProfile } from "@/shared/types/nutrition";
import { calculateNutritionGoals } from "@/shared/utils/nutritionGoals";

const base: NutritionProfile = {
  age: 30,
  gender: "male",
  heightCm: 175,
  weightKg: 70,
  targetWeightKg: 65,
  goal: "maintenance",
  activityLevel: "sedentary",
  dietPreference: "anything",
  allergies: [],
};

describe("calculateNutritionGoals", () => {
  it("uses Mifflin-St Jeor and the same web splits", () => {
    const goals = calculateNutritionGoals(base);
    expect(goals.proteinGrams).toBe(140);
    expect(goals.waterMl).toBe(2450);
    expect(goals.targetCalories).toBe(goals.maintenanceCalories);
  });

  it("applies fat-loss and lean-bulk calorie deltas", () => {
    const loss = calculateNutritionGoals({ ...base, goal: "fat_loss" });
    const bulk = calculateNutritionGoals({ ...base, goal: "lean_bulk" });
    expect(loss.targetCalories).toBe(loss.maintenanceCalories - 500);
    expect(bulk.targetCalories).toBe(bulk.maintenanceCalories + 200);
  });
});
