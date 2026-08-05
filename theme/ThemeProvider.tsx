import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";
import { useColorScheme as useSystemColorScheme } from "react-native";

import { getFirestoreDb } from "@/lib/firebase";
import { useAuth } from "@/providers/AuthProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import { memoryStorage, setSharedStorage } from "@/shared/storage/memoryStorage";
import {
  THEME_STORAGE_KEY,
  createTheme,
  isThemeName,
  type ThemeName,
  type ThemeTokens,
} from "./tokens";

type ThemeContextValue = {
  theme: ThemeTokens;
  themeName: ThemeName;
  setThemeName: (name: ThemeName) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function resolveInitialTheme(system: string | null | undefined): ThemeName {
  try {
    const stored = memoryStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(stored)) return stored;
  } catch {
    /* ignore */
  }
  return system === "dark" ? "dark" : "light";
}

/**
 * Theme provider — AsyncStorage + Firestore `users/{uid}.theme` (shared UserDoc).
 * Must sit under AuthProvider + UserDocProvider.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme();
  const { realUser } = useAuth();
  const { data } = useUserDoc();
  const [themeName, setThemeNameState] = useState<ThemeName>(() =>
    resolveInitialTheme(system)
  );

  useEffect(() => {
    setSharedStorage(memoryStorage);
    let cancelled = false;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((stored) => {
        if (cancelled || !isThemeName(stored)) return;
        setThemeNameState(stored);
        memoryStorage.setItem(THEME_STORAGE_KEY, stored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync theme from the shared user doc listener (no extra onSnapshot)
  useEffect(() => {
    if (isThemeName(data?.theme)) {
      setThemeNameState(data.theme);
      memoryStorage.setItem(THEME_STORAGE_KEY, data.theme);
      void AsyncStorage.setItem(THEME_STORAGE_KEY, data.theme);
    }
  }, [data?.theme]);

  const setThemeName = useCallback(
    (name: ThemeName) => {
      setThemeNameState(name);
      try {
        memoryStorage.setItem(THEME_STORAGE_KEY, name);
      } catch {
        /* ignore */
      }
      void AsyncStorage.setItem(THEME_STORAGE_KEY, name);

      const db = getFirestoreDb();
      if (realUser && db) {
        setDoc(doc(db, "users", realUser.uid), { theme: name }, { merge: true }).catch(
          (err) => console.error("Failed to sync theme to Firestore", err)
        );
      }
    },
    [realUser]
  );

  const toggleTheme = useCallback(() => {
    setThemeName(themeName === "dark" || themeName === "light"
      ? themeName === "dark"
        ? "light"
        : "dark"
      : themeUsesOppositeToggle(themeName));
  }, [setThemeName, themeName]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: createTheme(themeName),
      themeName,
      setThemeName,
      toggleTheme,
    }),
    [themeName, setThemeName, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

function themeUsesOppositeToggle(name: ThemeName): ThemeName {
  // Named themes: flip to light/dark counterpart for quick toggle.
  const darkish = [
    "dark",
    "midnight",
    "midnight-olive",
    "cyberpunk",
    "deep-sea",
    "glass-3d",
  ].includes(name);
  return darkish ? "light" : "dark";
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within AppThemeProvider");
  }
  return ctx;
}
