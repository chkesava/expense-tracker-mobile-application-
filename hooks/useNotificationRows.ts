/**
 * The user's recent in-app notification rows (SPENDLY-230), for the unified
 * inbox and the SIP notifications sheet. Reads through the per-collection
 * read switch (`readModel.notifications`): Firestore by default (the newest
 * rows only), the on-device copy in `supabase` mode with no Firestore
 * listener mounted. Duress-aware uid; nothing while signed out.
 */

import { useCallback, useEffect, useState } from "react";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { collection, doc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from "@/lib/firestore";
import { logError } from "@/lib/errors";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { noteDirectWrites, trackedBatch } from "@/lib/readModelWriteHooks";
import { useAuth } from "@/providers/AuthProvider";
import {
  NOTIFICATIONS_COLLECTION,
  NOTIFICATION_ROWS_LIMIT,
  recentNotificationRows,
  type NotificationRow,
} from "@/shared/utils/notificationRows";

export function useNotificationRows(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();
  const rowsSource = useReadModelSource("notifications");

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const path = `users/${uid}/${NOTIFICATIONS_COLLECTION}`;
    const apply = (docs: SourceDoc[]) => {
      setRows(recentNotificationRows(docs.map((d) => ({ id: d.id, data: d.data as Record<string, unknown> }))));
      setError(null);
      setLoading(false);
    };
    if (rowsSource.mode === "supabase") return rowsSource.subscribe(apply);
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, NOTIFICATIONS_COLLECTION), orderBy("createdAt", "desc"), limit(NOTIFICATION_ROWS_LIMIT)),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (rowsSource.mode === "shadow") void rowsSource.shadow(docs);
      },
      snapshotErrorHandler(
        "snapshot.notifications",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your notifications."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt, rowsSource.mode]);

  /** Marks rows read on every device (stamps updatedAt, tells the read model). */
  const markRead = useCallback(
    async (ids: readonly string[]) => {
      const db = getFirestoreDb();
      if (!uid || !db || ids.length === 0) return;
      try {
        const batch = trackedBatch(writeBatch(db));
        for (const id of ids) {
          batch.update(doc(db, "users", uid, NOTIFICATIONS_COLLECTION, id), { read: true, updatedAt: serverTimestamp() });
        }
        await batch.commit();
        noteDirectWrites(uid, batch.writtenPaths());
      } catch (err) {
        logError("notifications.markRead", err);
      }
    },
    [uid]
  );

  /** Deletes every row (the SIP sheet's "Clear all"). */
  const clearAll = useCallback(async (): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db) return false;
    try {
      const snapshot = await getDocs(collection(db, "users", uid, NOTIFICATIONS_COLLECTION));
      const batch = trackedBatch(writeBatch(db));
      snapshot.forEach((d) => {
        batch.delete(d.ref);
      });
      await batch.commit();
      noteDirectWrites(uid, batch.writtenPaths());
      return true;
    } catch (err) {
      logError("notifications.clearAll", err);
      return false;
    }
  }, [uid]);

  return { rows, loading, error, retry, markRead, clearAll };
}
