/**
 * User prefs stored on `users/{uid}` (same shape as web useSettings).
 * Privacy fields are seeded for doc parity; UI arrives in Phase 4.
 */

import {
  DEFAULT_CREDIT_CARD_BILL_REMINDERS,
  type CreditCardBillRemindersSettings,
} from "./creditCardBill";

export type DefaultView = "add" | "expenses" | "analytics" | "dashboard";
export type NavigationStyle = "bottom" | "dock";
export type { CreditCardBillRemindersSettings };

export type DashboardWidgets = {
  subscriptions: boolean;
  focus: boolean;
  gamification: boolean;
  topCategories: boolean;
};

export type OnboardingState = {
  welcomeCompleted: boolean;
  onboardingDismissed: boolean;
  completedSteps: string[];
  setupStartedAt: string;
  visitedScreens: string[];
  /**
   * True once the user has explicitly confirmed a currency. `defaultCurrency`
   * lives on the shared `system_settings/global` doc and always carries a
   * fallback, so it cannot distinguish "chosen" from "defaulted" — this flag
   * keeps the setup step from ticking itself on first launch.
   * Optional so settings docs written before this flag existed still parse.
   */
  currencyChosen?: boolean;
};

export type DateFormatOption =
  | "YYYY-MM-DD"
  | "DD/MM/YYYY"
  | "MM/DD/YYYY"
  | "DD MMM YYYY";

export type NumberFormatOption = "auto" | "standard" | "lakhs";

export type FirstDayOfWeekOption = "monday" | "sunday";

