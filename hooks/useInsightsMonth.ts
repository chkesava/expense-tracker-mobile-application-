import { useEffect, useMemo, useState } from "react";

import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { readInsightsMonth } from "@/lib/readModel/analyticsReadPath";
import { useAuth } from "@/providers/AuthProvider";
import type { ReadModelSession } from "@/providers/FinanceDataProvider";
import { useNetwork } from "@/providers/NetworkProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { insightsMonthRows } from "@/shared/utils/insightsMonthRows";
import { isInMonth } from "@/shared/utils/dates";
import { configuredReadModelMode } from "@/shared/utils/readModelMode";

type Row = { id?: string; date?: unknown; month?: unknown; updatedAt?: unknown; createdAt?: unknown };

/**
 * SPENDLY-513 — the Insights month's rows.
 *
 * `firestore` (the default) and `shadow`: the rows the device holds for the
 * month, exactly as before (shadow also compares the month in the background).
 * `supabase`: the month's complete rows from the read model, with this
 * device's own newer writes overlaid (insightsMonthRows). The Insights
 * helpers then run unchanged over whichever rows these are.
 */
export function useInsightsMonth<E extends Row, I extends Row>(input: {
  monthKey: string;
  expenses: E[];
  incomes: I[];
  localMonthExpenses: E[];
  localMonthIncomes: I[];
  session: ReadModelSession;
}): { expenses: E[]; incomes: I[]; fromReadModel: boolean } {
  const { monthKey, expenses, incomes, localMonthExpenses, localMonthIncomes, session } = input;
  const { user, isDuress } = useAuth();
  const { isOnline } = useNetwork();
  const { settings } = useSystemSettings();
  const configured = configuredReadModelMode(settings.readModel, "insights");
  const [remote, setRemote] = useState<{ monthKey: string; expenses: E[]; incomes: I[] } | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    setRemote(null);
    if (configured === "firestore" || !user || !db) return;
    let cancelled = false;
    readInsightsMonth<E, I>({
      db,
      user,
      monthKey,
      conditions: session.conditions(),
      locallyRemovedIds: session.locallyRemovedIds,
    })
      .then((month) => {
        if (!cancelled && month) setRemote({ monthKey, ...month });
      })
      .catch((error) => logWarning("readModel.insights", error));
    return () => {
      cancelled = true;
    };
  }, [configured, user, monthKey, session, isOnline, isDuress]);

  return useMemo(() => {
    if (!remote || remote.monthKey !== monthKey) {
      return { expenses: localMonthExpenses, incomes: localMonthIncomes, fromReadModel: false };
    }
    // isInMonth again: the same rule the screen uses, applied after the overlay.
    return {
      expenses: insightsMonthRows(remote.expenses, expenses, localMonthExpenses, session.locallyRemovedIds).filter((r) =>
        isInMonth(r as { month?: string; date?: string }, monthKey)
      ),
      incomes: insightsMonthRows(remote.incomes, incomes, localMonthIncomes, session.locallyRemovedIds).filter((r) =>
        isInMonth(r as { month?: string; date?: string }, monthKey)
      ),
      fromReadModel: true,
    };
  }, [remote, monthKey, expenses, incomes, localMonthExpenses, localMonthIncomes, session]);
}
