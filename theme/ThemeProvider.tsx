import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
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
import { acceptRemotePalette, acceptStoredPalette, createPendingPalette } from "./expensePaletteSync";
import {
  ACCENT_STORAGE_KEY,
  THEME_STORAGE_KEY,
  createTheme,
  isAccentColorName,
  isThemeName,
  resolveThemePreference,
  resolveExpensePalette,
  themeUsesDarkPalette,
  type AccentColorName,
  type ExpensePaletteName,
  type ThemeName,
  type ThemeTokens,
} from "./tokens";

export type ThemeMode = "system" | "light" | "dark" | "custom";
export const THEME_MODE_STORAGE_KEY = "expense-tracker-theme-mode";
/** SPENDLY-618: the Expense app's own palette, separate from the saved theme. */
export const EXPENSE_PALETTE_STORAGE_KEY = "expense-tracker-palette";

type ThemeContextValue = {
  theme: ThemeTokens;
  themeName: ThemeName;
  themeMode: ThemeMode;
  accentColor: AccentColorName;
  /** SPENDLY-618: the palette the Expense shell renders in. */
  expensePalette: ExpensePaletteName;
  setExpensePalette: (palette: ExpensePaletteName) => void;
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

/**
 * SPENDLY-604: a product shell that pins its palette (the Expense app is
 * always dark) registers it here, so root-level hosts that render above the
 * shell (`appDialog` alerts, toasts) can match it through `ShellThemeScope`.
 * Null whenever no such shell is mounted, e.g. in Ganesh Seva or Nutrition.
 */
type ShellThemeValue = { name: ThemeName | null; setName: (name: ThemeName | null) => void };
const ShellThemeContext = createContext<ShellThemeValue>({ name: null, setName: () => undefined });

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

function resolveInitialExpensePalette(): ExpensePaletteName {
  try {
    return resolveExpensePalette(memoryStorage.getItem(EXPENSE_PALETTE_STORAGE_KEY));
  } catch {
    return resolveExpensePalette(null);
  }
}

/**
 * Theme provider — AsyncStorage + Firestore `users/{uid}`.
 * Must sit under AuthProvider + UserDocProvider.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const system = useSystemColorScheme();
  const { realUser } = useAuth();
  const { data, loading: userDocLoading, error: userDocError } = useUserDoc();

  const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
  const [themeName, setThemeNameState] = useState<ThemeName>(() =>
    resolveInitialTheme(system)
  );
  const [accentColor, setAccentColorState] = useState<AccentColorName>(() =>
    resolveInitialAccent()
  );
  const [expensePalette, setExpensePaletteState] = useState<ExpensePaletteName>(() =>
    resolveInitialExpensePalette()
  );
  // SPENDLY-618: true once the user doc or a selection has set the palette,
  // so the slower startup AsyncStorage read cannot replace it.
  const paletteResolved = useRef(false);
  // SPENDLY-619: same for the theme name and mode.
  const themeResolved = useRef(false);
  // The committed device appearance, for async callbacks that outlive a render.
  // Written in a layout effect so a discarded render can never leave its value.
  const systemRef = useRef(system);
  useLayoutEffect(() => {
    systemRef.current = system;
  }, [system]);
  // The newest local selection while its write is in flight, per account.
  const [pendingPalette] = useState(createPendingPalette);
  const [shellThemeName, setShellThemeName] = useState<ThemeName | null>(null);
  const shellTheme = useMemo<ShellThemeValue>(
    () => ({ name: shellThemeName, setName: setShellThemeName }),
    [shellThemeName]
  );

  useEffect(() => {
    setSharedStorage(memoryStorage);
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(THEME_STORAGE_KEY),
      AsyncStorage.getItem(THEME_MODE_STORAGE_KEY),
      AsyncStorage.getItem(ACCENT_STORAGE_KEY),
      AsyncStorage.getItem(EXPENSE_PALETTE_STORAGE_KEY),
    ])
      .then(([storedTheme, storedMode, storedAccent, storedPalette]) => {
        if (cancelled) return;
        // The oldest source: skipped once the user doc or a selection has set
        // the theme. The name is derived from the mode, so they always agree.
        const pref = themeResolved.current ? null : resolveThemePreference(storedMode, storedTheme, systemRef.current);
        if (pref) {
          setThemeNameState(pref.name);
          memoryStorage.setItem(THEME_STORAGE_KEY, pref.name);
          if (pref.mode) setThemeModeState(pref.mode);
        }
        if (isAccentColorName(storedAccent)) {
          setAccentColorState(storedAccent);
          memoryStorage.setItem(ACCENT_STORAGE_KEY, storedAccent);
        }
        const palette = acceptStoredPalette(storedPalette, paletteResolved.current);
        if (palette) {
          setExpensePaletteState(palette);
          memoryStorage.setItem(EXPENSE_PALETTE_STORAGE_KEY, palette);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  // Sync theme from shared user doc listener
  useEffect(() => {
    const pref = resolveThemePreference((data as Record<string, unknown>)?.themeMode, data?.theme, system);
    if (pref) {
      themeResolved.current = true;
      setThemeNameState(pref.name);
      memoryStorage.setItem(THEME_STORAGE_KEY, pref.name);
      void AsyncStorage.setItem(THEME_STORAGE_KEY, pref.name);
      if (pref.mode) setThemeModeState(pref.mode);
    }
    if (isAccentColorName((data as Record<string, unknown>)?.accentColor)) {
      const acc = (data as Record<string, unknown>).accentColor as AccentColorName;
      setAccentColorState(acc);
      memoryStorage.setItem(ACCENT_STORAGE_KEY, acc);
      void AsyncStorage.setItem(ACCENT_STORAGE_KEY, acc);
    }
  }, [data, system]);

  // SPENDLY-618: palette sync, kept apart so a device appearance change does not rerun it.
  useEffect(() => {
    const palette = acceptRemotePalette(
      (data as Record<string, unknown>)?.expensePalette,
      pendingPalette.pendingFor(realUser?.uid ?? null),
      // Only a document read for the signed-in account (not the previous one mid-switch).
      Boolean(realUser) && !userDocLoading && !userDocError
    );
    if (palette) {
      paletteResolved.current = true;
      setExpensePaletteState(palette);
      memoryStorage.setItem(EXPENSE_PALETTE_STORAGE_KEY, palette);
      void AsyncStorage.setItem(EXPENSE_PALETTE_STORAGE_KEY, palette);
    }
  }, [data, pendingPalette, realUser, userDocLoading, userDocError]);

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
      themeResolved.current = true;
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
      themeResolved.current = true;
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

  const setExpensePalette = useCallback(
    (palette: ExpensePaletteName) => {
      paletteResolved.current = true;
      const token = pendingPalette.begin(realUser?.uid ?? null, palette);
      setExpensePaletteState(palette);
      try {
        memoryStorage.setItem(EXPENSE_PALETTE_STORAGE_KEY, palette);
      } catch {
        /* ignore */
      }
      void AsyncStorage.setItem(EXPENSE_PALETTE_STORAGE_KEY, palette);

      // Only the newest selection's write clears the marker (handles A → B → A).
      void persistThemeFields({ expensePalette: palette }).finally(() => pendingPalette.complete(token));
    },
    [pendingPalette, persistThemeFields, realUser]
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
      expensePalette,
      setExpensePalette,
      setThemeName,
      setThemeMode,
      setAccentColor,
      toggleTheme,
    }),
    [themeName, themeMode, accentColor, expensePalette, setExpensePalette, setThemeName, setThemeMode, setAccentColor, toggleTheme]
  );

  return (
    <ThemeContext.Provider value={value}>
      <ShellThemeContext.Provider value={shellTheme}>{children}</ShellThemeContext.Provider>
    </ThemeContext.Provider>
  );
}

