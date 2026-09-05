import { useMemo } from "react";
import { where } from "firebase/firestore";

import { useGaneshCollection } from "@/hooks/ganesh/useGaneshCollection";
import { useGaneshSession } from "@/providers/GaneshSessionProvider";
import { useAuth } from "@/providers/AuthProvider";
import type {
  CashAdjustment,
  CashReconciliation,
  CollectionSession,
} from "@/shared/types/ganeshSessions";
import { festivalCol } from "@/shared/utils/ganeshPaths";

/**
 * Collection sessions and their cash counts (GS-076, GS-075).
 *
 * All three listeners are bounded, per GS-065: a Pandal accumulates one session
 * per collector per collection day, so a busy festival is in the low hundreds
 * and the caps below are an upper bound on a runaway query rather than a page
 * size.
 */

export function useCollectionSessions(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, retry } = useGaneshCollection<CollectionSession>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "collectionSessions") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<CollectionSession, "id">),
      pendingWrite,
    }),
    { orderByField: "startedAt", orderDirection: "desc", limitTo: 400 }
  );
  return { sessions: items, loading, error, retry };
}

/**
 * The signed-in collector's own open session, if they have one.
 *
 * Derived from the same subscription rather than its own query — a collector
 * has at most one open session, and filtering a list already in memory is
 * cheaper than a second listener.
 */
export function useMyOpenSession() {
  const { pandalId, festivalId } = useGaneshSession();
  const { realUser } = useAuth();
  const { sessions, loading, error } = useCollectionSessions(pandalId, festivalId);

  const session = useMemo(
    () =>
      sessions.find(
        (row) => row.status === "open" && row.collectorId === realUser?.uid
      ) ?? null,
    [sessions, realUser?.uid]
  );

  return { session, loading, error };
}

/** Sessions waiting for someone to count their cash. */
export function useSessionsAwaitingCount(
  pandalId: string | null,
  festivalId: string | null
) {
  const { sessions, loading, error } = useCollectionSessions(pandalId, festivalId);
  const awaiting = useMemo(
    () => sessions.filter((row) => row.status === "closed"),
    [sessions]
  );
  return { sessions: awaiting, loading, error };
}

export function useReconciliations(pandalId: string | null, festivalId: string | null) {
  const { items, loading, error, retry } = useGaneshCollection<CashReconciliation>(
    pandalId && festivalId ? festivalCol(pandalId, festivalId, "reconciliations") : null,
    (id, data, pendingWrite) => ({
      id,
      ...(data as Omit<CashReconciliation, "id">),
      pendingWrite,
    }),
    { orderByField: "approvedAt", orderDirection: "desc", limitTo: 400 }
  );
  return { reconciliations: items, loading, error, retry };
}

/**
 * The adjustments recorded against one reconciliation.
 *
 * Queried per reconciliation rather than filtered client-side out of a capped
 * Pandal-wide feed — that is the defect GS-067 was about, and an incomplete
 * list of corrections to a cash discrepancy would be worse than none.
 */
export function useReconciliationAdjustments(
  pandalId: string | null,
  festivalId: string | null,
  reconciliationId: string | null
) {
  const extra = useMemo(
    () => (reconciliationId ? [where("reconciliationId", "==", reconciliationId)] : []),
    [reconciliationId]
  );
  const { items, loading, error } = useGaneshCollection<CashAdjustment>(
    pandalId && festivalId && reconciliationId
      ? festivalCol(pandalId, festivalId, "cashAdjustments")
      : null,
    (id, data) => ({ id, ...(data as Omit<CashAdjustment, "id">) }),
    { extra, extraKey: reconciliationId ?? "", limitTo: 100 }
  );
  return { adjustments: items, loading, error };
}
