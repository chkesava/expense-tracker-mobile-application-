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
  useRef,
  useState,
  type ReactNode,
} from "react";
import { View } from "react-native";
import { doc, setDoc } from "firebase/firestore";

import { GANESH_SPLASH_MAROON } from "@/components/ganesh/splash/ganeshSplashTheme";
import { ACTIVE_PRODUCT } from "@/lib/activeProduct";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite } from "@/lib/firestoreWrite";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
import { useAuth } from "@/providers/AuthProvider";
import { useSystemSettings } from "@/providers/SystemSettingsProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import {
  resetDisplayCurrencyPreferences,
  setDisplayCurrencyPreferences,
} from "@/shared/utils/displayCurrency";
import {
  SETTINGS_DEFAULTS,
  mergeSettingsFromDoc,
  overlayPendingSettings,
  remainingPendingSettings,
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
  const { settings: systemSettings } = useSystemSettings();
  const fallbackCurrency = systemSettings.defaultCurrency;
  const [settings, setSettings] = useState<UserSettings>(SETTINGS_DEFAULTS);
  const [seedAttempted, setSeedAttempted] = useState(false);
  const overlayRef = useRef<Partial<UserSettings>>({});
  const pendingRef = useRef<Partial<UserSettings>>({});
  const drainPromiseRef = useRef(Promise.resolve());
  const realUserRef = useRef(realUser);
  realUserRef.current = realUser;

  useEffect(() => {
    haptic.setEnabled(settings.hapticFeedback);
  }, [settings.hapticFeedback]);

  // Mirror money-formatting prefs for code that formats outside the React tree
  // (SMS notification copy, background handlers).
  useEffect(() => {
    setDisplayCurrencyPreferences({
      currency: settings.currency,
      numberFormat: settings.numberFormat,
    });
  }, [settings.currency, settings.numberFormat]);

  useEffect(() => {
    if (!realUser) {
      overlayRef.current = {};
      pendingRef.current = {};
      setSettings(SETTINGS_DEFAULTS);
      setSeedAttempted(false);
      resetDisplayCurrencyPreferences();
      return;
    }
    if (userDocLoading) return;
    // The profile read failed — keep whatever settings are already applied
    // rather than snapping the UI back to defaults.
    if (userDocError) return;

    if (exists && data) {
      const cloud = mergeSettingsFromDoc(data as Record<string, unknown>, {
        fallbackCurrency,
      });
      overlayRef.current = remainingPendingSettings(cloud, overlayRef.current);
      setSettings(overlayPendingSettings(cloud, overlayRef.current));
      setSeedAttempted(false);
    } else if (!exists && !seedAttempted) {
      // Doc is confirmed missing after the first snapshot. Apply defaults in
      // memory only — never write SETTINGS_DEFAULTS to Firestore. A merge seed
      // previously raced ahead of the snapshot and wiped budget/accent/theme.
      setSeedAttempted(true);
      const cloud = mergeSettingsFromDoc(null, { fallbackCurrency });
      overlayRef.current = remainingPendingSettings(cloud, overlayRef.current);
      setSettings(overlayPendingSettings(cloud, overlayRef.current));
    }
  }, [
    realUser,
    data,
    exists,
    userDocError,
    userDocLoading,
    seedAttempted,
    fallbackCurrency,
  ]);

  const loading = Boolean(realUser) && userDocLoading;

  const drainPendingWrites = useCallback(() => {
    drainPromiseRef.current = drainPromiseRef.current.then(async () => {
      const user = realUserRef.current;
      const db = getFirestoreDb();
      if (!user || !db) return;

      while (Object.keys(pendingRef.current).length > 0) {
        const batch = pendingRef.current;
        pendingRef.current = {};
        try {
          await commitWrite(
            () => setDoc(doc(db, "users", user.uid), batch, { merge: true }),
            { label: "settings" }
          );
        } catch (err) {
          pendingRef.current = { ...batch, ...pendingRef.current };
          logError("settingsProvider.saveSettings", err);
          toast.error(friendlyErrorMessage(err, "Couldn't save settings."));
          break;
        }
      }
    });
    return drainPromiseRef.current;
  }, []);

  const updateSettings = useCallback(
    async (updates: Partial<UserSettings>) => {
      overlayRef.current = { ...overlayRef.current, ...updates };
      pendingRef.current = { ...pendingRef.current, ...updates };
      setSettings((prev) => ({ ...prev, ...updates }));

      const db = getFirestoreDb();
      if (!realUser || !db) {
        logError(
          "settingsProvider.saveSettings",
          new Error("Not signed in or Firebase unavailable")
        );
        toast.error("Couldn't save settings. Check your connection and try again.");
        return;
      }

      await drainPendingWrites();
    },
    [drainPendingWrites, realUser]
  );

  // SPENDLY-22: the privacy PIN is no longer a setting. It lives in
  // `lib/pinVault.ts` behind SecureStore and is reached through
  // `PrivacyPinProvider` — keeping a setter here would put it back in
  // Firestore, which is the defect AUTH-04 is about.

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
      setLockOnInactivity: (val) => void updateSettings({ lockOnInactivity: val }),
      setInactivityTimeout: (val) =>
        void updateSettings({ inactivityTimeout: val }),
      setLockOnAppSwitch: (val) => void updateSettings({ lockOnAppSwitch: val }),
      setEnableInvestments: (val) => void updateSettings({ enableInvestments: val }),
      setAccentColor: (val) => void updateSettings({ accentColor: val }),
      setCurrency: (val) =>
        void updateSettings({
          currency: val,
          onboarding: { ...settings.onboarding, currencyChosen: true },
        }),
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
        backgroundColor: ACTIVE_PRODUCT === "ganesh" ? GANESH_SPLASH_MAROON : "#0F2F4B",
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
