import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  runTransaction,
  updateDoc,
  where,
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
import { forgetSnapshotPath, logDirectRead, logQuerySnapshot } from "@/lib/firestoreReadDebug";
import { notifyReadModelSnapshot } from "@/lib/readModelPush";
import { noteDirectWrites, noteTransactionWrites } from "@/lib/readModelWriteHooks";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { friendlyErrorMessage, logError, logWarning } from "@/lib/errors";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useAccounts } from "@/hooks/useAccounts";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useReadModelMode, useReadModelSource } from "@/hooks/useReadModelSource";
import { billPassFingerprint, billPassHasWork, billPassReadsCopy, loadAuthoritativeBillInputs, toCreditCardBill, type AuthoritativeReader, type BillPassInputs } from "@/lib/readModelLocal/billPass";
import { toSourceDocs } from "@/lib/readModelLocal/readSource";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useExpenses } from "@/hooks/useExpenses";
import { usePushReminderMode } from "@/hooks/usePushReminderMode";
import { useSettings } from "@/providers/SettingsProvider";
import { perfEvent } from "@/lib/perf";
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
  previewSettledAutoBillRecalculation,
  type SettledBillRecalculation,
} from "@/shared/utils/autoCreditCardBills";
import {
  billAllocationBasisUnchanged,
  collectCreditBillAllocationPatches,
  collectCreditBillDuplicateResolutions,
} from "@/shared/utils/creditCardLedger";
import { createAutoCreditCardBill } from "@/services/creditCardBills/autoBill";
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

/**
 * SPENDLY-597: the bill pass's Firestore reads when its inputs are served by
 * the on-device copy (never the copy). Metered like every direct read.
 */
