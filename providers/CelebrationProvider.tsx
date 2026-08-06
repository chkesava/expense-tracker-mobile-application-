import React, {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import * as Haptics from "expo-haptics";

export interface CelebrationEvent {
  title: string;
  subtitle?: string;
  badgeEmoji?: string;
  pointsEarned?: number;
}

interface CelebrationContextType {
  celebrate: (event: CelebrationEvent) => void;
  currentCelebration: CelebrationEvent | null;
  dismissCelebration: () => void;
}

const CelebrationContext = createContext<CelebrationContextType | undefined>(
  undefined
);

export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [currentCelebration, setCurrentCelebration] =
    useState<CelebrationEvent | null>(null);

  const celebrate = useCallback((event: CelebrationEvent) => {
    Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success
    ).catch(() => undefined);
    setCurrentCelebration(event);
  }, []);

  const dismissCelebration = useCallback(() => {
    setCurrentCelebration(null);
  }, []);

  return (
    <CelebrationContext.Provider
      value={{
        celebrate,
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
