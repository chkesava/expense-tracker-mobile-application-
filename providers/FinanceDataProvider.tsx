import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type QuerySnapshot,
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

import { commitMutations } from "@/lib/commitMutations";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { writeSavedMessage } from "@/lib/firestoreWrite";
import {
  canDeleteAccount,
  countLinkedAccountRecords,
  totalPendingSyncCount,
  validateAccountMoneyMove,
} from "@/lib/finance/ledgerGuards";
import {
  setGlobalLastServerSyncAt,
  setGlobalPendingSyncCount,
} from "@/lib/syncStatusStore";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import type {
  Account,
  AccountEntry,
  AccountPayment,
  AccountTransfer,
  AccountType,
  CashbackKind,
  CashbackSource,
  Expense,
  Income,
} from "@/shared/types/expense";
import { CASHBACK_SOURCE_ID } from "@/shared/types/expense";
import { voidCreditBillPayment } from "@/services/creditCardBills/billPayment";
import { cashbackDocId } from "@/shared/utils/cashbackId";
import { isAccidentalBalanceBaseline } from "@/shared/utils/accountBaseline";
import {
  buildAccountWritePayload,
  hydrateAccountIdentity,
} from "@/shared/utils/accountIdentity";
import { isValidDateKey, todayDateKey } from "@/shared/utils/dates";
import { isActiveLedgerRow } from "@/shared/utils/ledgerRow";
import {
  FINANCE_SNAPSHOT_LISTEN_OPTIONS,
  foldLedgerSnapshot,
  isStagedPageComplete,
  LEDGER_STAGED_LIMIT,
  shouldApplySnapshotDocs,
  sortLedgerByDateDesc,
} from "@/shared/utils/ledgerSnapshot";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import {
  forgetSnapshotPath,
  logQuerySnapshot,
} from "@/lib/firestoreReadDebug";
import { useLoadFailure } from "@/hooks/useLoadFailure";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";

function noteServerSync(fromCache: boolean): void {
  if (!fromCache) setGlobalLastServerSyncAt(Date.now());
}

// ─── Granular Context Types ───────────────────────────────────────────────────

export type ExpensesContextType = {
  expenses: Expense[];
  expensesLoading: boolean;
  /**
   * SPENDLY-97: true once `expenses` holds the full history rather than the
   * staged first-paint page. `expensesLoading` goes false on the staged
   * snapshot, so anything that writes derived money (auto credit-card
   * statements) must gate on this instead.
   */
  expensesComplete: boolean;
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
  /**
   * SPENDLY-109: `incomesLoading` goes false on the *staged* 300-row page, so
   * anything that must not reason from a truncated ledger gates on this
   * instead. Mirrors `expensesComplete` (SPENDLY-97).
   */
  incomesComplete: boolean;
  financeError: LoadFailure | null;
  retryFinanceData: () => void;
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
  ) => Promise<string | null>;
  addExternalPayment: (
    toAccountId: string,
    amount: number,
    date: string,
    note?: string,
    opts?: { appliedCycleStart?: string; appliedCycleEnd?: string }
  ) => Promise<string | null>;
  addCashback: (input: {
    cardId: string;
    amount: number;
    date: string;
    kind: CashbackKind;
    note?: string;
    linkedExpenseId?: string;
    providerRef?: string;
    source?: CashbackSource;
    /** Set only when the user confirmed a deliberate duplicate. */
    discriminator?: string;
  }) => Promise<string | null>;
  voidCashback: (id: string, reason?: string) => Promise<boolean>;
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

// ─── Contexts ─────────────────────────────────────────────────────────────────

