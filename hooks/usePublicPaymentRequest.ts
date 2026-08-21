/**
 * Reads the world-readable `paymentRequests` doc behind `/payment/:slug`.
 *
 * Live rather than one-shot so the QR amount stops being stale while the page
 * is open: the organizer marking the share collected drops the remaining due to
 * zero, and the payer should see that rather than a QR for money they no longer
 * owe. `attempt` is in the deps so `retry()` re-attaches the listener.
 */

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, query, where } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, toLoadFailure, type LoadFailure } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import type { PaymentRequest } from "@/shared/types/paymentRequest";

export type UsePublicPaymentRequest = {
  request: PaymentRequest | null;
  loading: boolean;
  error: LoadFailure | null;
  retry: () => void;
};

export function usePublicPaymentRequest(
  slug: string | undefined
): UsePublicPaymentRequest {
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    if (!slug) {
      setRequest(null);
      setLoading(false);
      setError(toLoadFailure(new Error("missing-slug"), "Missing payment link."));
      return;
    }

    const db = getFirestoreDb();
    if (!db) {
      setRequest(null);
      setLoading(false);
      setError(
        toLoadFailure(
          new Error("firestore-unavailable"),
          "Payments aren't configured on this device."
        )
      );
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, "paymentRequests"),
      where("slug", "==", slug),
      limit(1)
    );

    return onSnapshot(
      q,
      (snap) => {
        setLoading(false);
        if (snap.empty) {
          setRequest(null);
          setError({
            message: "This payment link is invalid or has expired.",
            kind: "notFound",
            retryable: false,
          });
          return;
        }
        const docSnap = snap.docs[0];
        setError(null);
        setRequest({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PaymentRequest, "id">),
        });
      },
      snapshotErrorHandler(
        "snapshot.publicPaymentRequest",
        (failure) => {
          setRequest(null);
          setError(failure);
          setLoading(false);
        },
        "Couldn't load this payment request."
      )
    );
  }, [slug, attempt, setError]);

  return { request, loading, error, retry };
}