function themeUsesOppositeToggle(name: ThemeName): ThemeName {
  return themeUsesDarkPalette(name) ? "light" : "dark";
}

/**
 * SPENDLY-572: renders a subtree in a fixed palette (the Visual First
 * dashboard is always Midnight Emerald) without touching the user's saved
 * theme. Setters pass through, so a theme change inside still updates the
 * app; `themeName` and `theme` are the override's for everything below.
 */
export function ThemeOverride({ themeName, children }: { themeName: ThemeName; children: ReactNode }) {
  const parent = useTheme();
  const value = useMemo<ThemeContextValue>(
    () => ({ ...parent, theme: createTheme(themeName, parent.accentColor), themeName }),
    [parent, themeName]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** SPENDLY-604: pins root-level hosts to `name` while the calling shell is mounted. */
export function useRegisterShellTheme(name: ThemeName) {
  const { setName } = useContext(ShellThemeContext);
  useEffect(() => {
    setName(name);
    return () => setName(null);
  }, [name, setName]);
}

/** Renders `children` in the registered shell palette, or unchanged when none is. */
export function ShellThemeScope({ children }: { children: ReactNode }) {
  const { name } = useContext(ShellThemeContext);
  return name ? <ThemeOverride themeName={name}>{children}</ThemeOverride> : <>{children}</>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within AppThemeProvider");
  }
  return ctx;
}

