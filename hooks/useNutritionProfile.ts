import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import type { NutritionGoals, NutritionProfile } from "@/shared/types/nutrition";
import { calculateNutritionGoals } from "@/shared/utils/nutritionGoals";

export { calculateNutritionGoals };

export function useNutritionProfile() {
  const { user } = useAuth();
  const db = getFirestoreDb();
  const [profile, setProfile] = useState<NutritionProfile | null>(null);
  const [goals, setGoals] = useState<NutritionGoals | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !db) {
      setProfile(null);
      setGoals(null);
      setLoading(false);
      return;
    }

    const profileRef = doc(db, `users/${user.uid}/profile/nutrition`);
    const goalsRef = doc(db, `users/${user.uid}/goals/nutrition`);

    const unsubProfile = onSnapshot(
      profileRef,
      (snap) => {
        setProfile(snap.exists() ? (snap.data() as NutritionProfile) : null);
        setLoading(false);
      },
      (error) => {
        logError("nutrition.profile.listen", error);
        setLoading(false);
      }
    );

    const unsubGoals = onSnapshot(
      goalsRef,
      (snap) => {
        setGoals(snap.exists() ? (snap.data() as NutritionGoals) : null);
      },
      (error) => {
        logError("nutrition.goals.listen", error);
      }
    );

    return () => {
      unsubProfile();
      unsubGoals();
    };
  }, [user, db]);

  const updateProfileAndGoals = useCallback(
    async (newProfile: NutritionProfile) => {
      if (!user || !db) return;
      const calculatedGoals = calculateNutritionGoals(newProfile);
      await setDoc(doc(db, `users/${user.uid}/profile/nutrition`), newProfile);
      await setDoc(doc(db, `users/${user.uid}/goals/nutrition`), calculatedGoals);
    },
    [user, db]
  );

  return {
    profile,
    goals,
    loading,
    updateProfileAndGoals,
    calculateNutritionGoals,
  };
}
