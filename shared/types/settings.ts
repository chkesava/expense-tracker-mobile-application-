/**
 * User prefs stored on `users/{uid}` (same shape as web useSettings).
 * Privacy fields are seeded for doc parity; UI arrives in Phase 4.
 */

export type DefaultView = "add" | "expenses" | "analytics" | "dashboard";
export type NavigationStyle = "bottom" | "dock";

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
};

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
};

function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export const SETTINGS_DEFAULTS: UserSettings = {
  lockPastMonths: true,
  compactListMode: false,
  defaultCategory: "Food & Dining",
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
  },
};

export function mergeSettingsFromDoc(
  data: Record<string, unknown> | null | undefined
): UserSettings {
  if (!data) return { ...SETTINGS_DEFAULTS, timezone: deviceTimezone() };

  return {
    ...SETTINGS_DEFAULTS,
    ...(data as Partial<UserSettings>),
    dashboardWidgets: {
      ...SETTINGS_DEFAULTS.dashboardWidgets,
      ...((data.dashboardWidgets as Partial<DashboardWidgets>) || {}),
    },
    dashboardOrder:
      (data.dashboardOrder as string[] | undefined) ||
      SETTINGS_DEFAULTS.dashboardOrder,
    ghostMode:
      (data.ghostMode as boolean | undefined) ?? SETTINGS_DEFAULTS.ghostMode,
    hapticFeedback:
      (data.hapticFeedback as boolean | undefined) ??
      SETTINGS_DEFAULTS.hapticFeedback,
    timezone:
      typeof data.timezone === "string" && data.timezone
        ? data.timezone
        : SETTINGS_DEFAULTS.timezone,
    onboarding: {
      ...SETTINGS_DEFAULTS.onboarding,
      ...((data.onboarding as Partial<OnboardingState>) || {}),
      completedSteps:
        (data.onboarding as Partial<OnboardingState>)?.completedSteps ||
        SETTINGS_DEFAULTS.onboarding.completedSteps,
      visitedScreens:
        (data.onboarding as Partial<OnboardingState>)?.visitedScreens ||
        SETTINGS_DEFAULTS.onboarding.visitedScreens,
    },
  };
}

