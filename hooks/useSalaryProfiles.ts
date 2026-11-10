import { useEffect, useState } from "react";
import { collection, onSnapshot } from "@/lib/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import type { SalaryProfile } from "@/shared/features/salary/types";

/**
 * Loads user salary profiles (SPENDLY-325, SPENDLY-333).
 * Dual-store aware: reads from Firestore by default, or Supabase via read-model local copy.
 */
export function useSalaryProfiles(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [profiles, setProfiles] = useState<SalaryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();
  const profilesSource = useReadModelSource("salaryProfiles");

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setProfiles([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/salaryProfiles`;

    const applyProfiles = (docs: SourceDoc[]) => {
      const list: SalaryProfile[] = [];
      for (const d of docs) {
        const data = d.data as Omit<SalaryProfile, "id">;
        if (!data) continue;
        list.push({ ...data, id: d.id });
      }
      setProfiles(list);
      setError(null);
      setLoading(false);
    };

    if (profilesSource.mode === "supabase") return profilesSource.subscribe(applyProfiles);

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "salaryProfiles"),
      (snap) => {
        const docs = toSourceDocs(snap);
        applyProfiles(docs);
        if (profilesSource.mode === "shadow") void profilesSource.shadow(docs);
      },
      snapshotErrorHandler(
        "snapshot.salaryProfiles",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your salary profile."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt, profilesSource.mode]);

  const primaryProfile = profiles.find((p) => p.primaryEmployer) || profiles[0] || null;

  return { profiles, primaryProfile, loading, error, retry };
}
