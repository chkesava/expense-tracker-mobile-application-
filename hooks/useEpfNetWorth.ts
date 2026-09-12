/**
 * EPF's contribution to net worth — KAN-71.
 *
 * Naively this would mount five Firestore listeners for **every** Spendly user,
 * including the large majority with no EPF at all — a real cost and cold-start
 * regression, and the opposite of the bounded loading KAN-71 asks for.
 *
 * So it reads the profile document first (one tiny doc) and mounts the rest
 * only when a profile exists:
 *
 *   no EPF profile  → one doc listener, zero further cost, epfValue = 0
 *   has EPF profile → establishments, contributions, transfers, interest,
 *                     reconciliations
 *
 * Absence short-circuits everything, so the dashboard is unchanged for anyone
 * who does not use EPF.
 */

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useAuth } from "@/providers/AuthProvider";
import { useEpf } from "@/hooks/useEpf";
import { useEpfAllContributions } from "@/hooks/useEpfAllContributions";
import { useEpfInterest } from "@/hooks/useEpfInterest";
import { useEpfTransfers } from "@/hooks/useEpfTransfers";
import {
  EPF_PROFILE_COLLECTION,
  EPF_PROFILE_DOC_ID,
} from "@/shared/features/epf/types";
import {
  epfPortfolioSummary,
  type EpfPortfolioSummary,
} from "@/shared/features/epf/utils/portfolio";

export function useEpfNetWorth() {
  // Duress-aware uid: a duress session must contribute no EPF to net worth.
  const { user } = useAuth();
  const uid = user?.uid;

  // The gate. One document decides whether any of the rest is worth loading.
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setHasProfile(false);
      return;
    }

    const path = `users/${uid}/${EPF_PROFILE_COLLECTION}/${EPF_PROFILE_DOC_ID}`;
    const unsubscribe = onSnapshot(
      doc(db, "users", uid, EPF_PROFILE_COLLECTION, EPF_PROFILE_DOC_ID),
      (snap) => setHasProfile(snap.exists()),
      snapshotErrorHandler(
        "snapshot.epfNetWorthProfile",
        // A failure here must not break net worth for everyone else; treat it
        // as "no EPF" and let the EPF tab surface the real error.
        () => setHasProfile(false),
        "Couldn't load your EPF profile."
      )
    );

    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid]);

  const enabled = hasProfile === true;

  const { establishments, establishmentsLoading } = useEpf({ enabled });
  const { contributions, loading: contributionsLoading } = useEpfAllContributions({ enabled });
  const { transfers, transfersLoading } = useEpfTransfers({ enabled });
  const { interestEntries, reconciliations, interestLoading } = useEpfInterest({ enabled });

  const summary: EpfPortfolioSummary = useMemo(() => {
    if (!enabled) {
      return epfPortfolioSummary({
        establishments: [],
        contributions: [],
        transfers: [],
        interestEntries: [],
        adjustments: [],
      });
    }
    return epfPortfolioSummary({
      establishments,
      contributions,
      transfers,
      interestEntries,
      adjustments: reconciliations,
    });
  }, [enabled, establishments, contributions, transfers, interestEntries, reconciliations]);

  const loading =
    hasProfile === null ||
    (enabled &&
      (establishmentsLoading || contributionsLoading || transfersLoading || interestLoading));

  return {
    /** What EPF adds to total assets. Zero when the user has no EPF profile. */
    epfValue: summary.total,
    /** Credited months not yet confirmed against a passbook. */
    epfUnreconciledCount: summary.unreconciledCount,
    /** Full breakdown, for the EPF tab's total card. */
    summary,
    hasProfile: enabled,
    loading,
  };
}
