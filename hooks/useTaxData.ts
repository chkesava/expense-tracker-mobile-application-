import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { useAuth } from "@/providers/AuthProvider";
import type {
  FinancialYearKey,
  TaxDocument,
  TaxEntry,
  TaxProfile,
  TaxReview,
  TaxSnapshot,
} from "@/shared/features/tax/types";
import {
  inTaxYear,
  sortByCreated,
  taxDocumentFromDoc,
  taxEntryFromDoc,
  taxProfileFromDoc,
  taxReviewFromDoc,
  taxSnapshotFromDoc,
} from "@/shared/features/tax/utils/docs";
import { isFinancialYearKey } from "@/shared/features/tax/utils/taxYear";

/**
 * The Tax & ITR Readiness Center's stored data for one year (SPENDLY-709,
 * epic SPENDLY-288). Display only.
 *
 * Each hook reads one collection through its per-collection switch:
 * `firestore` (default) keeps a listener bounded to the year
 * (`where("fy", "==", fy)`); `shadow` compares it with the copy (windowed:
 * the copy also holds other years); `supabase` reads the on-device copy,
 * filtered to the year, with no Firestore listener mounted.
 *
 * Mount a hook only where its section is on screen (`enabled`, SPENDLY-406).
 * Writers never build from these values: `services/tax/taxStore.ts` loads
 * from Firestore first (R4.3a).
 *
 * The effects are written out per hook, not shared, on purpose: the guards
 * (`providerSwitch.test.ts`, `listenersOff.test.ts`) read each listener with
 * its collection name next to it.
 */

type TaxYearState<T> = {
  items: T[];
  loading: boolean;
};

const IDLE = { items: [], loading: false };
const LOADING = { items: [], loading: true };

type Options = { enabled?: boolean };

function collect<T>(docs: SourceDoc[], map: (d: SourceDoc) => T | null): T[] {
  return docs.map(map).filter((x): x is T => x !== null);
}

export function useTaxEntries(fy: FinancialYearKey, options?: Options) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const entriesSource = useReadModelSource("taxEntries");
  const [state, setState] = useState<TaxYearState<TaxEntry>>(LOADING);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db || !isFinancialYearKey(fy)) {
      setState(IDLE);
      return;
    }
    setState(LOADING);
    const path = `users/${uid}/taxEntries`;
    const apply = (docs: SourceDoc[]) => {
      setState({ items: sortByCreated(collect(docs, (d) => taxEntryFromDoc(d.id, d.data, fy))), loading: false });
      setError(null);
    };
    if (entriesSource.mode === "supabase") return entriesSource.subscribe(apply, { where: inTaxYear(fy) });
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "taxEntries"), where("fy", "==", fy)),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (entriesSource.mode === "shadow") void entriesSource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler(
        "snapshot.taxEntries",
        (failure) => {
          setError(failure);
          setState(IDLE);
        },
        "Couldn't load your tax records."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, fy, attempt, setError, entriesSource.mode]);

  return { entries: state.items, loading: state.loading, error, retry };
}

export function useTaxReviews(fy: FinancialYearKey, options?: Options) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const reviewsSource = useReadModelSource("taxReviews");
  const [state, setState] = useState<TaxYearState<TaxReview>>(LOADING);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db || !isFinancialYearKey(fy)) {
      setState(IDLE);
      return;
    }
    setState(LOADING);
    const path = `users/${uid}/taxReviews`;
    const apply = (docs: SourceDoc[]) => {
      setState({ items: sortByCreated(collect(docs, (d) => taxReviewFromDoc(d.id, d.data, fy))), loading: false });
      setError(null);
    };
    if (reviewsSource.mode === "supabase") return reviewsSource.subscribe(apply, { where: inTaxYear(fy) });
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "taxReviews"), where("fy", "==", fy)),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (reviewsSource.mode === "shadow") void reviewsSource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler(
        "snapshot.taxReviews",
        (failure) => {
          setError(failure);
          setState(IDLE);
        },
        "Couldn't load your tax review decisions."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, fy, attempt, setError, reviewsSource.mode]);

  return { reviews: state.items, loading: state.loading, error, retry };
}

export function useTaxProfile(fy: FinancialYearKey, options?: Options) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const profilesSource = useReadModelSource("taxProfiles");
  const [state, setState] = useState<TaxYearState<TaxProfile>>(LOADING);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db || !isFinancialYearKey(fy)) {
      setState(IDLE);
      return;
    }
    setState(LOADING);
    const path = `users/${uid}/taxProfiles`;
    const apply = (docs: SourceDoc[]) => {
      setState({ items: collect(docs, (d) => taxProfileFromDoc(d.id, d.data)), loading: false });
      setError(null);
    };
    if (profilesSource.mode === "supabase") return profilesSource.subscribe(apply, { where: inTaxYear(fy) });
    // One document per year; a query (not a doc listener) so both sources hand over the same shape.
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "taxProfiles"), where("fy", "==", fy)),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (profilesSource.mode === "shadow") void profilesSource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler(
        "snapshot.taxProfiles",
        (failure) => {
          setError(failure);
          setState(IDLE);
        },
        "Couldn't load your tax profile."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, fy, attempt, setError, profilesSource.mode]);

  return { profile: state.items.find((p) => p.id === fy) ?? null, loading: state.loading, error, retry };
}

export function useTaxDocuments(fy: FinancialYearKey, options?: Options) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const documentsSource = useReadModelSource("taxDocuments");
  const [state, setState] = useState<TaxYearState<TaxDocument>>(LOADING);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db || !isFinancialYearKey(fy)) {
      setState(IDLE);
      return;
    }
    setState(LOADING);
    const path = `users/${uid}/taxDocuments`;
    const apply = (docs: SourceDoc[]) => {
      setState({ items: sortByCreated(collect(docs, (d) => taxDocumentFromDoc(d.id, d.data, fy))), loading: false });
      setError(null);
    };
    if (documentsSource.mode === "supabase") return documentsSource.subscribe(apply, { where: inTaxYear(fy) });
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "taxDocuments"), where("fy", "==", fy)),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (documentsSource.mode === "shadow") void documentsSource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler(
        "snapshot.taxDocuments",
        (failure) => {
          setError(failure);
          setState(IDLE);
        },
        "Couldn't load your tax documents."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, fy, attempt, setError, documentsSource.mode]);

  return { documents: state.items, loading: state.loading, error, retry };
}

export function useTaxSnapshots(fy: FinancialYearKey, options?: Options) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const snapshotsSource = useReadModelSource("taxSnapshots");
  const [state, setState] = useState<TaxYearState<TaxSnapshot>>(LOADING);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db || !isFinancialYearKey(fy)) {
      setState(IDLE);
      return;
    }
    setState(LOADING);
    const path = `users/${uid}/taxSnapshots`;
    const apply = (docs: SourceDoc[]) => {
      setState({ items: sortByCreated(collect(docs, (d) => taxSnapshotFromDoc(d.id, d.data, fy))), loading: false });
      setError(null);
    };
    if (snapshotsSource.mode === "supabase") return snapshotsSource.subscribe(apply, { where: inTaxYear(fy) });
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "taxSnapshots"), where("fy", "==", fy)),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (snapshotsSource.mode === "shadow") void snapshotsSource.shadow(docs, { windowed: true });
      },
      snapshotErrorHandler(
        "snapshot.taxSnapshots",
        (failure) => {
          setError(failure);
          setState(IDLE);
        },
        "Couldn't load your saved tax estimates."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, fy, attempt, setError, snapshotsSource.mode]);

  return { snapshots: state.items, loading: state.loading, error, retry };
}
