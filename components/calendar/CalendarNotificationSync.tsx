import { useEffect, useMemo } from "react";

import { useBorrowings } from "@/hooks/useBorrowings";
import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { usePushReminderMode } from "@/hooks/usePushReminderMode";
import { useReceivables } from "@/hooks/useReceivables";
import { useSubscriptions } from "@/hooks/useSubscriptions";
import { useSalaryRecords } from "@/hooks/useSalaryRecords";
import { useSalaryProfiles } from "@/hooks/useSalaryProfiles";
import { useTaxCalendarFacts } from "@/hooks/useTaxCalendarFacts";
import { useTaxCenterFlag } from "@/hooks/useTaxCenterEnabled";
import { useRemindersInbox } from "@/providers/RemindersInboxProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { cancelCalendarNotifications, reconcileCalendarNotifications } from "@/services/calendar/calendarNotificationScheduler";
import { planCalendarNotifications, CALENDAR_NOTIFICATION_HORIZON_DAYS } from "@/shared/utils/calendarNotifications";
import { localReminderSourcesEnabled } from "@/shared/utils/push/reminderMode";
import { reminderEvents } from "@/shared/utils/calendarReminders";
import { borrowingEvents, receivableEvents, salaryEvents, subscriptionEvents, type CalendarContext } from "@/shared/utils/calendarSources";
import { shiftDateKey, todayDateKey } from "@/shared/utils/dates";
import { taxEvents } from "@/shared/features/tax/utils/taxCalendar";
import { formatAmount } from "@/shared/utils/formatCurrency";

/**
 * Keeps Financial Calendar notifications in step with the data (SPENDLY-184).
 * Mounted once in the app shell; renders nothing. Uses only data the shell
 * already loads (recurring items, borrowings, receivables) plus the small
 * reminders listener — and none of it when both switches are off.
 *
 * SPENDLY-746 (epic SPENDLY-735): the calendar reminders come from the inbox's
 * listener (no second one), and in push mode (or while the mode is unknown)
 * the loans and money-owed listeners aren't registered at all: the server
 * sends these reminders, and the phone schedules nothing.
 */
export function CalendarNotificationSync() {
  const { settings } = useSettings();
  const prefs = settings.calendarNotifications;
  // SPENDLY-297: tax deadlines notify only with the tax center on and their own switch.
  const { enabled: taxCenter } = useTaxCenterFlag();
  const taxOn = taxCenter && prefs.taxEnabled;
  const salaryOn = Boolean(prefs.salaryEnabled);
  const active = prefs.remindersEnabled || prefs.duesEnabled || taxOn || salaryOn;
  // SPENDLY-693: when the server delivers reminders as push, this phone doesn't.
  const { mode, loading: modeLoading } = usePushReminderMode();
  const currency = useDisplayCurrency();
  const today = todayDateKey(settings.timezone);
  const local = localReminderSourcesEnabled({ mode, loading: modeLoading });
  const { calendarReminders: reminders, calendarRemindersReady } = useRemindersInbox();
  const { subscriptions } = useSubscriptions();
  const { borrowings } = useBorrowings({ enabled: Boolean(prefs.duesEnabled) && local });
  const { receivables } = useReceivables({ enabled: Boolean(prefs.duesEnabled) && local });
  // SPENDLY-297: tax deadlines, like the other local sources, only when this phone schedules.
  const { facts: taxFacts } = useTaxCalendarFacts({ enabled: taxOn && local });
  // SPENDLY-333: salary payday and late salary reminders.
  const { records: salaryRecords } = useSalaryRecords({ enabled: salaryOn && local });
  const { profiles: salaryProfiles } = useSalaryProfiles({ enabled: salaryOn && local });

  const plan = useMemo(() => {
    if (!active) return [];
    const ctx: CalendarContext = { range: { from: shiftDateKey(today, -1), to: shiftDateKey(today, CALENDAR_NOTIFICATION_HORIZON_DAYS) }, today, currency };
    const events = [
      ...(prefs.remindersEnabled ? reminderEvents(reminders, ctx) : []),
      ...(prefs.duesEnabled ? [...subscriptionEvents(subscriptions, ctx), ...borrowingEvents(borrowings, ctx), ...receivableEvents(receivables, ctx)] : []),
      ...(taxOn && taxFacts ? taxEvents(taxFacts, ctx) : []),
      ...(salaryOn ? salaryEvents(salaryRecords, salaryProfiles, ctx) : []),
    ];
    return planCalendarNotifications({ events, reminders, today, prefs: { ...prefs, taxEnabled: taxOn, salaryEnabled: salaryOn }, format: (n) => formatAmount(n, currency) });
  }, [active, today, currency, prefs, reminders, subscriptions, borrowings, receivables, taxOn, taxFacts, salaryOn, salaryRecords, salaryProfiles]);

  const planKey = useMemo(() => JSON.stringify(plan.map((n) => [n.id, n.fireDate, n.body])), [plan]);

  useEffect(() => {
    if (modeLoading) return;
    // Wait for the reminders rather than planning without them (a second pass on every launch).
    if (active && mode !== "push" && prefs.remindersEnabled && !calendarRemindersReady) return;
    // Debounced so a burst of snapshot updates schedules once.
    const t = setTimeout(() => {
      if (!active || mode === "push") void cancelCalendarNotifications();
      else void reconcileCalendarNotifications(plan, { quietHoursStart: prefs.quietHoursStart, quietHoursEnd: prefs.quietHoursEnd, timezone: settings.timezone });
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, active, mode, modeLoading, calendarRemindersReady, prefs.quietHoursStart, prefs.quietHoursEnd, settings.timezone]);

  return null;
}
