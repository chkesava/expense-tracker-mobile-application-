import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "@/lib/firestore";
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
import { AppState } from "react-native";

import { getFirestoreDb } from "@/lib/firebase";
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { notifyReadModelSnapshot } from "@/lib/readModelPush";
import { noteDirectWrites } from "@/lib/readModelWriteHooks";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useReadModelSource } from "@/hooks/useReadModelSource";
import { parseStoredBill } from "@/shared/utils/creditCardBillStatus";
import { toSourceDocs } from "@/lib/readModelLocal/readSource";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { usePushReminderMode } from "@/hooks/usePushReminderMode";
import { useSettings } from "@/providers/SettingsProvider";
import { perfEvent } from "@/lib/perf";
import {
  DEFAULT_BILL_REMINDER_FREQUENCY,
  type CreateCreditCardBillInput,
  type CreditCardBill,
  type CreditCardBillReminderLog,
} from "@/shared/types/creditCardBill";
import { validateCreateCreditCardBillInput } from "@/shared/utils/creditCardBillValidate";
import { refreshCreditCardBillDerivedFields } from "@/shared/utils/creditCardBillDerived";
import {
  previewSettledAutoBillRecalculation,
  type SettledBillRecalculation,
} from "@/shared/utils/autoCreditCardBills";
import { todayDateKey } from "@/shared/utils/dates";
import {
  cancelAllBillReminders,
  cancelBillReminders,
  reconcileBillReminders,
} from "@/services/creditCardBills/billReminderScheduler";
import {
  editCreditBillPayment,
  recordCreditBillPayment,
  type EditCreditBillPaymentPatch,
  type RecordCreditBillPaymentInput,
} from "@/services/creditCardBills/billPayment";

type CreditCardBillsContextType = {
  bills: CreditCardBill[];
  billsLoading: boolean;
  createBill: (input: CreateCreditCardBillInput) => Promise<string | null>;
  updateBill: (
    id: string,
    updates: Partial<CreditCardBill>
  ) => Promise<boolean>;
  applyPaymentToBill: (
    billId: string,
    amount: number,
    paymentDate: string,
    paymentId?: string
  ) => Promise<boolean>;
  recordBillPayment: (
    input: RecordCreditBillPaymentInput
  ) => Promise<string | null>;
  /**
   * SPENDLY-385: correct a recorded payment in place. `expectedUpdatedAt` is
   * the payment's `updatedAt` when the form opened; resolves true once saved
   * (or when nothing changed), false after an error has been shown.
   */
  editBillPayment: (
    paymentId: string,
    patch: EditCreditBillPaymentPatch,
    expectedUpdatedAt: unknown
  ) => Promise<boolean>;
  markBillPaid: (
    billId: string,
    opts: {
      amount: number;
      paymentDate: string;
      /** When set, caller already wrote AccountPayment. */
      paymentId?: string;
      recordPaymentOnlyOnBill?: boolean;
    }
  ) => Promise<boolean>;
  cancelBill: (billId: string) => Promise<boolean>;
  /**
   * SPENDLY-719: settle stored bills against the ledger soon. Call after a
   * write that moves a card's settlement outside this provider (cashback).
   */
  requestBillPass: () => void;
  /**
   * SPENDLY-99: what a settled auto statement would become if recomputed
   * against full history, or null when there is nothing to correct. Pure —
   * writes nothing, so the UI can show the before/after before asking.
   */
  previewBillRecalculation: (billId: string) => SettledBillRecalculation | null;
  /** Apply a previewed recalculation. Only ever called on user confirmation. */
  recalculateBill: (billId: string) => Promise<boolean>;
  snoozeBillReminder: (billId: string, days?: number) => Promise<boolean>;
  refreshReminderSchedules: () => Promise<void>;
  registerSubscriber: () => () => void;
};

const CreditCardBillsContext = createContext<
  CreditCardBillsContextType | undefined
>(undefined);

const refreshDerivedFields = refreshCreditCardBillDerivedFields;

