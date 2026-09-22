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
import { forgetSnapshotPath, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { useSettings } from "@/providers/SettingsProvider";
import {
  AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
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
import { getAccountKind } from "@/shared/utils/accountKind";
import {
  canRunAutoCreditCardBillGeneration,
  collectAutoCreditCardBillDrafts,
  collectAutoCreditCardBillRefreshPatches,
} from "@/shared/utils/autoCreditCardBills";
import { collectCreditBillAllocationPatches } from "@/shared/utils/creditCardLedger";
import { createAutoCreditCardBill } from "@/services/creditCardBills/autoBill";
import { todayDateKey } from "@/shared/utils/dates";
import {
  cancelBillReminders,
  reconcileBillReminders,
} from "@/services/creditCardBills/billReminderScheduler";
import {
  recordCreditBillPayment,
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
  const {
    expenses,
    loading: expensesLoading,
    complete: expensesComplete,
  } = useExpenses();
  const { payments, loading: paymentsLoading } = useAccountPayments();
  const { settings } = useSettings();
  const [bills, setBills] = useState<CreditCardBill[]>([]);
  const [billsLoading, setBillsLoading] = useState(true);
  const reconcileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoGenerateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoGenerateInFlight = useRef(false);
  const autoGenerateToastShown = useRef(false);
  const lastAutoBillFingerprintRef = useRef("");
  const didInitialAutoGenerate = useRef(false);

  const globalPrefs = settings.creditCardBillReminders;
  const timezone = settings.timezone;

  useEffect(() => {
    autoGenerateToastShown.current = false;
    lastAutoBillFingerprintRef.current = "";
    didInitialAutoGenerate.current = false;
  }, [user?.uid]);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!user || !db) {
      setBills([]);
      setBillsLoading(false);
      return;
    }

    setBillsLoading(true);
    const path = `users/${user.uid}/creditCardBills`;
    const unsub = onSnapshot(
      query(collection(db, "users", user.uid, "creditCardBills")),
      (snap) => {
        logQuerySnapshot(path, snap);
        setBills(
          snap.docs.map((d) => {
            const data = d.data() as Partial<CreditCardBill>;
            const statementAmount = Number(data.statementAmount) || 0;
            const amountPaid = Number(data.amountPaid) || 0;
            return {
              ...data,
              id: d.id,
              statementAmount,
              amountPaid,
              remainingAmount:
                data.remainingAmount == null
                  ? computeRemainingAmount(statementAmount, amountPaid)
                  : Number(data.remainingAmount),
              paymentIds: data.paymentIds ?? [],
              status:
                data.status ??
                computeCreditCardBillStatus({
                  today: todayDateKey(timezone),
                  dueDate: data.dueDate || "",
                  amountPaid,
                  statementAmount,
                }),
            } as CreditCardBill;
          })
        );
        setBillsLoading(false);
      },
      () => setBillsLoading(false)
    );
    return () => {
      forgetSnapshotPath(path);
      unsub();
    };
  }, [user?.uid, timezone]);

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
      if (autoGenerateTimer.current) clearTimeout(autoGenerateTimer.current);
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

      // Manual bills keep a random id. Auto statements use
      // `createAutoCreditCardBill` (`accountId_statementDate`) so two devices
      // cannot mint duplicates for the same cycle.
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
      bills,
      timezone,
      globalPrefs.enabled,
      settings.currency,
    ]
  );

  const generateAutoBills = useCallback(async () => {
    // SPENDLY-97: the AppState listener below calls this directly, so the gate
    // cannot live only in the trigger effect — a foreground during a listener
    // resubscribe would otherwise generate from the staged page.
    if (!user) return;
    if (
      !canRunAutoCreditCardBillGeneration({
        billsLoading,
        expensesLoading,
        paymentsLoading,
        expensesComplete,
      })
    ) {
      return;
    }
    const db = getFirestoreDb();
    if (!db) return;
    if (autoGenerateInFlight.current) return;
    autoGenerateInFlight.current = true;
    try {
      const typeNameById = new Map(
        accountTypes.map((type) => [type.id, type.name])
      );
      const drafts = collectAutoCreditCardBillDrafts({
        accounts,
        typeNameById,
        expenses,
        existingBills: bills,
        today: todayDateKey(timezone),
      });
      const patches = collectAutoCreditCardBillRefreshPatches({
        accounts,
        typeNameById,
        expenses,
        existingBills: bills,
        today: todayDateKey(timezone),
      });
      const patchedPreview = new Map(bills.map((bill) => [bill.id, bill]));
      for (const patch of patches) {
        const existing = patchedPreview.get(patch.billId);
        if (!existing) continue;
        patchedPreview.set(patch.billId, {
          ...existing,
          statementAmount: patch.statementAmount,
          minimumDueAmount: patch.minimumDueAmount,
          statementDate: patch.statementDate,
          billingPeriodStart: patch.billingPeriodStart,
          billingPeriodEnd: patch.billingPeriodEnd,
          dueDate: patch.dueDate,
        });
      }
      const previewAllocations = collectCreditBillAllocationPatches({
        accounts,
        isCreditAccount: (account) =>
          getAccountKind(typeNameById.get(account.typeId) || "") === "credit",
        expenses,
        payments,
        bills: [...patchedPreview.values()],
        today: todayDateKey(timezone),
      });
      const fingerprint = JSON.stringify({
        drafts: drafts
          .map(
            (draft) =>
              `${draft.accountId}:${draft.billingPeriodStart}:${draft.statementAmount}`
          )
          .sort(),
        patches: patches
          .map(
            (patch) =>
              `${patch.billId}:${patch.statementAmount}:${patch.dueDate}:${patch.billingPeriodStart}:${patch.billingPeriodEnd}`
          )
          .sort(),
        allocations: previewAllocations
          .map(
            (allocation) =>
              `${allocation.billId}:${allocation.amountPaid}:${allocation.paymentIds.join(",")}`
          )
          .sort(),
      });
      if (fingerprint === lastAutoBillFingerprintRef.current) {
        return;
      }

      let created = 0;
      for (const draft of drafts) {
        try {
          await createAutoCreditCardBill(user.uid, {
            accountId: draft.accountId,
            statementAmount: draft.statementAmount,
            minimumDueAmount: draft.minimumDueAmount,
            statementDate: draft.statementDate,
            dueDate: draft.dueDate,
            billingPeriodStart: draft.billingPeriodStart ?? null,
            billingPeriodEnd: draft.billingPeriodEnd ?? null,
            note: draft.note ?? null,
            currency: draft.currency || settings.currency || "INR",
            reminderEnabled: draft.reminderEnabled ?? true,
            reminderFrequency:
              draft.reminderFrequency ?? AUTO_CREDIT_CARD_BILL_REMINDER_FREQUENCY,
          });
          created += 1;
        } catch (err) {
          logError("creditCardBills.autoCreate", err);
        }
      }
      if (created > 0 && !autoGenerateToastShown.current) {
        autoGenerateToastShown.current = true;
        toast.success(
          created === 1
            ? "Credit card statement created"
            : `${created} credit card statements created`
        );
      }

      const patchedBills = new Map(bills.map((bill) => [bill.id, bill]));
      for (const patch of patches) {
        const existing = patchedBills.get(patch.billId);
        if (!existing) continue;
        const next = {
          ...existing,
          statementAmount: patch.statementAmount,
          minimumDueAmount: patch.minimumDueAmount,
          statementDate: patch.statementDate,
          billingPeriodStart: patch.billingPeriodStart,
          billingPeriodEnd: patch.billingPeriodEnd,
          dueDate: patch.dueDate,
        };
        const derived = refreshDerivedFields(next, timezone, globalPrefs.enabled);
        patchedBills.set(patch.billId, {
          ...next,
          status: derived.status,
          remainingAmount: derived.remainingAmount,
        });
        if (
          existing.statementAmount === patch.statementAmount &&
          existing.minimumDueAmount === patch.minimumDueAmount &&
          existing.statementDate === patch.statementDate &&
          existing.billingPeriodStart === patch.billingPeriodStart &&
          existing.billingPeriodEnd === patch.billingPeriodEnd &&
          existing.dueDate === patch.dueDate &&
          existing.status === derived.status &&
          existing.remainingAmount === derived.remainingAmount
        ) {
          continue;
        }
        try {
          await commitWrite(
            () =>
              updateDoc(
                doc(db, "users", user.uid, "creditCardBills", patch.billId),
                {
                  statementAmount: patch.statementAmount,
                  minimumDueAmount: patch.minimumDueAmount,
                  statementDate: patch.statementDate,
                  billingPeriodStart: patch.billingPeriodStart,
                  billingPeriodEnd: patch.billingPeriodEnd,
                  dueDate: patch.dueDate,
                  status: derived.status,
                  remainingAmount: derived.remainingAmount,
                  nextReminderAt: derived.nextReminderAt ?? null,
                  updatedAt: serverTimestamp(),
                }
              ),
            { label: "credit card bill" }
          );
        } catch (err) {
          logError("creditCardBills.autoRefresh", err);
        }
      }

      // Attach payments recorded before statements were linked to the
      // statement they actually settled, so stored bills match the ledger.
      const allocations = collectCreditBillAllocationPatches({
        accounts,
        isCreditAccount: (account) =>
          getAccountKind(typeNameById.get(account.typeId) || "") === "credit",
        expenses,
        payments,
        bills: [...patchedBills.values()],
        today: todayDateKey(timezone),
      });
      for (const allocation of allocations) {
        const existing = patchedBills.get(allocation.billId);
        if (!existing) continue;
        if (
          existing.amountPaid === allocation.amountPaid &&
          JSON.stringify(existing.paymentIds ?? []) ===
            JSON.stringify(allocation.paymentIds)
        ) {
          continue;
        }
        const derived = refreshDerivedFields(
          { ...existing, amountPaid: allocation.amountPaid },
          timezone,
          globalPrefs.enabled
        );
        try {
          await commitWrite(
            () =>
              updateDoc(
                doc(db, "users", user.uid, "creditCardBills", allocation.billId),
                {
                  amountPaid: allocation.amountPaid,
                  paymentIds: allocation.paymentIds,
                  paymentDate: allocation.paymentDate ?? null,
                  status: derived.status,
                  remainingAmount: derived.remainingAmount,
                  nextReminderAt: derived.nextReminderAt ?? null,
                  updatedAt: serverTimestamp(),
                }
              ),
            { label: "credit card bill" }
          );
        } catch (err) {
          logError("creditCardBills.allocatePayments", err);
        }
      }
      lastAutoBillFingerprintRef.current = fingerprint;
    } finally {
      autoGenerateInFlight.current = false;
    }
  }, [
    user,
    billsLoading,
    expensesLoading,
    paymentsLoading,
    expensesComplete,
    accountTypes,
    accounts,
    expenses,
    payments,
    bills,
    timezone,
    globalPrefs.enabled,
    settings.currency,
  ]);

  const scheduleAutoGenerate = useCallback(() => {
    if (autoGenerateTimer.current) clearTimeout(autoGenerateTimer.current);
    autoGenerateTimer.current = setTimeout(() => {
      void generateAutoBills();
    }, 400);
  }, [generateAutoBills]);

  // SPENDLY-45: do not run on every bills/expenses/payments snapshot — that
  // is a write triggered by a read and races across devices. First load plus
  // app focus is enough; deterministic ids make a replay a merge.
  // SPENDLY-97: `expensesComplete`, not `expensesLoading` — the latter goes
  // false on the staged first-paint page, and this pass backfills 12 cycles.
  // Still one-shot: the ref is only claimed once the ledger is whole.
  useEffect(() => {
    if (!user) return;
    if (
      !canRunAutoCreditCardBillGeneration({
        billsLoading,
        expensesLoading,
        paymentsLoading,
        expensesComplete,
      })
    ) {
      return;
    }
    if (didInitialAutoGenerate.current) return;
    didInitialAutoGenerate.current = true;
    scheduleAutoGenerate();
  }, [
    user,
    billsLoading,
    expensesLoading,
    paymentsLoading,
    expensesComplete,
    scheduleAutoGenerate,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") scheduleAutoGenerate();
    });
    return () => sub.remove();
  }, [scheduleAutoGenerate]);

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
      if (derived.status === "PAID") {
        await cancelBillReminders(billId);
      }
      return true;
    },
    [user, bills, timezone, globalPrefs.enabled]
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
        return result.paymentId;
      } catch (err) {
        logError("creditCardBills.recordBillPayment", err);
        toast.error(friendlyErrorMessage(err, "Failed to record payment"));
        return null;
      }
    },
    [user, timezone]
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
      recordBillPayment,
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
      recordBillPayment,
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
