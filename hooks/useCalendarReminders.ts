import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { CALENDAR_REMINDERS_COLLECTION } from "@/services/calendar/reminderStore";
import type { CalendarReminder } from "@/shared/types/calendarReminder";

/** The user's calendar reminders (SPENDLY-183). Mounted on calendar screens only; duress-aware uid. */
export function useCalendarReminders(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [reminders, setReminders] = useState<CalendarReminder[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setReminders([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/${CALENDAR_REMINDERS_COLLECTION}`;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, CALENDAR_REMINDERS_COLLECTION),
      (snap) => {
        setReminders(
          snap.docs.map((d) => {
            const data = d.data() as Omit<CalendarReminder, "id">;
            return { ...data, id: d.id, completedDates: Array.isArray(data.completedDates) ? data.completedDates : [] };
          })
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.calendarReminders",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your reminders."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt]);

  return { uid, reminders, loading, error, retry };
}
