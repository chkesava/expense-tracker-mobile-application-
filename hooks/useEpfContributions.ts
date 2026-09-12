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
import { epfTodayKey } from "@/shared/features/epf/utils/epfClock";
import type {
  EpfBackfillRow,
  EpfContribution,
  EpfContributionActor,
  EpfContributionStatus,
} from "@/shared/features/epf/types";
import {
  EPF_CONTRIBUTION_EVENTS_COLLECTION,
  EPF_CONTRIBUTIONS_COLLECTION,
} from "@/shared/features/epf/types";
import {
  contributionDocId,
  normalizeEpfContribution,
  sortContributionsByMonth,
} from "@/shared/features/epf/utils/contributions";
import {
  applyActualCredit,
  applyAutoCredit,
  applyMissed,
  applyReversed,
  buildContributionEvent,
  canTransition,
  contributionsToAutoCredit,
} from "@/shared/features/epf/utils/lifecycle";

/**
 * Firestore caps a batch at 500 writes.
 *
 * Each saved month now writes **two** documents — the contribution and its
 * audit event (KAN-72) — so the row chunk is half what it would otherwise be.
 * At 400 rows a batch would be 800 writes and fail, and only on a long
 * backfill, which is the worst place to find out.
 */
const BATCH_CHUNK_SIZE = 200;

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

          // KAN-72: every month that moves money leaves an audit entry, in the
          // same batch as the write so the two cannot diverge. `from: "none"`
          // marks a row that did not exist before — scheduled generation.
          for (const row of group) {
            const existing = byMonth.get(row.month);
            batch.set(
              doc(collection(db, "users", uid, EPF_CONTRIBUTION_EVENTS_COLLECTION)),
              withoutUndefined({
                ...buildContributionEvent(
                  { id: contributionDocId(establishmentId, row.month), establishmentId, month: row.month },
                  existing?.status ?? "none",
                  opts.status,
                  {
                    actor: row.source === "simulated" ? "system" : "user",
                    amount: row.epfCredit,
                  }
                ),
                at: serverTimestamp(),
              })
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

  /**
   * Write a status change and its audit event atomically — KAN-68.
   *
   * One batch, so a contribution and the event describing it can never
   * disagree. The transition is validated first: an illegal move is a bug, not
   * something to persist and reconcile later.
   */
  const applyTransition = useCallback(
    async (
      month: string,
      transform: (row: EpfContribution) => EpfContribution,
      meta: { actor: EpfContributionActor; amount?: number; reason?: string; message: string }
    ): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !establishmentId) {
        toast.error("Not authenticated");
        return false;
      }

      const current = byMonth.get(month);
      if (!current) {
        toast.error("That month is not recorded yet");
        return false;
      }

      const next = transform(current);
      if (next.status !== current.status && !canTransition(current.status, next.status)) {
        toast.error(`Cannot move a ${current.status} month to ${next.status}.`);
        return false;
      }

      try {
        const batch = writeBatch(db);
        const ref = doc(
          db,
          "users",
          uid,
          EPF_CONTRIBUTIONS_COLLECTION,
          contributionDocId(establishmentId, month)
        );
        batch.set(
          ref,
          withoutUndefined({
            status: next.status,
            creditedAmount: next.creditedAmount,
            creditDate: next.creditDate,
            reconciledAt: next.reconciledAt,
            // An empty reason must clear a stale one, so send null not undefined.
            statusReason: next.statusReason ?? null,
            statusUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        );

        const eventRef = doc(
          collection(db, "users", uid, EPF_CONTRIBUTION_EVENTS_COLLECTION)
        );
        batch.set(eventRef, {
          ...withoutUndefined(
            buildContributionEvent(current, current.status, next.status, meta)
          ),
          at: serverTimestamp(),
        });

        const outcome = await commitWrite(() => batch.commit(), {
          label: "EPF contribution status",
        });
        toast.success(writeSavedMessage(outcome, meta.message));
        return true;
      } catch (err) {
        logError("epfcontributions.applytransition", err);
        toast.error("Couldn't update that month");
        return false;
      }
    },
    [uid, establishmentId, byMonth]
  );

  const recordCredit = useCallback(
    (month: string, input: { amount: number; date: string }) =>
      applyTransition(
        month,
        (row) =>
          applyActualCredit(row, { ...input, reconciledAt: new Date().toISOString() }),
        { actor: "user", amount: input.amount, message: "Credit recorded" }
      ),
    [applyTransition]
  );

  const markMissed = useCallback(
    (month: string, reason: string) =>
      applyTransition(month, (row) => applyMissed(row, reason, new Date().toISOString()), {
        actor: "user",
        reason,
        message: "Marked as missed",
      }),
    [applyTransition]
  );

  const markReversed = useCallback(
    (month: string, reason: string) =>
      applyTransition(month, (row) => applyReversed(row, reason, new Date().toISOString()), {
        actor: "user",
        reason,
        message: "Marked as reversed",
      }),
    [applyTransition]
  );

  /**
   * Age every `expected` month whose credit window has passed.
   *
   * Runs on the client as well as in the cron so someone opening the app sees
   * the current state rather than waiting for the monthly job. Both call the
   * same pure selector, so they cannot disagree.
   */
  const autoAdvanceCredits = useCallback(async (): Promise<number> => {
    const db = getFirestoreDb();
    if (!uid || !db || !establishmentId) return 0;

    const due = contributionsToAutoCredit(contributions, epfTodayKey());
    if (due.length === 0) return 0;

    try {
      for (const group of chunk(due, BATCH_CHUNK_SIZE)) {
        const batch = writeBatch(db);
        for (const row of group) {
          const next = applyAutoCredit(row);
          batch.set(
            doc(
              db,
              "users",
              uid,
              EPF_CONTRIBUTIONS_COLLECTION,
              contributionDocId(establishmentId, row.month)
            ),
            { status: next.status, statusUpdatedAt: serverTimestamp(), updatedAt: serverTimestamp() },
            { merge: true }
          );
          batch.set(doc(collection(db, "users", uid, EPF_CONTRIBUTION_EVENTS_COLLECTION)), {
            ...withoutUndefined(
              buildContributionEvent(row, row.status, next.status, {
                actor: "system",
                amount: row.epfCredit,
              })
            ),
            at: serverTimestamp(),
          });
        }
        await commitWrite(() => batch.commit(), { label: "EPF credit advance" });
      }
      return due.length;
    } catch (err) {
      logError("epfcontributions.autoadvancecredits", err);
      return 0;
    }
  }, [uid, establishmentId, contributions]);

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

    // KAN-68 lifecycle
    recordCredit,
    markMissed,
    markReversed,
    autoAdvanceCredits,
  };
}
