import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query } from "@/lib/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { forgetSnapshotPath } from "@/lib/firestoreReadDebug";
import { toSourceDocs, type SourceDoc } from "@/lib/readModelLocal/readSource";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { useTaxEntries, useTaxReviews } from "@/hooks/useTaxData";
import { useAuth } from "@/providers/AuthProvider";
import type { Holding, PortfolioTransaction } from "@/shared/features/portfolio/types";
import type { FinancialYearKey } from "@/shared/features/tax/types";
import { assembleCapitalGains } from "@/shared/features/tax/utils/capitalGains";

/**
 * The year's capital gains (SPENDLY-293): sales Spendly finds in the
 * portfolio's trades, and the rows and statement totals the user adds.
 *
 * Reads only while the screen is open (SPENDLY-406). Trades and holdings go
 * through their own switches (display only: a decision re-reads the SELL row
 * from Firestore before writing, `taxCapitalGainStore`, R4.3a). The whole
 * trade history is read, not just the year: first-in-first-out needs the
 * earlier buys and sales.
 */
export function useTaxCapitalGains(fy: FinancialYearKey, options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const entries = useTaxEntries(fy, { enabled });
  const reviews = useTaxReviews(fy, { enabled });
  const holdingsSource = useReadModelSource("holdings");
  const transactionsSource = useReadModelSource("portfolioTransactions");
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [transactions, setTransactions] = useState<PortfolioTransaction[] | null>(null);
  const holdingsFailure = useLoadFailure();
  const tradesFailure = useLoadFailure();
  const setHoldingsError = holdingsFailure.setError;
  const setTradesError = tradesFailure.setError;

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setHoldings([]);
      return;
    }
    setHoldings(null);
    const path = `users/${uid}/holdings`;
    const apply = (docs: SourceDoc[]) => {
      setHoldings(docs.map((d) => ({ id: d.id, ...d.data }) as Holding));
      setHoldingsError(null);
    };
    if (holdingsSource.mode === "supabase") return holdingsSource.subscribe(apply);
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "holdings")),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (holdingsSource.mode === "shadow") void holdingsSource.shadow(docs);
      },
      snapshotErrorHandler(
        "snapshot.taxHoldings",
        (failure) => {
          setHoldingsError(failure);
          setHoldings([]);
        },
        "Couldn't load your holdings."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, holdingsFailure.attempt, setHoldingsError, holdingsSource.mode]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setTransactions([]);
      return;
    }
    setTransactions(null);
    const path = `users/${uid}/portfolioTransactions`;
    const apply = (docs: SourceDoc[]) => {
      setTransactions(docs.map((d) => ({ id: d.id, ...d.data }) as PortfolioTransaction));
      setTradesError(null);
    };
    if (transactionsSource.mode === "supabase") return transactionsSource.subscribe(apply);
    const unsubscribe = onSnapshot(
      query(collection(db, "users", uid, "portfolioTransactions")),
      (snap) => {
        const docs = toSourceDocs(snap);
        apply(docs);
        if (transactionsSource.mode === "shadow") void transactionsSource.shadow(docs);
      },
      snapshotErrorHandler(
        "snapshot.taxPortfolioTransactions",
        (failure) => {
          setTradesError(failure);
          setTransactions([]);
        },
        "Couldn't load your trades."
      )
    );
    return () => {
      forgetSnapshotPath(path);
      unsubscribe();
    };
  }, [uid, enabled, tradesFailure.attempt, setTradesError, transactionsSource.mode]);

  const summary = useMemo(
    () =>
      assembleCapitalGains({
        fy,
        transactions: transactions ?? [],
        holdings: holdings ?? [],
        entries: entries.entries,
        reviews: reviews.reviews,
      }),
    [fy, transactions, holdings, entries.entries, reviews.reviews]
  );

  const loading = entries.loading || reviews.loading || (enabled && (holdings === null || transactions === null));
  const error = entries.error ?? reviews.error ?? holdingsFailure.error ?? tradesFailure.error ?? null;
  const retry = () => {
    entries.retry();
    reviews.retry();
    holdingsFailure.retry();
    tradesFailure.retry();
  };

  return { summary, entries: entries.entries, loading, error, retry };
}
