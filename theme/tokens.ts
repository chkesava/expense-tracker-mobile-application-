/**
 * Design tokens — light & dark only for Phase 1.
 * Derived from expense-tracker `src/index.css` :root / .dark HSL values (converted to hex).
 */

export type ThemeName = "light" | "dark";

export type ColorTokens = {
  background: string;
  foreground: string;
  card: string;
  cardForeground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  border: string;
  tint: string;
  tabIconDefault: string;
  tabIconSelected: string;
};

export type SpaceTokens = {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
};

export type RadiusTokens = {
  sm: number;
  md: number;
  lg: number;
  xl: number;
  full: number;
};

export type TypographyTokens = {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
};

export type ThemeTokens = {
  name: ThemeName;
  colors: ColorTokens;
  space: SpaceTokens;
  radius: RadiusTokens;
  typography: TypographyTokens;
};

const space: SpaceTokens = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

const radius: RadiusTokens = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

const typography: TypographyTokens = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
};

/** Light — electric indigo primary (web :root) */
export const lightColors: ColorTokens = {
  background: "#F7F9FC",
  foreground: "#020617",
  card: "#FFFFFF",
  cardForeground: "#0B1220",
  primary: "#4F46FF",
  primaryForeground: "#F8FAFC",
  secondary: "#F1F5F9",
  secondaryForeground: "#0F172A",
  muted: "#F1F5F9",
  mutedForeground: "#6B7280",
  destructive: "#EF4444",
  destructiveForeground: "#F8FAFC",
  success: "#25965A",
  successForeground: "#FFFFFF",
  warning: "#F59E0B",
  warningForeground: "#1C1917",
  border: "#E5E7EB",
  tint: "#4F46FF",
  tabIconDefault: "#9CA3AF",
  tabIconSelected: "#4F46FF",
};

/** Dark — OLED indigo (web .dark) */
export const darkColors: ColorTokens = {
  background: "#080A14",
  foreground: "#F8FAFC",
  card: "#0C0F1A",
  cardForeground: "#F8FAFC",
  primary: "#6B63FF",
  primaryForeground: "#080A14",
  secondary: "#15192A",
  secondaryForeground: "#F8FAFC",
  muted: "#15192A",
  mutedForeground: "#A3B0C2",
  destructive: "#C53030",
  destructiveForeground: "#F8FAFC",
  success: "#34B37A",
  successForeground: "#080A14",
  warning: "#FBBF24",
  warningForeground: "#1C1917",
  border: "#1A1F33",
  tint: "#6B63FF",
  tabIconDefault: "#6B7280",
  tabIconSelected: "#6B63FF",
};

export function createTheme(name: ThemeName): ThemeTokens {
  return {
    name,
    colors: name === "dark" ? darkColors : lightColors,
    space,
    radius,
    typography,
  };
}

export const THEME_STORAGE_KEY = "expense-tracker-theme";
