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
  const { themeName } = useTheme();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { expenses, loading: expensesLoading } = useExpenses();
  const { incomes, loading: incomesLoading } = useIncomes();
  const { categories } = useCategories();
  const { celebrate } = useCelebration();
  const { setIsAddExpenseOpen } = useModals();

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
        onNavigate: () => router.push("/settings"),
      },
      {
        id: "theme",
        label: "Customize your theme",
        completed: themeName !== "dark",
        onNavigate: () => router.push("/settings"),
      },
      {
        id: "account",
        label: "Add your first account",
        completed: accounts.length > 0,
        onNavigate: () => router.push("/settings"),
      },
      {
        id: "expense",
        label: "Log your first expense",
        completed: expenses.length > 0,
        onNavigate: () => setIsAddExpenseOpen(true),
      },
      {
        id: "income",
        label: "Log your first income",
        completed: incomes.length > 0,
        onNavigate: () => setIsAddExpenseOpen(true),
      },
      {
        id: "budget",
        label: "Set a monthly budget",
        completed: settings.monthlyBudget > 0,
        onNavigate: () => router.push("/settings"),
      },
      {
        id: "first_category",
        label: "Create a custom category",
        completed: categories.some((c) => !c.isDefault),
        onNavigate: () => router.push("/settings"),
      },
      {
        id: "explore_dashboard",
        label: "Explore the dashboard",
        completed: visitedScreens.includes("dashboard"),
        onNavigate: () => router.push("/dashboard"),
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
    themeName,
    accounts.length,
    expenses.length,
    incomes.length,
    settings.monthlyBudget,
    categories,
    visitedScreens,
    router,
    setIsAddExpenseOpen,
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

  const isOnboarding = Boolean(
    !dataLoading &&
      !onboarding?.onboardingDismissed &&
      completedCount < totalCount &&
      isExplicitlyOnboarding
  );

  // First launch welcome modal shows ONLY if:
  // 1. Data has finished loading
  // 2. Welcome is not yet completed
  // 3. Either it's a new user (no financial data) OR they explicitly restarted setup
  const isFirstLaunch = Boolean(
    !dataLoading &&
      !onboarding?.welcomeCompleted &&
      (!hasFinancialData || onboarding?.setupStartedAt)
  );

  // Handle threshold celebrations (only during active onboarding)
  useEffect(() => {
    if (dataLoading || !isOnboarding || !onboarding?.welcomeCompleted) return;

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
    isOnboarding,
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
