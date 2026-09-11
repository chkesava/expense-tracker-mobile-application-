/**
 * EPF contribution records for one establishment — KAN-66.
 *
 * A separate hook rather than an extension of `useEpf`: contributions are
 * parameterised by establishment and should only be listened to while a history
 * or backfill screen is open, whereas `useEpf` loads on every Investments-tab
 * visit.
 *
 * Thin by design. All decision logic lives in
 * `shared/features/epf/utils/contributions.ts`, because `vitest.config.ts` never
 * runs `hooks/**`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { commitWrite, writeSavedMessage, type WriteOutcome } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import type {
  EpfBackfillRow,
  EpfContribution,
  EpfContributionStatus,
} from "@/shared/features/epf/types";
import { EPF_CONTRIBUTIONS_COLLECTION } from "@/shared/features/epf/types";
import {
  contributionDocId,
  normalizeEpfContribution,
  sortContributionsByMonth,
} from "@/shared/features/epf/utils/contributions";

/** Firestore caps a batch at 500 writes; stay comfortably under it. */
const BATCH_CHUNK_SIZE = 400;

function chunk<T>(items: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

/** Firestore rejects undefined; drop those keys. */
function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) out[key] = val;
  }
  return out as T;
}

export function useEpfContributions(
  establishmentId: string | undefined,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled !== false && Boolean(establishmentId);
  // Duress-aware uid, matching useEpf: a duress session must show no EPF data.
  const { user } = useAuth();
  const uid = user?.uid;

  const [contributions, setContributions] = useState<EpfContribution[]>([]);
  const [contributionsLoading, setContributionsLoading] = useState(true);
  const {
    error: contributionsError,
    setError: setContributionsError,
    retry: retryContributions,
    attempt,
  } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !establishmentId || !db) {
      setContributions([]);
      setContributionsLoading(false);
      return;
    }

    setContributionsLoading(true);
    const path = `users/${uid}/${EPF_CONTRIBUTIONS_COLLECTION}`;
    // Equality filter only — no orderBy, so no composite index is required and
    // a document missing `month` is never silently dropped. Sorted below.
    const q = query(
      collection(db, "users", uid, EPF_CONTRIBUTIONS_COLLECTION),
      where("establishmentId", "==", establishmentId)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        logQuerySnapshot(path, snapshot);
        setContributions(
          sortContributionsByMonth(
            snapshot.docs.map((docSnap) =>
              normalizeEpfContribution(docSnap.id, docSnap.data() as Record<string, unknown>)
            )
          )
        );
        setContributionsError(null);
        setContributionsLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.epfContributions",
        (failure) => {
          setContributionsError(failure);
          setContributionsLoading(false);
        },
        "Couldn't load your EPF contributions."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, establishmentId, attempt]);

  const byMonth = useMemo(
    () => new Map(contributions.map((row) => [row.month, row])),
    [contributions]
  );

  const hasDrafts = useMemo(
    () => contributions.some((row) => row.status === "draft"),
    [contributions]
  );

  /**
   * Write many months at once.
   *
   * Chunked batches rather than one unbounded commit, each wrapped in
   * `commitWrite` so an offline save reports "queued" instead of hanging.
   * Partial success is reported, never swallowed.
   */
  const saveContributions = useCallback(
    async (
      rows: EpfBackfillRow[],
      opts: { status: EpfContributionStatus }
    ): Promise<{ saved: number; failed: number }> => {
      const db = getFirestoreDb();
      if (!uid || !db || !establishmentId) {
        toast.error("Not authenticated");
        return { saved: 0, failed: rows.length };
      }
      if (rows.length === 0) return { saved: 0, failed: 0 };

      let saved = 0;
      let failed = 0;
      let lastOutcome: WriteOutcome = "acked";

      for (const group of chunk(rows, BATCH_CHUNK_SIZE)) {
        try {
          const batch = writeBatch(db);
          for (const row of group) {
            const ref = doc(
              db,
              "users",
              uid,
              EPF_CONTRIBUTIONS_COLLECTION,
              contributionDocId(establishmentId, row.month)
            );
            batch.set(
              ref,
              withoutUndefined({
                establishmentId,
                month: row.month,
                wage: row.wage,
                employeeShare: row.employeeShare,
                employerShare: row.employerShare,
                epsShare: row.epsShare,
                employerEpfShare: row.employerEpfShare,
                totalContribution: row.totalContribution,
                epfCredit: row.epfCredit,
                status: opts.status,
                source: row.source,
                overridden: row.overridden || undefined,
                partialMonth: row.partialMonth || undefined,
                epsEligible: row.epsEligible,
                rulesVersion: row.rulesVersion,
                creditDate: row.creditDate || undefined,
                reference: row.reference || undefined,
                notes: row.notes || undefined,
                zeroReason: row.zeroReason || undefined,
                updatedAt: serverTimestamp(),
                createdAt: byMonth.has(row.month) ? undefined : serverTimestamp(),
              }),
              // Deterministic ids + merge: re-saving converges instead of duplicating.
              { merge: true }
            );
          }

          const outcome = await commitWrite(() => batch.commit(), {
            label: "EPF contributions",
          });
          saved += group.length;
          lastOutcome = outcome;
        } catch (err) {
          failed += group.length;
          logError("epfcontributions.savecontributions", err);
        }
      }

      // One toast for the whole save, not one per chunk.
      if (failed > 0) {
        toast.error(`Saved ${saved} of ${rows.length} months. Try again for the rest.`);
      } else {
        toast.success(
          writeSavedMessage(lastOutcome, `Saved ${saved} month${saved === 1 ? "" : "s"}`)
        );
      }
      return { saved, failed };
    },
    [uid, establishmentId, byMonth]
  );

  const saveContribution = useCallback(
    async (row: EpfBackfillRow, status: EpfContributionStatus): Promise<boolean> => {
      const result = await saveContributions([row], { status });
      return result.saved === 1;
    },
    [saveContributions]
  );

  /** Promote every draft to confirmed without re-sending the amounts. */
  const confirmDrafts = useCallback(async (): Promise<boolean> => {
    const drafts = contributions.filter((row) => row.status === "draft");
    if (drafts.length === 0) return true;
    const result = await saveContributions(
      drafts.map((row) => ({ ...row, persisted: true })),
      { status: "confirmed" }
    );
    return result.failed === 0;
  }, [contributions, saveContributions]);

  const deleteContribution = useCallback(
    async (month: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !establishmentId) {
        toast.error("Not authenticated");
        return false;
      }

      try {
        const outcome = await commitWrite(
          () =>
            deleteDoc(
              doc(
                db,
                "users",
                uid,
                EPF_CONTRIBUTIONS_COLLECTION,
                contributionDocId(establishmentId, month)
              )
            ),
          { label: "EPF contribution" }
        );
        toast.success(writeSavedMessage(outcome, "Month removed"));
        return true;
      } catch (err) {
        logError("epfcontributions.deletecontribution", err);
        toast.error("Failed to remove month");
        return false;
      }
    },
    [uid, establishmentId]
  );

  /**
   * Remove every draft row.
   *
   * Exists because a single draft arms the KAN-65 delete guard on the parent
   * establishment — without this, typing one wage would make the employer
   * undeletable.
   */
  const discardDrafts = useCallback(async (): Promise<boolean> => {
    const db = getFirestoreDb();
    const drafts = contributions.filter((row) => row.status === "draft");
    if (!uid || !db || !establishmentId || drafts.length === 0) return true;

    try {
      for (const group of chunk(drafts, BATCH_CHUNK_SIZE)) {
        const batch = writeBatch(db);
        for (const row of group) {
          batch.delete(
            doc(
              db,
              "users",
              uid,
              EPF_CONTRIBUTIONS_COLLECTION,
              contributionDocId(establishmentId, row.month)
            )
          );
        }
        await commitWrite(() => batch.commit(), { label: "EPF drafts" });
      }
      toast.success("Drafts discarded");
      return true;
    } catch (err) {
      logError("epfcontributions.discarddrafts", err);
      toast.error("Failed to discard drafts");
      return false;
    }
  }, [uid, establishmentId, contributions]);

  return {
    contributions,
    byMonth,
    hasDrafts,
    contributionsLoading,
    contributionsError,
    retryContributions,

    saveContribution,
    saveContributions,
    confirmDrafts,
    deleteContribution,
    discardDrafts,
  };
}
