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

import { getFirestoreDb } from "@/lib/firebase";

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
  const [settings, setSettings] = useState<SystemSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!db) {
      setLoading(false);
      return;
    }

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
        console.error("Error fetching system settings:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, []);

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
