/**
 * Detect recurring merchants from the live expense list and upsert Subscriptions.
 */

import { useEffect, useRef } from "react";

import { useExpenses } from "@/hooks/useExpenses";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useAuth } from "@/providers/AuthProvider";

export function useSmsRecurringSync() {
  const { user, isDuress } = useAuth();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { subscriptions, loading: subsLoading } = useSubscriptions();
  const lastKey = useRef("");

  useEffect(() => {
    const uid = user?.uid;
    if (!uid || isDuress || expensesLoading || subsLoading) return;
    if (expenses.length < 3) return;

    const tail = expenses[expenses.length - 1];
    const key = `${uid}:${expenses.length}:${tail?.id || ""}:${subscriptions.length}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    void import("@/services/sms/smsRecurringSync")
      .then((m) => m.syncRecurringFromExpenses(uid, expenses, subscriptions))
      .catch(() => undefined);
  }, [
    user?.uid,
    isDuress,
    expenses,
    expensesLoading,
    subscriptions,
    subsLoading,
  ]);
}