const ExpensesContext = createContext<ExpensesContextType | undefined>(undefined);
const IncomesContext = createContext<IncomesContextType | undefined>(undefined);
const AccountsContext = createContext<AccountsContextType | undefined>(undefined);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function FinanceDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
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
  const [expensesComplete, setExpensesComplete] = useState(false);
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [incomesLoading, setIncomesLoading] = useState(true);
  const [incomesComplete, setIncomesComplete] = useState(false);
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

  const repairedTodayBaselinesRef = useRef(new Set<string>());

  useEffect(() => {
    if (!uid) repairedTodayBaselinesRef.current.clear();
  }, [uid]);

  useEffect(() => {
    if (!uid || !db || accountsLoading) return;
    const today = todayDateKey();
    for (const account of accounts) {
      if (!account.id) continue;
      if (!isAccidentalBalanceBaseline(account.balanceAsOfDate, today)) continue;
      if (repairedTodayBaselinesRef.current.has(account.id)) continue;
      repairedTodayBaselinesRef.current.add(account.id);
      const accountId = account.id;
      void commitMutations(
        uid,
        [
          {
            op: "update",
            ref: doc(db, "users", uid, "accounts", accountId),
            data: { balanceAsOfDate: null },
          },
        ],
        {
          label: "account baseline",
          onLateFailure: (error) => {
            repairedTodayBaselinesRef.current.delete(accountId);
            logError("financeDataProvider.clearAccidentalBaseline", error);
          },
        }
      ).catch((error) => {
        repairedTodayBaselinesRef.current.delete(accountId);
        logError("financeDataProvider.clearAccidentalBaseline", error);
      });
    }
  }, [accounts, accountsLoading, db, uid]);

  // ─── Critical listeners (First paint) ────────────────────────────────────────

  useEffect(() => {
    if (!uid || !db) {
      setExpenses([]);
      setIncomes([]);
      setAccounts([]);
      setAccountTypes([]);
      setPayments([]);
      setEntries([]);
      setTransfers([]);
      setExpensesLoading(false);
      setExpensesComplete(false);
      setIncomesLoading(false);
      setIncomesComplete(false);
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
      setGlobalLastServerSyncAt(null);
      setIsFromCache(false);
      expensesHydratedRef.current = false;
      incomesHydratedRef.current = false;
      accountsHydratedRef.current = false;
      accountTypesHydratedRef.current = false;
      return;
    }

    // Don't flip to skeleton if we already have data (listener resubscribe after Google Sign-In).
    setExpensesLoading(!expensesHydratedRef.current);
    // SPENDLY-97: a resubscribe restarts at the staged page, so completeness
    // has to be re-earned even when the rows already on screen stay put.
    setExpensesComplete(false);
    setIncomesLoading(!incomesHydratedRef.current);
    setIncomesComplete(false);
    setAccountsLoading(!accountsHydratedRef.current);
    setAccountTypesLoading(!accountTypesHydratedRef.current);
    setPaymentsLoading(true);
    setEntriesLoading(true);
    setTransfersLoading(true);

    const base = ["users", uid] as const;
    const expensePath = `users/${uid}/expenses`;
    const incomePath = `users/${uid}/incomes`;
    const accountPath = `users/${uid}/accounts`;
    const accountTypePath = `users/${uid}/accountTypes`;
    const expensesCol = collection(db, ...base, "expenses");
    const incomesCol = collection(db, ...base, "incomes");

    // SPENDLY-97: the staged and upgraded listeners shared one handler, so
    // nothing could tell a 300-row page from the whole ledger. `fromFullQuery`
    // is the only difference — it marks the unlimited listener.
    const makeApplyExpensesSnap =
      (fromFullQuery: boolean) => (snap: QuerySnapshot) => {
        logQuerySnapshot(expensePath, snap);
        const { items, pendingWrites } = foldLedgerSnapshot<Expense>(snap.docs, {
          activeOnly: true,
        });
        if (shouldApplySnapshotDocs(snap, expensesHydratedRef.current)) {
          setExpenses(items);
        }
        pendingExpensesCountRef.current = pendingWrites;
        updatePendingSyncCount();
        setIsFromCache(snap.metadata.fromCache);
        noteServerSync(snap.metadata.fromCache);
        expensesHydratedRef.current = true;
        setFinanceError(null);
        setExpensesLoading(false);
        // A cache-served *unlimited* snapshot is still the entire local
        // ledger — the same rows every screen renders — so it counts as
        // complete. Only the short-page shortcut demands a server snapshot.
        if (fromFullQuery || isStagedPageComplete(snap)) {
          setExpensesComplete(true);
        }
      };

    const applyExpensesSnap = makeApplyExpensesSnap(false);

    // SPENDLY-109: same factory shape as expenses above — `fromFullQuery`
    // marks the unlimited listener, which is the only difference.
    const makeApplyIncomesSnap =
      (fromFullQuery: boolean) => (snap: QuerySnapshot) => {
        logQuerySnapshot(incomePath, snap);
        const { items, pendingWrites } = foldLedgerSnapshot<Income>(snap.docs, {
          activeOnly: true,
        });
        if (shouldApplySnapshotDocs(snap, incomesHydratedRef.current)) {
          setIncomes(items);
        }
        pendingIncomesCountRef.current = pendingWrites;
        updatePendingSyncCount();
        noteServerSync(snap.metadata.fromCache);
        incomesHydratedRef.current = true;
        setFinanceError(null);
        setIncomesLoading(false);
        // A cache-served *unlimited* snapshot is still the entire local ledger,
        // so it counts as complete. Only the short-page shortcut demands a
        // server snapshot.
        if (fromFullQuery || isStagedPageComplete(snap)) {
          setIncomesComplete(true);
        }
      };

    const applyIncomesSnap = makeApplyIncomesSnap(false);

    // SPENDLY-12: first paint is a page, not the lifetime ledger. The idle
    // upgrade below is the same pattern docs/PERF_BASELINE.md described and
    // commit 007f649 removed. Do not set loading on the upgrade.
    let expensesUnsub = onSnapshot(
      query(expensesCol, orderBy("createdAt", "desc"), limit(LEDGER_STAGED_LIMIT)),
      FINANCE_SNAPSHOT_LISTEN_OPTIONS,
      applyExpensesSnap,
      snapshotErrorHandler(
        "snapshot.expenses",
        (failure) => {
          setFinanceError(failure);
          setExpensesLoading(false);
        },
        "Couldn't load your expenses."
      )
    );
    let incomesUnsub = onSnapshot(
      query(incomesCol, orderBy("createdAt", "desc"), limit(LEDGER_STAGED_LIMIT)),
      FINANCE_SNAPSHOT_LISTEN_OPTIONS,
      applyIncomesSnap,
      snapshotErrorHandler(
        "snapshot.incomes",
        (failure) => {
          setFinanceError(failure);
          setIncomesLoading(false);
        },
        "Couldn't load your income."
      )
    );

    const cancelLedgerUpgrade = scheduleIdleWork(
      () => {
        expensesUnsub();
        expensesUnsub = onSnapshot(
          query(expensesCol, orderBy("createdAt", "desc")),
          FINANCE_SNAPSHOT_LISTEN_OPTIONS,
          makeApplyExpensesSnap(true),
          snapshotErrorHandler(
            "snapshot.expenses",
            (failure) => {
              setFinanceError(failure);
              setExpensesLoading(false);
            },
            "Couldn't load your expenses."
          )
        );
        incomesUnsub();
        incomesUnsub = onSnapshot(
          query(incomesCol, orderBy("createdAt", "desc")),
          FINANCE_SNAPSHOT_LISTEN_OPTIONS,
          makeApplyIncomesSnap(true),
          snapshotErrorHandler(
            "snapshot.incomes",
            (failure) => {
              setFinanceError(failure);
              setIncomesLoading(false);
            },
            "Couldn't load your income."
          )
        );
      },
      { timeoutMs: 2800, fallbackDelayMs: 1200 }
    );

    const unsubscribers = [
      onSnapshot(
        query(collection(db, ...base, "accounts")),
        FINANCE_SNAPSHOT_LISTEN_OPTIONS,
        (snap) => {
          logQuerySnapshot(accountPath, snap);
          if (shouldApplySnapshotDocs(snap, accountsHydratedRef.current)) {
            setAccounts(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Account))
            );
          }
          pendingAccountsCountRef.current = snap.docs.filter(
            (d) => d.metadata.hasPendingWrites
          ).length;
          updatePendingSyncCount();
          noteServerSync(snap.metadata.fromCache);
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
        FINANCE_SNAPSHOT_LISTEN_OPTIONS,
        (snap) => {
          logQuerySnapshot(accountTypePath, snap);
          if (shouldApplySnapshotDocs(snap, accountTypesHydratedRef.current)) {
            setAccountTypes(
              snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as AccountType))
            );
          }
          pendingAccountTypesCountRef.current = snap.docs.filter(
            (d) => d.metadata.hasPendingWrites
          ).length;
          updatePendingSyncCount();
          noteServerSync(snap.metadata.fromCache);
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
      cancelLedgerUpgrade();
      expensesUnsub();
      incomesUnsub();
      forgetSnapshotPath(expensePath);
      forgetSnapshotPath(incomePath);
      forgetSnapshotPath(accountPath);
      forgetSnapshotPath(accountTypePath);
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [uid, db, updatePendingSyncCount, financeAttempt, setFinanceError]);

  // ─── Deferred: Secondary ledger collections ─────────────────────────────────

  useEffect(() => {
    if (!uid || !db) return;

    let secondaryUnsubs: Array<() => void> = [];
    const paymentPath = `users/${uid}/accountPayments`;
    const entryPath = `users/${uid}/accountEntries`;
    const transferPath = `users/${uid}/accountTransfers`;

    const cancelIdle = scheduleIdleWork(
      () => {
        const base = ["users", uid] as const;
        let paymentsHydrated = false;
        let entriesHydrated = false;
        let transfersHydrated = false;

        secondaryUnsubs = [
          onSnapshot(
            query(collection(db, ...base, "accountPayments")),
            FINANCE_SNAPSHOT_LISTEN_OPTIONS,
            (snap) => {
              logQuerySnapshot(paymentPath, snap);
              const { items, pendingWrites } = foldLedgerSnapshot<AccountPayment>(snap.docs);
              if (shouldApplySnapshotDocs(snap, paymentsHydrated)) {
                setPayments(sortLedgerByDateDesc(items));
              }
              pendingPaymentsCountRef.current = pendingWrites;
              updatePendingSyncCount();
              noteServerSync(snap.metadata.fromCache);
              paymentsHydrated = true;
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
            FINANCE_SNAPSHOT_LISTEN_OPTIONS,
            (snap) => {
              logQuerySnapshot(entryPath, snap);
              const { items, pendingWrites } = foldLedgerSnapshot<AccountEntry>(snap.docs);
              if (shouldApplySnapshotDocs(snap, entriesHydrated)) {
                setEntries(sortLedgerByDateDesc(items));
              }
              pendingEntriesCountRef.current = pendingWrites;
              updatePendingSyncCount();
              noteServerSync(snap.metadata.fromCache);
              entriesHydrated = true;
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
            FINANCE_SNAPSHOT_LISTEN_OPTIONS,
            (snap) => {
              logQuerySnapshot(transferPath, snap);
              const { items, pendingWrites } = foldLedgerSnapshot<AccountTransfer>(snap.docs);
              if (shouldApplySnapshotDocs(snap, transfersHydrated)) {
                setTransfers(sortLedgerByDateDesc(items));
              }
              pendingTransfersCountRef.current = pendingWrites;
              updatePendingSyncCount();
              noteServerSync(snap.metadata.fromCache);
              transfersHydrated = true;
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
      forgetSnapshotPath(paymentPath);
      forgetSnapshotPath(entryPath);
      forgetSnapshotPath(transferPath);
      secondaryUnsubs.forEach((unsub) => unsub());
    };
  }, [uid, db, updatePendingSyncCount, financeAttempt, setFinanceError]);

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

        const ref = doc(collection(database, "users", u.uid, "accounts"));
        const outcome = await commitMutations(
          u.uid,
          [{ op: "set", ref, data: payload as Record<string, unknown> }],
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
        const outcome = await commitMutations(
          u.uid,
          [
            {
              op: "update",
              ref: doc(database, "users", u.uid, "accounts", id),
              data: payload as Record<string, unknown>,
            },
          ],
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
        linkedExpensesSnap.docs.filter((d) => isActiveLedgerRow(d.data())).length,
        linkedIncomesSnap.docs.filter((d) => isActiveLedgerRow(d.data())).length,
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

      const outcome = await commitMutations(
        u.uid,
        [{ op: "delete", ref: doc(database, "users", u.uid, "accounts", id) }],
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
      const ref = doc(collection(database, "users", u.uid, "accountTypes"));
      const outcome = await commitMutations(
        u.uid,
        [
          {
            op: "set",
            ref,
            data: { name: name.trim(), createdAt: serverTimestamp() },
          },
        ],
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
      const outcome = await commitMutations(
        u.uid,
        [{ op: "delete", ref: doc(database, "users", u.uid, "accountTypes", id) }],
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
      if (!u || !database) return null;
      const validation = validateAccountMoneyMove({
        fromAccountId,
        toAccountId,
        amount,
        date,
      });
      if (!validation.ok) {
        toast.error(validation.error);
        return null;
      }
      try {
        const ref = doc(collection(database, "users", u.uid, "accountPayments"));
        const outcome = await commitMutations(
          u.uid,
          [
            {
              op: "set",
              ref,
              data: {
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
              },
            },
          ],
          { label: "payment" }
        );
        toast.success(writeSavedMessage(outcome, "Bill payment recorded"));
        return ref.id;
      } catch (err) {
        logError("financeDataProvider.recordPayment", err);
        toast.error("Failed to record payment");
        return null;
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
      if (!u || !database || !toAccountId || amount <= 0) return null;
      if (!isValidDateKey(date)) {
        toast.error("Invalid payment date");
        return null;
      }
      try {
        const ref = doc(collection(database, "users", u.uid, "accountPayments"));
        const outcome = await commitMutations(
          u.uid,
          [
            {
              op: "set",
              ref,
              data: {
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
              },
            },
          ],
          { label: "payment" }
        );
        toast.success(writeSavedMessage(outcome, "Marked as already paid"));
        return ref.id;
      } catch (err) {
        logError("financeDataProvider.markAsPaid", err);
        toast.error("Failed to mark as paid");
        return null;
      }
    },
    []
  );

  /**
   * Record cashback / a statement credit against a credit card.
   *
   * Shares the `accountPayments` collection with bill payments because it does
   * the same thing to the ledger — reduces what the card owes — but carries its
   * own `sourceType` so nothing downstream can mistake it for a bill the user
   * paid, and its own sentinel `fromAccountId` so no bank balance moves.
   *
   * The document id is derived from the entry itself, so a double-tap, a retry
   * after a dropped connection, or the same credit entered on a second device
   * overwrites one document instead of crediting the card twice.
   *
   * Validation lives in `shared/utils/cashbackValidate.ts` and runs at the call
   * site, which has the ledger context this does not.
   */
  const addCashback = useCallback(
    async (input: {
      cardId: string;
      amount: number;
      date: string;
      kind: CashbackKind;
      note?: string;
      linkedExpenseId?: string;
      providerRef?: string;
      source?: CashbackSource;
      discriminator?: string;
    }) => {
      const u = userRef.current;
      const database = getFirestoreDb();
      if (!u || !database || !input.cardId || !(input.amount > 0)) return null;
      if (!isValidDateKey(input.date)) {
        toast.error("Invalid cashback date");
        return null;
      }
      try {
        const id = cashbackDocId(input);
        const ref = doc(database, "users", u.uid, "accountPayments", id);
        const outcome = await commitMutations(
          u.uid,
          [
            {
              op: "set",
              ref,
              data: {
                fromAccountId: CASHBACK_SOURCE_ID,
                toAccountId: input.cardId,
                amount: input.amount,
                date: input.date,
                note: input.note?.trim() || "",
                sourceType: "cashback",
                cashbackKind: input.kind,
                cashbackSource: input.source || "manual",
                ...(input.linkedExpenseId
                  ? { linkedExpenseId: input.linkedExpenseId }
                  : {}),
                ...(input.providerRef?.trim()
                  ? { providerRef: input.providerRef.trim() }
                  : {}),
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              },
            },
          ],
          { label: "cashback" }
        );
        toast.success(writeSavedMessage(outcome, "Cashback recorded"));
        return ref.id;
      } catch (err) {
        logError("financeDataProvider.addCashback", err);
        toast.error(friendlyErrorMessage(err, "Failed to record cashback"));
        return null;
      }
    },
    []
  );

  /**
   * Reverse a cashback record without destroying it.
   *
   * A delete would take the money back out of the ledger but leave nothing
   * behind explaining that it was ever there. The ledger skips voided rows, so
   * the balance is corrected and the history survives.
   */
  const voidCashback = useCallback(async (id: string, reason?: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database || !id) return false;
    try {
      const outcome = await commitMutations(
        u.uid,
        [
          {
            op: "update",
            ref: doc(database, "users", u.uid, "accountPayments", id),
            data: {
              voidedAt: new Date().toISOString(),
              ...(reason?.trim() ? { voidReason: reason.trim() } : {}),
              updatedAt: serverTimestamp(),
            },
          },
        ],
        { label: "cashback reversal" }
      );
      toast.success(writeSavedMessage(outcome, "Cashback reversed"));
      return true;
    } catch (err) {
      logError("financeDataProvider.voidCashback", err);
      toast.error(friendlyErrorMessage(err, "Failed to reverse cashback"));
      return false;
    }
  }, []);

  const deletePayment = useCallback(async (id: string) => {
    const u = userRef.current;
    const database = getFirestoreDb();
    if (!u || !database) return;
    try {
      const result = await voidCreditBillPayment(u.uid, id, {
        reason: "Payment removed",
      });
      toast.success(writeSavedMessage(result.outcome, "Payment removed"));
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
        const ref = doc(collection(database, "users", u.uid, "accountEntries"));
        const outcome = await commitMutations(
          u.uid,
          [
            {
              op: "set",
              ref,
              data: {
                accountId,
                amount,
                direction,
                date,
                note: note?.trim() || "",
                createdAt: serverTimestamp(),
              },
            },
          ],
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
      const outcome = await commitMutations(
        u.uid,
        [{ op: "delete", ref: doc(database, "users", u.uid, "accountEntries", id) }],
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
        const ref = doc(collection(database, "users", u.uid, "accountTransfers"));
        const outcome = await commitMutations(
          u.uid,
          [
            {
              op: "set",
              ref,
              data: {
                fromAccountId,
                toAccountId,
                amount,
                date,
                note: note?.trim() || "",
                createdAt: serverTimestamp(),
              },
            },
          ],
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
      const outcome = await commitMutations(
        u.uid,
        [{ op: "delete", ref: doc(database, "users", u.uid, "accountTransfers", id) }],
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
      expensesComplete,
      financeError,
      retryFinanceData,
      pendingSyncCount,
      isFromCache,
    }),
    [
      expenses,
      expensesLoading,
      expensesComplete,
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
      incomesComplete,
      financeError,
      retryFinanceData,
    }),
    [incomes, incomesLoading, incomesComplete, financeError, retryFinanceData]
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
      addCashback,
      voidCashback,
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
      addCashback,
      voidCashback,
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
