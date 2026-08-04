import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme as useSystemColorScheme } from "react-native";

import { memoryStorage, setSharedStorage } from "@/shared/storage/memoryStorage";
import {
  THEME_STORAGE_KEY,
  createTheme,
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
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    /* ignore */
  }
  return system === "dark" ? "dark" : "light";
}

/**
 * Phase 1 ThemeProvider — light/dark only.
 * Firestore sync of theme arrives in Phase 3 with UserDoc.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme();
  const [themeName, setThemeNameState] = useState<ThemeName>(() =>
    resolveInitialTheme(system)
  );

  useEffect(() => {
    // Ensure Phase 0 helpers use the same in-memory KV until MMKV is wired.
    setSharedStorage(memoryStorage);
  }, []);

  const setThemeName = useCallback((name: ThemeName) => {
    setThemeNameState(name);
    try {
      memoryStorage.setItem(THEME_STORAGE_KEY, name);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeName(themeName === "dark" ? "light" : "dark");
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

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within AppThemeProvider");
  }
  return ctx;
}
