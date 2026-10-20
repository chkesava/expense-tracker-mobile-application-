import { useMemo } from "react";

import { useAccountEntries } from "@/hooks/useAccountEntries";
import { useAccountPayments } from "@/hooks/useAccountPayments";
import { useAccountTransfers } from "@/hooks/useAccountTransfers";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useSettings } from "@/providers/SettingsProvider";
import type { Account } from "@/shared/types/expense";
import { computeOutstandingCredit } from "@/shared/utils/accountBalance";
import { todayDateKey } from "@/shared/utils/dates";
import { roundMoney } from "@/shared/utils/money";

export type LiveCardUsage = {
  /** Spend in the open cycle, not yet on a statement. */
  unbilledSpend: number;
  /** What closed statements still owe. */
  statementDue: number;
  /** Provider cashback credited in the open cycle. */
  cashbackThisCycle: number;
  oldestOpenRemaining: number;
  oldestOpenBillId?: string;
  /** Limit minus this cycle's spend, never negative. */
  availableCredit: number;
};

/**
 * SPENDLY-497 — a card's cycle numbers, derived live from the ledger the
 * providers already hold (the same `computeOutstandingCredit` card analytics
 * uses), instead of stored fields only a manual rebuild ever refreshed.
 * Refunds, transfers and adjustments on the card count, as they do in the
 * stored total. The stored `currentOutstanding` stays the displayed total.
 */
export function useCreditCardLiveUsage(cards: readonly Account[]): Map<string, LiveCardUsage> {
  const { expenses } = useExpenses();
  const { incomes } = useIncomes();
  const { entries } = useAccountEntries();
  const { transfers } = useAccountTransfers();
  const { payments } = useAccountPayments();
  const { bills } = useCreditCardBills();
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);

  return useMemo(() => {
    const out = new Map<string, LiveCardUsage>();
    for (const card of cards) {
      const usage = computeOutstandingCredit(card, expenses, payments, bills, today, {
        incomes,
        entries,
        transfers,
      });
      out.set(card.id, {
        unbilledSpend: usage.unbilledSpend,
        statementDue: usage.statementDue,
        cashbackThisCycle: usage.cashbackThisCycle,
        oldestOpenRemaining: usage.oldestOpenRemaining,
        oldestOpenBillId: usage.oldestOpenBillId,
        availableCredit: roundMoney(Math.max(0, (card.creditLimit || 0) - usage.unbilledSpend)),
      });
    }
    return out;
  }, [cards, expenses, incomes, entries, transfers, payments, bills, today]);
}
