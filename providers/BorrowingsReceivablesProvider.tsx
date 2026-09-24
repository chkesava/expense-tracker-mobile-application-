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
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

import { logError, logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import type { Borrowing, BorrowingRepayment } from "@/shared/types/borrowing";
import type { Receivable, ReceivableRepayment } from "@/shared/types/receivable";
import {
  allocateRepayment,
  buildBorrowingUpdatePayload,
  denormalizedBorrowingCacheFields,
  summarizeBorrowing,
  summarizeBorrowings,
  validateRepayment,
  type BorrowingSummary,
} from "@/shared/utils/borrowingMath";
import {
  allocateReceivableRepayment,
  buildReceivableUpdatePayload,
  denormalizedReceivableCacheFields,
  roundMoney,
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
    ...denormalizedBorrowingCacheFields(summary),
    updatedAt: serverTimestamp(),
  };
}

function denormalizedReceivableFields(summary: ReceivableSummary) {
  return {
    ...denormalizedReceivableCacheFields(summary),
    updatedAt: serverTimestamp(),
  };
}

export type BorrowingsContextType = {
  borrowings: Borrowing[];
  repayments: BorrowingRepayment[];
  summaries: Map<string, BorrowingSummary>;
  portfolio: ReturnType<typeof summarizeBorrowings>;
  loading: boolean;
  error: LoadFailure | null;
  retry: () => void;
  getSummary: (borrowingId: string) => BorrowingSummary | null;
  getRepayments: (borrowingId: string) => BorrowingRepayment[];
  createBorrowing: (input: CreateBorrowingInput) => Promise<string | null>;
  updateBorrowing: (id: string, updates: Partial<Borrowing>) => Promise<boolean>;
  deleteBorrowing: (id: string) => Promise<boolean>;
  addRepayment: (input: AddRepaymentInput) => Promise<string | null>;
  deleteRepayment: (repaymentId: string, borrowingId: string) => Promise<boolean>;
  /**
   * SPENDLY-159 — manual close. Not `markSettled`: a paid-off borrowing is
   * already FULLY_SETTLED by derivation. See the implementation.
   */
  closeBorrowing: (id: string) => Promise<boolean>;
};

