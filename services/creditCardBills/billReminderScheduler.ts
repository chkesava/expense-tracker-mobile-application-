/**
 * Local scheduled reminders for credit-card bills (hybrid delivery).
 * Soft-fails on permission/schedule errors — never mutates payment state.
 */

import type { Account } from "@/shared/types/expense";
import type {
  CreditCardBill,
  CreditCardBillRemindersSettings,
} from "@/shared/types/creditCardBill";
import {
  buildReminderSlots,
  applyQuietHours,
  stableReminderNotificationId,
  type ReminderSlot,
} from "@/shared/utils/creditCardBillReminders";
import { shouldSendBillReminder } from "@/shared/utils/creditCardBillStatus";
import { todayDateKey } from "@/shared/utils/dates";
import { buildBillReminderCopy } from "./billNotificationCopy";

export const CREDIT_CARD_BILL_CHANNEL_ID = "credit-card-bills";

let handlerReady = false;
let channelReady = false;

async function loadNotifications() {
  return import("expo-notifications");
}

export async function ensureBillNotificationHandler(): Promise<void> {
  if (handlerReady) return;
  try {
    const Notifications = await loadNotifications();
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    handlerReady = true;
  } catch {
    // soft-fail
  }
}

async function ensureAndroidChannel(): Promise<void> {
  if (channelReady) return;
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS !== "android") {
      channelReady = true;
      return;
    }
    const Notifications = await loadNotifications();
    await Notifications.setNotificationChannelAsync(CREDIT_CARD_BILL_CHANNEL_ID, {
      name: "Credit card bills",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250],
      lightColor: "#0F2F4B",
    });
    channelReady = true;
  } catch {
    // soft-fail
  }
}

export async function requestBillNotificationPermission(): Promise<boolean> {
  try {
    const { Platform } = await import("react-native");
    if (Platform.OS === "web") return false;
    await ensureBillNotificationHandler();
    await ensureAndroidChannel();
    const Notifications = await loadNotifications();
    const existing = await Notifications.getPermissionsAsync();
    if (existing.status === "granted") return true;
    const asked = await Notifications.requestPermissionsAsync();
    return asked.status === "granted";
  } catch {
    return false;
  }
}

export async function cancelBillReminders(billId: string): Promise<void> {
  try {
    const Notifications = await loadNotifications();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const prefix = `ccbill:${billId}:`;
    await Promise.all(
      scheduled
        .filter((n) => String(n.identifier || "").startsWith(prefix))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch {
    // soft-fail
  }
}

export function dateTriggerFromDateKey(
  dateKey: string,
  quietStart: string,
  quietEnd: string,
  timezone?: string
): Date {
  const quiet = applyQuietHours(9, 0, quietStart, quietEnd);
  const [y, m, d] = dateKey.split("-").map(Number);

  // The Settings copy promises reminders follow the user's timezone, so honour
  // it for the fire *time* too — not just for which calendar day is picked.
  // `timezone` used to be accepted and discarded (`void timezone`), which meant
  // a user whose app timezone differed from their device's got notified at the
  // wrong hour.
  const naiveLocal = new Date(y, m - 1, d, quiet.hour, quiet.minute, 0, 0);
  if (!timezone) return naiveLocal;

  const offsetMinutes = timezoneOffsetMinutes(naiveLocal, timezone);
  const deviceOffsetMinutes = -naiveLocal.getTimezoneOffset();
  const driftMinutes = deviceOffsetMinutes - offsetMinutes;
  if (driftMinutes === 0) return naiveLocal;

  return new Date(naiveLocal.getTime() + driftMinutes * 60_000);
}

/** Minutes east of UTC for `timezone` at the given instant. */
function timezoneOffsetMinutes(at: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(at);
    const get = (type: string) =>
      Number(parts.find((part) => part.type === type)?.value);
    const asUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour") % 24,
      get("minute"),
      get("second")
    );
    return Math.round((asUtc - at.getTime()) / 60_000);
  } catch {
    // Unknown timezone id — fall back to the device offset (no adjustment).
    return -at.getTimezoneOffset();
  }
}

