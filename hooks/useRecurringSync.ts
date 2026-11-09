/**
 * Queue the server's recurring-merchant suggestions for review.
 *
 * SPENDLY-744 (epic SPENDLY-735): the app no longer detects. The server's
 * recurring-weekly job runs the detector over the whole ledger and stores the
 * result at users/{uid}/recurringSuggestions; this reads them through the
 * per-collection read switch (`readModel.recurringSuggestions`: Firestore by
 * default, the on-device copy in `supabase` mode with no Firestore listener)
 * and hands them to the existing review queue, which still drops anything
 * already subscribed or dismissed on this device.
 */

import { useEffect, useRef } from "react";

import { useReadModelSource } from "@/hooks/useReadModelSource";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { getFirestoreDb } from "@/lib/firebase";
import { collection, onSnapshot } from "@/lib/firestore";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { useAuth } from "@/providers/AuthProvider";
import type { RecurringPattern } from "@/services/recurring/recurringDetector";
import {
  patternFromSuggestionDoc,
  RECURRING_SUGGESTIONS_COLLECTION,
} from "@/shared/utils/recurringSuggestions";

export function useRecurringSync() {
  const { user, isDuress } = useAuth();
  const { subscriptions, loading: subsLoading } = useSubscriptions();
  const source = useReadModelSource("recurringSuggestions");
  const lastKey = useRef("");
  const subscriptionsRef = useRef(subscriptions);
  subscriptionsRef.current = subscriptions;

  const uid = user?.uid;
  const ready = Boolean(uid) && !isDuress && !subsLoading;

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !ready || !db) return;
    const apply = (docs: SourceDoc[]) => {
      const patterns = docs.map((d) => patternFromSuggestionDoc(d.data as Record<string, unknown>) as RecurringPattern);
      const key = `${uid}:${subscriptionsRef.current.length}:${patterns.map((p) => p.key).sort().join(",")}`;
      if (lastKey.current === key) return;
      lastKey.current = key;
      void import("@/services/recurring/recurringSync")
        .then((m) => m.syncRecurringFromServer(uid, patterns, subscriptionsRef.current))
        .catch(() => undefined);
    };
    if (source.mode === "supabase") return source.subscribe(apply);
    const path = `users/${uid}/${RECURRING_SUGGESTIONS_COLLECTION}`;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, RECURRING_SUGGESTIONS_COLLECTION),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (source.mode === "shadow") void source.shadow(docs);
      },
      snapshotErrorHandler("snapshot.recurringSuggestions", () => undefined, "Couldn't load recurring suggestions.")
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, ready, source.mode, subscriptions.length]);
}
