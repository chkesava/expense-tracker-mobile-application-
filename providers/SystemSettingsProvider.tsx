/**
 * Shared listener for `system_settings/global`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { doc, onSnapshot } from "firebase/firestore";

import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";

export type SystemSettings = {
  maintenanceMode: boolean;
  disableSignups: boolean;
  announcementBanner: string;
  defaultCurrency: string;
  enableAIFeatures: boolean;
  allowDataExport: boolean;
  enableInvestments: boolean;
};

const DEFAULT_SETTINGS: SystemSettings = {
  maintenanceMode: false,
  disableSignups: false,
  announcementBanner: "",
  defaultCurrency: "INR",
  enableAIFeatures: true,
  allowDataExport: true,
  enableInvestments: true,
};

type SystemSettingsContextType = {
  settings: SystemSettings;
  loading: boolean;
};

const SystemSettingsContext = createContext<SystemSettingsContextType | undefined>(
  undefined
);

export function SystemSettingsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const uid = user?.uid ?? null;

  useEffect(() => {
    // Auth restore races the first snapshot. A permission-denied error is
    // terminal, so wait until we know whether anyone is signed in, then
    // subscribe again after login (same shape as useAppUpdate).
    if (authLoading) return;

    const db = getFirestoreDb();
    if (!db) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = onSnapshot(
      doc(db, "system_settings", "global"),
      (docSnap) => {
        if (docSnap.exists()) {
          setSettings({ ...DEFAULT_SETTINGS, ...(docSnap.data() as Partial<SystemSettings>) });
        } else {
          setSettings(DEFAULT_SETTINGS);
        }
        setLoading(false);
      },
      (error) => {
        // Non-fatal: DEFAULT_SETTINGS already applied, so the app stays usable.
        logWarning("snapshot.systemSettings", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [authLoading, uid]);

  const value = useMemo(() => ({ settings, loading }), [settings, loading]);

  return (
    <SystemSettingsContext.Provider value={value}>
      {children}
    </SystemSettingsContext.Provider>
  );
}

export function useSystemSettings() {
  const context = useContext(SystemSettingsContext);
  if (context === undefined) {
    throw new Error("useSystemSettings must be used within a SystemSettingsProvider");
  }
  return context;
}
