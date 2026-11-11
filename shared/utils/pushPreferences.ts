/**
 * Spendly notification preferences for push (SPENDLY-226, epic SPENDLY-222).
 *
 * Reminder categories reuse the switches users already have, so nothing gets
 * a second, conflicting toggle:
 *   bills    → settings.creditCardBillReminders.enabled
 *   calendar → settings.calendarNotifications.remindersEnabled
 *   dues     → settings.calendarNotifications.duesEnabled
 *   goals    → each goal's own reminder settings (checked by the goal source)
 * Event categories that had no switch get one in `pushNotifications.categories`.
 *
 * One delivery window replaces the separate bill and calendar quiet hours
 * (they are kept in step when the window is saved, and read as a fallback for
 * accounts that never saved one). A window may cross midnight (22:00–07:00).
 */

export type PushCategory = "bills" | "calendar" | "dues" | "goals" | "investments" | "shared" | "priceAlerts" | "salary";

/** Categories whose only switch lives in `pushNotifications.categories`. */
export type PushEventCategory = "investments" | "shared" | "priceAlerts";

export type DeliveryWindow = { start: string; end: string };

export type PushNotificationSettings = {
  categories: Record<PushEventCategory, boolean>;
  /** Null until the user saves one; then it wins over the legacy quiet hours. */
  deliveryWindow: DeliveryWindow | null;
  /** Amounts and card digits on the lock screen. Off by default (privacy). */
  showAmounts: boolean;
};

export const DEFAULT_PUSH_NOTIFICATIONS: PushNotificationSettings = {
  categories: { investments: true, shared: true, priceAlerts: true },
  deliveryWindow: null,
  showAmounts: false,
};

export const DEFAULT_DELIVERY_WINDOW: DeliveryWindow = { start: "08:00", end: "21:00" };

/**
 * Price alert pushes need SPENDLY-625 (alerts evaluated on the server) and
 * SPENDLY-698. Until both exist the switch is hidden, so it never promises
 * something that can't arrive. The stored preference is kept as it is.
 */
export const PRICE_ALERT_PUSH_AVAILABLE = false;

/**
 * Android channel per category, so users can also mute a category from the
 * phone's own settings. Existing channel ids are kept (bills, calendar,
 * goals); dues are part of the calendar card and share its channel.
 */
export const PUSH_CHANNELS: Record<PushCategory, { id: string; name: string; importance: "high" | "default" }> = {
  bills: { id: "credit-card-bills", name: "Credit card bills", importance: "high" },
  calendar: { id: "financial-calendar", name: "Financial calendar", importance: "default" },
  dues: { id: "financial-calendar", name: "Financial calendar", importance: "default" },
  goals: { id: "savings-goals", name: "Savings goals", importance: "default" },
  investments: { id: "investments", name: "SIP and EPF updates", importance: "default" },
  shared: { id: "shared-money", name: "Shared splits and vaults", importance: "default" },
  priceAlerts: { id: "price-alerts", name: "Price alerts", importance: "high" },
  salary: { id: "salary-payday", name: "Salary & Payday reminders", importance: "default" },
};

const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME.test(value);
}

function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function asWindow(start: unknown, end: unknown): DeliveryWindow | null {
  if (!isValidTime(start) || !isValidTime(end) || start === end) return null;
  return { start, end };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** Reads the stored preferences, filling defaults and dropping bad values. */
export function parsePushNotificationSettings(raw: unknown): PushNotificationSettings {
  const src = record(raw);
  if (!src) return { ...DEFAULT_PUSH_NOTIFICATIONS, categories: { ...DEFAULT_PUSH_NOTIFICATIONS.categories } };
  const cats = record(src.categories) ?? {};
  const pick = (k: PushEventCategory) =>
    typeof cats[k] === "boolean" ? (cats[k] as boolean) : DEFAULT_PUSH_NOTIFICATIONS.categories[k];
  const win = record(src.deliveryWindow);
  return {
    categories: { investments: pick("investments"), shared: pick("shared"), priceAlerts: pick("priceAlerts") },
    deliveryWindow: win ? asWindow(win.start, win.end) : null,
    showAmounts: typeof src.showAmounts === "boolean" ? src.showAmounts : DEFAULT_PUSH_NOTIFICATIONS.showAmounts,
  };
}

/** The settings this module reads (a slice of UserSettings). */
export type PushPreferenceSource = {
  pushNotifications?: PushNotificationSettings;
  creditCardBillReminders?: { enabled?: boolean; quietHoursStart?: string; quietHoursEnd?: string };
  calendarNotifications?: { remindersEnabled?: boolean; duesEnabled?: boolean; salaryEnabled?: boolean; quietHoursStart?: string; quietHoursEnd?: string };
};

/** The one window every Spendly notification is delivered in. */
export function resolveDeliveryWindow(s: PushPreferenceSource): DeliveryWindow {
  return (
    s.pushNotifications?.deliveryWindow ??
    asWindow(s.creditCardBillReminders?.quietHoursStart, s.creditCardBillReminders?.quietHoursEnd) ??
    asWindow(s.calendarNotifications?.quietHoursStart, s.calendarNotifications?.quietHoursEnd) ??
    DEFAULT_DELIVERY_WINDOW
  );
}

export function crossesMidnight(w: DeliveryWindow): boolean {
  return minutesOf(w.start) > minutesOf(w.end);
}

/** True when `time` (HH:mm, local) is inside the window; the end is exclusive. */
export function isWithinDeliveryWindow(w: DeliveryWindow, time: string): boolean {
  if (!isValidTime(time)) return false;
  const t = minutesOf(time);
  const start = minutesOf(w.start);
  const end = minutesOf(w.end);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/**
 * Whether the user wants this category at all. The server sender (SPENDLY-227)
 * skips opted-out users; per-item switches (a bill's own reminder flag, a
 * goal's reminders) are checked by each source on top of this.
 */
export function isPushCategoryEnabled(s: PushPreferenceSource, category: PushCategory): boolean {
  switch (category) {
    case "bills":
      return s.creditCardBillReminders?.enabled !== false;
    case "calendar":
      return s.calendarNotifications?.remindersEnabled !== false;
    case "dues":
      return s.calendarNotifications?.duesEnabled === true;
    case "salary":
      return s.calendarNotifications?.salaryEnabled !== false;
    case "goals":
      return true;
    default: {
      const prefs = s.pushNotifications ?? DEFAULT_PUSH_NOTIFICATIONS;
      return prefs.categories[category] !== false;
    }
  }
}
