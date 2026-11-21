import { useEffect, useMemo } from "react";

import { useDisplayCurrency } from "@/hooks/useDisplayCurrency";
import { useLowBalanceAlerts } from "@/hooks/useLowBalanceAlerts";
import { usePushReminderMode } from "@/hooks/usePushReminderMode";
import { useSettings } from "@/providers/SettingsProvider";
import { cancelLowBalanceNotifications, reconcileLowBalanceNotifications } from "@/services/lowBalance/lowBalanceNotificationScheduler";
import { planLowBalanceNotifications } from "@/shared/utils/lowBalanceLocalPlan";
import { localReminderSourcesEnabled } from "@/shared/utils/push/reminderMode";
import { resolveDeliveryWindow } from "@/shared/utils/pushPreferences";

/**
 * Keeps the on-device low-balance alerts in step with the server's stored
 * result (SPENDLY-799, epic SPENDLY-793). Mounted once in the app shell;
 * renders nothing.
 *
 * - **Push mode** (or while the mode is unknown): the server sends these as
 *   push (SPENDLY-797). The phone schedules nothing, cancels any it had, and
 *   doesn't even mount the result listener.
 * - **Local mode:** plans from the stored result only. Nothing is computed
 *   here. The plan is rebuilt whenever the result changes (a new `runId`,
 *   e.g. after a top-up re-runs the server job) or the settings do.
 */
export function LowBalanceNotificationSync() {
  const { settings } = useSettings();
  const enabled = settings.lowBalanceAlerts.enabled;
  const { mode, loading: modeLoading } = usePushReminderMode();
  const local = localReminderSourcesEnabled({ mode, loading: modeLoading });
  const currency = useDisplayCurrency();
  const { stored, today, loading } = useLowBalanceAlerts({ enabled: enabled && local });
  const window = resolveDeliveryWindow(settings);

  const plan = useMemo(
    () =>
      local
        ? planLowBalanceNotifications({ stored, today, enabled, showAmounts: settings.pushNotifications.showAmounts, currency })
        : [],
    [local, stored, today, enabled, settings.pushNotifications.showAmounts, currency]
  );
  const planKey = useMemo(() => JSON.stringify(plan.map((n) => [n.id, n.body])), [plan]);

  useEffect(() => {
    if (modeLoading) return;
    // Wait for the stored result rather than clearing and rescheduling on every launch.
    if (local && enabled && loading) return;
    // Debounced so a burst of snapshot updates schedules once.
    const t = setTimeout(() => {
      if (!local || !enabled) void cancelLowBalanceNotifications();
      else void reconcileLowBalanceNotifications(plan, { windowStart: window.start, windowEnd: window.end, timezone: settings.timezone });
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planKey, local, enabled, loading, modeLoading, window.start, window.end, settings.timezone]);

  return null;
}
