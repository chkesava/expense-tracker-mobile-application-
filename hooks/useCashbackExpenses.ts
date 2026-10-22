import { useEffect, useMemo, useState } from "react";

import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { readCashbackLinkedExpenses } from "@/lib/readModel/analyticsReadPath";
import { useAuth } from "@/providers/AuthProvider";
import type { ReadModelSession } from "@/providers/FinanceDataProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import type { AccountPayment, Expense } from "@/shared/types/expense";
import { missingCashbackLinks } from "@/shared/utils/cashbackHistory";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";

/**
 * SPENDLY-513 — the expenses `buildCashbackHistory` should see for a card.
 *
 * Cashback rows (`accountPayments`) are already complete on the device: the
 * provider listens to all of them, so totals never change source. What can be
 * missing is the purchase a cashback links to, when it is older than the
 * loaded Journal window, and then its note doesn't show.
 *
 * `firestore` (default) and `shadow`: `expenses` unchanged (shadow logs how
 * many linked purchases the device lacks). `supabase`: the missing linked
 * purchases are fetched from the read model and added.
 */
export function useCashbackExpenses(input: {
  cardId: string | undefined;
  payments: AccountPayment[];
  expenses: Expense[];
  session: ReadModelSession;
}): Expense[] {
  const { cardId, payments, expenses, session } = input;
  const { user } = useAuth();
  const { settings } = useSystemSettings();
  const configured = configuredReadModelMode(settings.readModel, "cashback");
  const missing = useMemo(
    () => (cardId && configured !== "firestore" ? missingCashbackLinks(cardId, payments, expenses) : []),
    [cardId, configured, payments, expenses]
  );
  const missingKey = missing.join(",");
  const [extra, setExtra] = useState<{ key: string; rows: Expense[] } | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!missingKey || !user || !db) return;
    let cancelled = false;
    readCashbackLinkedExpenses<Expense>({
      db,
      user,
      conditions: session.conditions(),
      missingIds: missingKey.split(","),
      locallyRemovedIds: session.locallyRemovedIds,
    })
      .then((rows) => {
        if (!cancelled && rows) setExtra({ key: missingKey, rows });
      })
      .catch((error) => logWarning("readModel.cashback", error));
    return () => {
      cancelled = true;
    };
  }, [missingKey, user, session]);

  return useMemo(() => {
    if (!extra || extra.key !== missingKey || extra.rows.length === 0) return expenses;
    const have = new Set(expenses.map((e) => e.id));
    return [...expenses, ...extra.rows.filter((e) => !have.has(e.id))];
  }, [expenses, extra, missingKey]);
}