export async function reconcileBillReminders(opts: {
  bills: CreditCardBill[];
  accountsById: Map<string, Account>;
  globalPrefs: CreditCardBillRemindersSettings;
  timezone?: string;
  onLog?: (entry: {
    billId: string;
    notificationType: "days_before" | "due_date" | "overdue" | "skipped";
    daysBefore?: number;
    status: "sent" | "skipped" | "failed";
    reason?: string;
  }) => Promise<void> | void;
}): Promise<void> {
  const today = todayDateKey(opts.timezone);
  const granted = await requestBillNotificationPermission();

  for (const bill of opts.bills) {
    await cancelBillReminders(bill.id);

    const allowed = shouldSendBillReminder({
      status: bill.status,
      remainingAmount: bill.remainingAmount,
      reminderEnabled: bill.reminderEnabled,
      globalRemindersEnabled: opts.globalPrefs.enabled,
    });

    if (!allowed) {
      await opts.onLog?.({
        billId: bill.id,
        notificationType: "skipped",
        status: "skipped",
        reason: "not_eligible",
      });
      continue;
    }

    if (!granted) {
      await opts.onLog?.({
        billId: bill.id,
        notificationType: "skipped",
        status: "failed",
        reason: "permission_denied",
      });
      continue;
    }

    const account = opts.accountsById.get(bill.accountId);
    if (!account) continue;

    const frequency = {
      daysBefore: bill.reminderFrequency?.daysBefore?.length
        ? bill.reminderFrequency.daysBefore
        : opts.globalPrefs.daysBefore,
      onDueDate:
        bill.reminderFrequency?.onDueDate ?? opts.globalPrefs.onDueDate,
      overdueEveryDays:
        bill.reminderFrequency?.overdueEveryDays ??
        opts.globalPrefs.overdueEveryDays,
    };

    const slots = buildReminderSlots(bill.dueDate, frequency, today, 60);
    // Cap scheduled local notifications to avoid OS limits
    const upcoming = slots.slice(0, 12);

    for (const slot of upcoming) {
      await scheduleSlot({
        bill,
        account,
        slot,
        quietStart: opts.globalPrefs.quietHoursStart,
        quietEnd: opts.globalPrefs.quietHoursEnd,
        timezone: opts.timezone,
        onLog: opts.onLog,
      });
    }
  }
}

async function scheduleSlot(opts: {
  bill: CreditCardBill;
  account: Account;
  slot: ReminderSlot;
  quietStart: string;
  quietEnd: string;
  timezone?: string;
  onLog?: (entry: {
    billId: string;
    notificationType: "days_before" | "due_date" | "overdue" | "skipped";
    daysBefore?: number;
    status: "sent" | "skipped" | "failed";
    reason?: string;
  }) => Promise<void> | void;
}): Promise<void> {
  try {
    // Re-check eligibility immediately before scheduling (stale job guard)
    if (
      opts.bill.status === "PAID" ||
      opts.bill.status === "CANCELLED" ||
      opts.bill.remainingAmount <= 0 ||
      !opts.bill.reminderEnabled
    ) {
      return;
    }

    const when = dateTriggerFromDateKey(
      opts.slot.dateKey,
      opts.quietStart,
      opts.quietEnd,
      opts.timezone
    );
    if (when.getTime() <= Date.now() - 60_000) {
      return;
    }

    const Notifications = await loadNotifications();
    const { Platform } = await import("react-native");
    const copy = buildBillReminderCopy({
      billId: opts.bill.id,
      account: opts.account,
      statementAmount: opts.bill.statementAmount,
      currency: opts.bill.currency,
      dueDate: opts.bill.dueDate,
      slot: opts.slot,
    });

    const identifier = stableReminderNotificationId(opts.bill.id, opts.slot);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: copy.title,
        body: copy.body,
        data: copy.data,
        ...(Platform.OS === "android"
          ? { channelId: CREDIT_CARD_BILL_CHANNEL_ID }
          : {}),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: when,
        ...(Platform.OS === "android"
          ? { channelId: CREDIT_CARD_BILL_CHANNEL_ID }
          : {}),
      },
    });

    await opts.onLog?.({
      billId: opts.bill.id,
      notificationType:
        opts.slot.kind === "days_before"
          ? "days_before"
          : opts.slot.kind === "due_date"
            ? "due_date"
            : "overdue",
      daysBefore:
        opts.slot.kind === "days_before" ? opts.slot.daysBefore : undefined,
      status: "sent",
    });
  } catch {
    await opts.onLog?.({
      billId: opts.bill.id,
      notificationType:
        opts.slot.kind === "days_before"
          ? "days_before"
          : opts.slot.kind === "due_date"
            ? "due_date"
            : "overdue",
      status: "failed",
      reason: "schedule_error",
    });
  }
}
