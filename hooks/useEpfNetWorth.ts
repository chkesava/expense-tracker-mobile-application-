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
import { useEpfSummary } from "@/hooks/useDomainSummaries";
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
  const { summary, loading, error } = useEpfSummary();

  if (!summary) {
    return {
      epfValue: 0,
      epfUnreconciledCount: 0,
      summary: null,
      hasProfile: false,
      loading,
    };
  }

  return {
    epfValue: summary.currentBalance,
    epfUnreconciledCount: 0, // This isn't currently materialized in the Phase 5 spec
    summary: summary,
    hasProfile: true,
    loading,
  };
}
