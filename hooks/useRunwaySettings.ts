import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { RUNWAY_SETTINGS_COLLECTION } from "@/services/runway/runwaySettingsStore";
import { DEFAULT_RUNWAY_SETTINGS, RUNWAY_SETTINGS_DOC_ID, normalizeRunwaySettings, type RunwaySettings } from "@/shared/utils/runwaySettings";

/** The user's runway preferences (SPENDLY-210). Mounted only on the runway screen. */
export function useRunwaySettings() {
  const { user } = useAuth();
  const uid = user?.uid;
  const [settings, setSettings] = useState<RunwaySettings>(DEFAULT_RUNWAY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setSettings(DEFAULT_RUNWAY_SETTINGS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/${RUNWAY_SETTINGS_COLLECTION}/${RUNWAY_SETTINGS_DOC_ID}`;
    const unsubscribe = onSnapshot(
      doc(db, "users", uid, RUNWAY_SETTINGS_COLLECTION, RUNWAY_SETTINGS_DOC_ID),
      (snap) => {
        setSettings(normalizeRunwaySettings(snap.exists() ? snap.data() : undefined));
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.runwaySettings",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your runway settings."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, attempt]);

  return { uid, settings, loading, error, retry };
}
