import { useMemo } from "react";

import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useCalendarReminders } from "@/hooks/useCalendarReminders";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useEpf } from "@/hooks/useEpf";
import { useEpfAllContributions } from "@/hooks/useEpfAllContributions";
import { useFeeIntelligence } from "@/hooks/useFeeIntelligence";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useIncomes } from "@/hooks/useIncomes";
import { useInvestments } from "@/hooks/useInvestments";
import { useReceivables } from "@/hooks/useReceivables";
import { useSipPlans } from "@/hooks/useSipPlans";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSettings } from "@/providers/SettingsProvider";
import type { CalendarEvent, CalendarRange, CalendarSource } from "@/shared/types/calendar";
import { getAccountKind } from "@/shared/utils/accountKind";
import { queryCalendar, type CalendarData, type CalendarSourceStatus } from "@/shared/utils/calendarQuery";
import { todayDateKey } from "@/shared/utils/dates";
import { detectFeePatterns } from "@/shared/utils/feePatterns";

const status = (loading: boolean, error?: unknown): CalendarSourceStatus => (error ? "error" : loading ? "loading" : "ready");

/**
 * Financial Calendar events for a range (SPENDLY-178). Reads data the app's
 * providers already hold; only SIP plans, EPF and goals add listeners, and
 * only while a calendar screen is mounted. No full-history re-reads.
 */
export function useFinancialCalendar(range: CalendarRange, options?: { includeCancelled?: boolean; extraEvents?: readonly CalendarEvent[] }) {
  const { settings } = useSettings();
  const today = todayDateKey(settings.timezone);
  const currency = useDisplayCurrency();

  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  const { bills, loading: billsLoading } = useCreditCardBills();
  const { subscriptions, loading: subsLoading, error: subsError } = useSubscriptions();
  const borrowingsCtx = useBorrowings();
  const receivablesCtx = useReceivables();
  const { incomes, loading: incomesLoading, complete: incomesComplete, error: incomesError } = useIncomes();
  const { goals, loading: goalsLoading, error: goalsError } = useFinancialGoals();
  const { investments, loading: investmentsLoading, error: investmentsError } = useInvestments();
  const { plans, loading: sipLoading, error: sipError } = useSipPlans();
  const { contributions, loading: epfLoading, error: epfError } = useEpfAllContributions();
  const { establishments } = useEpf();
  const { uid, reminders, loading: remindersLoading, error: remindersError } = useCalendarReminders();

  // SPENDLY-320: Known fees from derived intelligence
  const { result: feeResult, loading: feeLoading, error: feeError } = useFeeIntelligence();
  const feePatterns = useMemo(() => (feeResult ? detectFeePatterns(feeResult.records, today) : []), [feeResult, today]);

  const cardNames = useMemo(() => {
    const typeName = new Map(accountTypes.map((t) => [t.id, t.name]));
    return new Map(accounts.filter((a) => getAccountKind(typeName.get(a.typeId) ?? "") === "credit").map((a) => [a.id, a.name]));
  }, [accounts, accountTypes]);
  const employerNames = useMemo(() => new Map(establishments.map((e) => [e.id, e.employerName])), [establishments]);

  const sourceStatus: Partial<Record<CalendarSource, CalendarSourceStatus>> = {
    card_bill: status(billsLoading),
    subscription: status(subsLoading, subsError),
    borrowing: status(Boolean(borrowingsCtx.loading)),
    receivable: status(Boolean(receivablesCtx.loading)),
    // Older income may still be paging in (SPENDLY-109): report it as partial, not missing.
    income: status(incomesLoading || !incomesComplete, incomesError),
    goal: status(goalsLoading, goalsError),
    investment: status(investmentsLoading, investmentsError),
    sip: status(sipLoading, sipError),
    epf: status(epfLoading, epfError),
    fee: status(feeLoading, feeError),
    reminder: status(remindersLoading, remindersError),
  };
  const statusKey = JSON.stringify(sourceStatus);

  // Exposed so a screen can query a second range (182 summary) from the same data.
  const data: CalendarData = useMemo(
    () => ({
      bills,
      cardNames,
      subscriptions,
      borrowings: borrowingsCtx.borrowings,
      receivables: receivablesCtx.receivables,
      incomes,
      goals,
      investments,
      sipPlans: plans,
      epfContributions: contributions,
      epfEmployerNames: employerNames,
      feePatterns,
      reminders,
      extraEvents: options?.extraEvents,
    }),
    [bills, cardNames, subscriptions, borrowingsCtx.borrowings, receivablesCtx.receivables, incomes, goals, investments, plans, contributions, employerNames, feePatterns, reminders, options?.extraEvents]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableStatus = useMemo(() => sourceStatus, [statusKey]);

  const result = useMemo(
    () => queryCalendar({ range, today, currency, includeCancelled: options?.includeCancelled, status: stableStatus, data }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [range.from, range.to, today, currency, options?.includeCancelled, stableStatus, data]
  );

  return { ...result, today, currency, data, status: stableStatus, reminders, uid };
}
