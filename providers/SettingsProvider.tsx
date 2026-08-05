/**
 * User settings — merge/seed/setters on `users/{realUid}`.
 * Reads the shared UserDoc snapshot (no second listener).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { ActivityIndicator, View } from "react-native";
import { doc, setDoc } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import {
  SETTINGS_DEFAULTS,
  mergeSettingsFromDoc,
  type DefaultView,
  type NavigationStyle,
  type UserSettings,
} from "@/shared/types/settings";
import { useTheme } from "@/theme/ThemeProvider";

type SettingsContextType = {
  settings: UserSettings;
  loading: boolean;
  updateSettings: (updates: Partial<UserSettings>) => Promise<void>;
  setLockPastMonths: (val: boolean) => void;
  setCompactListMode: (val: boolean) => void;
  setDefaultCategory: (val: string) => void;
  setDefaultView: (val: DefaultView) => void;
  setExportYear: (val: number) => void;
  setMonthlyBudget: (val: number) => void;
  setTimezone: (val: string) => void;
  setUpiId: (val: string) => void;
  toggleDashboardWidget: (key: keyof UserSettings["dashboardWidgets"]) => void;
  setDashboardOrder: (order: string[]) => void;
  setNavigationStyle: (val: NavigationStyle) => void;
  setGhostMode: (val: boolean) => void;
  setPrivacyPin: (val: string) => void;
  setFakePin: (val: string) => void;
  setLockOnInactivity: (val: boolean) => void;
  setInactivityTimeout: (val: number) => void;
  setLockOnAppSwitch: (val: boolean) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { realUser } = useAuth();
  const { data, exists, loading: userDocLoading } = useUserDoc();
  const [settings, setSettings] = useState<UserSettings>(SETTINGS_DEFAULTS);
  const [seedAttempted, setSeedAttempted] = useState(false);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!realUser) {
      setSettings(SETTINGS_DEFAULTS);
      setSeedAttempted(false);
      return;
    }
    if (userDocLoading) return;

    if (exists && data) {
      setSettings(mergeSettingsFromDoc(data as Record<string, unknown>));
      setSeedAttempted(false);
    } else if (!exists && !seedAttempted && db) {
      setSeedAttempted(true);
      setDoc(doc(db, "users", realUser.uid), SETTINGS_DEFAULTS, {
        merge: true,
      }).catch((err) => console.error("Failed to seed user settings", err));
      setSettings(SETTINGS_DEFAULTS);
    }
  }, [realUser, data, exists, userDocLoading, seedAttempted]);

  const loading = Boolean(realUser) && userDocLoading;

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      const db = getFirestoreDb();
      if (!realUser || !db) return;
      setSettings((prev) => ({ ...prev, ...updates }));
      try {
        await setDoc(doc(db, "users", realUser.uid), updates, { merge: true });
      } catch (err) {
        console.error("Failed to save settings", err);
      }
    },
    [realUser]
  );

  const value = useMemo<SettingsContextType>(
    () => ({
      settings,
      loading,
      updateSettings,
      setLockPastMonths: (val) => void updateSettings({ lockPastMonths: val }),
      setCompactListMode: (val) => void updateSettings({ compactListMode: val }),
      setDefaultCategory: (val) => void updateSettings({ defaultCategory: val }),
      setDefaultView: (val) => void updateSettings({ defaultView: val }),
      setExportYear: (val) => void updateSettings({ exportYear: val }),
      setMonthlyBudget: (val) => void updateSettings({ monthlyBudget: val }),
      setTimezone: (val) => void updateSettings({ timezone: val }),
      setUpiId: (val) => void updateSettings({ upiId: val }),
      toggleDashboardWidget: (key) => {
        const newWidgets = {
          ...settings.dashboardWidgets,
          [key]: !settings.dashboardWidgets[key],
        };
        void updateSettings({ dashboardWidgets: newWidgets });
      },
      setDashboardOrder: (order) => void updateSettings({ dashboardOrder: order }),
      setNavigationStyle: (val) => void updateSettings({ navigationStyle: val }),
      setGhostMode: (val) => void updateSettings({ ghostMode: val }),
      setPrivacyPin: (val) => void updateSettings({ privacyPin: val }),
      setFakePin: (val) => void updateSettings({ fakePin: val }),
      setLockOnInactivity: (val) => void updateSettings({ lockOnInactivity: val }),
      setInactivityTimeout: (val) =>
        void updateSettings({ inactivityTimeout: val }),
      setLockOnAppSwitch: (val) => void updateSettings({ lockOnAppSwitch: val }),
    }),
    [settings, loading, updateSettings]
  );

  return (
    <SettingsContext.Provider value={value}>
      {loading ? <SettingsBootSplash /> : children}
    </SettingsContext.Provider>
  );
}

function SettingsBootSplash() {
  // Avoid importing theme here — Settings sits under ThemeProvider.
  // Use a neutral fullscreen hold until user doc resolves.
  const { theme } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: theme.colors.background,
      }}
    >
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
