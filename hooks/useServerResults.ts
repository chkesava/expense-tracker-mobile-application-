/**
 * SPENDLY-747 (epic SPENDLY-735) — the results the server's insights-daily job
 * stores at users/{uid}/serverResults: the fee rows and the Journal health
 * report. Reads through the per-collection read switch
 * (`readModel.serverResults`): Firestore by default, the on-device copy in
 * `supabase` mode with no Firestore listener mounted. Nothing is computed
 * over the ledger here. Duress-aware uid; nothing while signed out.
 */

import { useEffect, useState } from "react";

import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { getFirestoreDb } from "@/lib/firebase";
import { collection, doc, onSnapshot } from "@/lib/firestore";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { useAuth } from "@/providers/AuthProvider";
import { SERVER_RESULTS_COLLECTION } from "@/shared/utils/serverResults";

export function useServerResults(options?: {
  enabled?: boolean;
  /**
   * SPENDLY-798: only this result document. The dashboard reads the small
   * shortfall result without loading the fee rows (up to ~600 KB a part).
   */
  docId?: string;
}) {
  const enabled = options?.enabled !== false;
  const docId = options?.docId;
  const { user } = useAuth();
  const uid = user?.uid;
  const [docs, setDocs] = useState<SourceDoc[] | null>(null);
  const { error, setError, retry, attempt } = useLoadFailure();
  const source = useReadModelSource("serverResults");

  useEffect(() => {
    const db = getFirestoreDb();
    setDocs(null);
    if (!uid || !enabled || !db) return;
    const apply = (next: SourceDoc[]) => {
      setDocs(next);
      setError(null);
    };
    if (source.mode === "supabase") return source.subscribe(docId ? (next) => apply(next.filter((d) => d.id === docId)) : apply);
    if (docId) {
      // One document; no shadow comparison (it compares whole collections).
      const path = `users/${uid}/${SERVER_RESULTS_COLLECTION}/${docId}`;
      const unsubscribe = onSnapshot(
        doc(db, "users", uid, SERVER_RESULTS_COLLECTION, docId),
        (snap) => apply(snap.exists() ? [{ id: snap.id, data: (snap.data() ?? {}) as Record<string, unknown> }] : []),
        snapshotErrorHandler("snapshot.serverResults", (failure) => setError(failure), "Couldn't load your results.")
      );
      return () => {
        forgetSnapshotPath(path);
        unsubscribe();
      };
    }
    const path = `users/${uid}/${SERVER_RESULTS_COLLECTION}`;
    const unsubscribe = onSnapshot(
      collection(db, "users", uid, SERVER_RESULTS_COLLECTION),
      (snap) => {
        const next = toSourceDocs(snap);
        apply(next);
        if (source.mode === "shadow") void source.shadow(next);
      },
      snapshotErrorHandler("snapshot.serverResults", (failure) => setError(failure), "Couldn't load your results.")
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, attempt, source.mode, docId]);

  return { docs, loading: enabled && Boolean(uid) && docs === null && !error, error, retry };
}
