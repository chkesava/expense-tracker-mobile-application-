import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite, writeSavedMessage } from "@/lib/firestoreWrite";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useExpenseReferenceData } from "@/providers/ExpenseReferenceDataProvider";
import type { Subscription } from "@/shared/types/subscription";

/**
 * Firestore rejects `undefined` field values outright — the client throws
 * "Unsupported field value: undefined" before anything reaches the server, and
 * `ignoreUndefinedProperties` is not enabled on this app's Firestore instance.
 *
 * The recurring form always builds a full `Subscription` shape and leaves the
 * fields that do not apply to the chosen type as `undefined` (`intervalDays` on
 * a monthly EMI, `toAccountId` on anything but a transfer, ...), so every create
 * was failing on the payload rather than on permissions.
 */
function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) out[key] = val;
  }
  return out as T;
}

/**
 * On an update, an `undefined` field means "this no longer applies" (switching
 * an EMI back to a subscription, clearing an end term). Dropping the key would
 * silently leave the stale value on the document, so send an explicit delete.
 */
function withFieldDeletes<T extends Record<string, unknown>>(
  value: T
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = val === undefined ? deleteField() : val;
  }
  return out;
}

export function useSubscriptions(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { user } = useAuth();
  const uid = user?.uid;
  const {
    subscriptions: sharedSubscriptions,
    subscriptionsLoading,
    subscriptionsError,
    retrySubscriptions,
  } = useExpenseReferenceData();
  const subscriptions = enabled ? sharedSubscriptions : [];
  const loading = enabled ? subscriptionsLoading : false;
  const error = enabled ? subscriptionsError : null;
  const retry = retrySubscriptions;

  // CRUD Methods
  const addSubscription = async (
    sub: Omit<Subscription, "id">
  ): Promise<string | null> => {
    const db = getFirestoreDb();
    if (!uid || !db) return null;

    try {
      const docRef = doc(collection(db, "users", uid, "subscriptions"));
      const outcome = await commitWrite(
        () =>
          setDoc(
            docRef,
            withoutUndefined({ ...sub, createdAt: serverTimestamp() })
          ),
        { label: "subscription" }
      );
      toast.success(writeSavedMessage(outcome, "Subscription added"));
      return docRef.id;
    } catch (err) {
      logError("subscriptions.addsubscription", err);
      toast.error("Failed to add subscription");
      return null;
    }
  };

  const updateSubscription = async (
    id: string,
    updates: Partial<Subscription>
  ): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const outcome = await commitWrite(
        () =>
          updateDoc(
            doc(db, "users", uid, "subscriptions", id),
            withFieldDeletes(updates)
          ),
        { label: "subscription" }
      );
      toast.success(writeSavedMessage(outcome, "Subscription updated"));
      return true;
    } catch (err) {
      logError("subscriptions.updatesubscription", err);
      toast.error("Failed to update subscription");
      return false;
    }
  };

  const deleteSubscription = async (id: string): Promise<boolean> => {
    const db = getFirestoreDb();
    if (!uid || !db || !id) return false;

    try {
      const existing = subscriptions.find((sub) => sub.id === id);
      const outcome = await commitWrite(
        () => deleteDoc(doc(db, "users", uid, "subscriptions", id)),
        { label: "subscription deletion" }
      );
      if (existing?.name) {
        void import("@/services/sms/smsRecurringSync").then((m) =>
          m.rememberDeletedSubscription(uid, existing)
        );
      }
      toast.success(writeSavedMessage(outcome, "Subscription deleted"));
      return true;
    } catch (err) {
      logError("subscriptions.deletesubscription", err);
      toast.error("Failed to delete subscription");
      return false;
    }
  };

  const toggleActive = async (id: string, currentStatus: boolean) => {
    return updateSubscription(id, { isActive: !currentStatus });
  };

  return {
    error,
    retry,
    subscriptions,
    loading,
    addSubscription,
    updateSubscription,
    deleteSubscription,
    toggleActive,
  };
}
