import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { getRandomBytes } from "expo-crypto";

import { getFirestoreDb } from "@/lib/firebase";
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
        setLoading(false);
      },
      (error) => {
        console.error("usePaymentRequests error:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid, enabled]);

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

      await addDoc(collection(db, "paymentRequests"), newRequest);
      toast.success("Payment request created!");
      return slug;
    } catch (err) {
      console.error("createPaymentRequest error:", err);
      toast.error("Failed to create payment request");
      return null;
    }
  };

  const cancelPaymentRequest = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      await updateDoc(doc(db, "paymentRequests", id), { status: "cancelled" });
      toast.success("Payment request cancelled");
      return true;
    } catch (err) {
      console.error("cancelPaymentRequest error:", err);
      toast.error("Failed to cancel");
      return false;
    }
  };

  const deletePaymentRequest = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      await deleteDoc(doc(db, "paymentRequests", id));
      toast.success("Payment request deleted");
      return true;
    } catch (err) {
      console.error("deletePaymentRequest error:", err);
      toast.error("Failed to delete");
      return false;
    }
  };

  return {
    requests,
    loading,
    createPaymentRequest,
    cancelPaymentRequest,
    deletePaymentRequest,
  };
}