export type ReceivablesContextType = {
  receivables: Receivable[];
  repayments: ReceivableRepayment[];
  summaries: Map<string, ReceivableSummary>;
  portfolio: ReturnType<typeof summarizeReceivables>;
  loading: boolean;
  error: LoadFailure | null;
  retry: () => void;
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
  /** SPENDLY-160 — forgive outstanding interest once the principal is back. */
  waiveInterest: (id: string) => Promise<boolean>;
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
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);

  const [borrowings, setBorrowings] = useState<Borrowing[]>([]);
  const [borrowingRepayments, setBorrowingRepayments] = useState<
    BorrowingRepayment[]
  >([]);
  const [borrowingsLoading, setBorrowingsLoading] = useState(true);
  const {
    error: borrowingsError,
    setError: setBorrowingsError,
    retry: retryBorrowings,
    attempt: borrowingsAttempt,
  } = useLoadFailure();

  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [receivableRepayments, setReceivableRepayments] = useState<
    ReceivableRepayment[]
  >([]);
  const [receivablesLoading, setReceivablesLoading] = useState(true);
  const {
    error: receivablesError,
    setError: setReceivablesError,
    retry: retryReceivables,
    attempt: receivablesAttempt,
  } = useLoadFailure();

  // Separate effects so a retry for one collection pair doesn't tear down
  // and re-subscribe the other's listeners.
  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setBorrowings([]);
      setBorrowingRepayments([]);
      setBorrowingsLoading(false);
      return;
    }

    setBorrowingsLoading(true);
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
        setBorrowingsError(null);
        setBorrowingsLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.borrowings",
        (failure) => {
          setBorrowingsError(failure);
          setBorrowingsLoading(false);
        },
        "Couldn't load your borrowings."
      )
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
      (err) => logWarning("snapshot.borrowing.repayments", err)
    );

    return () => {
      unsubBorrowings();
      unsubBorrowingRepayments();
    };
  }, [uid, borrowingsAttempt, setBorrowingsError]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setReceivables([]);
      setReceivableRepayments([]);
      setReceivablesLoading(false);
      return;
    }

    setReceivablesLoading(true);
    const base = ["users", uid] as const;

    const unsubReceivables = onSnapshot(
      query(collection(db, ...base, "receivables"), orderBy("lentDate", "desc")),
      (snapshot) => {
        setReceivables(
          snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Receivable, "id">),
          }))
        );
        setReceivablesError(null);
        setReceivablesLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.receivables",
        (failure) => {
          setReceivablesError(failure);
          setReceivablesLoading(false);
        },
        "Couldn't load your receivables."
      )
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
      (err) => logWarning("snapshot.receivable.repayments", err)
    );

    return () => {
      unsubReceivables();
      unsubReceivableRepayments();
    };
  }, [uid, receivablesAttempt, setReceivablesError]);

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
        const ref = doc(collection(db, "users", uid, "borrowings"));
        const outcome = await commitWrite(
          () =>
            setDoc(ref, {
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
            }),
          { label: "borrowing" }
        );
        toast.success(writeSavedMessage(outcome, "Borrowing recorded"));
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

      const existing = borrowings.find((b) => b.id === id);
      if (!existing) {
        toast.error("Borrowing not found");
        return false;
      }

      const result = buildBorrowingUpdatePayload(
        existing,
        updates,
        borrowingRepayments,
        today
      );
      if (!result.ok) {
        toast.error(result.error);
        return false;
      }

      try {
        // The edit and its recomputed totals go up as one write: a connection
        // dropping between two separate updates would leave the borrowing
        // showing a new principal against stale outstanding/status fields.
        const outcome = await commitWrite(
          () =>
            updateDoc(doc(db, "users", uid, "borrowings", id), {
              ...result.fields,
              updatedAt: serverTimestamp(),
            }),
          { label: "borrowing" }
        );
        toast.success(writeSavedMessage(outcome, "Borrowing updated"));
        return true;
      } catch (err) {
        logError("borrowings.updateborrowing", err);
        toast.error("Failed to update borrowing");
        return false;
      }
    },
    [uid, borrowings, borrowingRepayments, today]
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

        // Offline this query answers from cache and may not list every
        // repayment, which would orphan the ones it missed.
        if (linked.metadata.fromCache) {
          toast.error(
            "Can't verify linked repayments while offline. Try again when connected."
          );
          return false;
        }

        const batch = writeBatch(db);
        linked.docs.forEach((repaymentDoc) => batch.delete(repaymentDoc.ref));
        batch.delete(doc(db, "users", uid, "borrowings", id));
        const outcome = await commitWrite(() => batch.commit(), {
          label: "borrowing deletion",
        });

        toast.success(writeSavedMessage(outcome, "Borrowing deleted"));
        return true;
      } catch (err) {
        logError("borrowings.deleteborrowing", err);
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
        const ref = doc(collection(db, "users", uid, "borrowingRepayments"));

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
          today
        );

        // Repayment + recomputed parent totals commit atomically. Two separate
        // writes could leave a repayment recorded against a borrowing that
        // still shows the full amount outstanding if the link drops between.
        const batch = writeBatch(db);
        batch.set(ref, {
          borrowingId: input.borrowingId,
          amount: input.amount,
          principalComponent: allocation.principalComponent,
          interestComponent: allocation.interestComponent,
          paymentAccountId: input.paymentAccountId ?? null,
          date: input.date,
          month: monthFromDateKey(input.date),
          note: input.note ?? "",
          createdAt: serverTimestamp(),
        });
        batch.update(
          doc(db, "users", uid, "borrowings", input.borrowingId),
          denormalizedBorrowingFields(nextSummary)
        );
        const outcome = await commitWrite(() => batch.commit(), {
          label: "repayment",
        });

        toast.success(
          writeSavedMessage(
            outcome,
            nextSummary.status === "FULLY_SETTLED"
              ? "Borrowing settled"
              : "Repayment recorded"
          )
        );
        return ref.id;
      } catch (err) {
        logError("borrowings.addrepayment", err);
        toast.error("Failed to record repayment");
        return null;
      }
    },
    [uid, borrowings, borrowingRepayments, today]
  );

  const deleteBorrowingRepayment = useCallback(
    async (repaymentId: string, borrowingId: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;
      const borrowing = borrowings.find((b) => b.id === borrowingId);
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, "users", uid, "borrowingRepayments", repaymentId));

        if (borrowing) {
          const nextSummary = summarizeBorrowing(
            borrowing,
            borrowingRepayments.filter((r) => r.id !== repaymentId),
            today
          );
          batch.update(
            doc(db, "users", uid, "borrowings", borrowingId),
            denormalizedBorrowingFields(nextSummary)
          );
        }

        const outcome = await commitWrite(() => batch.commit(), {
          label: "repayment deletion",
        });

        toast.success(writeSavedMessage(outcome, "Repayment removed"));
        return true;
      } catch (err) {
        logError("borrowings.deleterepayment", err);
        toast.error("Failed to remove repayment");
        return false;
      }
    },
    [uid, borrowings, borrowingRepayments, today]
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
        const ref = doc(collection(db, "users", uid, "receivables"));
        const outcome = await commitWrite(
          () =>
            setDoc(ref, {
              ...input,
              userId: uid,
              personId: input.personId ?? null,
              dueDate: input.dueDate ?? null,
              purpose: input.purpose ?? "",
              note: input.note ?? "",
              ...(input.spaceId ? { spaceId: input.spaceId } : {}),
              interestRate: input.interestRate ?? 0,
              interestType: input.interestType ?? "NONE",
              interestFrequency: input.interestFrequency ?? "NONE",
              interestBasis: input.interestBasis ?? "OUTSTANDING_PRINCIPAL",
              interestStoppedDate: null,
              waivedInterest: 0,
              totalReceived: 0,
              outstandingAmount: input.originalAmount,
              accruedInterest: 0,
              status: "ACTIVE",
              settledDate: null,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            }),
          { label: "receivable" }
        );
        toast.success(writeSavedMessage(outcome, "Money lent recorded"));
        return ref.id;
      } catch (err) {
        logError("receivables.createreceivable", err);
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

      try {
        const payload: Record<string, unknown> = {
          ...updates,
          updatedAt: serverTimestamp(),
        };
        if ("spaceId" in updates) {
          payload.spaceId = updates.spaceId ?? null;
        }

        // The edit and its recomputed totals go up as one write: a connection
        // dropping between two separate updates would leave the receivable
        // showing a new principal against stale outstanding/status fields.
        //
        // SPENDLY-160 moved the rule into `buildReceivableUpdatePayload`, which
        // also widened it: the cache used to be restamped only for an amount
        // edit, so a cancel wrote a status against a stale outstanding.
        if (existing) {
          const built = buildReceivableUpdatePayload(
            existing,
            updates,
            receivableRepayments,
            today
          );
          if (!built.ok) {
            toast.error(built.error);
            return false;
          }
          Object.assign(payload, built.fields);
        }

        const outcome = await commitWrite(
          () => updateDoc(doc(db, "users", uid, "receivables", id), payload),
          { label: "receivable" }
        );

        toast.success(writeSavedMessage(outcome, "Receivable updated"));
        return true;
      } catch (err) {
        logError("receivables.updatereceivable", err);
        toast.error("Failed to update receivable");
        return false;
      }
    },
    [uid, receivables, receivableRepayments, today]
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

        // Offline this query answers from cache and may not list every
        // repayment, which would orphan the ones it missed.
        if (linked.metadata.fromCache) {
          toast.error(
            "Can't verify linked repayments while offline. Try again when connected."
          );
          return false;
        }

        const batch = writeBatch(db);
        linked.docs.forEach((repaymentDoc) => batch.delete(repaymentDoc.ref));
        batch.delete(doc(db, "users", uid, "receivables", id));
        const outcome = await commitWrite(() => batch.commit(), {
          label: "receivable deletion",
        });

        toast.success(writeSavedMessage(outcome, "Receivable deleted"));
        return true;
      } catch (err) {
        logError("receivables.deletereceivable", err);
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

      // Split as of the repayment date, so the interest cleared is the interest
      // that had actually accrued when the money arrived (SPENDLY-160).
      const allocation = allocateReceivableRepayment(input.amount, summary);

      try {
        const ref = doc(collection(db, "users", uid, "receivableRepayments"));

        const nextSummary = summarizeReceivable(
          receivable,
          [
            ...receivableRepayments,
            {
              id: ref.id,
              receivableId: input.receivableId,
              amount: input.amount,
              principalComponent: allocation.principalComponent,
              interestComponent: allocation.interestComponent,
              date: input.date,
            },
          ],
          today
        );

        // Repayment + recomputed parent totals commit atomically. Two separate
        // writes could leave money recorded as received while the receivable
        // still shows the full amount outstanding if the link drops between.
        const batch = writeBatch(db);
        batch.set(ref, {
          receivableId: input.receivableId,
          amount: input.amount,
          principalComponent: allocation.principalComponent,
          interestComponent: allocation.interestComponent,
          receivedAccountId: input.receivedAccountId ?? null,
          date: input.date,
          month: monthFromDateKey(input.date),
          note: input.note ?? "",
          createdAt: serverTimestamp(),
        });
        batch.update(
          doc(db, "users", uid, "receivables", input.receivableId),
          denormalizedReceivableFields(nextSummary)
        );
        const outcome = await commitWrite(() => batch.commit(), {
          label: "repayment",
        });

        toast.success(
          writeSavedMessage(
            outcome,
            nextSummary.status === "FULLY_SETTLED"
              ? "Receivable settled"
              : "Repayment recorded"
          )
        );
        return ref.id;
      } catch (err) {
        logError("receivables.addreceivablerepayment", err);
        toast.error("Failed to record repayment");
        return null;
      }
    },
    [uid, receivables, receivableRepayments, today]
  );

  const deleteReceivableRepayment = useCallback(
    async (repaymentId: string, receivableId: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!uid || !db) return false;
      const receivable = receivables.find((r) => r.id === receivableId);
      try {
        const batch = writeBatch(db);
        batch.delete(doc(db, "users", uid, "receivableRepayments", repaymentId));

        if (receivable) {
          const nextSummary = summarizeReceivable(
            receivable,
            receivableRepayments.filter((r) => r.id !== repaymentId),
            today
          );
          batch.update(
            doc(db, "users", uid, "receivables", receivableId),
            denormalizedReceivableFields(nextSummary)
          );
        }

        const outcome = await commitWrite(() => batch.commit(), {
          label: "repayment deletion",
        });

        toast.success(writeSavedMessage(outcome, "Repayment removed"));
        return true;
      } catch (err) {
        logError("receivables.deletereceivablerepayment", err);
        toast.error("Failed to remove repayment");
        return false;
      }
    },
    [uid, receivables, receivableRepayments, today]
  );

  /**
   * SPENDLY-159 — "Mark completed" for a borrowing.
   *
   * Deliberately NOT the twin of `markReceivableSettled`, which refuses while
   * anything is owed and then writes `FULLY_SETTLED`. On the borrowing side
   * `deriveStatus` already returns `FULLY_SETTLED` the moment outstanding
   * principal and interest both hit zero, so a settle-when-paid-off action
   * would be unreachable: by the time it applied, the status was already there.
   *
   * What a borrowing actually lacks is a way to close one that derivation will
   * never close — written off, refinanced, or settled outside the app. That is
   * `CLOSED`, which `deriveStatus` documents as outranking derivation and which
   * every repayment guard already recognises, but which nothing could set.
   *
   * Closing does not hide money: `summarizeBorrowings` still adds a closed
   * borrowing's outstanding to the portfolio total. It moves the borrowing out
   * of the active count and stops offering repayment actions on it.
   */
  const closeBorrowing = useCallback(
    async (id: string): Promise<boolean> =>
      updateBorrowing(id, { status: "CLOSED" }),
    [updateBorrowing]
  );

  const markReceivableSettled = useCallback(
    async (id: string): Promise<boolean> => {
      const receivable = receivables.find((r) => r.id === id);
      if (!receivable) return false;
      const summary = summarizeReceivable(
        receivable,
        receivableRepayments,
        today
      );
      if (summary.outstandingAmount > 0) {
        toast.error(
          `Still ${summary.outstandingAmount} outstanding. Record a repayment to settle.`
        );
        return false;
      }
      return updateReceivable(id, {
        status: "FULLY_SETTLED",
        settledDate: summary.settledDate ?? today,
      });
    },
    [receivables, receivableRepayments, updateReceivable, today]
  );

  /**
   * SPENDLY-160 — forgive interest that will not be collected.
   *
   * The principal has to be back first: waiving is for the case where a friend
   * returned what they borrowed and you let the interest go, not a way to make
   * an unpaid lend disappear. Stamping `interestStoppedDate` is what stops the
   * waived amount re-accruing tomorrow and re-opening the receivable.
   */
  const waiveReceivableInterest = useCallback(
    async (id: string): Promise<boolean> => {
      const receivable = receivables.find((r) => r.id === id);
      if (!receivable) return false;
      const summary = summarizeReceivable(
        receivable,
        receivableRepayments,
        today
      );
      if (summary.outstandingPrincipal > 0) {
        toast.error(
          `Still ${summary.outstandingPrincipal} of principal outstanding. Only interest can be waived.`
        );
        return false;
      }
      if (summary.outstandingInterest <= 0) {
        toast.error("There is no outstanding interest to waive.");
        return false;
      }
      return updateReceivable(id, {
        waivedInterest: roundMoney(
          summary.interestWaived + summary.outstandingInterest
        ),
        interestStoppedDate: today,
      });
    },
    [receivables, receivableRepayments, updateReceivable, today]
  );

  const cancelReceivable = useCallback(
    async (id: string): Promise<boolean> =>
      // Freeze accrual at the write-off: a debt you have given up on should not
      // keep climbing in a detail view you have no way to correct.
      updateReceivable(id, {
        status: "CANCELLED",
        interestStoppedDate: today,
      }),
    [updateReceivable, today]
  );

  // ─── Context values ─────────────────────────────────────────────────────

  const borrowingsValue = useMemo<BorrowingsContextType>(
    () => ({
      borrowings,
      repayments: borrowingRepayments,
      summaries: borrowingSummaries,
      portfolio: borrowingPortfolio,
      loading: borrowingsLoading,
      error: borrowingsError,
      retry: retryBorrowings,
      getSummary: getBorrowingSummary,
      getRepayments: getBorrowingRepayments,
      createBorrowing,
      updateBorrowing,
      deleteBorrowing,
      addRepayment: addBorrowingRepayment,
      deleteRepayment: deleteBorrowingRepayment,
      closeBorrowing,
    }),
    [
      borrowings,
      borrowingRepayments,
      borrowingSummaries,
      borrowingPortfolio,
      borrowingsLoading,
      borrowingsError,
      retryBorrowings,
      getBorrowingSummary,
      getBorrowingRepayments,
      createBorrowing,
      updateBorrowing,
      deleteBorrowing,
      addBorrowingRepayment,
      deleteBorrowingRepayment,
      closeBorrowing,
    ]
  );

  const receivablesValue = useMemo<ReceivablesContextType>(
    () => ({
      receivables,
      repayments: receivableRepayments,
      summaries: receivableSummaries,
      portfolio: receivablePortfolio,
      loading: receivablesLoading,
      error: receivablesError,
      retry: retryReceivables,
      getSummary: getReceivableSummary,
      getRepayments: getReceivableRepayments,
      createReceivable,
      updateReceivable,
      deleteReceivable,
      addRepayment: addReceivableRepayment,
      deleteRepayment: deleteReceivableRepayment,
      markSettled: markReceivableSettled,
      waiveInterest: waiveReceivableInterest,
      cancelReceivable,
    }),
    [
      receivables,
      receivableRepayments,
      receivableSummaries,
      receivablePortfolio,
      receivablesLoading,
      receivablesError,
      retryReceivables,
      getReceivableSummary,
      getReceivableRepayments,
      createReceivable,
      updateReceivable,
      deleteReceivable,
      addReceivableRepayment,
      deleteReceivableRepayment,
      markReceivableSettled,
      waiveReceivableInterest,
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
