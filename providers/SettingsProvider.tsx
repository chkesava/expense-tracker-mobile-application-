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
import { View } from "react-native";
import { doc, setDoc } from "firebase/firestore";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import {
  SETTINGS_DEFAULTS,
  mergeSettingsFromDoc,
  type DateFormatOption,
  type DefaultView,
  type FirstDayOfWeekOption,
  type NavigationStyle,
  type NumberFormatOption,
  type UserSettings,
} from "@/shared/types/settings";

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
  setHapticFeedback: (val: boolean) => void;
  setPrivacyPin: (val: string) => void;
  setFakePin: (val: string) => void;
  setLockOnInactivity: (val: boolean) => void;
  setInactivityTimeout: (val: number) => void;
  setLockOnAppSwitch: (val: boolean) => void;
  setEnableInvestments: (val: boolean) => void;
  setAccentColor: (val: string) => void;
  setCurrency: (val: string) => void;
  setLanguage: (val: string) => void;
  setDateFormat: (val: DateFormatOption) => void;
  setNumberFormat: (val: NumberFormatOption) => void;
  setFirstDayOfWeek: (val: FirstDayOfWeekOption) => void;
  setCreditCardBillReminders: (
    val: Partial<UserSettings["creditCardBillReminders"]>
  ) => void;
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { realUser } = useAuth();
  const { data, exists, error: userDocError, loading: userDocLoading } = useUserDoc();
  const [settings, setSettings] = useState<UserSettings>(SETTINGS_DEFAULTS);
  const [seedAttempted, setSeedAttempted] = useState(false);

  useEffect(() => {
    haptic.setEnabled(settings.hapticFeedback);
  }, [settings.hapticFeedback]);

  useEffect(() => {
    if (!realUser) {
      setSettings(SETTINGS_DEFAULTS);
      setSeedAttempted(false);
      return;
    }
    if (userDocLoading) return;
    // The profile read failed — keep whatever settings are already applied
    // rather than snapping the UI back to defaults.
    if (userDocError) return;

    if (exists && data) {
      setSettings(mergeSettingsFromDoc(data as Record<string, unknown>));
      setSeedAttempted(false);
    } else if (!exists && !seedAttempted) {
      // Doc is confirmed missing after the first snapshot. Apply defaults in
      // memory only — never write SETTINGS_DEFAULTS to Firestore. A merge seed
      // previously raced ahead of the snapshot and wiped budget/accent/theme.
      setSeedAttempted(true);
      setSettings(mergeSettingsFromDoc(null));
    }
  }, [realUser, data, exists, userDocError, userDocLoading, seedAttempted]);

  const loading = Boolean(realUser) && userDocLoading;

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      const db = getFirestoreDb();
      if (!realUser || !db) return;
      setSettings((prev) => ({ ...prev, ...updates }));
      try {
        await setDoc(doc(db, "users", realUser.uid), updates, { merge: true });
      } catch (err) {
        logError("settingsProvider.saveSettings", err);
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
      setHapticFeedback: (val) => void updateSettings({ hapticFeedback: val }),
      setPrivacyPin: (val) => void updateSettings({ privacyPin: val }),
      setFakePin: (val) => void updateSettings({ fakePin: val }),
      setLockOnInactivity: (val) => void updateSettings({ lockOnInactivity: val }),
      setInactivityTimeout: (val) =>
        void updateSettings({ inactivityTimeout: val }),
      setLockOnAppSwitch: (val) => void updateSettings({ lockOnAppSwitch: val }),
      setEnableInvestments: (val) => void updateSettings({ enableInvestments: val }),
      setAccentColor: (val) => void updateSettings({ accentColor: val }),
      setCurrency: (val) => void updateSettings({ currency: val }),
      setLanguage: (val) => void updateSettings({ language: val }),
      setDateFormat: (val) => void updateSettings({ dateFormat: val }),
      setNumberFormat: (val) => void updateSettings({ numberFormat: val }),
      setFirstDayOfWeek: (val) => void updateSettings({ firstDayOfWeek: val }),
      setCreditCardBillReminders: (val) => {
        void updateSettings({
          creditCardBillReminders: {
            ...settings.creditCardBillReminders,
            ...val,
            daysBefore:
              val.daysBefore ?? settings.creditCardBillReminders.daysBefore,
          },
        });
      },
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
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#0F2F4B",
      }}
    />
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
