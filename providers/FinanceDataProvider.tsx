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

import { getFirestoreDb } from "@/lib/firebase";
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
import { isValidDateKey } from "@/shared/utils/dates";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";

/** Initial first-paint window — full history loads on idle */
const INITIAL_EXPENSE_LIMIT = 200;

// ─── Granular Context Types ───────────────────────────────────────────────────

export type ExpensesContextType = {
  expenses: Expense[];
  expensesLoading: boolean;
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

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(true);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [incomesLoading, setIncomesLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountTypes, setAccountTypes] = useState<AccountType[]>([]);
  const [accountTypesLoading, setAccountTypesLoading] = useState(true);
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
    const total =
      pendingExpensesCountRef.current +
      pendingIncomesCountRef.current +
      pendingAccountsCountRef.current +
      pendingAccountTypesCountRef.current +
      pendingPaymentsCountRef.current +
      pendingEntriesCountRef.current +
      pendingTransfersCountRef.current;
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
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Expense))
        );
        pendingExpensesCountRef.current = snap.docs.filter(
          (d) => d.metadata.hasPendingWrites
        ).length;
        updatePendingSyncCount();
        setIsFromCache(snap.metadata.fromCache);
        expensesHydratedRef.current = true;
        setExpensesLoading(false);
      },
      (error) => {
        console.error("Error fetching expenses:", error);
        setExpensesLoading(false);
      }
    );

    // 2. Incomes, Accounts, and Account Types
    const unsubscribers = [
      onSnapshot(
        query(collection(db, ...base, "incomes"), orderBy("createdAt", "desc")),
        (snap) => {
          setIncomes(
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Income))
          );
          pendingIncomesCountRef.current = snap.docs.filter(
            (d) => d.metadata.hasPendingWrites
          ).length;
          updatePendingSyncCount();
          incomesHydratedRef.current = true;
          setIncomesLoading(false);
        },
        (error) => {
          console.error("Error fetching incomes:", error);
          setIncomesLoading(false);
        }
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
          setAccountsLoading(false);
        },
        (error) => {
          console.error("useAccounts snapshot error:", error);
          setAccountsLoading(false);
        }
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
          setAccountTypesLoading(false);
        },
        (error) => {
          console.error("useAccountTypes snapshot error:", error);
          setAccountTypesLoading(false);
        }
      ),
    ];

    return () => {
      limitedExpensesUnsubRef.current?.();
      limitedExpensesUnsubRef.current = null;
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [user, db, updatePendingSyncCount]);

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
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Expense))
            );
            pendingExpensesCountRef.current = snap.docs.filter(
              (d) => d.metadata.hasPendingWrites
            ).length;
            updatePendingSyncCount();
            expensesHydratedRef.current = true;
            setExpensesLoading(false);
          },
          (error) => {
            console.error("Error fetching full expenses:", error);
            setExpensesLoading(false);
          }
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
              setPaymentsLoading(false);
            },
            (error) => {
              console.error("useAccountPayments snapshot error:", error);
              setPaymentsLoading(false);
            }
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
              setEntriesLoading(false);
            },
            (error) => {
              console.error("useAccountEntries snapshot error:", error);
              setEntriesLoading(false);
            }
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
              setTransfersLoading(false);
            },
            (error) => {
              console.error("useAccountTransfers snapshot error:", error);
              setTransfersLoading(false);
            }
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
  }, [user, db, updatePendingSyncCount]);

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
        const payload: Record<string, unknown> = {
          name: name.trim(),
          typeId,
          createdAt: serverTimestamp(),
        };
        if (extras?.billGenerationDay != null)
          payload.billGenerationDay = extras.billGenerationDay;
        if (extras?.creditLimit != null) payload.creditLimit = extras.creditLimit;
        if (extras?.openingBalance != null)
          payload.openingBalance = extras.openingBalance;
        if (extras?.balanceInitialized != null)
          payload.balanceInitialized = extras.balanceInitialized;
        if (extras?.balanceAsOfDate != null)
          payload.balanceAsOfDate = extras.balanceAsOfDate;

        await addDoc(collection(database, "users", u.uid, "accounts"), payload);
        toast.success("Account added");
      } catch (err) {
        console.error(err);
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
        const { id: _, createdAt: __, ...validUpdates } = updates as Record<string, unknown>;
        await updateDoc(
          doc(database, "users", u.uid, "accounts", id),
          validUpdates
        );
        toast.success("Account updated");
      } catch (err) {
        console.error(err);
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

      const linkedCount =
        linkedExpensesSnap.size +
        linkedIncomesSnap.size +
        linkedEntriesSnap.size +
        linkedPaymentsFromSnap.size +
        linkedPaymentsToSnap.size +
        linkedTransfersFromSnap.size +
        linkedTransfersToSnap.size;

      if (linkedCount > 0) {
        toast.error(
          `Cannot delete account. ${linkedCount} linked records exist. Unlink transactions first.`
        );
        return;
      }

      await deleteDoc(doc(database, "users", u.uid, "accounts", id));
      toast.success("Account deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete account");
    }
  }, []);

  const addAccountType = useCallback(async (name: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database || !name.trim()) return;
    try {
      await addDoc(collection(database, "users", u.uid, "accountTypes"), {
        name: name.trim(),
        createdAt: serverTimestamp(),
      });
      toast.success("Account type added");
    } catch (err) {
      console.error(err);
      toast.error("Failed to add account type");
    }
  }, []);

  const deleteAccountType = useCallback(async (id: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database) return;
    try {
      await deleteDoc(doc(database, "users", u.uid, "accountTypes", id));
      toast.success("Account type deleted");
    } catch (err) {
      console.error(err);
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
      if (!u || !database || !fromAccountId || !toAccountId || amount <= 0)
        return false;
      if (fromAccountId === toAccountId) {
        toast.error("Source and destination accounts must differ");
        return false;
      }
      if (!isValidDateKey(date)) {
        toast.error("Invalid payment date");
        return false;
      }
      try {
        await addDoc(collection(database, "users", u.uid, "accountPayments"), {
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
        });
        toast.success("Bill payment recorded");
        return true;
      } catch (err) {
        console.error(err);
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
        await addDoc(collection(database, "users", u.uid, "accountPayments"), {
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
        });
        toast.success("Marked as already paid");
        return true;
      } catch (err) {
        console.error(err);
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
      await deleteDoc(doc(database, "users", u.uid, "accountPayments", id));
      toast.success("Payment removed");
    } catch (err) {
      console.error(err);
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
        await addDoc(collection(database, "users", u.uid, "accountEntries"), {
          accountId,
          amount,
          direction,
          date,
          note: note?.trim() || "",
          createdAt: serverTimestamp(),
        });
        toast.success(
          direction === "credit"
            ? "Funds added to account"
            : "Debit recorded in account"
        );
        return true;
      } catch (err) {
        console.error(err);
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
      await deleteDoc(doc(database, "users", u.uid, "accountEntries", id));
      toast.success("Account entry removed");
    } catch (err) {
      console.error(err);
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
      if (!u || !database || !fromAccountId || !toAccountId || amount <= 0) {
        toast.error("Choose two accounts and enter a valid amount");
        return false;
      }
      if (fromAccountId === toAccountId) {
        toast.error("Source and destination accounts must differ");
        return false;
      }
      if (!isValidDateKey(date)) {
        toast.error("Invalid transfer date");
        return false;
      }
      try {
        await addDoc(collection(database, "users", u.uid, "accountTransfers"), {
          fromAccountId,
          toAccountId,
          amount,
          date,
          note: note?.trim() || "",
          createdAt: serverTimestamp(),
        });
        toast.success("Transfer recorded");
        return true;
      } catch (err) {
        console.error(err);
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
      await deleteDoc(doc(database, "users", u.uid, "accountTransfers", id));
      toast.success("Transfer removed");
    } catch (err) {
      console.error(err);
      toast.error("Failed to remove transfer");
    }
  }, []);

  // ─── Memoized Values ─────────────────────────────────────────────────────────

  const expensesValue = useMemo<ExpensesContextType>(
    () => ({
      expenses,
      expensesLoading,
      pendingSyncCount,
      isFromCache,
    }),
    [expenses, expensesLoading, pendingSyncCount, isFromCache]
  );

  const incomesValue = useMemo<IncomesContextType>(
    () => ({
      incomes,
      incomesLoading,
    }),
    [incomes, incomesLoading]
  );

  const accountsValue = useMemo<AccountsContextType>(
    () => ({
      accounts,
      accountsLoading,
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
      accounts,
      accountsLoading,
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
