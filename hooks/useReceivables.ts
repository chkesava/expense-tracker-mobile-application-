import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type {
  Receivable,
  ReceivableRepayment,
} from "@/shared/types/receivable";
import {
  summarizeReceivable,
  summarizeReceivables,
  validateReceivableRepayment,
  type ReceivableSummary,
} from "@/shared/utils/receivableMath";
import { monthFromDateKey, todayDateKey } from "@/shared/utils/dates";

export type CreateReceivableInput = Omit<
  Receivable,
  "id" | "userId" | "status" | "createdAt" | "updatedAt"
>;

export type AddReceivableRepaymentInput = {
  receivableId: string;
  amount: number;
  receivedAccountId?: string | null;
  date: string;
  note?: string;
  allowOverpayment?: boolean;
};

function denormalizedFields(summary: ReceivableSummary) {
  return {
    totalReceived: summary.totalReceived,
    outstandingAmount: summary.outstandingAmount,
    status: summary.status,
    settledDate: summary.settledDate,
    updatedAt: serverTimestamp(),
  };
}

export function useReceivables(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [repayments, setRepayments] = useState<ReceivableRepayment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setReceivables([]);
      setRepayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubReceivables = onSnapshot(
      query(
        collection(db, "users", uid, "receivables"),
        orderBy("lentDate", "desc")
      ),
      (snapshot) => {
        setReceivables(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Receivable, "id">),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.warn("Error fetching receivables:", err);
        setLoading(false);
      }
    );

    const unsubRepayments = onSnapshot(
      query(
        collection(db, "users", uid, "receivableRepayments"),
        orderBy("date", "desc")
      ),
      (snapshot) => {
        setRepayments(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<ReceivableRepayment, "id">),
          }))
        );
      },
      (err) => {
        console.warn("Error fetching receivable repayments:", err);
      }
    );

    return () => {
      unsubReceivables();
      unsubRepayments();
    };
  }, [uid, enabled]);

  const today = todayDateKey();

  const summaries = useMemo(() => {
    const map = new Map<string, ReceivableSummary>();
    for (const receivable of receivables) {
      if (!receivable.id) continue;
      map.set(receivable.id, summarizeReceivable(receivable, repayments, today));
    }
    return map;
  }, [receivables, repayments, today]);

  const portfolio = useMemo(
    () => summarizeReceivables(receivables, repayments, today),
    [receivables, repayments, today]
  );

  const getSummary = useCallback(
    (receivableId: string) => summaries.get(receivableId) ?? null,
    [summaries]
  );

  const getRepayments = useCallback(
    (receivableId: string) =>
      repayments
        .filter((r) => r.receivableId === receivableId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [repayments]
  );

  const createReceivable = useCallback(
    async (input: CreateReceivableInput): Promise<string | null> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      try {
        const ref = await addDoc(collection(db, "users", uid, "receivables"), {
          ...input,
          userId: uid,
          personId: input.personId ?? null,
          dueDate: input.dueDate ?? null,
          purpose: input.purpose ?? "",
          note: input.note ?? "",
          ...(input.spaceId ? { spaceId: input.spaceId } : {}),
          totalReceived: 0,
          outstandingAmount: input.originalAmount,
          status: "ACTIVE",
          settledDate: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("Money lent recorded");
        return ref.id;
      } catch (err) {
        console.error("createReceivable error:", err);
        toast.error("Failed to record money lent");
        return null;
      }
    },
    [uid]
  );

  const updateReceivable = useCallback(
    async (id: string, updates: Partial<Receivable>): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !id) return false;

      const existing = receivables.find((r) => r.id === id);
      if (existing && updates.originalAmount != null) {
        const summary = summarizeReceivable(existing, repayments, todayDateKey());
        if (updates.originalAmount < summary.totalReceived) {
          toast.error(
            `Original amount cannot be less than ${summary.totalReceived} already received.`
          );
          return false;
        }
      }

      try {
        const payload: Record<string, unknown> = {
          ...updates,
          updatedAt: serverTimestamp(),
        };
        if ("spaceId" in updates) {
          payload.spaceId = updates.spaceId ?? null;
        }

        await updateDoc(doc(db, "users", uid, "receivables", id), payload);

        if (existing && updates.originalAmount != null) {
          const next = summarizeReceivable(
            { ...existing, ...updates, originalAmount: updates.originalAmount },
            repayments,
            todayDateKey()
          );
          await updateDoc(
            doc(db, "users", uid, "receivables", id),
            denormalizedFields(next)
          );
        }

        toast.success("Receivable updated");
        return true;
      } catch (err) {
        console.error("updateReceivable error:", err);
        toast.error("Failed to update receivable");
        return false;
      }
    },
    [uid, receivables, repayments]
  );

  const deleteReceivable = useCallback(
    async (id: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !id) return false;

      try {
        const linked = await getDocs(
          query(
            collection(db, "users", uid, "receivableRepayments"),
            where("receivableId", "==", id)
          )
        );

        const batch = writeBatch(db);
        linked.docs.forEach((repaymentDoc) => batch.delete(repaymentDoc.ref));
        batch.delete(doc(db, "users", uid, "receivables", id));
        await batch.commit();

        toast.success("Receivable deleted");
        return true;
      } catch (err) {
        console.error("deleteReceivable error:", err);
        toast.error("Failed to delete receivable");
        return false;
      }
    },
    [uid]
  );

  const addRepayment = useCallback(
    async (input: AddReceivableRepaymentInput): Promise<string | null> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      const receivable = receivables.find((r) => r.id === input.receivableId);
      if (!receivable) {
        toast.error("Receivable not found");
        return null;
      }

      if (receivable.status === "CANCELLED") {
        toast.error("This receivable is cancelled.");
        return null;
      }

      const summary = summarizeReceivable(receivable, repayments, input.date);
      const validation = validateReceivableRepayment(input.amount, summary, {
        allowOverpayment: input.allowOverpayment,
      });
      if (!validation.ok) {
        toast.error(validation.error ?? "Invalid repayment");
        return null;
      }

      try {
        const ref = await addDoc(
          collection(db, "users", uid, "receivableRepayments"),
          {
            receivableId: input.receivableId,
            amount: input.amount,
            receivedAccountId: input.receivedAccountId ?? null,
            date: input.date,
            month: monthFromDateKey(input.date),
            note: input.note ?? "",
            createdAt: serverTimestamp(),
          }
        );

        const nextSummary = summarizeReceivable(
          receivable,
          [
            ...repayments,
            {
              id: ref.id,
              receivableId: input.receivableId,
              amount: input.amount,
              date: input.date,
            },
          ],
          todayDateKey()
        );

        await updateDoc(
          doc(db, "users", uid, "receivables", input.receivableId),
          denormalizedFields(nextSummary)
        );

        toast.success(
          nextSummary.status === "FULLY_SETTLED"
            ? "Receivable settled"
            : "Repayment recorded"
        );
        return ref.id;
      } catch (err) {
        console.error("addReceivableRepayment error:", err);
        toast.error("Failed to record repayment");
        return null;
      }
    },
    [uid, receivables, repayments]
  );

  const deleteRepayment = useCallback(
    async (repaymentId: string, receivableId: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;

      const receivable = receivables.find((r) => r.id === receivableId);

      try {
        await deleteDoc(
          doc(db, "users", uid, "receivableRepayments", repaymentId)
        );

        if (receivable) {
          const nextSummary = summarizeReceivable(
            receivable,
            repayments.filter((r) => r.id !== repaymentId),
            todayDateKey()
          );
          await updateDoc(
            doc(db, "users", uid, "receivables", receivableId),
            denormalizedFields(nextSummary)
          );
        }

        toast.success("Repayment removed");
        return true;
      } catch (err) {
        console.error("deleteReceivableRepayment error:", err);
        toast.error("Failed to remove repayment");
        return false;
      }
    },
    [uid, receivables, repayments]
  );

  const markSettled = useCallback(
    async (id: string): Promise<boolean> => {
      const receivable = receivables.find((r) => r.id === id);
      if (!receivable) return false;
      const summary = summarizeReceivable(receivable, repayments, todayDateKey());
      if (summary.outstandingAmount > 0) {
        toast.error(
          `Still ${summary.outstandingAmount} outstanding. Record a repayment to settle.`
        );
        return false;
      }
      return updateReceivable(id, {
        status: "FULLY_SETTLED",
        settledDate: summary.settledDate ?? todayDateKey(),
      });
    },
    [receivables, repayments, updateReceivable]
  );

  const cancelReceivable = useCallback(
    async (id: string): Promise<boolean> =>
      updateReceivable(id, { status: "CANCELLED" }),
    [updateReceivable]
  );

  return {
    receivables,
    repayments,
    summaries,
    portfolio,
    loading,
    getSummary,
    getRepayments,
    createReceivable,
    updateReceivable,
    deleteReceivable,
    addRepayment,
    deleteRepayment,
    markSettled,
    cancelReceivable,
  };
}
