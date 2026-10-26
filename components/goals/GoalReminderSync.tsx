import { useEffect, useMemo, useState } from "react";

import { useFinancialGoals } from "@/hooks/useFinancialGoals";
import { useSaveGoalsEnabled } from "@/hooks/useSaveGoalsEnabled";
import { useSettings } from "@/providers/SettingsProvider";
import { cancelGoalNotifications, reconcileGoalNotifications } from "@/services/goals/goalReminderScheduler";
import { todayDateKey } from "@/shared/utils/dates";
import { goalReminders, planGoalNotifications, wantsNotifications } from "@/shared/utils/goalReminders";
import { scheduleIdleWork } from "@/shared/utils/scheduleIdle";

/**
 * Keeps Save Goals reminder notifications in step with the goals (SPENDLY-612).
 * Mounted once in the app shell beside CalendarNotificationSync; renders
 * nothing. Uses the shared, ref-counted goals listener (summaries only, the
 * same one the inbox uses), attached after startup idle and only while the
 * Save Goals feature is on. Re-plans whenever a goal changes — that is how
 * inactivity alerts move with each contribution, with no polling.
 */
export function GoalReminderSync() {
  const saveGoals = useSaveGoalsEnabled();
  const [ready, setReady] = useState(false);
  useEffect(() => scheduleIdleWork(() => setReady(true)), []);
  const { settings } = useSettings();
  const { goals } = useFinancialGoals({ enabled: ready && saveGoals });
  const today = todayDateKey(settings.timezone);

  const plan = useMemo(() => (saveGoals ? planGoalNotifications(goals, today) : []), [saveGoals, goals, today]);
  const anyWanted = useMemo(() => goals.some((g) => wantsNotifications(goalReminders(g))), [goals]);
  const planKey = useMemo(() => JSON.stringify(plan.map((n) => [n.id, n.time, n.title])), [plan]);

  useEffect(() => {
    if (!ready) return;
    // Debounced so a burst of snapshot updates schedules once.
    const t = setTimeout(() => {
      if (!saveGoals || !anyWanted) void cancelGoalNotifications();
      else void reconcileGoalNotifications(plan, { timezone: settings.timezone });
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, planKey, saveGoals, anyWanted, settings.timezone]);

  return null;
}
