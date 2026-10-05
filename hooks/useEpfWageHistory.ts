/**
 * Effective-dated EPF wage history for one establishment — SPENDLY-389.
 *
 * A sibling of `useEpfContributions`, not an extension of it: wage history is
 * its own small collection, scoped by `establishmentId` the same way. Thin by
 * design — all decision logic lives in `shared/features/epf/utils/wageHistory.ts`,
 * because `vitest.config.ts` never runs `hooks/**`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from "firebase/firestore";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import type { EpfWageHistoryEntry } from "@/shared/features/epf/types";
import { EPF_WAGE_HISTORY_COLLECTION } from "@/shared/features/epf/types";
import {
  normalizeWageHistoryEntry,
  sortWageHistoryByEffectiveFrom,
  wageHistoryWritePayload,
} from "@/shared/features/epf/utils/wageHistory";
import { withoutUndefined } from "@/shared/utils/objects";

export function useEpfWageHistory(establishmentId: string | undefined) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [history, setHistory] = useState<EpfWageHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const {
    error: historyError,
    setError: setHistoryError,
    retry: retryHistory,
    attempt,
  } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !establishmentId || !db) {
      setHistory([]);
      setHistoryLoading(false);
      return;
    }

    setHistoryLoading(true);
    const path = `users/${uid}/${EPF_WAGE_HISTORY_COLLECTION}`;
    const q = query(
      collection(db, "users", uid, EPF_WAGE_HISTORY_COLLECTION),
      where("establishmentId", "==", establishmentId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        logQuerySnapshot(path, snapshot);
        setHistory(
          sortWageHistoryByEffectiveFrom(
            snapshot.docs.map((docSnap) =>
              normalizeWageHistoryEntry(docSnap.id, docSnap.data() as Record<string, unknown>)
            )
          )
        );
        setHistoryError(null);
        setHistoryLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.epfWageHistory",
        (failure) => {
          setHistoryError(failure);
          setHistoryLoading(false);
        },
        "Couldn't load your EPF wage history."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, establishmentId, attempt]);

  const byEffectiveMonth = useMemo(
    () => new Map(history.map((entry) => [entry.effectiveFromMonth, entry])),
    [history]
  );

  const addWageChange = useCallback(
    async (
      entry: Omit<EpfWageHistoryEntry, "id" | "createdAtMs" | "updatedAtMs">
    ): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !establishmentId) {
        toast.error("Not authenticated");
        return false;
      }

      try {
        const ref = doc(collection(db, "users", uid, EPF_WAGE_HISTORY_COLLECTION));
        const now = Date.now();
        const outcome = await commitWrite(
          () =>
            setDoc(
              ref,
              withoutUndefined({
                ...wageHistoryWritePayload(entry),
                createdAtMs: now,
                updatedAtMs: now,
              })
            ),
          { label: "EPF wage change" }
        );
        toast.success(writeSavedMessage(outcome, "Wage change saved"));
        return true;
      } catch (err) {
        logError("epfwagehistory.addwagechange", err);
        toast.error(friendlyErrorMessage(err, "Couldn't save the wage change."));
        return false;
      }
    },
    [uid, establishmentId]
  );

  const removeWageChange = useCallback(
    async (id: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !establishmentId) {
        toast.error("Not authenticated");
        return false;
      }

      try {
        const ref = doc(db, "users", uid, EPF_WAGE_HISTORY_COLLECTION, id);
        const outcome = await commitWrite(() => deleteDoc(ref), { label: "EPF wage change" });
        toast.success(writeSavedMessage(outcome, "Wage change removed"));
        return true;
      } catch (err) {
        logError("epfwagehistory.removewagechange", err);
        toast.error("Couldn't remove that wage change");
        return false;
      }
    },
    [uid, establishmentId]
  );

  return {
    history,
    byEffectiveMonth,
    historyLoading,
    historyError,
    retryHistory,
    addWageChange,
    removeWageChange,
  };
}
