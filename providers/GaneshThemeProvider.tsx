import { useMemo, type ReactNode } from "react";
import { StatusBar } from "expo-status-bar";

import { createGaneshTheme } from "@/theme/ganeshPalette";
import { ThemeContext, useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/**
 * Gives the Ganesh Seva subtree its own palette.
 *
 * `useTheme()` reads a React context, so republishing that context here swaps
 * the palette for every Ganesh screen at once — no screen imports change, and
 * nothing outside `app/(ganesh*)` is affected. Mounted in
 * `app/(ganesh)/_layout.tsx` and `app/(ganesh-auth)/_layout.tsx`.
 *
 * The parent `AppThemeProvider` stays the single source of truth for *whether*
 * the user is in light or dark mode, and for persisting that choice. This
 * provider only decides what those two modes look like inside Ganesh, and
 * deliberately drops the user's accent colour: a pandal's app should look the
 * same to every committee member.
 */
export function GaneshThemeProvider({ children }: { children: ReactNode }) {
  const parent = useTheme();
  const isDark = themeUsesDarkPalette(parent.themeName);

  const value = useMemo(
    () => ({ ...parent, theme: createGaneshTheme(parent.theme, isDark) }),
    [parent, isDark]
  );

  return (
    <ThemeContext.Provider value={value}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {children}
    </ThemeContext.Provider>
  );
}
