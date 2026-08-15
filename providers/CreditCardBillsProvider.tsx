import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
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
import { AppState } from "react-native";

import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite } from "@/lib/firestoreWrite";
import { useAuth } from "@/providers/AuthProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useSettings } from "@/providers/SettingsProvider";
import {
  DEFAULT_BILL_REMINDER_FREQUENCY,
  DEFAULT_CREDIT_CARD_BILL_REMINDERS,
  type CreateCreditCardBillInput,
  type CreditCardBill,
  type CreditCardBillReminderLog,
} from "@/shared/types/creditCardBill";
import {
  computeNextReminderAt,
} from "@/shared/utils/creditCardBillReminders";
import {
  computeCreditCardBillStatus,
  computeRemainingAmount,
} from "@/shared/utils/creditCardBillStatus";
import { validateCreateCreditCardBillInput } from "@/shared/utils/creditCardBillValidate";
import { todayDateKey } from "@/shared/utils/dates";
import {
  cancelBillReminders,
  reconcileBillReminders,
} from "@/services/creditCardBills/billReminderScheduler";

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
  snoozeBillReminder: (billId: string, days?: number) => Promise<boolean>;
  refreshReminderSchedules: () => Promise<void>;
};

const CreditCardBillsContext = createContext<
  CreditCardBillsContextType | undefined
>(undefined);

function refreshDerivedFields(
  bill: Pick<
    CreditCardBill,
    | "dueDate"
    | "statementAmount"
    | "amountPaid"
    | "status"
    | "reminderEnabled"
    | "reminderFrequency"
    | "lastReminderSentAt"
  >,
  timezone: string,
  globalEnabled: boolean
): Pick<
  CreditCardBill,
  "status" | "remainingAmount" | "nextReminderAt"
> {
  const remainingAmount = computeRemainingAmount(
    bill.statementAmount,
    bill.amountPaid
  );
  const status =
    bill.status === "CANCELLED"
      ? "CANCELLED"
      : computeCreditCardBillStatus({
          today: todayDateKey(timezone),
          dueDate: bill.dueDate,
          amountPaid: bill.amountPaid,
          statementAmount: bill.statementAmount,
        });
  const nextReminderAt =
    computeNextReminderAt({
      bill: {
        ...bill,
        status,
        remainingAmount,
      },
      today: todayDateKey(timezone),
      globalPrefs: {
        ...DEFAULT_CREDIT_CARD_BILL_REMINDERS,
        enabled: globalEnabled,
      },
    }) ?? undefined;
  return { status, remainingAmount, nextReminderAt };
}

export function CreditCardBillsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { settings } = useSettings();
  const [bills, setBills] = useState<CreditCardBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const globalPrefs = settings.creditCardBillReminders;
  const timezone = settings.timezone;

  useEffect(() => {
    const db = getFirestoreDb();
    if (!user || !db) {
      setBills([]);
      setBillsLoading(false);
      return;
    }

    setBillsLoading(true);
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "creditCardBills")),
      (snap) => {
        setBills(
          snap.docs.map(
            (d) => ({ id: d.id, ...(d.data() as object) }) as CreditCardBill
          )
        );
        setBillsLoading(false);
      },
      () => setBillsLoading(false)
    );
    return unsub;
  }, [user]);

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
    const accountsById = new Map(accounts.map((a) => [a.id, a]));
    await reconcileBillReminders({
      bills,
      accountsById,
      globalPrefs,
      timezone,
      onLog: async (entry) => {
        // Only persist schedule failures / skips occasionally would be noisy;
        // log explicit skipped/failed reasons only.
        if (entry.status === "failed") {
          await writeReminderLog(entry);
        }
      },
    });
  }, [accounts, bills, globalPrefs, timezone, writeReminderLog]);

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
        accountTypes
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

      // Client-generated id: the caller needs it immediately, and offline the
      // server round-trip that `addDoc` waits on never happens.
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
      return ref.id;
    },
    [
      user,
      accounts,
      accountTypes,
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

      if (derived.status === "PAID" || derived.status === "CANCELLED") {
        await cancelBillReminders(id);
      }
      return true;
    },
    [user, bills, accounts, accountTypes, timezone, globalPrefs.enabled]
  );

  const applyPaymentToBill = useCallback(
    async (
      billId: string,
      amount: number,
      paymentDate: string,
      paymentId?: string
    ): Promise<boolean> => {
      const existing = bills.find((b) => b.id === billId);
      if (!existing) return false;
      const amountPaid = existing.amountPaid + Math.max(0, amount);
      const paymentIds = paymentId
        ? [...(existing.paymentIds || []), paymentId]
        : existing.paymentIds;

      return updateBill(billId, {
        amountPaid,
        paymentDate,
        paymentIds,
      });
    },
    [bills, updateBill]
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
      return updateBill(billId, {
        amountPaid: Math.max(amountPaid, existing.statementAmount),
        paymentDate: opts.paymentDate,
        paymentIds,
      });
    },
    [bills, updateBill]
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
      markBillPaid,
      cancelBill,
      snoozeBillReminder,
      refreshReminderSchedules,
    }),
    [
      bills,
      billsLoading,
      createBill,
      updateBill,
      applyPaymentToBill,
      markBillPaid,
      cancelBill,
      snoozeBillReminder,
      refreshReminderSchedules,
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
