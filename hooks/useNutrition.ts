import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  setDoc,
  updateDoc,
  getDoc,
  query,
} from 'firebase/firestore';

import { getFirestoreDb } from '@/lib/firebase';
import { useAuth } from '@/providers/AuthProvider';
import {
  NutritionProfile,
  NutritionGoals,
  DailyLogSummary,
  Meal,
  WorkoutEntry,
  WeightEntry,
  FoodItem,
} from '@/shared/types/nutrition';

function calculateGoals(profile: NutritionProfile): NutritionGoals {
  const { gender, weightKg, heightCm, age, activityLevel, goal } = profile;

  let bmr = 0;
  if (gender === 'male') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
  } else if (gender === 'female') {
    bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
  } else {
    // Average
    const maleBmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    const femaleBmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    bmr = (maleBmr + femaleBmr) / 2;
  }

  let activityMultiplier = 1.2;
  switch (activityLevel) {
    case 'sedentary':
      activityMultiplier = 1.2;
      break;
    case 'light':
      activityMultiplier = 1.375;
      break;
    case 'moderate':
      activityMultiplier = 1.55;
      break;
    case 'active':
      activityMultiplier = 1.725;
      break;
    case 'very_active':
      activityMultiplier = 1.9;
      break;
  }

  const maintenanceCalories = Math.round(bmr * activityMultiplier);
  let targetCalories = maintenanceCalories;

  if (goal === 'fat_loss') {
    targetCalories -= 500;
  } else if (goal === 'muscle_gain' || goal === 'lean_bulk') {
    targetCalories += 300;
  }

  const proteinGrams = Math.round(weightKg * 2);
  const fatGrams = Math.round((targetCalories * 0.25) / 9);
  const proteinCalories = proteinGrams * 4;
  const fatCalories = fatGrams * 9;
  const remainingCalories = targetCalories - proteinCalories - fatCalories;
  const carbsGrams = Math.max(0, Math.round(remainingCalories / 4));
  
  const waterMl = Math.round(weightKg * 35); // 35 ml per kg

  return {
    maintenanceCalories,
    targetCalories,
    proteinGrams,
    carbsGrams,
    fatGrams,
    waterMl,
  };
}

export function useNutrition(dateStr: string) { // dateStr in YYYY-MM-DD
  const { user } = useAuth();
  const db = getFirestoreDb();
  
  const [profile, setProfile] = useState<NutritionProfile | null>(null);
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [dailyLog, setDailyLog] = useState<DailyLogSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setLoading(false);
      return;
    }

    const uid = user.uid;
    const profileRef = doc(db, `users/${uid}/nutritionProfile`, 'current');
    
    const unsubProfile = onSnapshot(profileRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as NutritionProfile & { goals?: NutritionGoals };
        const { goals: savedGoals, ...profData } = data;
        setProfile(profData as NutritionProfile);
        if (savedGoals) {
          setGoals(savedGoals);
        } else {
          setGoals(calculateGoals(profData as NutritionProfile));
        }
      } else {
        setProfile(null);
        setGoals(null);
      }
    });

    const dailyLogRef = doc(db, `users/${uid}/daily_logs`, dateStr);
    const unsubDailyLog = onSnapshot(dailyLogRef, (docSnap) => {
      if (docSnap.exists()) {
        setDailyLog(docSnap.data() as DailyLogSummary);
      } else {
        setDailyLog({
          date: dateStr,
          mealCount: 0,
          nutritionSummary: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
          waterLoggedMl: 0,
          workoutSummary: { durationMinutes: 0, caloriesBurned: 0 },
        });
      }
      setLoading(false);
    });

    return () => {
      unsubProfile();
      unsubDailyLog();
    };
  }, [user, db, dateStr]);

  const saveProfile = useCallback(async (newProfile: NutritionProfile) => {
    if (!user || !db) return;
    const uid = user.uid;
    const computedGoals = calculateGoals(newProfile);
    const profileRef = doc(db, `users/${uid}/nutritionProfile`, 'current');
    
    await setDoc(profileRef, {
      ...newProfile,
      goals: computedGoals,
    });
  }, [user, db]);

  const logMeal = useCallback(async (meal: Meal) => {
    if (!user || !db) return;
    const uid = user.uid;
    const dailyLogRef = doc(db, `users/${uid}/daily_logs`, dateStr);
    
    const snap = await getDoc(dailyLogRef);
    if (!snap.exists()) {
      await setDoc(dailyLogRef, {
        date: dateStr,
        mealCount: 1,
        nutritionSummary: meal.totals,
        waterLoggedMl: 0,
        workoutSummary: { durationMinutes: 0, caloriesBurned: 0 },
        meals: [meal],
      });
    } else {
      const data = snap.data();
      const meals = data.meals || [];
      meals.push(meal);
      
      const newTotals = {
        calories: data.nutritionSummary.calories + meal.totals.calories,
        protein: data.nutritionSummary.protein + meal.totals.protein,
        carbs: data.nutritionSummary.carbs + meal.totals.carbs,
        fat: data.nutritionSummary.fat + meal.totals.fat,
        fiber: data.nutritionSummary.fiber + meal.totals.fiber,
      };

      await updateDoc(dailyLogRef, {
        mealCount: data.mealCount + 1,
        nutritionSummary: newTotals,
        meals,
      });
    }
  }, [user, db, dateStr]);

  const logWater = useCallback(async (amountMl: number) => {
    if (!user || !db) return;
    const uid = user.uid;
    const dailyLogRef = doc(db, `users/${uid}/daily_logs`, dateStr);
    
    const snap = await getDoc(dailyLogRef);
    if (!snap.exists()) {
      await setDoc(dailyLogRef, {
        date: dateStr,
        mealCount: 0,
        nutritionSummary: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
        waterLoggedMl: amountMl,
        workoutSummary: { durationMinutes: 0, caloriesBurned: 0 },
      });
    } else {
      const data = snap.data();
      await updateDoc(dailyLogRef, {
        waterLoggedMl: (data.waterLoggedMl || 0) + amountMl,
      });
    }
  }, [user, db, dateStr]);

  const logWeight = useCallback(async (weightEntry: WeightEntry) => {
    if (!user || !db) return;
    const uid = user.uid;
    const weightRef = doc(db, `users/${uid}/weight_logs`, weightEntry.id || Date.now().toString());
    
    await setDoc(weightRef, weightEntry);
    
    if (profile) {
      // Also update current weight in profile
      const newProfile = { ...profile, weightKg: weightEntry.weightKg };
      await saveProfile(newProfile);
    }
  }, [user, db, profile, saveProfile]);

  return {
    profile,
    goals,
    dailyLog,
    loading,
    saveProfile,
    logMeal,
    logWater,
    logWeight,
  };
}
