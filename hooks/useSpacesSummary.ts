import { useEffect, useState } from "react";
import { doc, onSnapshot } from "@/lib/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import type { SourceDoc } from "@/lib/readModelLocal/readSource";
import {
  SPACES_SUMMARY_DOC_ID,
  type SpacesSummaryDoc,
  type StoredSpaceTotals,
} from "@/shared/types/space";

const EMPTY: Record<string, StoredSpaceTotals> = {};

/**
 * SPENDLY-791: every Space's totals as the server job `space-daily` stored
 * them (`financialSummaries/spaces`), from every expense in the Space, any
 * month. Read-only, so the copy may serve it in `supabase` mode.
 */
export function useSpacesSummary() {
  const summarySource = useReadModelSource("financialSummaries");
  const { user } = useAuth();
  const uid = user?.uid;
  const [totals, setTotals] = useState<Record<string, StoredSpaceTotals>>(EMPTY);
  const [stored, setStored] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setLoading(false);
      return;
    }
    const path = `users/${uid}/financialSummaries/${SPACES_SUMMARY_DOC_ID}`;
    setLoading(true);
    const apply = (docs: SourceDoc[]) => {
      const found = docs.find((d) => d.id === SPACES_SUMMARY_DOC_ID);
      const data = found?.data as Partial<SpacesSummaryDoc> | undefined;
      setTotals(data?.spaces ?? EMPTY);
      setStored(Boolean(found));
      setLoading(false);
    };
    if (summarySource.mode === "supabase") {
      return summarySource.subscribe(apply, { where: (d) => d.id === SPACES_SUMMARY_DOC_ID });
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", uid, "financialSummaries", SPACES_SUMMARY_DOC_ID),
      (snap) => {
        const docs = snap.exists() ? [{ id: snap.id, data: (snap.data() ?? {}) as Record<string, unknown> }] : [];
        apply(docs);
        if (summarySource.mode === "shadow") void summarySource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler("snapshot.spacesSummary", (err) => {
        setError(err as unknown as Error);
        setLoading(false);
      })
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, summarySource.mode]);

  return { totals, stored, loading, error };
}
