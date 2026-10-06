import { useEffect, useMemo } from "react";

import { useBorrowings } from "@/hooks/useBorrowings";
import { useCalendarReminders } from "@/hooks/useCalendarReminders";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useReceivables } from "@/hooks/useReceivables";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSettings } from "@/providers/SettingsProvider";
import { cancelCalendarNotifications, reconcileCalendarNotifications } from "@/services/calendar/calendarNotificationScheduler";
import { planCalendarNotifications, CALENDAR_NOTIFICATION_HORIZON_DAYS } from "@/shared/utils/calendarNotifications";
import { reminderEvents } from "@/shared/utils/calendarReminders";
import { borrowingEvents, receivableEvents, subscriptionEvents, type CalendarContext } from "@/shared/utils/calendarSources";
import { shiftDateKey, todayDateKey } from "@/shared/utils/dates";
import { formatAmount } from "@/shared/utils/formatCurrency";

/**
 * Keeps Financial Calendar notifications in step with the data (SPENDLY-184).
 * Mounted once in the app shell; renders nothing. Uses only data the shell
 * already loads (recurring items, borrowings, receivables) plus the small
 * reminders listener — and none of it when both switches are off.
 */
export function CalendarNotificationSync() {
  const { settings } = useSettings();
  const prefs = settings.calendarNotifications;
  const active = prefs.remindersEnabled || prefs.duesEnabled;
  const currency = useDisplayCurrency();
  const today = todayDateKey(settings.timezone);
  const { reminders } = useCalendarReminders({ enabled: prefs.remindersEnabled });
  const { subscriptions } = useSubscriptions();
  const { borrowings } = useBorrowings({ enabled: Boolean(prefs.duesEnabled) });
  const { receivables } = useReceivables({ enabled: Boolean(prefs.duesEnabled) });

  const plan = useMemo(() => {
    if (!active) return [];
    const ctx: CalendarContext = { range: { from: shiftDateKey(today, -1), to: shiftDateKey(today, CALENDAR_NOTIFICATION_HORIZON_DAYS) }, today, currency };
    const events = [
      ...(prefs.remindersEnabled ? reminderEvents(reminders, ctx) : []),
      ...(prefs.duesEnabled ? [...subscriptionEvents(subscriptions, ctx), ...borrowingEvents(borrowings, ctx), ...receivableEvents(receivables, ctx)] : []),
    ];
    return planCalendarNotifications({ events, reminders, today, prefs, format: (n) => formatAmount(n, currency) });
  }, [active, today, currency, prefs, reminders, subscriptions, borrowings, receivables]);

  const planKey = useMemo(() => JSON.stringify(plan.map((n) => [n.id, n.fireDate, n.body])), [plan]);

  useEffect(() => {
    // Debounced so a burst of snapshot updates schedules once.
    const t = setTimeout(() => {
      if (!active) void cancelCalendarNotifications();
      else void reconcileCalendarNotifications(plan, { quietHoursStart: prefs.quietHoursStart, quietHoursEnd: prefs.quietHoursEnd, timezone: settings.timezone });
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, active, prefs.quietHoursStart, prefs.quietHoursEnd, settings.timezone]);

  return null;
}
