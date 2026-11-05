import { useEffect, useState } from "react";
import { doc, onSnapshot } from "@/lib/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import type { EpfSummary } from "@/shared/types/financialSummary";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";

export function useEpfSummary(options?: { readFrom?: "copy" }) {
  // SPENDLY-599 (R4.3a): the EPF summary sync compares with this and writes,
  // so the copy serves only callers that never write (`readFrom: "copy"`).
  const summarySource = useReadModelSource("financialSummaries", { copy: options?.readFrom === "copy" });
  const { user } = useAuth();
  const uid = user?.uid;
  const [summary, setSummary] = useState<EpfSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setLoading(false);
      return;
    }
    const path = `users/${uid}/financialSummaries/epf`;
    setLoading(true);
    const applySummary = (docs: SourceDoc[]) => {
      const epf = docs.find((d) => d.id === "epf");
      setSummary(epf ? (epf.data as unknown as EpfSummary) : null);
      setLoading(false);
    };
    if (summarySource.mode === "supabase") {
      return summarySource.subscribe(applySummary, { where: (d) => d.id === "epf" });
    }

    const unsubscribe = onSnapshot(
      doc(db, "users", uid, "financialSummaries", "epf"),
      (snap) => {
        const docs = snap.exists() ? [{ id: snap.id, data: (snap.data() ?? {}) as Record<string, unknown> }] : [];
        applySummary(docs);
        // One document: the copy's other summaries aren't "extra".
        if (summarySource.mode === "shadow") void summarySource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler("snapshot.epfSummary", (err) => {
        setError(err as unknown as Error);
        setLoading(false);
      })
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, summarySource.mode]);

  return { summary, loading, error };
}