export type UserSettings = {
  lockPastMonths: boolean;
  compactListMode: boolean;
  defaultCategory: string;
  defaultView: DefaultView;
  exportYear: number;
  monthlyBudget: number;
  timezone: string;
  upiId: string;
  dashboardWidgets: DashboardWidgets;
  enableInvestments: boolean;
  dashboardOrder: string[];
  navigationStyle: NavigationStyle;
  ghostMode: boolean;
  hapticFeedback: boolean;
  privacyPin: string;
  fakePin: string;
  lockOnInactivity: boolean;
  inactivityTimeout: number;
  lockOnAppSwitch: boolean;
  onboarding: OnboardingState;
  /** Personalization */
  accentColor?: string;
  currency: string;
  language: string;
  dateFormat: DateFormatOption;
  numberFormat: NumberFormatOption;
  firstDayOfWeek: FirstDayOfWeekOption;
  themeMode?: string;
  /** Credit card bill local reminder preferences */
  creditCardBillReminders: CreditCardBillRemindersSettings;
};

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function asPlainRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Firestore sometimes stores amounts as strings; treat those as numbers. */
export function coerceFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/,/g, "");
    if (trimmed === "") return fallback;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function parseMonthlyBudgetInput(text: string): number | null {
  const trimmed = text.trim().replace(/,/g, "");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function formatMonthlyBudgetInput(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "";
  return String(value);
}

function pickSettingValue(
  source: Record<string, unknown>,
  keys: string[]
): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

export function settingsFieldEquals(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

/** Keep optimistic writes on top of a cloud snapshot so a stale listener cannot reset them. */
export function overlayPendingSettings(
  cloud: UserSettings,
  pending: Partial<UserSettings>
): UserSettings {
  if (Object.keys(pending).length === 0) return cloud;
  return { ...cloud, ...pending };
}

export function remainingPendingSettings(
  cloud: UserSettings,
  pending: Partial<UserSettings>
): Partial<UserSettings> {
  const still: Partial<UserSettings> = {};
  (Object.keys(pending) as (keyof UserSettings)[]).forEach((key) => {
    if (!settingsFieldEquals(cloud[key], pending[key])) {
      still[key] = pending[key] as never;
    }
  });
  return still;
}

export const SETTINGS_DEFAULTS: UserSettings = {
  lockPastMonths: true,
  compactListMode: false,
  defaultCategory: "Food",
  defaultView: "dashboard",
  exportYear: new Date().getFullYear(),
  monthlyBudget: 0,
  timezone: deviceTimezone(),
  upiId: "",
  dashboardWidgets: {
    subscriptions: true,
    focus: true,
    gamification: true,
    topCategories: true,
  },
  enableInvestments: true,
  dashboardOrder: [
    "focus",
    "gamification",
    "subscriptions",
    "topCategories",
    "overview",
    "investments",
    "quickAdd",
    "insight",
    "budgetAlerts",
    "financialGoals",
    "recentActivity",
  ],
  navigationStyle: "bottom",
  ghostMode: false,
  hapticFeedback: true,
  privacyPin: "",
  fakePin: "",
  lockOnInactivity: true,
  inactivityTimeout: 60,
  lockOnAppSwitch: true,
  onboarding: {
    welcomeCompleted: false,
    onboardingDismissed: false,
    completedSteps: [],
    setupStartedAt: "",
    visitedScreens: [],
    currencyChosen: false,
  },
  accentColor: "indigo",
  currency: "INR",
  language: "en",
  dateFormat: "YYYY-MM-DD",
  numberFormat: "auto",
  firstDayOfWeek: "monday",
  themeMode: "system",
  creditCardBillReminders: { ...DEFAULT_CREDIT_CARD_BILL_REMINDERS },
};

/**
 * Keys that belong to `UserSettings`. `users/{uid}` also carries profile fields
 * (email, displayName, photoURL, theme, …); spreading the raw doc used to drag
 * all of them onto the settings object, so `UserSettings` did not describe its
 * own runtime shape.
 */
const USER_SETTINGS_KEYS: (keyof UserSettings)[] = [
  "lockPastMonths",
  "compactListMode",
  "defaultCategory",
  "defaultView",
  "exportYear",
  "monthlyBudget",
  "timezone",
  "upiId",
  "dashboardWidgets",
  "enableInvestments",
  "dashboardOrder",
  "navigationStyle",
  "ghostMode",
  "hapticFeedback",
  "privacyPin",
  "fakePin",
  "lockOnInactivity",
  "inactivityTimeout",
  "lockOnAppSwitch",
  "onboarding",
  "accentColor",
  "currency",
  "language",
  "dateFormat",
  "numberFormat",
  "firstDayOfWeek",
  "themeMode",
  "creditCardBillReminders",
];

function pickKnownSettings(
  source: Record<string, unknown>
): Partial<UserSettings> {
  const picked: Record<string, unknown> = {};
  for (const key of USER_SETTINGS_KEYS) {
    if (source[key] !== undefined) picked[key] = source[key];
  }
  return picked as Partial<UserSettings>;
}

export function mergeSettingsFromDoc(
  data: Record<string, unknown> | null | undefined,
  opts: { fallbackCurrency?: string } = {}
): UserSettings {
  // A new user's currency should follow the system-wide default rather than the
  // hardcoded INR — the Preferences panel displays that system value directly
  // above the picker, so defaulting away from it reads as a bug.
  const defaultCurrency =
    opts.fallbackCurrency || SETTINGS_DEFAULTS.currency;

  if (!data) {
    return {
      ...SETTINGS_DEFAULTS,
      currency: defaultCurrency,
      timezone: deviceTimezone(),
    };
  }

  const nested = asPlainRecord(data.settings);
  const source: Record<string, unknown> = nested ? { ...nested, ...data } : data;
  const widgetsSource =
    asPlainRecord(source.dashboardWidgets) ?? asPlainRecord(data.dashboardWidgets);
  const onboardingSource =
    asPlainRecord(source.onboarding) ?? asPlainRecord(data.onboarding);
  const remindersSource =
    asPlainRecord(source.creditCardBillReminders) ??
    asPlainRecord(data.creditCardBillReminders);

  return {
    ...SETTINGS_DEFAULTS,
    ...pickKnownSettings(source),
    monthlyBudget: coerceFiniteNumber(
      pickSettingValue(source, ["monthlyBudget", "monthly_budget"]),
      SETTINGS_DEFAULTS.monthlyBudget
    ),
    exportYear: coerceFiniteNumber(
      source.exportYear,
      SETTINGS_DEFAULTS.exportYear
    ),
    inactivityTimeout: coerceFiniteNumber(
      source.inactivityTimeout,
      SETTINGS_DEFAULTS.inactivityTimeout
    ),
    dashboardWidgets: {
      ...SETTINGS_DEFAULTS.dashboardWidgets,
      ...((widgetsSource as Partial<DashboardWidgets>) || {}),
    },
    dashboardOrder:
      (source.dashboardOrder as string[] | undefined) ||
      SETTINGS_DEFAULTS.dashboardOrder,
    ghostMode:
      (source.ghostMode as boolean | undefined) ?? SETTINGS_DEFAULTS.ghostMode,
    hapticFeedback:
      (source.hapticFeedback as boolean | undefined) ??
      SETTINGS_DEFAULTS.hapticFeedback,
    timezone:
      typeof source.timezone === "string" && source.timezone
        ? source.timezone
        : SETTINGS_DEFAULTS.timezone,
    currency:
      typeof source.currency === "string" && source.currency
        ? source.currency
        : defaultCurrency,
    language:
      typeof source.language === "string" && source.language
        ? source.language
        : SETTINGS_DEFAULTS.language,
    dateFormat:
      (source.dateFormat as DateFormatOption) || SETTINGS_DEFAULTS.dateFormat,
    numberFormat:
      (source.numberFormat as NumberFormatOption) ||
      SETTINGS_DEFAULTS.numberFormat,
    firstDayOfWeek:
      (source.firstDayOfWeek as FirstDayOfWeekOption) ||
      SETTINGS_DEFAULTS.firstDayOfWeek,
    onboarding: {
      ...SETTINGS_DEFAULTS.onboarding,
      ...((onboardingSource as Partial<OnboardingState>) || {}),
      completedSteps:
        (onboardingSource as Partial<OnboardingState>)?.completedSteps ||
        SETTINGS_DEFAULTS.onboarding.completedSteps,
      visitedScreens:
        (onboardingSource as Partial<OnboardingState>)?.visitedScreens ||
        SETTINGS_DEFAULTS.onboarding.visitedScreens,
    },
    creditCardBillReminders: {
      ...SETTINGS_DEFAULTS.creditCardBillReminders,
      ...((remindersSource as Partial<CreditCardBillRemindersSettings>) || {}),
      // An empty array is a deliberate "no pre-due reminders", not a missing
      // field — only fall back to the default when the key is absent or not an
      // array. Treating `[]` as missing made that choice unsavable: the write
      // landed, the next snapshot restored [7, 3, 1], and the pills lit back up.
      daysBefore: Array.isArray(remindersSource?.daysBefore)
        ? (remindersSource.daysBefore as number[])
        : SETTINGS_DEFAULTS.creditCardBillReminders.daysBefore,
    },
  };
}

