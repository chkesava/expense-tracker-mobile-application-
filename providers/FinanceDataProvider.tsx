import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import {
  canDeleteAccount,
  countLinkedAccountRecords,
  totalPendingSyncCount,
  validateAccountMoneyMove,
} from "@/lib/finance/ledgerGuards";
import { setGlobalPendingSyncCount } from "@/lib/syncStatusStore";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type {
  Account,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  AccountType,
  Expense,
  Income,
} from "@/shared/types/expense";
import {
  buildAccountWritePayload,
  hydrateAccountIdentity,
} from "@/shared/utils/accountIdentity";
import { isValidDateKey } from "@/shared/utils/dates";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";

/** Initial first-paint window — full history loads on idle */
const INITIAL_EXPENSE_LIMIT = 200;

// ─── Granular Context Types ───────────────────────────────────────────────────

export type ExpensesContextType = {
  expenses: Expense[];
  expensesLoading: boolean;
  /** Non-null when a listener failed. Distinguishes "load failed" from "no rows". */
  financeError: LoadFailure | null;
  /** Re-establishes every finance listener. */
  retryFinanceData: () => void;
  pendingSyncCount: number;
  /** True when data is being served from local cache (offline or first-load). */
  isFromCache: boolean;
};

export type IncomesContextType = {
  incomes: Income[];
  incomesLoading: boolean;
};

export type AccountsContextType = {
  accounts: Account[];
  accountsLoading: boolean;
  financeError: LoadFailure | null;
  retryFinanceData: () => void;
  accountTypes: AccountType[];
  accountTypesLoading: boolean;
  payments: AccountPayment[];
  paymentsLoading: boolean;
  entries: AccountEntry[];
  entriesLoading: boolean;
  transfers: AccountTransfer[];
  transfersLoading: boolean;
  addAccount: (
    name: string,
    typeId: string,
    extras?: Partial<Omit<Account, "id" | "name" | "typeId" | "createdAt">>
  ) => Promise<void>;
  updateAccount: (id: string, updates: Partial<Account>) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  addAccountType: (name: string) => Promise<void>;
  deleteAccountType: (id: string) => Promise<void>;
  addPayment: (
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    date: string,
    note?: string,
    opts?: { appliedCycleStart?: string; appliedCycleEnd?: string }
  ) => Promise<boolean>;
  addExternalPayment: (
    toAccountId: string,
    amount: number,
    date: string,
    note?: string,
    opts?: { appliedCycleStart?: string; appliedCycleEnd?: string }
  ) => Promise<boolean>;
  deletePayment: (id: string) => Promise<void>;
  addEntry: (
    accountId: string,
    amount: number,
    direction: "credit" | "debit",
    date: string,
    note?: string
  ) => Promise<boolean>;
  deleteEntry: (id: string) => Promise<void>;
  addTransfer: (
    fromAccountId: string,
    toAccountId: string,
    amount: number,
    date: string,
    note?: string
  ) => Promise<boolean>;
  deleteTransfer: (id: string) => Promise<void>;
};

export type FinanceDataContextType = ExpensesContextType &
  IncomesContextType &
  AccountsContextType;

// ─── Contexts ─────────────────────────────────────────────────────────────────

const ExpensesContext = createContext<ExpensesContextType | undefined>(undefined);
const IncomesContext = createContext<IncomesContextType | undefined>(undefined);
const AccountsContext = createContext<AccountsContextType | undefined>(undefined);

// ─── Helper ───────────────────────────────────────────────────────────────────

