import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getRandomBytes } from "expo-crypto";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type { PaymentRequest, PaymentRequestInput } from "@/shared/types/paymentRequest";
import { getStoredQrStyleId } from "@/shared/utils/qrStyles";

/**
 * Generates a URL-safe random slug of ~8 chars using expo-crypto.
 */
function generateSlug(): string {
  const bytes = getRandomBytes(6);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 10);
}

export function usePaymentRequests(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, "paymentRequests"),
      where("createdBy", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: PaymentRequest[] = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<PaymentRequest, "id">),
        }));
        setRequests(list);
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.paymentRequests",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your payment requests."
      )
    );

    return unsubscribe;
  }, [uid, enabled, attempt]);

  const createPaymentRequest = async (
    input: PaymentRequestInput
  ): Promise<string | null> => {
    const db = getFirestoreDb();
    if (!uid || !db) return null;

    try {
      const slug = generateSlug();
      const newRequest: Omit<PaymentRequest, "id"> = {
        ...input,
        slug,
        createdBy: uid,
        createdAt: Date.now(),
        status: "active",
        qrStyleId: input.qrStyleId || getStoredQrStyleId(),
      };

      const outcome = await commitWrite(
        () => setDoc(doc(collection(db, "paymentRequests")), newRequest),
        { label: "payment request" }
      );
      toast.success(writeSavedMessage(outcome, "Payment request created!"));
      return slug;
    } catch (err) {
      logError("paymentRequests.createpaymentrequest", err);
      toast.error("Failed to create payment request");
      return null;
    }
  };

  const cancelPaymentRequest = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const outcome = await commitWrite(
        () => updateDoc(doc(db, "paymentRequests", id), { status: "cancelled" }),
        { label: "payment request" }
      );
      toast.success(writeSavedMessage(outcome, "Payment request cancelled"));
      return true;
    } catch (err) {
      logError("paymentRequests.cancelpaymentrequest", err);
      toast.error("Failed to cancel");
      return false;
    }
  };

  const deletePaymentRequest = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const outcome = await commitWrite(
        () => deleteDoc(doc(db, "paymentRequests", id)),
        { label: "payment request deletion" }
      );
      toast.success(writeSavedMessage(outcome, "Payment request deleted"));
      return true;
    } catch (err) {
      logError("paymentRequests.deletepaymentrequest", err);
      toast.error("Failed to delete");
      return false;
    }
  };

  return {
    error,
    retry,
    requests,
    loading,
    createPaymentRequest,
    cancelPaymentRequest,
    deletePaymentRequest,
  };
}
