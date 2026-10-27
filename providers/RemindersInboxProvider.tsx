import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { useAccounts } from "@/hooks/useAccounts";
import { useAccountTypes } from "@/hooks/useAccountTypes";
import { useBorrowings } from "@/hooks/useBorrowings";
import { useCalendarReminders } from "@/hooks/useCalendarReminders";
import { useCreditCardBills } from "@/hooks/useCreditCardBills";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useSaveGoalsEnabled } from "@/hooks/useSaveGoalsEnabled";
import { goalInboxItems } from "@/shared/utils/goalReminders";
import { useReceivables } from "@/hooks/useReceivables";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { getAccountKind } from "@/shared/utils/accountKind";
import { reminderEvents } from "@/shared/utils/calendarReminders";
import {
  borrowingEvents,
  cardBillEvents,
  receivableEvents,
  subscriptionEvents,
  type CalendarContext,
} from "@/shared/utils/calendarSources";
import { todayDateKey } from "@/shared/utils/dates";
import {
  dueInboxItems,
  inboxRange,
  markInboxSeen,
  parseSeenIds,
  unreadCount,
  type InboxItem,
} from "@/shared/utils/remindersInbox";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";

type RemindersInboxValue = {
  /** Dues: overdue or due soon, newest occurrence ids. */
  items: InboxItem[];
  unread: number;
  /** Marks every current due as seen on this device. */
  markAllSeen: () => void;
};

const RemindersInboxContext = createContext<RemindersInboxValue>({
  items: [],
  unread: 0,
  markAllSeen: () => undefined,
});

const seenKey = (uid: string) => `spendly:remindersInboxSeen:${uid}`;

/**
 * SPENDLY-569 — the reminders inbox behind the app-bar bell, computed once
 * for the whole shell. Its sources are the shared providers the dashboard and
 * calendar notifications already subscribe to (card bills, subscriptions,
 * loans, money owed, calendar reminders), attached only after startup idle so
 * the bell never delays first paint. Read state lives on this device only
 * (AsyncStorage), so there is no new Firestore collection.
 */
export function RemindersInboxProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid;
  const { settings } = useSettings();
  const currency = useDisplayCurrency();
  const today = todayDateKey(settings.timezone);

  const [ready, setReady] = useState(false);
  useEffect(() => scheduleIdleWork(() => setReady(true)), []);

  const { reminders } = useCalendarReminders({ enabled: ready });
  const { subscriptions } = useSubscriptions({ enabled: ready });
  const { borrowings } = useBorrowings({ enabled: ready });
  const { receivables } = useReceivables({ enabled: ready });
  const { bills } = useCreditCardBills({ enabled: ready });
  const { accounts } = useAccounts();
  const { accountTypes } = useAccountTypes();
  // SPENDLY-612: in-app goal reminders (work without push permission and on web).
  const saveGoals = useSaveGoalsEnabled();
  const { goals } = useFinancialGoals({ enabled: ready && saveGoals });

  const cardNames = useMemo(() => {
    const typeName = new Map(accountTypes.map((t) => [t.id, t.name]));
    return new Map(
      accounts.filter((a) => getAccountKind(typeName.get(a.typeId) ?? "") === "credit").map((a) => [a.id, a.name])
    );
  }, [accounts, accountTypes]);

  const items = useMemo(() => {
    if (!ready) return [];
    const ctx: CalendarContext = { range: inboxRange(today), today, currency };
    const events = [
      ...reminderEvents(reminders, ctx),
      ...cardBillEvents(bills, cardNames, ctx),
      ...subscriptionEvents(subscriptions, ctx),
      ...borrowingEvents(borrowings, ctx),
      ...receivableEvents(receivables, ctx),
    ];
    const goalItems: InboxItem[] = saveGoals
      ? goalInboxItems(goals, today).map((g) => ({
          id: g.id,
          kind: "due",
          source: "goal",
          title: g.title,
          subtitle: g.subtitle,
          amount: null,
          currency,
          date: g.date,
          tone: g.tone,
          href: g.href,
        }))
      : [];
    return [...dueInboxItems(events, today), ...goalItems];
  }, [ready, today, currency, reminders, bills, cardNames, subscriptions, borrowings, receivables, saveGoals, goals]);

  const [seenIds, setSeenIds] = useState<string[]>([]);
  useEffect(() => {
    setSeenIds([]);
    if (!uid) return;
    let cancelled = false;
    AsyncStorage.getItem(seenKey(uid))
      .then((raw) => {
        if (!cancelled) setSeenIds(parseSeenIds(raw));
      })
      .catch((error) => logError("remindersInbox.loadSeen", error));
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const seenSet = useMemo(() => new Set(seenIds), [seenIds]);
  const unread = useMemo(() => unreadCount(items, seenSet), [items, seenSet]);

  const markAllSeen = useCallback(() => {
    if (!uid || items.length === 0 || unreadCount(items, seenSet) === 0) return;
    const next = markInboxSeen(seenIds, items);
    setSeenIds(next);
    AsyncStorage.setItem(seenKey(uid), JSON.stringify(next)).catch((error) =>
      logError("remindersInbox.saveSeen", error)
    );
  }, [uid, items, seenIds, seenSet]);

  const value = useMemo(() => ({ items, unread, markAllSeen }), [items, unread, markAllSeen]);
  return <RemindersInboxContext.Provider value={value}>{children}</RemindersInboxContext.Provider>;
}

export function useRemindersInbox(): RemindersInboxValue {
  return useContext(RemindersInboxContext);
}
