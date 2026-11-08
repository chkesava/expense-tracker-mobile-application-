import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { useIncomes } from "@/hooks/useIncomes";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { useAuth } from "@/providers/AuthProvider";
import { TAX_DEADLINE_YEARS } from "@/shared/features/tax/data/taxDeadlines";
import type { TaxDocument, TaxEntry } from "@/shared/features/tax/types";
import { taxDocumentFromDoc, taxEntryFromDoc } from "@/shared/features/tax/utils/docs";
import { taxCalendarFacts } from "@/shared/features/tax/utils/taxCalendar";

const YEARS = [...TAX_DEADLINE_YEARS];
const inDeadlineYears = (doc: SourceDoc) => YEARS.includes(String(doc.data.fy));

/**
 * What the calendar needs to know about the user's tax records
 * (SPENDLY-297): advance-tax payments and whether a Form 16 is in, for the
 * years that have deadlines only (`fy in […]`, a handful of small documents).
 * Display only; nothing writes from it. Mounted only while the tax center is
 * enabled and something shows tax events (calendar, inbox, notifications).
 *
 * Each collection reads through its own switch: `supabase` reads the
 * on-device copy with no Firestore listener mounted.
 */
export function useTaxCalendarFacts(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const entriesSource = useReadModelSource("taxEntries");
  const documentsSource = useReadModelSource("taxDocuments");
  const { incomes } = useIncomes();
  const [entries, setEntries] = useState<TaxEntry[] | null>(null);
  const [documents, setDocuments] = useState<TaxDocument[] | null>(null);
  const entriesFailure = useLoadFailure();
  const documentsFailure = useLoadFailure();
  const setEntriesError = entriesFailure.setError;
  const setDocumentsError = documentsFailure.setError;

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setEntries([]);
      return;
    }
    setEntries(null);
    const path = `users/${uid}/taxEntries`;
    const apply = (docs: SourceDoc[]) => {
      setEntries(docs.map((d) => taxEntryFromDoc(d.id, d.data)).filter((e): e is TaxEntry => e !== null));
      setEntriesError(null);
    };
    if (entriesSource.mode === "supabase") return entriesSource.subscribe(apply, { where: inDeadlineYears });
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "taxEntries"), where("fy", "in", YEARS)),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (entriesSource.mode === "shadow") void entriesSource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler(
        "snapshot.taxCalendarEntries",
        (failure) => {
          setEntriesError(failure);
          setEntries([]);
        },
        "Couldn't load your tax records."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, entriesFailure.attempt, setEntriesError, entriesSource.mode]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setDocuments([]);
      return;
    }
    setDocuments(null);
    const path = `users/${uid}/taxDocuments`;
    const apply = (docs: SourceDoc[]) => {
      setDocuments(docs.map((d) => taxDocumentFromDoc(d.id, d.data)).filter((e): e is TaxDocument => e !== null));
      setDocumentsError(null);
    };
    if (documentsSource.mode === "supabase") return documentsSource.subscribe(apply, { where: inDeadlineYears });
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "taxDocuments"), where("fy", "in", YEARS)),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (documentsSource.mode === "shadow") void documentsSource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler(
        "snapshot.taxCalendarDocuments",
        (failure) => {
          setDocumentsError(failure);
          setDocuments([]);
        },
        "Couldn't load your tax documents."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, documentsFailure.attempt, setDocumentsError, documentsSource.mode]);

  const facts = useMemo(
    () => (enabled ? taxCalendarFacts({ entries: entries ?? [], documents: documents ?? [], incomes }) : null),
    [enabled, entries, documents, incomes]
  );

  return {
    /** `null` when tax events are off. */
    facts,
    loading: enabled && (entries === null || documents === null),
    error: entriesFailure.error ?? documentsFailure.error ?? null,
  };
}
