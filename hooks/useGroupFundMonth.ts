import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "@/lib/firestore";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { isLocalTestMode } from "@/lib/env";
import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { GROUP_FUND_MONTH_LIMIT } from "@/lib/readModel/groupFundSources";
import { readGroupFundMonth } from "@/lib/readModel/groupFundsReadPath";
import { useAuth } from "@/providers/AuthProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { GroupFundEvent } from "@/shared/types/groupFund";
import { groupFundEventFromDoc } from "@/shared/utils/groupFundDocs";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";

/**
 * One Group Fund's events for one month (SPENDLY-688), for the month view:
 * who paid, who partly paid, who didn't. One bounded read — `fundId == f and
 * period == M` (equality only, so no composite index) — never one per member.
 *
 * `firestore` (default) keeps a live listener, so a contribution recorded on
 * the screen shows at once. Under `readModel.groupFundHistory = "supabase"`
 * the month comes from the read model, re-read whenever the fund changes
 * (`fundVersion`), and falls back to the listener on any failure.
 */
export function useGroupFundMonth(fundId: string | undefined, period: string, fundVersion?: number) {
  const { user, isDuress } = useAuth();
  const uid = user?.uid;
  const { isOnline } = useNetwork();
  const { settings } = useSystemSettings();
  const readModelOn = configuredReadModelMode(settings.readModel, "groupFundHistory") === "supabase";
  const [events, setEvents] = useState<GroupFundEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    setEvents([]);
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
          setEvents(
            snap.docs
              .map((d) => groupFundEventFromDoc(d.id, d.data() as Record<string, unknown>))
              .filter((e): e is GroupFundEvent => !!e)
          );
          setError(null);
          setLoading(false);
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
  }, [uid, fundId, period, readModelOn, readModelOn ? fundVersion : 0, attempt, setError]);

  return { events, loading, error, retry };
}
