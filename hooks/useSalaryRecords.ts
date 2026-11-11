import { useEffect, useState } from "react";
import { collection, onSnapshot } from "@/lib/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import type { SalaryRecord } from "@/shared/features/salary/types";

/**
 * Loads canonical salary records for the current user (SPENDLY-325, SPENDLY-333).
 * Dual-store aware: reads from Firestore by default, or Supabase via read-model local copy.
 */
export function useSalaryRecords(options?: { enabled?: boolean; copy?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [records, setRecords] = useState<SalaryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();
  const recordsSource = useReadModelSource("salaryRecords", { copy: options?.copy });

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setRecords([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/salaryRecords`;

    const applyRecords = (docs: SourceDoc[]) => {
      const active: SalaryRecord[] = [];
      for (const d of docs) {
        const data = d.data as Omit<SalaryRecord, "id">;
        if (!data || data.deletedAt || data.status === "rejected") continue;
        active.push({ ...data, id: d.id });
      }
      active.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
      setRecords(active);
      setError(null);
      setLoading(false);
    };

    if (recordsSource.mode === "supabase") return recordsSource.subscribe(applyRecords);

    const unsubscribe = onSnapshot(
      collection(db, "users", uid, "salaryRecords"),
      (snap) => {
        const docs = toSourceDocs(snap);
        applyRecords(docs);
        if (recordsSource.mode === "shadow") void recordsSource.shadow(docs);
      },
      snapshotErrorHandler(
        "snapshot.salaryRecords",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your salary records."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt, recordsSource.mode]);

  return { records, loading, error, retry };
}
