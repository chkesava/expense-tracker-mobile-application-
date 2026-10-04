import { useCallback, useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { dismissFeeSignal, restoreFeeSignal } from "@/services/fees/feeSignalStore";
import type { FeeRecord } from "@/shared/types/fee";
import { todayDateKey } from "@/shared/utils/dates";
import {
  activeFeeSignals,
  detectFeeSignals,
  type FeeSignal,
  type FeeSignalDismissal,
} from "@/shared/utils/feeAnomalies";

/**
 * Fee signals for the signed-in user (SPENDLY-319): derived from the fee
 * records the caller already has, minus what the user dismissed. The
 * dismissals listener lives only while a fee surface is mounted.
 */
export function useFeeSignals(records: readonly FeeRecord[] | null) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [dismissals, setDismissals] = useState<FeeSignalDismissal[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { error, setError, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setDismissals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      collection(db, "users", uid, "feeSignalDismissals"),
      (snap) => {
        setDismissals(snap.docs.map((d) => ({ ...(d.data() as Omit<FeeSignalDismissal, "id">), id: d.id })));
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler("snapshot.feeSignalDismissals", (failure) => {
        setError(failure);
        setLoading(false);
      })
    );
  }, [uid, attempt, setError]);

  const all = useMemo(() => (records ? detectFeeSignals(records, todayDateKey()) : []), [records]);
  // If dismissals fail to load, show every signal rather than hide any.
  const active = useMemo(() => activeFeeSignals(all, error ? [] : dismissals), [all, dismissals, error]);
  const dismissed = useMemo(() => {
    const live = new Set(all.map((s) => s.id));
    return dismissals.filter((d) => live.has(d.id));
  }, [all, dismissals]);

  const dismiss = useCallback(
    async (signal: FeeSignal, resolution: "dismissed" | "resolved") => {
      if (!uid || busyId) return false;
      setBusyId(signal.id);
      try {
        const outcome = await dismissFeeSignal(uid, signal, resolution);
        toast.success(writeSavedMessage(outcome, resolution === "resolved" ? "Marked as resolved" : "Dismissed"));
        return true;
      } catch (err) {
        logError("fees.dismissSignal", err);
        toast.error(friendlyErrorMessage(err, "Couldn't save that."));
        return false;
      } finally {
        setBusyId(null);
      }
    },
    [busyId, uid]
  );

  const restore = useCallback(
    async (signalId: string) => {
      if (!uid || busyId) return;
      setBusyId(signalId);
      try {
        const outcome = await restoreFeeSignal(uid, signalId);
        toast.success(writeSavedMessage(outcome, "Signal restored"));
      } catch (err) {
        logError("fees.restoreSignal", err);
        toast.error(friendlyErrorMessage(err, "Couldn't restore that."));
      } finally {
        setBusyId(null);
      }
    },
    [busyId, uid]
  );

  return { all, active, dismissed, loading, busyId, dismiss, restore };
}