function firestoreBillReader(db: NonNullable<ReturnType<typeof getFirestoreDb>>, uid: string): AuthoritativeReader {
  const read = async (run: () => ReturnType<typeof getDocs>, path: string, shape: string) => {
    const snap = await run();
    logDirectRead(path, snap.docs.length, snap.metadata.fromCache ? "cache" : "server", { feature: "creditCardBills", queryShape: shape });
    return snap.docs.map((d) => ({ id: d.id, data: (d.data() ?? {}) as Record<string, unknown> }));
  };
  return {
    all: (name) => read(() => getDocs(query(collection(db, "users", uid, name))), `users/${uid}/${name}`, "bill pass inputs"),
    where: (name, field, value) =>
      read(
        () => getDocs(query(collection(db, "users", uid, name), where(field, "==", value))),
        `users/${uid}/${name}?${field}`,
        "bill pass card expenses"
      ),
  };
}

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
  // SPENDLY-673: firestore (default) | shadow | supabase, per readModel.creditCardBills.
  const billsSource = useReadModelSource("creditCardBills");
  // SPENDLY-597: where the bill pass's inputs come from (R4.3a).
  const expensesMode = useReadModelMode("expenses");
  const paymentsMode = useReadModelMode("accountPayments");
  const accountsMode = useReadModelMode("accounts");
  const accountTypesMode = useReadModelMode("accountTypes");
  const passInputModesRef = useRef<string[]>([]);
  passInputModesRef.current = [billsSource.mode, expensesMode, paymentsMode, accountsMode, accountTypesMode];
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
  // SPENDLY-675: bill ids the pass last ran against. null until it first runs.
  const passSeenBillIds = useRef<Set<string> | null>(null);
  const autoGenerateToastShown = useRef(false);
  const lastAutoBillFingerprintRef = useRef("");
  const didInitialAutoGenerate = useRef(false);
  // SPENDLY-719: a pass asked for while one is running runs right after it,
  // instead of being dropped (the bill stamp it would correct lands mid-pass).
  const autoGenerateRerun = useRef(false);
  // An unfinished pass (a skipped compare-and-set, or offline) retries a few
  // times, then waits for the next trigger rather than looping.
  const autoGenerateRetries = useRef(0);
  const generateAutoBillsRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * SPENDLY-719: run the bill pass soon. Money actions call this so the
   * stored bill (`amountPaid`, `status`, `remainingAmount`, which the bills
   * list and the server's reminders read) matches the ledger at once,
   * cashback included, instead of waiting for the next app focus.
   */
  const requestBillPass = useCallback((delayMs = 400) => {
    if (autoGenerateTimer.current) clearTimeout(autoGenerateTimer.current);
    autoGenerateTimer.current = setTimeout(() => {
      void generateAutoBillsRef.current?.();
    }, delayMs);
  }, []);

  const globalPrefs = settings.creditCardBillReminders;
  const timezone = settings.timezone;
  const showAmounts = settings.pushNotifications.showAmounts;
  // SPENDLY-693: when the server delivers reminders as push, this phone doesn't.
  const { mode: reminderMode, loading: reminderModeLoading } = usePushReminderMode();

  useEffect(() => {
    autoGenerateToastShown.current = false;
    lastAutoBillFingerprintRef.current = "";
    didInitialAutoGenerate.current = false;
  }, [user?.uid]);

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
        setBills(docs.map((d) => toCreditCardBill(d, todayDateKey(timezone))));
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
    if (autoGenerateInFlight.current) {
      autoGenerateRerun.current = true;
      return;
    }
    autoGenerateInFlight.current = true;
    passSeenBillIds.current = new Set(bills.map((bill) => bill.id));

    // The pass itself, unchanged; it runs on whichever inputs the gate below chose.
    const runBillPass = async (inputs: BillPassInputs) => {
      const { accounts, accountTypes, expenses, payments, bills } = inputs;
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
      for (const allocation of previewAllocations) {
        const existing = patchedPreview.get(allocation.billId);
        if (!existing) continue;
        patchedPreview.set(allocation.billId, {
          ...existing,
          amountPaid: allocation.amountPaid,
          paymentIds: allocation.paymentIds,
        });
      }
      const previewDuplicateResolutions = collectCreditBillDuplicateResolutions(
        [...patchedPreview.values()],
        todayDateKey(timezone)
      );
      const fingerprint = billPassFingerprint({
        drafts,
        patches,
        allocations: previewAllocations,
        duplicates: previewDuplicateResolutions,
        bills,
      });
      if (fingerprint === lastAutoBillFingerprintRef.current) {
        return;
      }
      // SPENDLY-719: a skipped or failed write leaves this pass unfinished, so
      // its fingerprint is not recorded and the next pass tries again.
      let incomplete = false;

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
          noteDirectWrites(user.uid, [`users/${user.uid}/creditCardBills/${patch.billId}`]);
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
        patchedBills.set(allocation.billId, {
          ...existing,
          amountPaid: allocation.amountPaid,
          paymentIds: allocation.paymentIds,
          status: derived.status,
          remainingAmount: derived.remainingAmount,
        });
        try {
          // SPENDLY-497: compare-and-set. A payment recorded since this pass
          // read the bill (increment + arrayUnion) must not be overwritten by
          // the absolute value computed here; skip and let the next pass
          // recompute. Transactions need the server, so offline this throws
          // and the pass simply retries later.
          const billRef = doc(db, "users", user.uid, "creditCardBills", allocation.billId);
          const applied = await runTransaction(db, async (tx) => {
            const snap = await tx.get(billRef);
            if (!billAllocationBasisUnchanged(snap.data(), existing)) return false;
            tx.update(billRef, {
              amountPaid: allocation.amountPaid,
              paymentIds: allocation.paymentIds,
              paymentDate: allocation.paymentDate ?? null,
              status: derived.status,
              remainingAmount: derived.remainingAmount,
              nextReminderAt: derived.nextReminderAt ?? null,
              updatedAt: serverTimestamp(),
            });
            return true;
          });
          if (applied) noteTransactionWrites(user.uid, [billRef.path]);
          else {
            // Keep the in-memory view on the stored doc, not the skipped patch.
            patchedBills.set(allocation.billId, existing);
            incomplete = true;
          }
        } catch (err) {
          patchedBills.set(allocation.billId, existing);
          incomplete = true;
          logWarning("creditCardBills.allocatePayments", err);
        }
      }

      // SPENDLY-417: two docs for the same card+cycle can exist (duplicate
      // generation, a manual bill alongside an auto one). Reconciliation
      // above only ever claims one of them, so the other keeps whatever
      // amountPaid/status it had when created — this is how an already-paid
      // cycle keeps showing OVERDUE. Merge every duplicate group onto one
      // canonical doc and cancel the rest; never deletes a doc or a payment.
      const duplicateResolutions = collectCreditBillDuplicateResolutions(
        [...patchedBills.values()],
        todayDateKey(timezone)
      );
      for (const resolution of duplicateResolutions) {
        const canonicalPatch = resolution.canonicalPatch;
        if (canonicalPatch) {
          try {
            await commitWrite(
              () =>
                updateDoc(
                  doc(db, "users", user.uid, "creditCardBills", resolution.canonicalId),
                  {
                    amountPaid: canonicalPatch.amountPaid,
                    paymentIds: canonicalPatch.paymentIds,
                    status: canonicalPatch.status,
                    remainingAmount: canonicalPatch.remainingAmount,
                    updatedAt: serverTimestamp(),
                  }
                ),
              { label: "credit card bill" }
            );
            noteDirectWrites(user.uid, [`users/${user.uid}/creditCardBills/${resolution.canonicalId}`]);
          } catch (err) {
            logError("creditCardBills.mergeDuplicate", err);
          }
        }
        for (const cancelId of resolution.cancelIds) {
          try {
            await commitWrite(
              () =>
                updateDoc(doc(db, "users", user.uid, "creditCardBills", cancelId), {
                  status: "CANCELLED",
                  updatedAt: serverTimestamp(),
                }),
              { label: "credit card bill" }
            );
            noteDirectWrites(user.uid, [`users/${user.uid}/creditCardBills/${cancelId}`]);
          } catch (err) {
            logError("creditCardBills.cancelDuplicate", err);
          }
        }
      }

      lastAutoBillFingerprintRef.current = incomplete ? "" : fingerprint;
      if (!incomplete) {
        autoGenerateRetries.current = 0;
      } else if (autoGenerateRetries.current < 3) {
        autoGenerateRetries.current += 1;
        requestBillPass(1500);
      }
    };

    try {
      // SPENDLY-597 (READ_MODEL_RULES R4.3a): this pass writes statements from
      // what it reads, so it never writes from the on-device copy. When any
      // input is served by the copy: check for work on the screen's data
      // (free), and only if there is some, run on Firestore's inputs.
      const stateInputs: BillPassInputs = { accounts, accountTypes, expenses, payments, bills };
      if (!billPassReadsCopy(passInputModesRef.current)) {
        await runBillPass(stateInputs);
        return;
      }
      const today = todayDateKey(timezone);
      if (!billPassHasWork(stateInputs, today, (bill) => refreshDerivedFields(bill, timezone, globalPrefs.enabled))) return;
      await runBillPass(await loadAuthoritativeBillInputs(firestoreBillReader(db, user.uid), today));
    } catch (err) {
      logError("creditCardBills.autoPass", err);
    } finally {
      autoGenerateInFlight.current = false;
      if (autoGenerateRerun.current) {
        autoGenerateRerun.current = false;
        requestBillPass();
      }
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
    requestBillPass,
  ]);

  useEffect(() => {
    generateAutoBillsRef.current = generateAutoBills;
  }, [generateAutoBills]);

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

  // SPENDLY-675: a bill that appears after the pass ran (one created by
  // another device or the legacy cron, or by this pass itself) kept its
  // creation-time amountPaid until the next app focus, so the statement
  // contradicted the card's Total outstanding. Re-run once when a new bill id
  // shows up. Bounded: each run records the ids it saw, the fingerprint skips
  // a no-op run, and the allocation write is compare-and-set (SPENDLY-497),
  // so a second device racing it skips rather than overwrites.
  useEffect(() => {
    const seen = passSeenBillIds.current;
    if (!seen) return;
    if (bills.some((bill) => !seen.has(bill.id))) scheduleAutoGenerate();
  }, [bills, scheduleAutoGenerate]);

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
