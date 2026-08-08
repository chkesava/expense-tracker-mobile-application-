import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

import { haptic } from "@/lib/haptics";
import { useSettings } from "@/providers/SettingsProvider";

export interface CelebrationEvent {
  title: string;
  subtitle?: string;
  badgeEmoji?: string;
  pointsEarned?: number;
}

interface CelebrationContextType {
  celebrate: (event: CelebrationEvent) => void;
  celebrateMilestone: (key: string, event: CelebrationEvent) => boolean;
  isMilestoneCelebrated: (key: string) => boolean;
  currentCelebration: CelebrationEvent | null;
  dismissCelebration: () => void;
}

const CelebrationContext = createContext<CelebrationContextType | undefined>(
  undefined
);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings } = useSettings();
  const [currentCelebration, setCurrentCelebration] =
    useState<CelebrationEvent | null>(null);

  const completedSteps = settings?.onboarding?.completedSteps || [];

  const isMilestoneCelebrated = useCallback(
    (key: string) => {
      return completedSteps.includes(key);
    },
    [completedSteps]
  );

  const celebrate = useCallback((event: CelebrationEvent) => {
    void haptic.success();
    setCurrentCelebration(event);
  }, []);

  const celebrateMilestone = useCallback(
    (key: string, event: CelebrationEvent): boolean => {
      const currentList = settings?.onboarding?.completedSteps || [];
      if (currentList.includes(key)) {
        return false;
      }

      // Persist milestone in user settings
      const updatedSteps = [...currentList, key];
      void updateSettings({
        onboarding: {
          ...settings?.onboarding,
          completedSteps: updatedSteps,
        },
      });

      celebrate(event);
      return true;
    },
    [settings?.onboarding, updateSettings, celebrate]
  );

  const dismissCelebration = useCallback(() => {
    setCurrentCelebration(null);
  }, []);

  return (
    <CelebrationContext.Provider
      value={{
        celebrate,
        celebrateMilestone,
        isMilestoneCelebrated,
        currentCelebration,
        dismissCelebration,
      }}
    >
      {children}
    </CelebrationContext.Provider>
  );
}

export function useCelebration() {
  const context = useContext(CelebrationContext);
  if (!context) {
    throw new Error("useCelebration must be used within a CelebrationProvider");
  }
  return context;
}
