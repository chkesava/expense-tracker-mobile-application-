/**
 * Keeps `financialSummaries/epf` equal to the EPF ledger — SPENDLY-653.
 *
 * Mounted by the EPF dashboard, which already listens to every source row
 * (through `useEpfInterestCatchUp`), so this adds one document listener and
 * nothing else. It derives the summary with the shared contract
 * (`epfPortfolioSummary`) and, only when the stored document disagrees, writes
 * it whole. An absolute write is idempotent: a retry, a second device or an
 * effect re-run writes the same values instead of adding them again, which is
 * the bug the old `increment()` deltas had.
 *
 * Returns the live summary so the overview card shows the derived figure even
 * before the write lands.
 */

import { useEffect, useMemo, useRef } from "react";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite } from "@/lib/firestoreWrite";
import { useAuth } from "@/providers/AuthProvider";
import { useEpfSummary } from "@/hooks/useDomainSummaries";
import { epfPortfolioSummary } from "@/shared/features/epf/utils/portfolio";
import {
  decideEpfSummarySync,
  type EpfSummarySources,
} from "@/shared/features/epf/utils/summarySync";

export function useEpfSummarySync(args: {
  enabled: boolean;
  /** Every source loaded without error. Never write a summary of a partial read. */
  ready: boolean;
  sources: EpfSummarySources;
}) {
  const { enabled, ready, sources } = args;
  const { user } = useAuth();
  const uid = user?.uid;
  const { summary: stored, loading: storedLoading, error: storedError } = useEpfSummary();
  const lastWritten = useRef<string | null>(null);

  const live = useMemo(
    () => (enabled && ready ? epfPortfolioSummary(sources) : null),
    [enabled, ready, sources]
  );

  useEffect(() => {
    const db = getFirestoreDb();
    if (!enabled || !uid || !db) return;

    const decision = decideEpfSummarySync({
      ready: ready && !storedLoading && !storedError,
      stored,
      sources,
    });
    if (!decision.write) return;

    // The stored snapshot lags our own write by a round trip; don't send the
    // same document again in the meantime.
    const signature = JSON.stringify(decision.fields);
    if (lastWritten.current === signature) return;
    lastWritten.current = signature;

    void commitWrite(
      () =>
        setDoc(
          doc(db, "users", uid, "financialSummaries", "epf"),
          { ...decision.fields, calculatedAt: serverTimestamp() },
          { merge: true }
        ),
      { label: "EPF summary" }
    ).catch((err) => {
      lastWritten.current = null;
      logError("epf.summarySync", err);
    });
  }, [enabled, uid, ready, stored, storedLoading, storedError, sources]);

  return live;
}
