import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  writeBatch,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { newId } from "@/lib/id";
import { useAuth } from "@/providers/AuthProvider";
import type {
  DailyLogSummary,
  FoodItem,
  Meal,
  NutrientTotals,
} from "@/shared/types/nutrition";

const EMPTY_TOTALS: NutrientTotals = {
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
};

const DEFAULT_MEAL_NAMES = [
  "Breakfast",
  "Lunch",
  "Dinner",
  "Snack 1",
  "Snack 2",
  "Snack 3",
];

function sumFoods(foods: FoodItem[]): NutrientTotals {
  return foods.reduce(
    (acc, food) => ({
      calories: acc.calories + (food.nutrients?.calories || 0),
      protein: acc.protein + (food.nutrients?.protein || 0),
      carbs: acc.carbs + (food.nutrients?.carbs || 0),
      fat: acc.fat + (food.nutrients?.fat || 0),
      fiber: acc.fiber + (food.nutrients?.fiber || 0),
    }),
    { ...EMPTY_TOTALS }
  );
}

export function useDailyLog(dateStr: string) {
  const { user } = useAuth();
  const db = getFirestoreDb();
  const [dailyLog, setDailyLog] = useState<DailyLogSummary | null>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db || !dateStr) {
      setDailyLog(null);
      setMeals([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const logRef = doc(db, `users/${user.uid}/daily_logs/${dateStr}`);
    const mealsQuery = query(
      collection(db, `users/${user.uid}/daily_logs/${dateStr}/meals`),
      orderBy("order", "asc")
    );

    const unsubLog = onSnapshot(
      logRef,
      (snap) => {
        setDailyLog(snap.exists() ? (snap.data() as DailyLogSummary) : null);
      },
      (error) => {
        logError("nutrition.dailyLog.listen", error);
      }
    );

    const unsubMeals = onSnapshot(
      mealsQuery,
      (snap) => {
        setMeals(snap.docs.map((d) => d.data() as Meal));
        setLoading(false);
      },
      (error) => {
        logError("nutrition.meals.listen", error);
        setLoading(false);
      }
    );

    return () => {
      unsubLog();
      unsubMeals();
    };
  }, [user, db, dateStr]);

  const initializeDay = useCallback(
    async (mealCount: number) => {
      if (!user || !db) return;
      const batch = writeBatch(db);
      const logRef = doc(db, `users/${user.uid}/daily_logs/${dateStr}`);

      const initialLog: DailyLogSummary = {
        date: dateStr,
        mealCount,
        nutritionSummary: { ...EMPTY_TOTALS },
        waterLoggedMl: 0,
        workoutSummary: { durationMinutes: 0, caloriesBurned: 0 },
      };
      batch.set(logRef, initialLog);

      for (let i = 0; i < mealCount; i++) {
        const mealId = newId();
        const mealRef = doc(
          db,
          `users/${user.uid}/daily_logs/${dateStr}/meals/${mealId}`
        );
        const newMeal: Meal = {
          id: mealId,
          name: DEFAULT_MEAL_NAMES[i] || `Meal ${i + 1}`,
          order: i,
          foods: [],
          totals: { ...EMPTY_TOTALS },
        };
        batch.set(mealRef, newMeal);
      }

      await batch.commit();
    },
    [user, db, dateStr]
  );

  const addMealSlot = useCallback(async () => {
    if (!user || !db || !dailyLog) return;
    const batch = writeBatch(db);
    const mealId = newId();
    const newOrder = meals.length;
    const mealRef = doc(
      db,
      `users/${user.uid}/daily_logs/${dateStr}/meals/${mealId}`
    );
    batch.set(mealRef, {
      id: mealId,
      name: `Meal ${newOrder + 1}`,
      order: newOrder,
      foods: [],
      totals: { ...EMPTY_TOTALS },
    } satisfies Meal);
    batch.update(doc(db, `users/${user.uid}/daily_logs/${dateStr}`), {
      mealCount: dailyLog.mealCount + 1,
    });
    await batch.commit();
  }, [user, db, dateStr, dailyLog, meals.length]);

  const renameMeal = useCallback(
    async (mealId: string, newName: string) => {
      if (!user || !db) return;
      await updateDoc(
        doc(db, `users/${user.uid}/daily_logs/${dateStr}/meals/${mealId}`),
        { name: newName }
      );
    },
    [user, db, dateStr]
  );

  const deleteMeal = useCallback(
    async (mealId: string) => {
      if (!user || !db || !dailyLog) return;
      const batch = writeBatch(db);
      batch.delete(
        doc(db, `users/${user.uid}/daily_logs/${dateStr}/meals/${mealId}`)
      );
      batch.update(doc(db, `users/${user.uid}/daily_logs/${dateStr}`), {
        mealCount: Math.max(0, dailyLog.mealCount - 1),
      });
      meals
        .filter((meal) => meal.id !== mealId)
        .forEach((meal, index) => {
          batch.update(
            doc(db, `users/${user.uid}/daily_logs/${dateStr}/meals/${meal.id}`),
            { order: index }
          );
        });
      await batch.commit();
    },
    [user, db, dateStr, dailyLog, meals]
  );

  const addWater = useCallback(
    async (amountMl: number) => {
      if (!user || !db || !dailyLog) return;
      await updateDoc(doc(db, `users/${user.uid}/daily_logs/${dateStr}`), {
        waterLoggedMl: (dailyLog.waterLoggedMl || 0) + amountMl,
      });
    },
    [user, db, dateStr, dailyLog]
  );

  const saveWorkout = useCallback(
    async (durationMinutes: number, caloriesBurned: number) => {
      if (!user || !db || !dailyLog) return;
      await updateDoc(doc(db, `users/${user.uid}/daily_logs/${dateStr}`), {
        workoutSummary: {
          durationMinutes:
            (dailyLog.workoutSummary?.durationMinutes || 0) + durationMinutes,
          caloriesBurned:
            (dailyLog.workoutSummary?.caloriesBurned || 0) + caloriesBurned,
        },
      });
    },
    [user, db, dateStr, dailyLog]
  );

  const saveFoodsToMeal = useCallback(
    async (mealId: string, newFoods: Omit<FoodItem, "id">[]) => {
      if (!user || !db || !dailyLog) return;
      const meal = meals.find((item) => item.id === mealId);
      if (!meal) return;

      const updatedFoods: FoodItem[] = [
        ...meal.foods,
        ...newFoods.map((food) => ({ ...food, id: newId() })),
      ];
      const newMealTotals = sumFoods(updatedFoods);
      const batch = writeBatch(db);
      batch.update(
        doc(db, `users/${user.uid}/daily_logs/${dateStr}/meals/${mealId}`),
        { foods: updatedFoods, totals: newMealTotals }
      );
      batch.update(doc(db, `users/${user.uid}/daily_logs/${dateStr}`), {
        "nutritionSummary.calories":
          dailyLog.nutritionSummary.calories +
          (newMealTotals.calories - meal.totals.calories),
        "nutritionSummary.protein":
          dailyLog.nutritionSummary.protein +
          (newMealTotals.protein - meal.totals.protein),
        "nutritionSummary.carbs":
          dailyLog.nutritionSummary.carbs +
          (newMealTotals.carbs - meal.totals.carbs),
        "nutritionSummary.fat":
          dailyLog.nutritionSummary.fat + (newMealTotals.fat - meal.totals.fat),
        "nutritionSummary.fiber":
          (dailyLog.nutritionSummary.fiber || 0) +
          (newMealTotals.fiber - (meal.totals.fiber || 0)),
      });
      await batch.commit();
    },
    [user, db, dateStr, dailyLog, meals]
  );

  const removeFoodFromMeal = useCallback(
    async (mealId: string, foodId: string) => {
      if (!user || !db || !dailyLog) return;
      const meal = meals.find((item) => item.id === mealId);
      if (!meal) return;

      const updatedFoods = meal.foods.filter((food) => food.id !== foodId);
      const newMealTotals = sumFoods(updatedFoods);
      const batch = writeBatch(db);
      batch.update(
        doc(db, `users/${user.uid}/daily_logs/${dateStr}/meals/${mealId}`),
        { foods: updatedFoods, totals: newMealTotals }
      );
      batch.update(doc(db, `users/${user.uid}/daily_logs/${dateStr}`), {
        "nutritionSummary.calories":
          dailyLog.nutritionSummary.calories +
          (newMealTotals.calories - meal.totals.calories),
        "nutritionSummary.protein":
          dailyLog.nutritionSummary.protein +
          (newMealTotals.protein - meal.totals.protein),
        "nutritionSummary.carbs":
          dailyLog.nutritionSummary.carbs +
          (newMealTotals.carbs - meal.totals.carbs),
        "nutritionSummary.fat":
          dailyLog.nutritionSummary.fat + (newMealTotals.fat - meal.totals.fat),
        "nutritionSummary.fiber":
          (dailyLog.nutritionSummary.fiber || 0) +
          (newMealTotals.fiber - (meal.totals.fiber || 0)),
      });
      await batch.commit();
    },
    [user, db, dateStr, dailyLog, meals]
  );

  return {
    dailyLog,
    meals,
    loading,
    initializeDay,
    addMealSlot,
    renameMeal,
    deleteMeal,
    addWater,
    saveWorkout,
    saveFoodsToMeal,
    removeFoodFromMeal,
  };
}