function sortByDateDesc<T extends { date: string }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FinanceDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const db = getFirestoreDb();

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const {
    error: financeError,
    setError: setFinanceError,
    retry: retryFinanceData,
    attempt: financeAttempt,
  } = useLoadFailure();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [incomesLoading, setIncomesLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [accountTypesLoading, setAccountTypesLoading] = useState(true);
  const accountTypesRef = useRef(accountTypes);
  useEffect(() => {
    accountTypesRef.current = accountTypes;
  }, [accountTypes]);
  const [payments, setPayments] = useState<AccountPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [entries, setEntries] = useState<AccountEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [transfers, setTransfers] = useState<AccountTransfer[]>([]);
  const [transfersLoading, setTransfersLoading] = useState(true);

  // Avoid permanent skeletons when resubscribing after Google Sign-In / activity resume.
  const expensesHydratedRef = useRef(false);
  const incomesHydratedRef = useRef(false);
  const accountsHydratedRef = useRef(false);
  const accountTypesHydratedRef = useRef(false);

  // Track pending writes per collection
  const pendingExpensesCountRef = useRef(0);
  const pendingIncomesCountRef = useRef(0);
  const pendingAccountsCountRef = useRef(0);
  const pendingAccountTypesCountRef = useRef(0);
  const pendingPaymentsCountRef = useRef(0);
  const pendingEntriesCountRef = useRef(0);
  const pendingTransfersCountRef = useRef(0);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isFromCache, setIsFromCache] = useState(false);

  const updatePendingSyncCount = useCallback(() => {
    const total = totalPendingSyncCount([
      pendingExpensesCountRef.current,
      pendingIncomesCountRef.current,
      pendingAccountsCountRef.current,
      pendingAccountTypesCountRef.current,
      pendingPaymentsCountRef.current,
      pendingEntriesCountRef.current,
      pendingTransfersCountRef.current,
    ]);
    setPendingSyncCount(total);
    setGlobalPendingSyncCount(total);
  }, []);

  // ─── Critical listeners (First paint) ────────────────────────────────────────

  const limitedExpensesUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!user || !db) {
      limitedExpensesUnsubRef.current?.();
      limitedExpensesUnsubRef.current = null;
      setExpenses([]);
      setIncomes([]);
      setAccounts([]);
      setAccountTypes([]);
      setPayments([]);
      setEntries([]);
      setTransfers([]);
      setExpensesLoading(false);
      setIncomesLoading(false);
      setAccountsLoading(false);
      setAccountTypesLoading(false);
      setPaymentsLoading(false);
      setEntriesLoading(false);
      setTransfersLoading(false);

      pendingExpensesCountRef.current = 0;
      pendingIncomesCountRef.current = 0;
      pendingAccountsCountRef.current = 0;
      pendingAccountTypesCountRef.current = 0;
      pendingPaymentsCountRef.current = 0;
      pendingEntriesCountRef.current = 0;
      pendingTransfersCountRef.current = 0;
      setPendingSyncCount(0);
      setGlobalPendingSyncCount(0);
      expensesHydratedRef.current = false;
      incomesHydratedRef.current = false;
      accountsHydratedRef.current = false;
      accountTypesHydratedRef.current = false;
      return;
    }

    // Don't flip to skeleton if we already have data (listener resubscribe after Google Sign-In).
    setExpensesLoading(!expensesHydratedRef.current);
    setIncomesLoading(!incomesHydratedRef.current);
    setAccountsLoading(!accountsHydratedRef.current);
    setAccountTypesLoading(!accountTypesHydratedRef.current);
    setPaymentsLoading(true);
    setEntriesLoading(true);
    setTransfersLoading(true);

    const base = ["users", user.uid] as const;

    // 1. Staged initial expenses
    limitedExpensesUnsubRef.current?.();
    limitedExpensesUnsubRef.current = onSnapshot(
      query(
        collection(db, ...base, "expenses"),
        orderBy("createdAt", "desc"),
        limit(INITIAL_EXPENSE_LIMIT)
      ),
      (snap) => {
        setExpenses(
          // Firestore doc id must win over any `id` field stored on the document.
          snap.docs.map((d) => ({ ...(d.data() as object), id: d.id } as Expense))
        );
        pendingExpensesCountRef.current = snap.docs.filter(
          (d) => d.metadata.hasPendingWrites
        ).length;
        updatePendingSyncCount();
        setIsFromCache(snap.metadata.fromCache);
        expensesHydratedRef.current = true;
        setFinanceError(null);
        setExpensesLoading(false);
      },
      snapshotErrorHandler(
        "snapshot.expenses",
        (failure) => {
          setFinanceError(failure);
          setExpensesLoading(false);
        },
        "Couldn't load your expenses."
      )
    );

    // 2. Incomes, Accounts, and Account Types
    const unsubscribers = [
      onSnapshot(
        query(collection(db, ...base, "incomes"), orderBy("createdAt", "desc")),
        (snap) => {
          setIncomes(
            snap.docs.map((d) => ({ ...(d.data() as object), id: d.id } as Income))
          );
          pendingIncomesCountRef.current = snap.docs.filter(
            (d) => d.metadata.hasPendingWrites
          ).length;
          updatePendingSyncCount();
          incomesHydratedRef.current = true;
          setFinanceError(null);
          setIncomesLoading(false);
        },
        snapshotErrorHandler(
          "snapshot.incomes",
          (failure) => {
            setFinanceError(failure);
            setIncomesLoading(false);
          },
          "Couldn't load your income."
        )
      ),
      onSnapshot(
        query(collection(db, ...base, "accounts")),
        (snap) => {
          setAccounts(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Account))
          );
          pendingAccountsCountRef.current = snap.docs.filter(
            (d) => d.metadata.hasPendingWrites
          ).length;
          updatePendingSyncCount();
          accountsHydratedRef.current = true;
          setFinanceError(null);
          setAccountsLoading(false);
        },
        snapshotErrorHandler(
          "snapshot.accounts",
          (failure) => {
            setFinanceError(failure);
            setAccountsLoading(false);
          },
          "Couldn't load your accounts."
        )
      ),
      onSnapshot(
        query(collection(db, ...base, "accountTypes")),
        (snap) => {
          setAccountTypes(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as AccountType))
          );
          pendingAccountTypesCountRef.current = snap.docs.filter(
            (d) => d.metadata.hasPendingWrites
          ).length;
          updatePendingSyncCount();
          accountTypesHydratedRef.current = true;
          setFinanceError(null);
          setAccountTypesLoading(false);
        },
        snapshotErrorHandler(
          "snapshot.accountTypes",
          (failure) => {
            setFinanceError(failure);
            setAccountTypesLoading(false);
          },
          "Couldn't load your account types."
        )
      ),
    ];

    return () => {
      limitedExpensesUnsubRef.current?.();
      limitedExpensesUnsubRef.current = null;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user, db, updatePendingSyncCount, financeAttempt, setFinanceError]);

  // ─── Deferred: Full Expense History + Secondary Collections ──────────────────

  useEffect(() => {
    if (!user || !db) return;

    let secondaryUnsubs: Array<() => void> = [];
    let expensesUpgradeUnsub: (() => void) | undefined;

    const cancelIdle = scheduleIdleWork(
      () => {
        const base = ["users", user.uid] as const;

        // Drop limited listener before attaching full history listener
        limitedExpensesUnsubRef.current?.();
        limitedExpensesUnsubRef.current = null;

        expensesUpgradeUnsub = onSnapshot(
          query(collection(db, ...base, "expenses"), orderBy("createdAt", "desc")),
          (snap) => {
            // Replace limited window with full history without flipping loading
            // (keeps ledger/dashboard mounted list from blanking mid-scroll).
            setExpenses(
              snap.docs.map((d) => ({ ...(d.data() as object), id: d.id } as Expense))
            );
            pendingExpensesCountRef.current = snap.docs.filter(
              (d) => d.metadata.hasPendingWrites
            ).length;
            updatePendingSyncCount();
            expensesHydratedRef.current = true;
            setFinanceError(null);
            setExpensesLoading(false);
          },
          snapshotErrorHandler(
            "snapshot.expensesFull",
            (failure) => {
              setFinanceError(failure);
              setExpensesLoading(false);
            },
            "Couldn't load your expense history."
          )
        );

        secondaryUnsubs = [
          onSnapshot(
            query(collection(db, ...base, "accountPayments")),
            (snap) => {
              setPayments(
                sortByDateDesc(
                  snap.docs.map(
                    (d) => ({ id: d.id, ...(d.data() as object) } as AccountPayment)
                  )
                )
              );
              pendingPaymentsCountRef.current = snap.docs.filter(
                (d) => d.metadata.hasPendingWrites
              ).length;
              updatePendingSyncCount();
              setFinanceError(null);
              setPaymentsLoading(false);
            },
            snapshotErrorHandler(
              "snapshot.accountPayments",
              (failure) => {
                setFinanceError(failure);
                setPaymentsLoading(false);
              },
              "Couldn't load your payments."
            )
          ),
          onSnapshot(
            query(collection(db, ...base, "accountEntries")),
            (snap) => {
              setEntries(
                sortByDateDesc(
                  snap.docs.map(
                    (d) => ({ id: d.id, ...(d.data() as object) } as AccountEntry)
                  )
                )
              );
              pendingEntriesCountRef.current = snap.docs.filter(
                (d) => d.metadata.hasPendingWrites
              ).length;
              updatePendingSyncCount();
              setFinanceError(null);
              setEntriesLoading(false);
            },
            snapshotErrorHandler(
              "snapshot.accountEntries",
              (failure) => {
                setFinanceError(failure);
                setEntriesLoading(false);
              },
              "Couldn't load your account entries."
            )
          ),
          onSnapshot(
            query(collection(db, ...base, "accountTransfers")),
            (snap) => {
              setTransfers(
                sortByDateDesc(
                  snap.docs.map(
                    (d) => ({ id: d.id, ...(d.data() as object) } as AccountTransfer)
                  )
                )
              );
              pendingTransfersCountRef.current = snap.docs.filter(
                (d) => d.metadata.hasPendingWrites
              ).length;
              updatePendingSyncCount();
              setFinanceError(null);
              setTransfersLoading(false);
            },
            snapshotErrorHandler(
              "snapshot.accountTransfers",
              (failure) => {
                setFinanceError(failure);
                setTransfersLoading(false);
              },
              "Couldn't load your transfers."
            )
          ),
        ];
      },
      { timeoutMs: 2800, fallbackDelayMs: 1200 }
    );

    return () => {
      cancelIdle();
      expensesUpgradeUnsub?.();
      secondaryUnsubs.forEach((unsub) => unsub());
    };
  }, [user, db, updatePendingSyncCount, financeAttempt, setFinanceError]);

  // ─── Actions ─────────────────────────────────────────────────────────────────

  const addAccount = useCallback(
    async (
      name: string,
      typeId: string,
      extras?: Partial<Omit<Account, "id" | "name" | "typeId" | "createdAt">>
    ) => {
      const u = userRef.current;
      const database = getFirestoreDb();
      if (!u || !database || !name.trim() || !typeId) return;
      try {
        const typeName = accountTypesRef.current.find((t) => t.id === typeId)?.name;
        const payload = buildAccountWritePayload({
          name,
          typeId,
          typeName,
          extras,
          createdAt: serverTimestamp(),
        });

        const outcome = await commitWrite(
          () => addDoc(collection(database, "users", u.uid, "accounts"), payload),
          { label: "account" }
        );
        toast.success(writeSavedMessage(outcome, "Account added"));
      } catch (err) {
        logError("financeDataProvider.addAccount", err);
        toast.error("Failed to add account");
      }
    },
    []
  );

  const updateAccount = useCallback(
    async (id: string, updates: Partial<Account>) => {
      const u = userRef.current;
      const database = getFirestoreDb();
      if (!u || !database) return;
      try {
        const existing = accountsRef.current.find((item) => item.id === id);
        const merged: Account = {
          id,
          name: existing?.name || "Account",
          typeId: existing?.typeId || "",
          ...existing,
          ...updates,
        };
        const typeName = accountTypesRef.current.find(
          (t) => t.id === merged.typeId
        )?.name;
        const hydrated = hydrateAccountIdentity(merged, typeName);
        const payload = buildAccountWritePayload({
          name: hydrated.name,
          typeId: hydrated.typeId,
          typeName,
          extras: hydrated,
        });
        const outcome = await commitWrite(
          () => updateDoc(doc(database, "users", u.uid, "accounts", id), payload),
          { label: "account" }
        );
        toast.success(writeSavedMessage(outcome, "Account updated"));
      } catch (err) {
        logError("financeDataProvider.updateAccount", err);
        toast.error("Failed to update account");
      }
    },
    []
  );

  const deleteAccount = useCallback(async (id: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database) return;
    try {
      const base = ["users", u.uid] as const;
      const [
        linkedExpensesSnap,
        linkedIncomesSnap,
        linkedEntriesSnap,
        linkedPaymentsFromSnap,
        linkedPaymentsToSnap,
        linkedTransfersFromSnap,
        linkedTransfersToSnap,
      ] = await Promise.all([
        getDocs(
          query(collection(database, ...base, "expenses"), where("accountId", "==", id))
        ),
        getDocs(
          query(collection(database, ...base, "incomes"), where("accountId", "==", id))
        ),
        getDocs(
          query(
            collection(database, ...base, "accountEntries"),
            where("accountId", "==", id)
          )
        ),
        getDocs(
          query(
            collection(database, ...base, "accountPayments"),
            where("fromAccountId", "==", id)
          )
        ),
        getDocs(
          query(
            collection(database, ...base, "accountPayments"),
            where("toAccountId", "==", id)
          )
        ),
        getDocs(
          query(
            collection(database, ...base, "accountTransfers"),
            where("fromAccountId", "==", id)
          )
        ),
        getDocs(
          query(
            collection(database, ...base, "accountTransfers"),
            where("toAccountId", "==", id)
          )
        ),
      ]);

      // Offline these queries answer from the local cache, which may not hold
      // every linked record. Deleting on a partial answer would orphan real
      // expenses/payments on the server, so the check has to be authoritative.
      const servedFromCache = [
        linkedExpensesSnap,
        linkedIncomesSnap,
        linkedEntriesSnap,
        linkedPaymentsFromSnap,
        linkedPaymentsToSnap,
        linkedTransfersFromSnap,
        linkedTransfersToSnap,
      ].some((snap) => snap.metadata.fromCache);

      if (servedFromCache) {
        toast.error(
          "Can't verify linked transactions while offline. Try again when connected."
        );
        return;
      }

      const linkedCount = countLinkedAccountRecords([
        linkedExpensesSnap.size,
        linkedIncomesSnap.size,
        linkedEntriesSnap.size,
        linkedPaymentsFromSnap.size,
        linkedPaymentsToSnap.size,
        linkedTransfersFromSnap.size,
        linkedTransfersToSnap.size,
      ]);

      if (!canDeleteAccount(linkedCount)) {
        toast.error(
          `Cannot delete account. ${linkedCount} linked records exist. Unlink transactions first.`
        );
        return;
      }

      const outcome = await commitWrite(
        () => deleteDoc(doc(database, "users", u.uid, "accounts", id)),
        { label: "account deletion" }
      );
      toast.success(writeSavedMessage(outcome, "Account deleted"));
    } catch (err) {
      logError("financeDataProvider.deleteAccount", err);
      toast.error("Failed to delete account");
    }
  }, []);

  const addAccountType = useCallback(async (name: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database || !name.trim()) return;
    try {
      const outcome = await commitWrite(
        () =>
          addDoc(collection(database, "users", u.uid, "accountTypes"), {
            name: name.trim(),
            createdAt: serverTimestamp(),
          }),
        { label: "account type" }
      );
      toast.success(writeSavedMessage(outcome, "Account type added"));
    } catch (err) {
      logError("financeDataProvider.addAccountType", err);
      toast.error("Failed to add account type");
    }
  }, []);

  const deleteAccountType = useCallback(async (id: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database) return;
    try {
      const outcome = await commitWrite(
        () => deleteDoc(doc(database, "users", u.uid, "accountTypes", id)),
        { label: "account type deletion" }
      );
      toast.success(writeSavedMessage(outcome, "Account type deleted"));
    } catch (err) {
      logError("financeDataProvider.deleteAccountType", err);
      toast.error("Failed to delete account type");
    }
  }, []);

  const addPayment = useCallback(
    async (
      fromAccountId: string,
      toAccountId: string,
      amount: number,
      date: string,
      note?: string,
      opts?: { appliedCycleStart?: string; appliedCycleEnd?: string }
    ) => {
      const u = userRef.current;
      const database = getFirestoreDb();
      if (!u || !database) return false;
      const validation = validateAccountMoneyMove({
        fromAccountId,
        toAccountId,
        amount,
        date,
      });
      if (!validation.ok) {
        toast.error(validation.error);
        return false;
      }
      try {
        const outcome = await commitWrite(
          () =>
            addDoc(collection(database, "users", u.uid, "accountPayments"), {
              fromAccountId,
              toAccountId,
              amount,
              date,
              note: note?.trim() || "",
              sourceType: "account",
              ...(opts?.appliedCycleStart
                ? { appliedCycleStart: opts.appliedCycleStart }
                : {}),
              ...(opts?.appliedCycleEnd
                ? { appliedCycleEnd: opts.appliedCycleEnd }
                : {}),
              createdAt: serverTimestamp(),
            }),
          { label: "payment" }
        );
        toast.success(writeSavedMessage(outcome, "Bill payment recorded"));
        return true;
      } catch (err) {
        logError("financeDataProvider.recordPayment", err);
        toast.error("Failed to record payment");
        return false;
      }
    },
    []
  );

  const addExternalPayment = useCallback(
    async (
      toAccountId: string,
      amount: number,
      date: string,
      note?: string,
      opts?: { appliedCycleStart?: string; appliedCycleEnd?: string }
    ) => {
      const u = userRef.current;
      const database = getFirestoreDb();
      if (!u || !database || !toAccountId || amount <= 0) return false;
      if (!isValidDateKey(date)) {
        toast.error("Invalid payment date");
        return false;
      }
      try {
        const outcome = await commitWrite(
          () =>
            addDoc(collection(database, "users", u.uid, "accountPayments"), {
              fromAccountId: "external",
              toAccountId,
              amount,
              date,
              note: note?.trim() || "",
              sourceType: "external",
              ...(opts?.appliedCycleStart
                ? { appliedCycleStart: opts.appliedCycleStart }
                : {}),
              ...(opts?.appliedCycleEnd
                ? { appliedCycleEnd: opts.appliedCycleEnd }
                : {}),
              createdAt: serverTimestamp(),
            }),
          { label: "payment" }
        );
        toast.success(writeSavedMessage(outcome, "Marked as already paid"));
        return true;
      } catch (err) {
        logError("financeDataProvider.markAsPaid", err);
        toast.error("Failed to mark as paid");
        return false;
      }
    },
    []
  );

  const deletePayment = useCallback(async (id: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database) return;
    try {
      const outcome = await commitWrite(
        () => deleteDoc(doc(database, "users", u.uid, "accountPayments", id)),
        { label: "payment deletion" }
      );
      toast.success(writeSavedMessage(outcome, "Payment removed"));
    } catch (err) {
      logError("financeDataProvider.removePayment", err);
      toast.error("Failed to remove payment");
    }
  }, []);

  const addEntry = useCallback(
    async (
      accountId: string,
      amount: number,
      direction: "credit" | "debit",
      date: string,
      note?: string
    ) => {
      const u = userRef.current;
      const database = getFirestoreDb();
      if (!u || !database || !accountId || amount <= 0 || !date) {
        toast.error("Enter a valid amount and date");
        return false;
      }
      if (!isValidDateKey(date)) {
        toast.error("Invalid entry date");
        return false;
      }
      try {
        const outcome = await commitWrite(
          () =>
            addDoc(collection(database, "users", u.uid, "accountEntries"), {
              accountId,
              amount,
              direction,
              date,
              note: note?.trim() || "",
              createdAt: serverTimestamp(),
            }),
          { label: "account entry" }
        );
        toast.success(
          writeSavedMessage(
            outcome,
            direction === "credit"
              ? "Funds added to account"
              : "Debit recorded in account"
          )
        );
        return true;
      } catch (err) {
        logError("financeDataProvider.saveAccountEntry", err);
        toast.error("Failed to save account entry");
        return false;
      }
    },
    []
  );

  const deleteEntry = useCallback(async (id: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database) return;
    try {
      const outcome = await commitWrite(
        () => deleteDoc(doc(database, "users", u.uid, "accountEntries", id)),
        { label: "account entry deletion" }
      );
      toast.success(writeSavedMessage(outcome, "Account entry removed"));
    } catch (err) {
      logError("financeDataProvider.removeAccountEntry", err);
      toast.error("Failed to remove account entry");
    }
  }, []);

  const addTransfer = useCallback(
    async (
      fromAccountId: string,
      toAccountId: string,
      amount: number,
      date: string,
      note?: string
    ) => {
      const u = userRef.current;
      const database = getFirestoreDb();
      if (!u || !database) {
        toast.error("Choose two accounts and enter a valid amount");
        return false;
      }
      const validation = validateAccountMoneyMove({
        fromAccountId,
        toAccountId,
        amount,
        date,
      });
      if (!validation.ok) {
        toast.error(
          validation.error === "Invalid payment date"
            ? "Invalid transfer date"
            : validation.error === "Source and destination accounts are required"
              ? "Choose two accounts and enter a valid amount"
              : validation.error
        );
        return false;
      }
      try {
        const outcome = await commitWrite(
          () =>
            addDoc(collection(database, "users", u.uid, "accountTransfers"), {
              fromAccountId,
              toAccountId,
              amount,
              date,
              note: note?.trim() || "",
              createdAt: serverTimestamp(),
            }),
          { label: "transfer" }
        );
        toast.success(writeSavedMessage(outcome, "Transfer recorded"));
        return true;
      } catch (err) {
        logError("financeDataProvider.recordTransfer", err);
        toast.error("Failed to record transfer");
        return false;
      }
    },
    []
  );

  const deleteTransfer = useCallback(async (id: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database) return;
    try {
      const outcome = await commitWrite(
        () => deleteDoc(doc(database, "users", u.uid, "accountTransfers", id)),
        { label: "transfer deletion" }
      );
      toast.success(writeSavedMessage(outcome, "Transfer removed"));
    } catch (err) {
      logError("financeDataProvider.removeTransfer", err);
      toast.error("Failed to remove transfer");
    }
  }, []);

  // ─── Memoized Values ─────────────────────────────────────────────────────────

  const expensesValue = useMemo<ExpensesContextType>(
    () => ({
      expenses,
      expensesLoading,
      financeError,
      retryFinanceData,
      pendingSyncCount,
      isFromCache,
    }),
    [
      expenses,
      expensesLoading,
      financeError,
      retryFinanceData,
      pendingSyncCount,
      isFromCache,
    ]
  );

  const incomesValue = useMemo<IncomesContextType>(
    () => ({
      incomes,
      incomesLoading,
    }),
    [incomes, incomesLoading]
  );

  const typeNameById = useMemo(() => {
    const map = new Map<string, string>();
    accountTypes.forEach((t) => map.set(t.id, t.name));
    return map;
  }, [accountTypes]);

  const hydratedAccounts = useMemo(
    () =>
      accounts.map((account) =>
        hydrateAccountIdentity(account, typeNameById.get(account.typeId))
      ),
    [accounts, typeNameById]
  );

  const accountsValue = useMemo<AccountsContextType>(
    () => ({
      accounts: hydratedAccounts,
      accountsLoading,
      financeError,
      retryFinanceData,
      accountTypes,
      accountTypesLoading,
      payments,
      paymentsLoading,
      entries,
      entriesLoading,
      transfers,
      transfersLoading,
      addAccount,
      updateAccount,
      deleteAccount,
      addAccountType,
      deleteAccountType,
      addPayment,
      addExternalPayment,
      deletePayment,
      addEntry,
      deleteEntry,
      addTransfer,
      deleteTransfer,
    }),
    [
      hydratedAccounts,
      accountsLoading,
      financeError,
      retryFinanceData,
      accountTypes,
      accountTypesLoading,
      payments,
      paymentsLoading,
      entries,
      entriesLoading,
      transfers,
      transfersLoading,
      addAccount,
      updateAccount,
      deleteAccount,
      addAccountType,
      deleteAccountType,
      addPayment,
      addExternalPayment,
      deletePayment,
      addEntry,
      deleteEntry,
      addTransfer,
      deleteTransfer,
    ]
  );

  return (
    <ExpensesContext.Provider value={expensesValue}>
      <IncomesContext.Provider value={incomesValue}>
        <AccountsContext.Provider value={accountsValue}>
          {children}
        </AccountsContext.Provider>
      </IncomesContext.Provider>
    </ExpensesContext.Provider>
  );
}

// ─── Context Hooks ───────────────────────────────────────────────────────────

export function useExpensesContext() {
  const context = useContext(ExpensesContext);
  if (!context) {
    throw new Error("useExpensesContext must be used within a FinanceDataProvider");
  }
  return context;
}

export function useIncomesContext() {
  const context = useContext(IncomesContext);
  if (!context) {
    throw new Error("useIncomesContext must be used within a FinanceDataProvider");
  }
  return context;
}

export function useAccountsContext() {
  const context = useContext(AccountsContext);
  if (!context) {
    throw new Error("useAccountsContext must be used within a FinanceDataProvider");
  }
  return context;
}

export function useFinanceDataContext(): FinanceDataContextType {
  const exp = useExpensesContext();
  const inc = useIncomesContext();
  const acc = useAccountsContext();
  return useMemo(() => ({ ...exp, ...inc, ...acc }), [exp, inc, acc]);
}
