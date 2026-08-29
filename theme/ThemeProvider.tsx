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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, setDoc } from "firebase/firestore";
import { useColorScheme as useSystemColorScheme } from "react-native";

import { logError } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";
import { commitWrite } from "@/lib/firestoreWrite";
import { useAuth } from "@/providers/AuthProvider";
import { useUserDoc } from "@/providers/UserDocProvider";
import { memoryStorage, setSharedStorage } from "@/shared/storage/memoryStorage";
import {
  ACCENT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  createTheme,
  isAccentColorName,
  isThemeName,
  type AccentColorName,
  type ThemeName,
  type ThemeTokens,
} from "./tokens";

export type ThemeMode = "system" | "light" | "dark" | "custom";
export const THEME_MODE_STORAGE_KEY = "expense-tracker-theme-mode";

type ThemeContextValue = {
  theme: ThemeTokens;
  themeName: ThemeName;
  themeMode: ThemeMode;
  accentColor: AccentColorName;
  setThemeName: (name: ThemeName) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setAccentColor: (accent: AccentColorName) => void;
  toggleTheme: () => void;
};

/**
 * Exported so a product can republish a different palette to its own subtree —
 * see `providers/GaneshThemeProvider.tsx`. Nothing else should provide this
 * context; `AppThemeProvider` remains the only writer of theme *preferences*.
 */
export const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export type { ThemeContextValue };

function resolveInitialTheme(system: string | null | undefined): ThemeName {
  try {
    const stored = memoryStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeName(stored)) return stored;
  } catch {
    /* ignore */
  }
  return system === "dark" ? "dark" : "light";
}

function resolveInitialAccent(): AccentColorName {
  try {
    const stored = memoryStorage.getItem(ACCENT_STORAGE_KEY);
    if (isAccentColorName(stored)) return stored;
  } catch {
    /* ignore */
  }
  return "indigo";
}

/**
 * Theme provider — AsyncStorage + Firestore `users/{uid}`.
 * Must sit under AuthProvider + UserDocProvider.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme();
  const { realUser } = useAuth();
  const { data } = useUserDoc();

  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [themeName, setThemeNameState] = useState<ThemeName>(() =>
    resolveInitialTheme(system)
  );
  const [accentColor, setAccentColorState] = useState<AccentColorName>(() =>
    resolveInitialAccent()
  );

  useEffect(() => {
    setSharedStorage(memoryStorage);
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(THEME_MODE_STORAGE_KEY),
      AsyncStorage.getItem(ACCENT_STORAGE_KEY),
    ])
      .then(([storedTheme, storedMode, storedAccent]) => {
        if (cancelled) return;
        if (isThemeName(storedTheme)) {
          setThemeNameState(storedTheme);
          memoryStorage.setItem(THEME_STORAGE_KEY, storedTheme);
        }
        if (storedMode === "system" || storedMode === "light" || storedMode === "dark" || storedMode === "custom") {
          setThemeModeState(storedMode);
        }
        if (isAccentColorName(storedAccent)) {
          setAccentColorState(storedAccent);
          memoryStorage.setItem(ACCENT_STORAGE_KEY, storedAccent);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync theme from shared user doc listener
  useEffect(() => {
    if (isThemeName(data?.theme)) {
      setThemeNameState(data.theme);
      memoryStorage.setItem(THEME_STORAGE_KEY, data.theme);
      void AsyncStorage.setItem(THEME_STORAGE_KEY, data.theme);
    }
    if (isAccentColorName((data as Record<string, unknown>)?.accentColor)) {
      const acc = (data as Record<string, unknown>).accentColor as AccentColorName;
      setAccentColorState(acc);
      memoryStorage.setItem(ACCENT_STORAGE_KEY, acc);
      void AsyncStorage.setItem(ACCENT_STORAGE_KEY, acc);
    }
    const mode = (data as Record<string, unknown>)?.themeMode;
    if (mode === "system" || mode === "light" || mode === "dark" || mode === "custom") {
      setThemeModeState(mode);
    }
  }, [data]);

  // Handle system appearance changes when in system mode
  useEffect(() => {
    if (themeMode === "system") {
      setThemeNameState(system === "dark" ? "dark" : "light");
    }
  }, [system, themeMode]);

  /**
   * Theme fields live on `users/{uid}` alongside the settings document, but this
   * provider sits *above* `SettingsProvider` and cannot reach its write queue.
   * Serialising here keeps concurrent theme/accent writes from interleaving, and
   * routes failures through `lib/errors` instead of a silent `console.error`.
   */
  const themeWriteChain = useRef(Promise.resolve());
  const persistThemeFields = useCallback(
    (fields: Record<string, string>) => {
      const user = realUser;
      const db = getFirestoreDb();
      if (!user || !db) return Promise.resolve();

      themeWriteChain.current = themeWriteChain.current.then(async () => {
        try {
          await commitWrite(
            () => setDoc(doc(db, "users", user.uid), fields, { merge: true }),
            { label: "theme" }
          );
        } catch (err) {
          logError("themeProvider.persistThemeFields", err);
        }
      });
      return themeWriteChain.current;
    },
    [realUser]
  );

  const setThemeName = useCallback(
    (name: ThemeName) => {
      const derivedMode: ThemeMode =
        name === "light" ? "light" : name === "dark" ? "dark" : "custom";
      setThemeNameState(name);
      setThemeModeState(derivedMode);
      try {
        memoryStorage.setItem(THEME_STORAGE_KEY, name);
      } catch {
        /* ignore */
      }
      void AsyncStorage.setItem(THEME_STORAGE_KEY, name);
      // Persist the derived mode locally too. AsyncStorage is the only source
      // available during the first frames and while offline/pre-auth, so
      // writing the mode to Firestore alone let a preset choice revert on the
      // next cold start.
      void AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, derivedMode);

      void persistThemeFields({ theme: name, themeMode: derivedMode });
    },
    [persistThemeFields]
  );

  const setThemeMode = useCallback(
    (mode: ThemeMode) => {
      setThemeModeState(mode);
      let targetTheme: ThemeName = themeName;
      if (mode === "system") {
        targetTheme = system === "dark" ? "dark" : "light";
      } else if (mode === "light") {
        targetTheme = "light";
      } else if (mode === "dark") {
        targetTheme = "dark";
      }
      setThemeNameState(targetTheme);

      void AsyncStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
      void AsyncStorage.setItem(THEME_STORAGE_KEY, targetTheme);

      void persistThemeFields({ theme: targetTheme, themeMode: mode });
    },
    [persistThemeFields, system, themeName]
  );

  const setAccentColor = useCallback(
    (accent: AccentColorName) => {
      setAccentColorState(accent);
      try {
        memoryStorage.setItem(ACCENT_STORAGE_KEY, accent);
      } catch {
        /* ignore */
      }
      void AsyncStorage.setItem(ACCENT_STORAGE_KEY, accent);

      void persistThemeFields({ accentColor: accent });
    },
    [persistThemeFields]
  );

  const toggleTheme = useCallback(() => {
    setThemeName(
      themeName === "dark" || themeName === "light"
        ? themeName === "dark"
          ? "light"
          : "dark"
        : themeUsesOppositeToggle(themeName)
    );
  }, [setThemeName, themeName]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: createTheme(themeName, accentColor),
      themeName,
      themeMode,
      accentColor,
      setThemeName,
      setThemeMode,
      setAccentColor,
      toggleTheme,
    }),
    [themeName, themeMode, accentColor, setThemeName, setThemeMode, setAccentColor, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

function themeUsesOppositeToggle(name: ThemeName): ThemeName {
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

