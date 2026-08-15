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

import { logError, logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type {
  Borrowing,
  BorrowingRepayment,
} from "@/shared/types/borrowing";
import {
  allocateRepayment,
  summarizeBorrowing,
  summarizeBorrowings,
  validateRepayment,
  type BorrowingSummary,
} from "@/shared/utils/borrowingMath";
import { monthFromDateKey, todayDateKey } from "@/shared/utils/dates";

export type CreateBorrowingInput = Omit<
  Borrowing,
  "id" | "userId" | "status" | "createdAt" | "updatedAt"
>;

export type AddRepaymentInput = {
  borrowingId: string;
  amount: number;
  paymentAccountId?: string | null;
  date: string;
  note?: string;
  /** Opt-in escape hatch; the form keeps this off. */
  allowOverpayment?: boolean;
};

/**
 * Derived snapshot written back onto the borrowing doc so lists can filter and
 * sort without loading every repayment. Display always uses the live summary.
 */
function denormalizedFields(summary: BorrowingSummary) {
  return {
    outstandingPrincipal: summary.outstandingPrincipal,
    accruedInterest: summary.interestAccrued,
    totalOutstanding: summary.totalOutstanding,
    status: summary.status,
    settledDate: summary.settledDate,
    updatedAt: serverTimestamp(),
  };
}

export function useBorrowings(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;

  const [borrowings, setBorrowings] = useState<Borrowing[]>([]);
  const [repayments, setRepayments] = useState<BorrowingRepayment[]>([]);
  const [loading, setLoading] = useState(true);
  const { error, setError, retry, attempt } = useLoadFailure();

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !enabled || !db) {
      setBorrowings([]);
      setRepayments([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubBorrowings = onSnapshot(
      query(
        collection(db, "users", uid, "borrowings"),
        orderBy("borrowedDate", "desc")
      ),
      (snapshot) => {
        setBorrowings(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Borrowing, "id">),
          }))
        );
        setError(null);
        setLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.borrowings",
        (failure) => {
          setError(failure);
          setLoading(false);
        },
        "Couldn't load your borrowings."
      )
    );

    const unsubRepayments = onSnapshot(
      query(
        collection(db, "users", uid, "borrowingRepayments"),
        orderBy("date", "desc")
      ),
      (snapshot) => {
        setRepayments(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<BorrowingRepayment, "id">),
          }))
        );
      },
      (err) => logWarning("snapshot.borrowing.repayments", err)
    );

    return () => {
      unsubBorrowings();
      unsubRepayments();
    };
  }, [uid, enabled, attempt]);

  const today = todayDateKey();

  const summaries = useMemo(() => {
    const map = new Map<string, BorrowingSummary>();
    for (const borrowing of borrowings) {
      if (!borrowing.id) continue;
      map.set(borrowing.id, summarizeBorrowing(borrowing, repayments, today));
    }
    return map;
  }, [borrowings, repayments, today]);

  const portfolio = useMemo(
    () => summarizeBorrowings(borrowings, repayments, today),
    [borrowings, repayments, today]
  );

  const getSummary = useCallback(
    (borrowingId: string) => summaries.get(borrowingId) ?? null,
    [summaries]
  );

  const getRepayments = useCallback(
    (borrowingId: string) =>
      repayments
        .filter((r) => r.borrowingId === borrowingId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [repayments]
  );

  const createBorrowing = useCallback(
    async (input: CreateBorrowingInput): Promise<string | null> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      try {
        const ref = await addDoc(collection(db, "users", uid, "borrowings"), {
          ...input,
          userId: uid,
          lenderId: input.lenderId ?? null,
          dueDate: input.dueDate ?? null,
          creditedAccountId: input.creditedAccountId ?? null,
          outstandingPrincipal: input.principalAmount,
          accruedInterest: 0,
          totalOutstanding: input.principalAmount,
          status: "ACTIVE",
          settledDate: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        toast.success("Borrowing recorded");
        return ref.id;
      } catch (err) {
        logError("borrowings.createborrowing", err);
        toast.error("Failed to record borrowing");
        return null;
      }
    },
    [uid]
  );

  const updateBorrowing = useCallback(
    async (id: string, updates: Partial<Borrowing>): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !id) return false;

      try {
        await updateDoc(doc(db, "users", uid, "borrowings", id), {
          ...updates,
          updatedAt: serverTimestamp(),
        });
        toast.success("Borrowing updated");
        return true;
      } catch (err) {
        logError("borrowings.updateborrowing", err);
        toast.error("Failed to update borrowing");
        return false;
      }
    },
    [uid]
  );

  /** Deletes the borrowing along with every repayment that belongs to it. */
  const deleteBorrowing = useCallback(
    async (id: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db || !id) return false;

      try {
        const linked = await getDocs(
          query(
            collection(db, "users", uid, "borrowingRepayments"),
            where("borrowingId", "==", id)
          )
        );

        const batch = writeBatch(db);
        linked.docs.forEach((repaymentDoc) => batch.delete(repaymentDoc.ref));
        batch.delete(doc(db, "users", uid, "borrowings", id));
        await batch.commit();

        toast.success("Borrowing deleted");
        return true;
      } catch (err) {
        logError("borrowings.deleteborrowing", err);
        toast.error("Failed to delete borrowing");
        return false;
      }
    },
    [uid]
  );

  const addRepayment = useCallback(
    async (input: AddRepaymentInput): Promise<string | null> => {
      const db = getFirestoreDb();
      if (!uid || !db) {
        toast.error("Not authenticated");
        return null;
      }

      const borrowing = borrowings.find((b) => b.id === input.borrowingId);
      if (!borrowing) {
        toast.error("Borrowing not found");
        return null;
      }

      const summary = summarizeBorrowing(borrowing, repayments, input.date);
      const validation = validateRepayment(input.amount, summary, {
        allowOverpayment: input.allowOverpayment,
      });
      if (!validation.ok) {
        toast.error(validation.error ?? "Invalid repayment");
        return null;
      }

      const allocation = allocateRepayment(input.amount, summary);

      try {
        const ref = await addDoc(
          collection(db, "users", uid, "borrowingRepayments"),
          {
            borrowingId: input.borrowingId,
            amount: input.amount,
            principalComponent: allocation.principalComponent,
            interestComponent: allocation.interestComponent,
            paymentAccountId: input.paymentAccountId ?? null,
            date: input.date,
            month: monthFromDateKey(input.date),
            note: input.note ?? "",
            createdAt: serverTimestamp(),
          }
        );

        const nextSummary = summarizeBorrowing(
          borrowing,
          [
            ...repayments,
            {
              id: ref.id,
              borrowingId: input.borrowingId,
              amount: input.amount,
              principalComponent: allocation.principalComponent,
              interestComponent: allocation.interestComponent,
              date: input.date,
            },
          ],
          todayDateKey()
        );

        await updateDoc(
          doc(db, "users", uid, "borrowings", input.borrowingId),
          denormalizedFields(nextSummary)
        );

        toast.success(
          nextSummary.status === "FULLY_SETTLED"
            ? "Borrowing settled"
            : "Repayment recorded"
        );
        return ref.id;
      } catch (err) {
        logError("borrowings.addrepayment", err);
        toast.error("Failed to record repayment");
        return null;
      }
    },
    [uid, borrowings, repayments]
  );

  const deleteRepayment = useCallback(
    async (repaymentId: string, borrowingId: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;

      const borrowing = borrowings.find((b) => b.id === borrowingId);

      try {
        await deleteDoc(
          doc(db, "users", uid, "borrowingRepayments", repaymentId)
        );

        if (borrowing) {
          const nextSummary = summarizeBorrowing(
            borrowing,
            repayments.filter((r) => r.id !== repaymentId),
            todayDateKey()
          );
          await updateDoc(
            doc(db, "users", uid, "borrowings", borrowingId),
            denormalizedFields(nextSummary)
          );
        }

        toast.success("Repayment removed");
        return true;
      } catch (err) {
        logError("borrowings.deleterepayment", err);
        toast.error("Failed to remove repayment");
        return false;
      }
    },
    [uid, borrowings, repayments]
  );

  return {
    error,
    retry,
    borrowings,
    repayments,
    summaries,
    portfolio,
    loading,
    getSummary,
    getRepayments,
    createBorrowing,
    updateBorrowing,
    deleteBorrowing,
    addRepayment,
    deleteRepayment,
  };
}
