/**
 * Reads the world-readable `paymentRequests` doc behind `/payment/:slug`.
 *
 * Live rather than one-shot so the QR amount stops being stale while the page
 * is open: the organizer marking the share collected drops the remaining due to
 * zero, and the payer should see that rather than a QR for money they no longer
 * owe. `attempt` is in the deps so `retry()` re-attaches the listener.
 *
 * Prefers get-by-slug (document id). Falls back to a slug query for auto-id
 * docs minted before SPENDLY-36, until those are backfilled.
 */

import { useEffect, useState } from "react";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, toLoadFailure, type LoadFailure } from "@/lib/firestoreErrors";
import { listenBySlugWithQueryFallback } from "@/lib/listenBySlug";
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

    return listenBySlugWithQueryFallback(db, "paymentRequests", slug, {
      onDoc: (id, data) => {
        setLoading(false);
        setError(null);
        setRequest({
          id,
          ...(data as Omit<PaymentRequest, "id">),
        });
      },
      onMissing: () => {
        setLoading(false);
        setRequest(null);
        setError({
          message: "This payment link is invalid or has expired.",
          kind: "notFound",
          retryable: false,
        });
      },
      onError: snapshotErrorHandler(
        "snapshot.publicPaymentRequest",
        (failure) => {
          setRequest(null);
          setError(failure);
          setLoading(false);
        },
        "Couldn't load this payment request."
      ),
    });
  }, [slug, attempt, setError]);

  return { request, loading, error, retry };
}
