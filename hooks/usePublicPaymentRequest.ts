import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { logError } from "@/lib/errors";
import type { PaymentRequest } from "@/shared/types/paymentRequest";

export function usePublicPaymentRequest(slug: string | undefined) {
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [loading, setLoading] = useState(Boolean(slug));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setRequest(null);
      setLoading(false);
      setError("Missing payment link.");
      return;
    }

    let cancelled = false;
    const db = getFirestoreDb();
    if (!db) {
      setRequest(null);
      setLoading(false);
      setError("Payments aren't configured on this device.");
      return;
    }

    setLoading(true);
    setError(null);

    const q = query(
      collection(db, "paymentRequests"),
      where("slug", "==", slug),
      limit(1)
    );

    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        if (snap.empty) {
          setRequest(null);
          setError("This payment link is invalid or has expired.");
          return;
        }
        const docSnap = snap.docs[0];
        setRequest({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PaymentRequest, "id">),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        logError("publicPaymentRequest.load", err);
        setRequest(null);
        setError("Couldn't load this payment request.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { request, loading, error };
}