export function CreditCardBillsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // SPENDLY-673: firestore (default) | shadow | supabase, per readModel.creditCardBills.
  const billsSource = useReadModelSource("creditCardBills");
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const {
    expenses,
    complete: expensesComplete,
  } = useExpenses();
  const { settings } = useSettings();
  const [bills, setBills] = useState<CreditCardBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * SPENDLY-734 (epic SPENDLY-735): the app computes no bill pass. The
   * server's `bill-daily` job (scripts/lib/billDailyCore.ts) settles stored
   * bills against the ledger, cashback included: closing cards, and every
   * card whose work it finds on the read model. Money actions still call this
   * after they save: SPENDLY-737 makes it ask the server to run for this user
   * now; until then the daily run settles them.
   */
  const requestBillPass = useCallback(() => {}, []);

  const globalPrefs = settings.creditCardBillReminders;
  const timezone = settings.timezone;
  const showAmounts = settings.pushNotifications.showAmounts;
  // SPENDLY-693: when the server delivers reminders as push, this phone doesn't.
  const { mode: reminderMode, loading: reminderModeLoading } = usePushReminderMode();

  const [shouldListen, setShouldListen] = useState(false);
  const subscriberCountRef = useRef(0);
  const teardownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const registerSubscriber = useCallback(() => {
    if (teardownTimerRef.current) {
      clearTimeout(teardownTimerRef.current);
      teardownTimerRef.current = null;
    }
    subscriberCountRef.current += 1;
    setShouldListen(true);
    return () => {
      subscriberCountRef.current = Math.max(0, subscriberCountRef.current - 1);
      if (subscriberCountRef.current === 0) {
        if (teardownTimerRef.current) clearTimeout(teardownTimerRef.current);
        teardownTimerRef.current = setTimeout(() => {
          if (subscriberCountRef.current === 0) {
            setShouldListen(false);
          }
          teardownTimerRef.current = null;
        }, 15000);
      }
    };
  }, []);

  useEffect(() => {
    return () => {
      if (teardownTimerRef.current) {
        clearTimeout(teardownTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!shouldListen) {
      if (bills.length === 0) {
        setBillsLoading(false);
      }
      return;
    }

    const db = getFirestoreDb();
    if (!user || !db) {
      setBills([]);
      setBillsLoading(false);
      return;
    }

    setBillsLoading(true);
    // SPENDLY-673: the same mapping for either source (Firestore or the on-device copy).
    const apply = (docs: { id: string; data: Record<string, unknown> }[]) => {
        setBills(docs.map((d) => parseStoredBill(d.id, d.data as Record<string, unknown>, todayDateKey(timezone))));
        setBillsLoading(false);
    };
    if (billsSource.mode === "supabase") return billsSource.subscribe(apply);

    const path = `users/${user.uid}/creditCardBills`;
    perfEvent("firestore_listener_start", { collection: "creditCardBills" });
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "creditCardBills")),
      (snap) => {
        logQuerySnapshot(path, snap, { feature: "creditCardBills", queryShape: "creditCardBills" });
        notifyReadModelSnapshot(snap);
        perfEvent("firestore_first_snapshot", {
          collection: "creditCardBills",
          docCount: snap.docs.length,
          fromCache: snap.metadata.fromCache,
        });
        const docs = toSourceDocs(snap);
        apply(docs);
        if (billsSource.mode === "shadow") void billsSource.shadow(docs);
      },
      () => setBillsLoading(false)
    );
    return () => {
      forgetSnapshotPath(path);
      unsub();
    };
  }, [user?.uid, timezone, shouldListen, billsSource.mode]);

  const writeReminderLog = useCallback(
    async (entry: Omit<CreditCardBillReminderLog, "id" | "sentAt" | "channel">) => {
      const db = getFirestoreDb();
      if (!user || !db) return;
      try {
        // Diagnostic log only — never block the caller on the network for it.
        await commitWrite(
          () =>
            addDoc(
              collection(db, "users", user.uid, "creditCardBillReminderLogs"),
              {
                billId: entry.billId,
                notificationType: entry.notificationType,
                daysBefore: entry.daysBefore ?? null,
                sentAt: new Date().toISOString(),
                channel: "local",
                status: entry.status,
                reason: entry.reason ?? null,
                createdAt: serverTimestamp(),
              }
            ),
          { graceMs: 0, onLateFailure: () => undefined }
        );
      } catch {
        // soft-fail — logging must not affect bill state
      }
    },
    [user]
  );

  const refreshReminderSchedules = useCallback(async () => {
    // Never cancel on a guess: wait until the mode is known.
    if (reminderModeLoading) return;
    if (reminderMode === "push") {
      await cancelAllBillReminders();
      return;
    }
    const accountsById = new Map(accounts.map((a) => [a.id, a]));
    await reconcileBillReminders({
      bills,
      accountsById,
      globalPrefs,
      timezone,
      showAmounts,
      onLog: async (entry) => {
        // Only persist schedule failures / skips occasionally would be noisy;
        // log explicit skipped/failed reasons only.
        if (entry.status === "failed") {
          await writeReminderLog(entry);
        }
      },
    });
  }, [accounts, bills, globalPrefs, timezone, showAmounts, writeReminderLog, reminderMode, reminderModeLoading]);

  const scheduleReconcile = useCallback(() => {
    if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    reconcileTimer.current = setTimeout(() => {
      void refreshReminderSchedules();
    }, 400);
  }, [refreshReminderSchedules]);

  useEffect(() => {
    if (billsLoading) return;
    scheduleReconcile();
  }, [bills, billsLoading, globalPrefs, scheduleReconcile]);

  // Clear any pending reconcile timer on unmount — otherwise a scheduled
  // reconcile can fire after logout using stale accounts/bills closures.
  useEffect(() => {
    return () => {
      if (reconcileTimer.current) clearTimeout(reconcileTimer.current);
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") scheduleReconcile();
    });
    return () => sub.remove();
  }, [scheduleReconcile]);

  const createBill = useCallback(
    async (input: CreateCreditCardBillInput): Promise<string | null> => {
      const db = getFirestoreDb();
      if (!user || !db) return null;

      const validation = validateCreateCreditCardBillInput(
        input,
        accounts,
        accountTypes,
        bills
      );
      if (!validation.ok) {
        throw new Error(validation.error);
      }

      const amountPaid = 0;
      const derived = refreshDerivedFields(
        {
          dueDate: input.dueDate,
          statementAmount: input.statementAmount,
          amountPaid,
          status: "UPCOMING",
          reminderEnabled: input.reminderEnabled ?? true,
          reminderFrequency:
            input.reminderFrequency ?? DEFAULT_BILL_REMINDER_FREQUENCY,
        },
        timezone,
        globalPrefs.enabled
      );

      // Manual bills keep a random id. Auto statements (created by the
      // server's bill-daily job, SPENDLY-727/734) use `autoCreditCardBillDocId`
      // (`accountId_statementDate`), so a replay cannot mint a duplicate.
      const ref = doc(collection(db, "users", user.uid, "creditCardBills"));
      await commitWrite(
        () =>
          setDoc(ref, {
            accountId: input.accountId,
            billingPeriodStart: input.billingPeriodStart ?? null,
            billingPeriodEnd: input.billingPeriodEnd ?? null,
            statementDate: input.statementDate,
            dueDate: input.dueDate,
            statementAmount: input.statementAmount,
            minimumDueAmount: input.minimumDueAmount,
            amountPaid,
            remainingAmount: derived.remainingAmount,
            currency: input.currency || settings.currency || "INR",
            status: derived.status,
            note: input.note ?? null,
            reminderEnabled: input.reminderEnabled ?? true,
            reminderFrequency:
              input.reminderFrequency ?? DEFAULT_BILL_REMINDER_FREQUENCY,
            nextReminderAt: derived.nextReminderAt ?? null,
            paymentIds: [],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }),
        { label: "credit card bill" }
      );
      noteDirectWrites(user.uid, [ref.path]);
      return ref.id;
    },
    [
      user,
      accounts,
      accountTypes,
      bills,
      timezone,
      globalPrefs.enabled,
      settings.currency,
    ]
  );

  const updateBill = useCallback(
    async (id: string, updates: Partial<CreditCardBill>): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!user || !db) return false;
      const existing = bills.find((b) => b.id === id);
      if (!existing) return false;

      if (updates.accountId && updates.accountId !== existing.accountId) {
        const { validateCreditCardBillAccount } = await import(
          "@/shared/utils/creditCardBillValidate"
        );
        const check = validateCreditCardBillAccount(
          updates.accountId,
          accounts,
          accountTypes
        );
        if (!check.ok) throw new Error(check.error);
      }

      const merged = { ...existing, ...updates };
      const derived = refreshDerivedFields(
        merged,
        timezone,
        globalPrefs.enabled
      );

      await commitWrite(
        () =>
          updateDoc(doc(db, "users", user.uid, "creditCardBills", id), {
            ...updates,
            status: derived.status,
            remainingAmount: derived.remainingAmount,
            nextReminderAt: derived.nextReminderAt ?? null,
            updatedAt: serverTimestamp(),
          }),
        { label: "credit card bill" }
      );
      noteDirectWrites(user.uid, [`users/${user.uid}/creditCardBills/${id}`]);

      if (derived.status === "PAID" || derived.status === "CANCELLED") {
        await cancelBillReminders(id);
      }
      return true;
    },
    [user, bills, accounts, accountTypes, timezone, globalPrefs.enabled]
  );

  // SPENDLY-99: the automatic refresh pass never repairs a PAID or CANCELLED
  // statement — rewriting a settled amount silently desyncs amountPaid/status
  // (SPENDLY-38 §6.4). This is the user-confirmed path instead. Preview is
  // pure; only `recalculateBill` writes, and only when the user says so.
  const previewBillRecalculation = useCallback(
    (billId: string): SettledBillRecalculation | null => {
      // A staged first-paint page would understate the recomputation — the
      // very bug that produced most of these wrong statements (SPENDLY-97).
      if (!expensesComplete) return null;
      const bill = bills.find((b) => b.id === billId);
      if (!bill) return null;
      const account = accounts.find((a) => a.id === bill.accountId);
      if (!account) return null;
      return previewSettledAutoBillRecalculation({
        bill,
        account,
        typeName: accountTypes.find((t) => t.id === account.typeId)?.name,
        expenses,
        today: todayDateKey(timezone),
      });
    },
    [expensesComplete, bills, accounts, accountTypes, expenses, timezone]
  );

  const recalculateBill = useCallback(
    async (billId: string): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!user || !db) return false;
      const existing = bills.find((b) => b.id === billId);
      const patch = previewBillRecalculation(billId);
      if (!existing || !patch) return false;

      // Full re-derive: if the corrected statement exceeds what was paid the
      // bill stops being PAID and reminders follow the normal rules. Slots
      // only run 30 days past the due date, so an old cycle schedules nothing.
      const derived = refreshDerivedFields(
        { ...existing, statementAmount: patch.recomputedAmount },
        timezone,
        globalPrefs.enabled
      );

      // Dates are deliberately left alone. The user is correcting an amount;
      // re-dating a settled statement is a different operation.
      await commitWrite(
        () =>
          updateDoc(doc(db, "users", user.uid, "creditCardBills", billId), {
            statementAmount: patch.recomputedAmount,
            minimumDueAmount: patch.minimumDueAmount,
            status: derived.status,
            remainingAmount: derived.remainingAmount,
            nextReminderAt: derived.nextReminderAt ?? null,
            recalculatedAt: new Date().toISOString(),
            previousStatementAmount: patch.storedAmount,
            updatedAt: serverTimestamp(),
          }),
        { label: "credit card bill" }
      );
      noteDirectWrites(user.uid, [`users/${user.uid}/creditCardBills/${billId}`]);

      if (derived.status === "PAID" || derived.status === "CANCELLED") {
        await cancelBillReminders(billId);
      } else {
        void refreshReminderSchedules();
      }
      return true;
    },
    [
      user,
      bills,
      previewBillRecalculation,
      timezone,
      globalPrefs.enabled,
      refreshReminderSchedules,
    ]
  );

  const applyPaymentToBill = useCallback(
    async (
      billId: string,
      amount: number,
      paymentDate: string,
      paymentId?: string
    ): Promise<boolean> => {
      const db = getFirestoreDb();
      if (!user || !db) return false;
      const existing = bills.find((b) => b.id === billId);
      if (!existing) return false;
      const settleable = Math.max(0, amount);
      const derived = refreshDerivedFields(
        { ...existing, amountPaid: existing.amountPaid + settleable },
        timezone,
        globalPrefs.enabled
      );
      await commitWrite(
        () =>
          updateDoc(doc(db, "users", user.uid, "creditCardBills", billId), {
            amountPaid: increment(settleable),
            ...(paymentId ? { paymentIds: arrayUnion(paymentId) } : {}),
            paymentDate,
            remainingAmount: derived.remainingAmount,
            status: derived.status,
            nextReminderAt: derived.nextReminderAt ?? null,
            updatedAt: serverTimestamp(),
          }),
        { label: "credit card bill payment stamp" }
      );
      noteDirectWrites(user.uid, [`users/${user.uid}/creditCardBills/${billId}`]);
      if (derived.status === "PAID") {
        await cancelBillReminders(billId);
      }
      // The stamp above counts cash only; the ledger also counts cashback.
      requestBillPass();
      return true;
    },
    [user, bills, timezone, globalPrefs.enabled, requestBillPass]
  );

  const recordBillPayment = useCallback(
    async (input: RecordCreditBillPaymentInput): Promise<string | null> => {
      if (!user) return null;
      try {
        const result = await recordCreditBillPayment(user.uid, {
          ...input,
          bill: input.bill
            ? { ...input.bill, timezone: input.bill.timezone || timezone }
            : undefined,
        });
        if (result.billStatus === "PAID" && input.bill?.id) {
          await cancelBillReminders(input.bill.id);
        }
        toast.success(writeSavedMessage(result.outcome, "Bill payment recorded"));
        // SPENDLY-719: the stamp counts this payment only; settle the stored
        // bill against the ledger (cashback included) now.
        requestBillPass();
        return result.paymentId;
      } catch (err) {
        logError("creditCardBills.recordBillPayment", err);
        toast.error(friendlyErrorMessage(err, "Failed to record payment"));
        return null;
      }
    },
    [user, timezone, requestBillPass]
  );

  const editBillPayment = useCallback(
    async (
      paymentId: string,
      patch: EditCreditBillPaymentPatch,
      expectedUpdatedAt: unknown
    ): Promise<boolean> => {
      if (!user) {
        toast.error("Not authenticated");
        return false;
      }
      try {
        const result = await editCreditBillPayment(user.uid, paymentId, patch, {
          expectedUpdatedAt,
          timezone,
        });
        if (!result.changed) {
          toast.info("No changes to save");
          return true;
        }
        if (result.billId) {
          if (result.billStatus === "PAID" || result.billStatus === "CANCELLED") {
            await cancelBillReminders(result.billId);
          } else {
            void refreshReminderSchedules();
          }
        }
        toast.success(writeSavedMessage(result.outcome, "Payment updated"));
        requestBillPass();
        return true;
      } catch (err) {
        logError("creditCardBills.editBillPayment", err);
        toast.error(friendlyErrorMessage(err, "Failed to update payment"));
        return false;
      }
    },
    [user, timezone, refreshReminderSchedules, requestBillPass]
  );

  const markBillPaid = useCallback(
    async (
      billId: string,
      opts: {
        amount: number;
        paymentDate: string;
        paymentId?: string;
        recordPaymentOnlyOnBill?: boolean;
      }
    ): Promise<boolean> => {
      const existing = bills.find((b) => b.id === billId);
      if (!existing) return false;
      const amountPaid = Math.max(existing.amountPaid, opts.amount);
      const paymentIds = opts.paymentId
        ? [...(existing.paymentIds || []), opts.paymentId]
        : existing.paymentIds;

      void opts.recordPaymentOnlyOnBill;
      const ok = await updateBill(billId, {
        amountPaid: Math.max(amountPaid, existing.statementAmount),
        paymentDate: opts.paymentDate,
        paymentIds,
      });
      if (ok) requestBillPass();
      return ok;
    },
    [bills, updateBill, requestBillPass]
  );

  const cancelBill = useCallback(
    async (billId: string): Promise<boolean> => {
      const ok = await updateBill(billId, { status: "CANCELLED" });
      if (ok) await cancelBillReminders(billId);
      return ok;
    },
    [updateBill]
  );

  const snoozeBillReminder = useCallback(
    async (billId: string, days = 1): Promise<boolean> => {
      const existing = bills.find((b) => b.id === billId);
      if (!existing) return false;
      const { addDaysToDateKey } = await import(
        "@/shared/utils/creditCardBillReminders"
      );
      const next = addDaysToDateKey(todayDateKey(timezone), days);
      return updateBill(billId, {
        lastReminderSentAt: new Date().toISOString(),
        nextReminderAt: next,
      });
    },
    [bills, timezone, updateBill]
  );

  const value = useMemo(
    () => ({
      bills,
      billsLoading,
      createBill,
      updateBill,
      applyPaymentToBill,
      requestBillPass,
      recordBillPayment,
      editBillPayment,
      markBillPaid,
      cancelBill,
      previewBillRecalculation,
      recalculateBill,
      snoozeBillReminder,
      refreshReminderSchedules,
      registerSubscriber,
    }),
    [
      bills,
      billsLoading,
      createBill,
      updateBill,
      applyPaymentToBill,
      requestBillPass,
      recordBillPayment,
      editBillPayment,
      markBillPaid,
      cancelBill,
      previewBillRecalculation,
      recalculateBill,
      snoozeBillReminder,
      refreshReminderSchedules,
      registerSubscriber,
    ]
  );

  return (
    <CreditCardBillsContext.Provider value={value}>
      {children}
    </CreditCardBillsContext.Provider>
  );
}

export function useCreditCardBillsContext(): CreditCardBillsContextType {
  const ctx = useContext(CreditCardBillsContext);
  if (!ctx) {
    throw new Error(
      "useCreditCardBillsContext must be used within CreditCardBillsProvider"
    );
  }
  return ctx;
}
