/**
 * Detect recurring merchants from the live expense list and queue them for review.
 */

import { useEffect, useRef } from "react";

import { useExpenses } from "@/hooks/useExpenses";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useAuth } from "@/providers/AuthProvider";

export function useSmsRecurringSync() {
  const { user, isDuress } = useAuth();
  const { expenses, complete: expensesComplete } = useExpenses();
  const { subscriptions, loading: subsLoading } = useSubscriptions();
  const lastKey = useRef("");

  useEffect(() => {
    const uid = user?.uid;
    // SPENDLY-98: `complete`, not `!loading` — the latter goes true on the
    // staged 300-row page. Detection needs at least three occurrences of a
    // merchant, so a truncated ledger drops real subscriptions below the
    // threshold and can classify cadence from a partial series.
    if (!uid || isDuress || !expensesComplete || subsLoading) return;
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
    expensesComplete,
    subscriptions,
    subsLoading,
  ]);
}
