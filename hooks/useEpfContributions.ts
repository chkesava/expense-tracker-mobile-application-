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
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "@/lib/firestore";

import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { noteDirectWrites, trackedBatch } from "@/lib/readModelWriteHooks";
import { toast } from "@/lib/toast";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
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
  contributionWritePayload,
  normalizeEpfContribution,
  sortContributionsByMonth,
} from "@/shared/features/epf/utils/contributions";
import {
  applyActualCredit,
  applyMissed,
  applyReversed,
  buildContributionEvent,
  canTransition,
  transitionRejectionMessage,
} from "@/shared/features/epf/utils/lifecycle";
import {
  summarizeSaveResults,
  type EpfMonthSaveResult,
} from "@/shared/features/epf/utils/saveOutcome";
import { withoutUndefined } from "@/shared/utils/objects";
import { chunk } from "@/shared/utils/chunk";
import { EPF_BATCH_CHUNK_SIZE } from "@/shared/features/epf/data/epfBatchLimits";
import {
  contributionRemovalKind,
  resolveBackfillSaveStatus,
} from "@/shared/features/epf/utils/backfillDraft";


export function useEpfContributions(
  establishmentId: string | undefined,
  options?: { enabled?: boolean; readFrom?: "copy" }
) {
  const enabled = options?.enabled !== false && Boolean(establishmentId);
  // SPENDLY-598 (R4.3a): EPF screens write from what these hooks load, so
  // the copy serves only callers that never write (`readFrom: "copy"`).
  const contributionsSource = useReadModelSource("epfContributions", { copy: options?.readFrom === "copy" });
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
    const applyContributions = (docs: SourceDoc[]) => {
      setContributions(sortContributionsByMonth(docs.map((d) => normalizeEpfContribution(d.id, d.data))));
      setContributionsError(null);
      setContributionsLoading(false);
    };
    if (contributionsSource.mode === "supabase") {
      return contributionsSource.subscribe(applyContributions, {
        where: (d) => d.data.establishmentId === establishmentId,
      });
    }

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        logQuerySnapshot(path, snapshot);
        const docs = toSourceDocs(snapshot);
        applyContributions(docs);
        // One establishment's rows: the copy's other rows aren't "extra".
        if (contributionsSource.mode === "shadow") void contributionsSource.shadow(docs, { windowed: true });
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
  }, [uid, enabled, establishmentId, attempt, contributionsSource.mode]);

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
   * `commitWrite` so an offline save reports its state instead of hanging.
   *
   * Returns **one result per month** — SPENDLY-1. It used to return
   * `{ saved, failed }` where `saved` was incremented by `group.length` the
   * moment `commitWrite` resolved and the toast described the whole operation
   * using only the last chunk's outcome. Since a Firestore batch is atomic, a
   * chunk's outcome is genuinely every month in it, so attributing per month
   * costs nothing and lets the caller name the months that failed.
   */
  const saveContributions = useCallback(
    async (
      rows: EpfBackfillRow[],
      opts: { status: EpfContributionStatus }
    ): Promise<EpfMonthSaveResult[]> => {
      const db = getFirestoreDb();
      if (!uid || !db || !establishmentId) {
        toast.error("Not authenticated");
        return rows.map((row) => ({
          month: row.month,
          outcome: "failed" as const,
          reason: "Not authenticated",
        }));
      }
      if (rows.length === 0) return [];

      const results: EpfMonthSaveResult[] = [];

      for (const group of chunk(rows, EPF_BATCH_CHUNK_SIZE)) {
        const accepted: Array<{
          row: EpfBackfillRow;
          status: EpfContributionStatus;
          existing?: EpfContribution;
        }> = [];
        for (const row of group) {
          const existing = byMonth.get(row.month);
          const decision = resolveBackfillSaveStatus({
            existingStatus: existing?.status,
            archived: existing?.archived,
            requested: opts.status,
          });
          if (!decision.ok) {
            results.push({ month: row.month, outcome: "failed", reason: decision.reason });
            continue;
          }
          accepted.push({ row, status: decision.status, existing });
        }
        if (accepted.length === 0) continue;

        try {
          const batch = trackedBatch(writeBatch(db));
          for (const item of accepted) {
            const ref = doc(
              db,
              "users",
              uid,
              EPF_CONTRIBUTIONS_COLLECTION,
              contributionDocId(establishmentId, item.row.month)
            );
            batch.set(
              ref,
              withoutUndefined({
                // The field list lives in `shared/` so it is covered by
                // `npm test` — an inline literal here is how SPENDLY-1's
                // missing `expectedCreditFrom`/`expectedCreditTo` went
                // unnoticed, since vitest never collects `hooks/**`.
                ...contributionWritePayload(item.row, {
                  status: item.status,
                  establishmentId,
                }),
                updatedAt: serverTimestamp(),
                createdAt: item.existing ? undefined : serverTimestamp(),
              }),
              // Deterministic ids + merge: re-saving converges instead of duplicating.
              { merge: true }
            );
          }

          // KAN-72: every month that moves money leaves an audit entry, in the
          // same batch as the write so the two cannot diverge. `from: "none"`
          // marks a row that did not exist before — scheduled generation.
          for (const item of accepted) {
            batch.set(
              doc(collection(db, "users", uid, EPF_CONTRIBUTION_EVENTS_COLLECTION)),
              withoutUndefined({
                ...buildContributionEvent(
                  {
                    id: contributionDocId(establishmentId, item.row.month),
                    establishmentId,
                    month: item.row.month,
                  },
                  item.existing?.status ?? "none",
                  item.status,
                  {
                    actor: item.row.source === "simulated" ? "system" : "user",
                    amount: item.row.epfCredit,
                  }
                ),
                at: serverTimestamp(),
              })
            );
          }

          // SPENDLY-653: no summary delta here. `financialSummaries/epf` is
          // written whole from the ledger by the server (epf-daily, SPENDLY-740); a delta taken
          // against a lagging `byMonth` could be applied twice.
          const outcome = await commitWrite(() => batch.commit(), {
            label: "EPF contributions",
          });
          noteDirectWrites(uid, batch.writtenPaths());
          for (const item of accepted) {
            results.push({ month: item.row.month, outcome });
          }
        } catch (err) {
          logError("epfcontributions.savecontributions", err);
          const reason = friendlyErrorMessage(err, "It couldn't be saved.");
          for (const item of accepted) {
            results.push({ month: item.row.month, outcome: "failed", reason });
          }
        }
      }

      // One toast for the whole save, not one per chunk. The copy is a pure
      // fold of the per-month results so it is covered by `npm test`.
      const summary = summarizeSaveResults(results);
      if (summary.message) {
        if (summary.tone === "error") toast.error(summary.message);
        else toast.success(summary.message);
      }
      return results;
    },
    [uid, establishmentId, byMonth]
  );

  const saveContribution = useCallback(
    async (row: EpfBackfillRow, status: EpfContributionStatus): Promise<boolean> => {
      const results = await saveContributions([row], { status });
      return results.every((result) => result.outcome !== "failed");
    },
    [saveContributions]
  );

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
        toast.error(transitionRejectionMessage(current.status, next.status));
        return false;
      }

      try {
        const batch = trackedBatch(writeBatch(db));
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
        noteDirectWrites(uid, batch.writtenPaths());
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

  const deleteContribution = useCallback(
    async (month: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !establishmentId) {
        toast.error("Not authenticated");
        return false;
      }

      const current = byMonth.get(month);
      const kind = contributionRemovalKind(current);
      if (kind === "missing") {
        toast.error("That month is not recorded yet");
        return false;
      }

      const ref = doc(
        db,
        "users",
        uid,
        EPF_CONTRIBUTIONS_COLLECTION,
        contributionDocId(establishmentId, month)
      );

      try {
        if (kind === "delete") {
          const batch = trackedBatch(writeBatch(db));
          batch.delete(ref);
          const outcome = await commitWrite(() => batch.commit(), {
            label: "EPF contribution",
          });
          noteDirectWrites(uid, batch.writtenPaths());
          toast.success(writeSavedMessage(outcome, "Month removed"));
          return true;
        }

        const batch = trackedBatch(writeBatch(db));
        batch.set(
          ref,
          {
            archived: true,
            statusReason: current?.statusReason ?? "Removed from backfill",
            statusUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        batch.set(
          doc(collection(db, "users", uid, EPF_CONTRIBUTION_EVENTS_COLLECTION)),
          withoutUndefined({
            ...buildContributionEvent(
              current!,
              current!.status,
              current!.status,
              {
                actor: "user",
                reason: "archived",
                amount: current!.epfCredit,
              }
            ),
            at: serverTimestamp(),
          })
        );
        const outcome = await commitWrite(() => batch.commit(), {
          label: "EPF contribution archive",
        });
        noteDirectWrites(uid, batch.writtenPaths());
        toast.success(writeSavedMessage(outcome, "Month removed"));
        return true;
      } catch (err) {
        logError("epfcontributions.deletecontribution", err);
        toast.error("Failed to remove month");
        return false;
      }
    },
    [uid, establishmentId, byMonth]
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
      for (const group of chunk(drafts, EPF_BATCH_CHUNK_SIZE)) {
        const batch = trackedBatch(writeBatch(db));
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
        noteDirectWrites(uid, batch.writtenPaths());
      }
      toast.success("Drafts discarded");
      return true;
    } catch (err) {
      logError("epfcontributions.discarddrafts", err);
      toast.error("Failed to discard drafts");
      return false;
    }
  }, [uid, establishmentId, contributions]);

  // SPENDLY-740 (epic SPENDLY-735): the credit-window and lifecycle repairs
  // run on the server (epf-cron's logic, daily via epf-daily), not in the app.

  return {
    contributions,
    byMonth,
    hasDrafts,
    contributionsLoading,
    contributionsError,
    retryContributions,

    saveContribution,
    saveContributions,
    deleteContribution,
    discardDrafts,

    // KAN-68 lifecycle
    recordCredit,
    markMissed,
    markReversed,
  };
}
