import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "expo-router";

import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { useExpenses } from "@/hooks/useExpenses";
import { useIncomes } from "@/hooks/useIncomes";
import { useCelebration } from "@/providers/CelebrationProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import { useTheme } from "@/theme/ThemeProvider";


export type SetupStep = {
  id: string;
  label: string;
  completed: boolean;
  onNavigate: () => void;
};

type SetupProgressContextType = {
  steps: SetupStep[];
  completedCount: number;
  totalCount: number;
  progress: number;
  isOnboarding: boolean;
  isFirstLaunch: boolean;
  launchSetupWizard: (stepIndex?: number) => void;
  completeWelcome: () => void;
  dismissOnboarding: () => void;
  resetOnboarding: () => void;
  markScreenVisited: (screen: string) => void;
};

const SetupProgressContext = createContext<SetupProgressContextType | undefined>(
  undefined
);

export function SetupProgressProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { settings, updateSettings } = useSettings();
  const { data: userDoc, loading: userDocLoading } = useUserDoc();
  const { themeMode } = useTheme();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { categories } = useCategories();
  const { celebrate } = useCelebration();
  const {
    setIsAddExpenseOpen,
    setAddTransactionKind,
    setIsSetupWizardOpen,
    setSetupWizardInitialStep,
  } = useModals();

  const launchSetupWizard = useCallback((stepIndex: number = 0) => {
    setSetupWizardInitialStep(stepIndex);
    setIsSetupWizardOpen(true);
  }, [setIsSetupWizardOpen, setSetupWizardInitialStep]);

  const { onboarding } = settings;
  const visitedScreens = useMemo(
    () => onboarding?.visitedScreens || [],
    [onboarding?.visitedScreens]
  );
  const completedSteps = useMemo(
    () => onboarding?.completedSteps || [],
    [onboarding?.completedSteps]
  );

  const dataLoading = Boolean(
    userDocLoading || accountsLoading || expensesLoading || incomesLoading
  );

  // Check if this user already has pre-existing financial activity
  const hasFinancialData = useMemo(() => {
    return (
      accounts.length > 0 ||
      expenses.length > 0 ||
      incomes.length > 0 ||
      (settings.monthlyBudget > 0)
    );
  }, [accounts.length, expenses.length, incomes.length, settings.monthlyBudget]);

  // If this is an existing user who registered before FTUE was added,
  // automatically mark welcome completed & dismissed so they aren't bothered.
  const autoMigratedRef = useRef(false);
  useEffect(() => {
    if (dataLoading || autoMigratedRef.current) return;
    if (
      hasFinancialData &&
      !onboarding?.welcomeCompleted &&
      !onboarding?.setupStartedAt
    ) {
      autoMigratedRef.current = true;
      void updateSettings({
        onboarding: {
          ...onboarding,
          welcomeCompleted: true,
          onboardingDismissed: true,
          completedSteps: ["milestone_25", "milestone_50", "milestone_75", "milestone_100"],
        },
      });
    }
  }, [dataLoading, hasFinancialData, onboarding, updateSettings]);

  const steps = useMemo<SetupStep[]>(() => {
    return [
      {
        id: "profile",
        label: "Complete your profile",
        completed: Boolean(userDoc?.username),
        onNavigate: () => launchSetupWizard(0),
      },
      {
        id: "currency",
        label: "Select your default currency",
        // The shared `system_settings/global` currency always carries an "INR"
        // fallback, so it is truthy before the user has chosen anything. Only
        // an explicit confirmation in the wizard completes this step.
        completed: Boolean(onboarding?.currencyChosen),
        onNavigate: () => launchSetupWizard(1),
      },
      {
        id: "budget",
        label: "Set a monthly budget",
        completed: settings.monthlyBudget > 0,
        onNavigate: () => launchSetupWizard(2),
      },
      {
        id: "account",
        label: "Add your first account",
        completed: accounts.length > 0,
        onNavigate: () => launchSetupWizard(3),
      },
      {
        id: "expense",
        label: "Log your first expense",
        completed: expenses.length > 0,
        onNavigate: () => launchSetupWizard(4),
      },
      {
        id: "income",
        label: "Log your first income",
        completed: incomes.length > 0,
        // The Add Transaction sheet is shared; open it on the Income tab so the
        // step doesn't drop the user on the expense form.
        onNavigate: () => {
          setAddTransactionKind("income");
          setIsAddExpenseOpen(true);
        },
      },
      {
        id: "first_category",
        label: "Create a custom category",
        completed: categories.some((c) => !c.isDefault),
        onNavigate: () => router.push("/settings/money" as never),
      },
      {
        id: "theme",
        label: "Customize your theme",
        // Was `themeName !== "dark"`, which self-completed for anyone whose
        // phone was in light mode. Theme mode starts at "system", so leaving
        // it means the user has not chosen.
        completed: themeMode !== "system",
        onNavigate: () => router.push("/settings/appearance" as never),
      },
      {
        id: "explore_dashboard",
        label: "Explore the dashboard",
        completed: visitedScreens.includes("dashboard"),
        onNavigate: () => router.dismissTo("/dashboard"),
      },
      {
        id: "explore_insights",
        label: "View your insights",
        completed: visitedScreens.includes("insights"),
        onNavigate: () => router.push("/insights"),
      },
    ];
  }, [
    userDoc?.username,
    onboarding?.currencyChosen,
    settings.monthlyBudget,
    accounts.length,
    expenses.length,
    incomes.length,
    categories,
    themeMode,
    visitedScreens,
    launchSetupWizard,
    setIsAddExpenseOpen,
    setAddTransactionKind,
    router,
  ]);

  const totalCount = steps.length;
  const completedCount = steps.filter((s) => s.completed).length;
  const progress = totalCount > 0 ? completedCount / totalCount : 0;

  // Active onboarding is true ONLY if:
  // 1. Data has loaded
  // 2. User has not dismissed onboarding
  // 3. Not all steps are complete
  // 4. Either it's a new user (no existing data) OR they explicitly started/restarted setup
  const isExplicitlyOnboarding = Boolean(
    onboarding?.setupStartedAt || !hasFinancialData
  );

  /**
   * Whether this user's setup is still being tracked — same as `isOnboarding`
   * but *without* the "not yet finished" condition. Milestones must key off
   * this: gating them on `isOnboarding` made the 100% milestone unreachable,
   * because reaching 100% is exactly what turns `isOnboarding` false.
   */
  const isTrackingSetup = Boolean(
    !dataLoading && !onboarding?.onboardingDismissed && isExplicitlyOnboarding
  );

  const isOnboarding = Boolean(isTrackingSetup && completedCount < totalCount);

  /**
   * The currency and theme steps used to complete themselves (a global currency
   * default, and a light-mode phone). Tightening them would re-open the
   * checklist for established users who had already finished it, so anyone with
   * real data whose *only* outstanding steps are those two is treated as done
   * and dismissed once.
   */
  const legacyCompleteRef = useRef(false);
  useEffect(() => {
    if (dataLoading || legacyCompleteRef.current) return;
    if (!isTrackingSetup || !hasFinancialData) return;

    const RELAXED_STEPS = ["currency", "theme"];
    const onlyRelaxedOutstanding = steps.every(
      (step) => step.completed || RELAXED_STEPS.includes(step.id)
    );
    const someRelaxedOutstanding = steps.some(
      (step) => !step.completed && RELAXED_STEPS.includes(step.id)
    );

    if (onlyRelaxedOutstanding && someRelaxedOutstanding) {
      legacyCompleteRef.current = true;
      void updateSettings({
        onboarding: { ...onboarding, onboardingDismissed: true },
      });
    }
  }, [
    dataLoading,
    isTrackingSetup,
    hasFinancialData,
    steps,
    onboarding,
    updateSettings,
  ]);

  // First launch welcome modal shows ONLY if:
  // 1. Data has finished loading
  // 2. Welcome is not yet completed
  // 3. Either it's a new user (no financial data) OR they explicitly restarted setup
  const isFirstLaunch = Boolean(
    !dataLoading &&
      !onboarding?.welcomeCompleted &&
      (!hasFinancialData || onboarding?.setupStartedAt)
  );

  // Handle threshold celebrations (while setup is still being tracked)
  useEffect(() => {
    if (dataLoading || !isTrackingSetup || !onboarding?.welcomeCompleted) return;

    const p = progress * 100;
    const completedSet = new Set(completedSteps);
    let newSteps = [...completedSteps];
    let justHit = false;

    if (p >= 25 && !completedSet.has("milestone_25")) {
      newSteps.push("milestone_25");
      justHit = true;
      celebrate({
        title: "Great Start!",
        subtitle: "You're 25% done with setup",
        badgeEmoji: "🌱",
      });
    } else if (p >= 50 && !completedSet.has("milestone_50")) {
      newSteps.push("milestone_50");
      justHit = true;
      celebrate({
        title: "Halfway There!",
        subtitle: "You're 50% done with setup",
        badgeEmoji: "🚀",
      });
    } else if (p >= 75 && !completedSet.has("milestone_75")) {
      newSteps.push("milestone_75");
      justHit = true;
      celebrate({
        title: "Almost Done!",
        subtitle: "You're 75% done with setup",
        badgeEmoji: "🔥",
      });
    } else if (p >= 100 && !completedSet.has("milestone_100")) {
      newSteps.push("milestone_100");
      justHit = true;
      celebrate({
        title: "Setup Complete!",
        subtitle: "You're ready to track expenses like a pro",
        badgeEmoji: "🏆",
        pointsEarned: 100,
      });
      void updateSettings({
        onboarding: {
          ...onboarding,
          onboardingDismissed: true,
          completedSteps: newSteps,
        },
      });
      return;
    }

    if (justHit) {
      void updateSettings({
        onboarding: { ...onboarding, completedSteps: newSteps },
      });
    }
  }, [
    progress,
    dataLoading,
    isTrackingSetup,
    onboarding,
    completedSteps,
    celebrate,
    updateSettings,
  ]);

  const completeWelcome = useCallback(() => {
    void updateSettings({
      onboarding: {
        ...onboarding,
        welcomeCompleted: true,
        setupStartedAt: onboarding?.setupStartedAt || new Date().toISOString(),
      },
    });
  }, [onboarding, updateSettings]);

  const dismissOnboarding = useCallback(() => {
    void updateSettings({
      onboarding: { ...onboarding, onboardingDismissed: true },
    });
  }, [onboarding, updateSettings]);

  const resetOnboarding = useCallback(() => {
    void updateSettings({
      onboarding: {
        welcomeCompleted: false,
        onboardingDismissed: false,
        completedSteps: [],
        setupStartedAt: new Date().toISOString(),
        visitedScreens: [],
        // Restarting setup should make the currency step actionable again.
        currencyChosen: false,
      },
    });
  }, [updateSettings]);

  const markScreenVisited = useCallback(
    (screen: string) => {
      if (!visitedScreens.includes(screen)) {
        void updateSettings({
          onboarding: {
            ...onboarding,
            visitedScreens: [...visitedScreens, screen],
          },
        });
      }
    },
    [onboarding, visitedScreens, updateSettings]
  );

  return (
    <SetupProgressContext.Provider
      value={{
        steps,
        completedCount,
        totalCount,
        progress,
        isOnboarding,
        isFirstLaunch,
        launchSetupWizard,
        completeWelcome,
        dismissOnboarding,
        resetOnboarding,
        markScreenVisited,
      }}
    >
      {children}
    </SetupProgressContext.Provider>
  );
}

export function useSetupProgress() {
  const context = useContext(SetupProgressContext);
  if (!context) {
    throw new Error(
      "useSetupProgress must be used within a SetupProgressProvider"
    );
  }
  return context;
}
