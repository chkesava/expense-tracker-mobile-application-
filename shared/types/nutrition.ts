export type GoalType = 'fat_loss' | 'muscle_gain' | 'maintenance' | 'lean_bulk';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type DietPreference = 'anything' | 'vegetarian' | 'vegan' | 'keto' | 'paleo';

export interface NutritionProfile {
  age: number;
  gender: 'male' | 'female' | 'other';
  heightCm: number;
  weightKg: number;
  targetWeightKg: number;
  goal: GoalType;
  activityLevel: ActivityLevel;
  dietPreference: DietPreference;
  allergies: string[];
}

export interface NutritionGoals {
  maintenanceCalories: number;
  targetCalories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterMl: number;
}

export interface NutrientTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar?: number;
  sodium?: number;
  potassium?: number;
}

export interface FoodItem {
  id: string;
  name: string;
  quantity: string;
  nutrients: NutrientTotals;
}

export interface Meal {
  id: string;
  name: string;
  order: number;
  time?: number; // timestamp
  foods: FoodItem[];
  totals: NutrientTotals;
  notes?: string;
  photoUrl?: string;
}

export interface WorkoutEntry {
  id: string;
  type: string;
  durationMinutes: number;
  caloriesBurned: number;
  notes?: string;
}

export interface DailyLogSummary {
  date: string; // YYYY-MM-DD
  mealCount: number;
  nutritionSummary: NutrientTotals;
  waterLoggedMl: number;
  workoutSummary: {
    durationMinutes: number;
    caloriesBurned: number;
  };
}

export interface WeightEntry {
  id: string;
  date: string; // YYYY-MM-DD
  weightKg: number;
  notes?: string;
}
