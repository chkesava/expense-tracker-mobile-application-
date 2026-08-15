/**
 * Shared borrowings + receivables data — one Firestore listener per collection
 * for the whole app, instead of every consumer (dashboard, ledger tabs, the
 * unified net-worth calculation) opening its own. Mirrors the sub-context
 * pattern already used by FinanceDataProvider for expenses/incomes/accounts.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
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
import type { Borrowing, BorrowingRepayment } from "@/shared/types/borrowing";
import type { Receivable, ReceivableRepayment } from "@/shared/types/receivable";
import {
  allocateRepayment,
  summarizeBorrowing,
  summarizeBorrowings,
  validateRepayment,
  type BorrowingSummary,
} from "@/shared/utils/borrowingMath";
import {
  summarizeReceivable,
  summarizeReceivables,
  validateReceivableRepayment,
  type ReceivableSummary,
} from "@/shared/utils/receivableMath";
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
  allowOverpayment?: boolean;
};

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

function denormalizedBorrowingFields(summary: BorrowingSummary) {
  return {
    outstandingPrincipal: summary.outstandingPrincipal,
    accruedInterest: summary.interestAccrued,
    totalOutstanding: summary.totalOutstanding,
    status: summary.status,
    settledDate: summary.settledDate,
    updatedAt: serverTimestamp(),
  };
}

function denormalizedReceivableFields(summary: ReceivableSummary) {
  return {
    totalReceived: summary.totalReceived,
    outstandingAmount: summary.outstandingAmount,
    status: summary.status,
    settledDate: summary.settledDate,
    updatedAt: serverTimestamp(),
  };
}

export type BorrowingsContextType = {
  borrowings: Borrowing[];
  repayments: BorrowingRepayment[];
  summaries: Map<string, BorrowingSummary>;
  portfolio: ReturnType<typeof summarizeBorrowings>;
  loading: boolean;
  getSummary: (borrowingId: string) => BorrowingSummary | null;
  getRepayments: (borrowingId: string) => BorrowingRepayment[];
  createBorrowing: (input: CreateBorrowingInput) => Promise<string | null>;
  updateBorrowing: (id: string, updates: Partial<Borrowing>) => Promise<boolean>;
  deleteBorrowing: (id: string) => Promise<boolean>;
  addRepayment: (input: AddRepaymentInput) => Promise<string | null>;
  deleteRepayment: (repaymentId: string, borrowingId: string) => Promise<boolean>;
};

export type ReceivablesContextType = {
  receivables: Receivable[];
  repayments: ReceivableRepayment[];
  summaries: Map<string, ReceivableSummary>;
  portfolio: ReturnType<typeof summarizeReceivables>;
  loading: boolean;
  getSummary: (receivableId: string) => ReceivableSummary | null;
  getRepayments: (receivableId: string) => ReceivableRepayment[];
  createReceivable: (input: CreateReceivableInput) => Promise<string | null>;
  updateReceivable: (id: string, updates: Partial<Receivable>) => Promise<boolean>;
  deleteReceivable: (id: string) => Promise<boolean>;
  addRepayment: (input: AddReceivableRepaymentInput) => Promise<string | null>;
  deleteRepayment: (
    repaymentId: string,
    receivableId: string
  ) => Promise<boolean>;
  markSettled: (id: string) => Promise<boolean>;
  cancelReceivable: (id: string) => Promise<boolean>;
};

const BorrowingsContext = createContext<BorrowingsContextType | undefined>(
  undefined
);
const ReceivablesContext = createContext<ReceivablesContextType | undefined>(
  undefined
);

export function BorrowingsReceivablesProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user } = useAuth();
  const uid = user?.uid;

  const [borrowings, setBorrowings] = useState<Borrowing[]>([]);
  const [borrowingRepayments, setBorrowingRepayments] = useState<
    BorrowingRepayment[]
  >([]);
  const [borrowingsLoading, setBorrowingsLoading] = useState(true);

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [receivableRepayments, setReceivableRepayments] = useState<
    ReceivableRepayment[]
  >([]);
  const [receivablesLoading, setReceivablesLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setBorrowings([]);
      setBorrowingRepayments([]);
      setBorrowingsLoading(false);
      setReceivables([]);
      setReceivableRepayments([]);
      setReceivablesLoading(false);
      return;
    }

    setBorrowingsLoading(true);
    setReceivablesLoading(true);
    const base = ["users", uid] as const;

    const unsubBorrowings = onSnapshot(
      query(collection(db, ...base, "borrowings"), orderBy("borrowedDate", "desc")),
      (snapshot) => {
        setBorrowings(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Borrowing, "id">),
          }))
        );
        setBorrowingsLoading(false);
      },
      (err) => {
        console.warn("Error fetching borrowings:", err);
        setBorrowingsLoading(false);
      }
    );

    const unsubBorrowingRepayments = onSnapshot(
      query(
        collection(db, ...base, "borrowingRepayments"),
        orderBy("date", "desc")
      ),
      (snapshot) => {
        setBorrowingRepayments(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<BorrowingRepayment, "id">),
          }))
        );
      },
      (err) => {
        console.warn("Error fetching borrowing repayments:", err);
      }
    );

    const unsubReceivables = onSnapshot(
      query(collection(db, ...base, "receivables"), orderBy("lentDate", "desc")),
      (snapshot) => {
        setReceivables(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Receivable, "id">),
          }))
        );
        setReceivablesLoading(false);
      },
      (err) => {
        console.warn("Error fetching receivables:", err);
        setReceivablesLoading(false);
      }
    );

    const unsubReceivableRepayments = onSnapshot(
      query(
        collection(db, ...base, "receivableRepayments"),
        orderBy("date", "desc")
      ),
      (snapshot) => {
        setReceivableRepayments(
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
      unsubBorrowings();
      unsubBorrowingRepayments();
      unsubReceivables();
      unsubReceivableRepayments();
    };
  }, [uid]);

  const today = todayDateKey();

  // ─── Borrowings ─────────────────────────────────────────────────────────

  const borrowingSummaries = useMemo(() => {
    const map = new Map<string, BorrowingSummary>();
    for (const borrowing of borrowings) {
      if (!borrowing.id) continue;
      map.set(borrowing.id, summarizeBorrowing(borrowing, borrowingRepayments, today));
    }
    return map;
  }, [borrowings, borrowingRepayments, today]);

  const borrowingPortfolio = useMemo(
    () => summarizeBorrowings(borrowings, borrowingRepayments, today),
    [borrowings, borrowingRepayments, today]
  );

  const getBorrowingSummary = useCallback(
    (borrowingId: string) => borrowingSummaries.get(borrowingId) ?? null,
    [borrowingSummaries]
  );

  const getBorrowingRepayments = useCallback(
    (borrowingId: string) =>
      borrowingRepayments
        .filter((r) => r.borrowingId === borrowingId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [borrowingRepayments]
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
        console.error("createBorrowing error:", err);
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
        console.error("updateBorrowing error:", err);
        toast.error("Failed to update borrowing");
        return false;
      }
    },
    [uid]
  );

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
        console.error("deleteBorrowing error:", err);
        toast.error("Failed to delete borrowing");
        return false;
      }
    },
    [uid]
  );

  const addBorrowingRepayment = useCallback(
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
      const summary = summarizeBorrowing(borrowing, borrowingRepayments, input.date);
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
            ...borrowingRepayments,
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
          denormalizedBorrowingFields(nextSummary)
        );
        toast.success(
          nextSummary.status === "FULLY_SETTLED"
            ? "Borrowing settled"
            : "Repayment recorded"
        );
        return ref.id;
      } catch (err) {
        console.error("addRepayment error:", err);
        toast.error("Failed to record repayment");
        return null;
      }
    },
    [uid, borrowings, borrowingRepayments]
  );

  const deleteBorrowingRepayment = useCallback(
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
            borrowingRepayments.filter((r) => r.id !== repaymentId),
            todayDateKey()
          );
          await updateDoc(
            doc(db, "users", uid, "borrowings", borrowingId),
            denormalizedBorrowingFields(nextSummary)
          );
        }
        toast.success("Repayment removed");
        return true;
      } catch (err) {
        console.error("deleteRepayment error:", err);
        toast.error("Failed to remove repayment");
        return false;
      }
    },
    [uid, borrowings, borrowingRepayments]
  );

  // ─── Receivables ────────────────────────────────────────────────────────

  const receivableSummaries = useMemo(() => {
    const map = new Map<string, ReceivableSummary>();
    for (const receivable of receivables) {
      if (!receivable.id) continue;
      map.set(
        receivable.id,
        summarizeReceivable(receivable, receivableRepayments, today)
      );
    }
    return map;
  }, [receivables, receivableRepayments, today]);

  const receivablePortfolio = useMemo(
    () => summarizeReceivables(receivables, receivableRepayments, today),
    [receivables, receivableRepayments, today]
  );

  const getReceivableSummary = useCallback(
    (receivableId: string) => receivableSummaries.get(receivableId) ?? null,
    [receivableSummaries]
  );

  const getReceivableRepayments = useCallback(
    (receivableId: string) =>
      receivableRepayments
        .filter((r) => r.receivableId === receivableId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [receivableRepayments]
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
        const summary = summarizeReceivable(
          existing,
          receivableRepayments,
          todayDateKey()
        );
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
            receivableRepayments,
            todayDateKey()
          );
          await updateDoc(
            doc(db, "users", uid, "receivables", id),
            denormalizedReceivableFields(next)
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
    [uid, receivables, receivableRepayments]
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

  const addReceivableRepayment = useCallback(
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

      const summary = summarizeReceivable(
        receivable,
        receivableRepayments,
        input.date
      );
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
            ...receivableRepayments,
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
          denormalizedReceivableFields(nextSummary)
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
    [uid, receivables, receivableRepayments]
  );

  const deleteReceivableRepayment = useCallback(
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
            receivableRepayments.filter((r) => r.id !== repaymentId),
            todayDateKey()
          );
          await updateDoc(
            doc(db, "users", uid, "receivables", receivableId),
            denormalizedReceivableFields(nextSummary)
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
    [uid, receivables, receivableRepayments]
  );

  const markReceivableSettled = useCallback(
    async (id: string): Promise<boolean> => {
      const receivable = receivables.find((r) => r.id === id);
      if (!receivable) return false;
      const summary = summarizeReceivable(
        receivable,
        receivableRepayments,
        todayDateKey()
      );
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
    [receivables, receivableRepayments, updateReceivable]
  );

  const cancelReceivable = useCallback(
    async (id: string): Promise<boolean> =>
      updateReceivable(id, { status: "CANCELLED" }),
    [updateReceivable]
  );

  // ─── Context values ─────────────────────────────────────────────────────

  const borrowingsValue = useMemo<BorrowingsContextType>(
    () => ({
      borrowings,
      repayments: borrowingRepayments,
      summaries: borrowingSummaries,
      portfolio: borrowingPortfolio,
      loading: borrowingsLoading,
      getSummary: getBorrowingSummary,
      getRepayments: getBorrowingRepayments,
      createBorrowing,
      updateBorrowing,
      deleteBorrowing,
      addRepayment: addBorrowingRepayment,
      deleteRepayment: deleteBorrowingRepayment,
    }),
    [
      borrowings,
      borrowingRepayments,
      borrowingSummaries,
      borrowingPortfolio,
      borrowingsLoading,
      getBorrowingSummary,
      getBorrowingRepayments,
      createBorrowing,
      updateBorrowing,
      deleteBorrowing,
      addBorrowingRepayment,
      deleteBorrowingRepayment,
    ]
  );

  const receivablesValue = useMemo<ReceivablesContextType>(
    () => ({
      receivables,
      repayments: receivableRepayments,
      summaries: receivableSummaries,
      portfolio: receivablePortfolio,
      loading: receivablesLoading,
      getSummary: getReceivableSummary,
      getRepayments: getReceivableRepayments,
      createReceivable,
      updateReceivable,
      deleteReceivable,
      addRepayment: addReceivableRepayment,
      deleteRepayment: deleteReceivableRepayment,
      markSettled: markReceivableSettled,
      cancelReceivable,
    }),
    [
      receivables,
      receivableRepayments,
      receivableSummaries,
      receivablePortfolio,
      receivablesLoading,
      getReceivableSummary,
      getReceivableRepayments,
      createReceivable,
      updateReceivable,
      deleteReceivable,
      addReceivableRepayment,
      deleteReceivableRepayment,
      markReceivableSettled,
      cancelReceivable,
    ]
  );

  return (
    <BorrowingsContext.Provider value={borrowingsValue}>
      <ReceivablesContext.Provider value={receivablesValue}>
        {children}
      </ReceivablesContext.Provider>
    </BorrowingsContext.Provider>
  );
}

export function useBorrowingsContext() {
  const context = useContext(BorrowingsContext);
  if (!context) {
    throw new Error(
      "useBorrowingsContext must be used within a BorrowingsReceivablesProvider"
    );
  }
  return context;
}

export function useReceivablesContext() {
  const context = useContext(ReceivablesContext);
  if (!context) {
    throw new Error(
      "useReceivablesContext must be used within a BorrowingsReceivablesProvider"
    );
  }
  return context;
}
