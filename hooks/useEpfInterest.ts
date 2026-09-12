/**
 * EPF interest entries and reconciliation observations — KAN-70.
 *
 * Thin by design: the schedule and the variance arithmetic live in
 * `shared/features/epf/utils/{interest,reconciliation}.ts`, because
 * `vitest.config.ts` never runs `hooks/**`.
 *
 * Both listeners are unfiltered — a working lifetime produces a few dozen rows
 * between them, and the balance needs all of them regardless of which
 * establishment is on screen. No filter means no index and no deploy
 * dependency.
 */

import { useCallback, useEffect, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useAuth } from "@/providers/AuthProvider";
import { epfCurrentMonth } from "@/shared/features/epf/utils/epfClock";
import type {
  EpfContribution,
  EpfInterestEntry,
  EpfReconciliation,
  EpfTransfer,
} from "@/shared/features/epf/types";
import {
  EPF_INTEREST_ENTRIES_COLLECTION,
  EPF_RECONCILIATIONS_COLLECTION,
} from "@/shared/features/epf/types";
import {
  buildInterestEntry,
  creditableYears,
  interestEntryId,
  interestSchedule,
  normalizeInterestEntry,
} from "@/shared/features/epf/utils/interest";
import {
  buildReconciliation,
  normalizeReconciliation,
  type EpfReconciliationInput,
} from "@/shared/features/epf/utils/reconciliation";
import { financialYearOfMonth } from "@/shared/utils/financialYear";

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) out[key] = val;
  }
  return out as T;
}

export function useEpfInterest(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  // Duress-aware uid, matching every other EPF hook.
  const { user } = useAuth();
  const uid = user?.uid;

  const [interestEntries, setInterestEntries] = useState<EpfInterestEntry[]>([]);
  const [reconciliations, setReconciliations] = useState<EpfReconciliation[]>([]);
  const [interestLoading, setInterestLoading] = useState(true);
  const {
    error: interestError,
    setError: setInterestError,
    retry: retryInterest,
    attempt,
  } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setInterestEntries([]);
      setReconciliations([]);
      setInterestLoading(false);
      return;
    }

    setInterestLoading(true);
    const entryPath = `users/${uid}/${EPF_INTEREST_ENTRIES_COLLECTION}`;
    const reconPath = `users/${uid}/${EPF_RECONCILIATIONS_COLLECTION}`;

    const unsubEntries = onSnapshot(
      collection(db, "users", uid, EPF_INTEREST_ENTRIES_COLLECTION),
      (snapshot) => {
        logQuerySnapshot(entryPath, snapshot);
        setInterestEntries(
          snapshot.docs.map((docSnap) =>
            normalizeInterestEntry(docSnap.id, docSnap.data() as Record<string, unknown>)
          )
        );
        setInterestError(null);
        setInterestLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.epfInterestEntries",
        (failure) => {
          setInterestError(failure);
          setInterestLoading(false);
        },
        "Couldn't load your EPF interest."
      )
    );

    const unsubRecon = onSnapshot(
      collection(db, "users", uid, EPF_RECONCILIATIONS_COLLECTION),
      (snapshot) => {
        logQuerySnapshot(reconPath, snapshot);
        setReconciliations(
          snapshot.docs.map((docSnap) =>
            normalizeReconciliation(docSnap.id, docSnap.data() as Record<string, unknown>)
          )
        );
      },
      snapshotErrorHandler(
        "snapshot.epfReconciliations",
        (failure) => setInterestError(failure),
        "Couldn't load your EPF reconciliations."
      )
    );

    return () => {
      forgetSnapshotPath(entryPath);
      forgetSnapshotPath(reconPath);
      unsubEntries();
      unsubRecon();
    };
  }, [uid, enabled, attempt]);

  /**
   * Recompute and store the whole interest schedule for one establishment.
   *
   * Safe to run repeatedly: the deterministic id means a year is overwritten
   * rather than duplicated, so "no duplicate interest events" falls out of the
   * key instead of a guard someone has to remember.
   *
   * Years EPFO has not declared a rate for are skipped entirely — writing zero
   * interest would be indistinguishable from a year that genuinely earned
   * nothing.
   */
  const recomputeInterest = useCallback(
    async (args: {
      establishmentId: string;
      contributions: EpfContribution[];
      transfers: EpfTransfer[];
    }): Promise<number> => {
      const db = getFirestoreDb();
      if (!uid || !db) return 0;

      const schedule = interestSchedule({
        contributions: args.contributions,
        transfers: args.transfers,
        adjustments: reconciliations,
        establishmentId: args.establishmentId,
        throughFinancialYear: financialYearOfMonth(epfCurrentMonth()),
      });
      const years = creditableYears(schedule);
      if (years.length === 0) return 0;

      try {
        const batch = writeBatch(db);
        for (const year of years) {
          batch.set(
            doc(
              db,
              "users",
              uid,
              EPF_INTEREST_ENTRIES_COLLECTION,
              interestEntryId(args.establishmentId, year.financialYear)
            ),
            withoutUndefined({
              ...buildInterestEntry(args.establishmentId, year),
              computedAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
            { merge: true }
          );
        }
        await commitWrite(() => batch.commit(), { label: "EPF interest" });
        return years.length;
      } catch (err) {
        logError("epfinterest.recomputeinterest", err);
        return 0;
      }
    },
    [uid, reconciliations]
  );

  /**
   * Record what EPFO actually showed.
   *
   * Append-only: a new document every time, so repeated reconciliations build a
   * history rather than overwriting each other. The adjustment moves the
   * balance; no contribution row is touched.
   */
  const recordReconciliation = useCallback(
    async (input: EpfReconciliationInput): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return false;
      }

      try {
        const ref = doc(collection(db, "users", uid, EPF_RECONCILIATIONS_COLLECTION));
        const outcome = await commitWrite(
          () =>
            writeBatch(db)
              .set(
                ref,
                withoutUndefined({
                  ...buildReconciliation(input),
                  createdAt: serverTimestamp(),
                })
              )
              .commit(),
          { label: "EPF reconciliation" }
        );
        toast.success(writeSavedMessage(outcome, "Balance reconciled"));
        return true;
      } catch (err) {
        logError("epfinterest.recordreconciliation", err);
        toast.error("Couldn't record that balance");
        return false;
      }
    },
    [uid]
  );

  return {
    interestEntries,
    reconciliations,
    interestLoading,
    interestError,
    retryInterest,

    recomputeInterest,
    recordReconciliation,
  };
}
