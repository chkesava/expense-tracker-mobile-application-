import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { GOAL_FUNDING_PLANS_COLLECTION } from "@/services/goals/goalFundingPlanStore";
import { sortPlans, type GoalFundingPlan } from "@/shared/utils/goalFundingPlans";

/** Saved goal funding plans (SPENDLY-220). Mounted on the optimizer screen only; duress-aware uid. */
export function useGoalFundingPlans() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [plans, setPlans] = useState<GoalFundingPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setPlans([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/${GOAL_FUNDING_PLANS_COLLECTION}`;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, GOAL_FUNDING_PLANS_COLLECTION),
      (snap) => {
        setPlans(
          sortPlans(
            snap.docs.map((d) => {
              const data = d.data() as Omit<GoalFundingPlan, "id">;
              return { ...data, id: d.id, inputs: Array.isArray(data.inputs) ? data.inputs : [], goalSnapshot: Array.isArray(data.goalSnapshot) ? data.goalSnapshot : [] };
            })
          )
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.goalFundingPlans",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your saved plans."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, attempt]);

  return { uid, plans, loading, error, retry };
}
