import { useEffect, useMemo, useRef, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "@/lib/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { isLocalTestMode } from "@/lib/env";
import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { GROUP_FUND_MONTH_LIMIT } from "@/lib/readModel/groupFundSources";
import { readGroupFundMonth, shadowCompareGroupFundMonth } from "@/lib/readModel/groupFundsReadPath";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { GroupFundEvent } from "@/shared/types/groupFund";
import { groupFundEventFromDoc } from "@/shared/utils/groupFundDocs";
import { overlayLocalRows } from "@/shared/utils/readModelOverlay";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";

/**
 * One Group Fund's events for one month (SPENDLY-688), for the month view:
 * who paid, who partly paid, who didn't. One bounded read — `fundId == f and
 * period == M` (equality only, so no composite index) — never one per member.
 *
 * `firestore` (default) keeps a live listener, so a contribution recorded on
 * the screen shows at once. Under `readModel.groupFundHistory = "supabase"`
 * the month comes from the read model, re-read whenever the fund changes
 * (`fundVersion`), and falls back to the listener on any failure. Rows from
 * the copy get this device's newer events (`recent`, the history's live
 * Firestore window) laid over them, so a payment just recorded never shows as
 * owing while the copy catches up (READ_MODEL_RULES R3.4). In `shadow` the
 * listener serves and the copy is compared in the background.
 */
export function useGroupFundMonth(
  fundId: string | undefined,
  period: string,
  fundVersion?: number,
  recent: readonly GroupFundEvent[] = []
) {
  const { user, isDuress } = useAuth();
  const uid = user?.uid;
  const { isOnline } = useNetwork();
  const { settings } = useSystemSettings();
  const configuredMode = configuredReadModelMode(settings.readModel, "groupFundHistory");
  const readModelOn = configuredMode === "supabase";
  const [events, setEvents] = useState<GroupFundEvent[]>([]);
  const [fromCopy, setFromCopy] = useState(false);
  const shadowedRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    setEvents([]);
    setFromCopy(false);
    if (!uid || !db || !fundId || !/^\d{4}-\d{2}$/.test(period)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let unsubscribe: (() => void) | null = null;
    let live = true;
    const path = `users/${uid}/groupFundEvents?fundId=${fundId}&period=${period}`;

    const listen = () => {
      const q = query(
        collection(db, "users", uid, "groupFundEvents"),
        where("fundId", "==", fundId),
        where("period", "==", period),
        limit(GROUP_FUND_MONTH_LIMIT)
      );
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          logQuerySnapshot(path, snap, { feature: "groupFunds", queryShape: "fund month" });
          const rows = snap.docs
            .map((d) => groupFundEventFromDoc(d.id, d.data() as Record<string, unknown>))
            .filter((e): e is GroupFundEvent => !!e);
          setEvents(rows);
          setFromCopy(false);
          setError(null);
          setLoading(false);
          // Shadow: compare the copy once per fund and month, from server data.
          const key = `${fundId}|${period}`;
          if (configuredMode === "shadow" && user && !snap.metadata.fromCache && shadowedRef.current !== key) {
            shadowedRef.current = key;
            void shadowCompareGroupFundMonth({
              db,
              user,
              fundId,
              period,
              firestoreEvents: rows,
              conditions: { setting: settings.readModel, online: isOnline, duress: isDuress, localTestMode: isLocalTestMode() },
            }).catch((failure) => logError("groupFundMonth.shadow", failure));
          }
        },
        snapshotErrorHandler(
          "snapshot.groupFundMonth",
          (failure) => {
            setError(failure);
            setLoading(false);
          },
          "Couldn't load this month."
        )
      );
    };

    if (readModelOn && user) {
      void readGroupFundMonth({
        db,
        user,
        fundId,
        period,
        conditions: { setting: settings.readModel, online: isOnline, duress: isDuress, localTestMode: isLocalTestMode() },
      })
        .then((rows) => {
          if (!live) return;
          if (rows) {
            setEvents(rows);
            setFromCopy(true);
            setError(null);
            setLoading(false);
          } else listen();
        })
        .catch((failure) => {
          logError("groupFundMonth.readModel", failure);
          if (live) listen();
        });
    } else {
      listen();
    }

    return () => {
      live = false;
      forgetSnapshotPath(path);
      unsubscribe?.();
    };
    // `fundVersion` re-reads the copy after a write; the listener updates by itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, fundId, period, readModelOn, configuredMode, readModelOn ? fundVersion : 0, attempt, setError]);

  // R3.4: the copy may lag this device's own writes; the live window doesn't.
  const merged = useMemo(() => {
    if (!fromCopy) return events;
    const mine = recent.filter((e) => e.fundId === fundId && (e.period ?? e.date.slice(0, 7)) === period);
    return mine.length === 0 ? events : overlayLocalRows(events, [...mine]).rows;
  }, [fromCopy, events, recent, fundId, period]);

  return { events: merged, loading, error, retry };
}
