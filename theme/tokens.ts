/**
 * Design tokens — light & dark palettes.
 * Named themes beyond light/dark map onto these palettes (full CSS themes later).
 */

export type ThemeName =
  | "light"
  | "dark"
  | "midnight"
  | "midnight-olive"
  | "vintage-parchment"
  | "sakura-bloom"
  | "cyberpunk"
  | "nordic"
  | "deep-sea"
  | "glass-3d"
  | "claymorphism";

export const THEME_NAMES: ThemeName[] = [
  "light",
  "dark",
  "midnight",
  "midnight-olive",
  "vintage-parchment",
  "sakura-bloom",
  "cyberpunk",
  "nordic",
  "deep-sea",
  "glass-3d",
  "claymorphism",
];

const DARK_APPEARANCE: ReadonlySet<ThemeName> = new Set([
  "dark",
  "midnight",
  "midnight-olive",
  "cyberpunk",
  "deep-sea",
  "glass-3d",
]);

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEME_NAMES as string[]).includes(value);
}

export function themeUsesDarkPalette(name: ThemeName): boolean {
  return DARK_APPEARANCE.has(name);
}

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
  /** MD3 container roles */
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  onSecondaryContainer: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
  scrim: string;
  info: string;
  infoForeground: string;
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
  /** Bottom-sheet / large surface corner radius (MD3 extra-large) */
  sheet: number;
};

export type TypographyTokens = {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
};

export type FontFamilyTokens = {
  regular: string;
  medium: string;
  semibold: string;
  bold: string;
};

export type ElevationLevel = {
  elevation: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowRadius: number;
  shadowOffset: { width: number; height: number };
};

export type ElevationTokens = {
  0: ElevationLevel;
  1: ElevationLevel;
  2: ElevationLevel;
  3: ElevationLevel;
  4: ElevationLevel;
  5: ElevationLevel;
};

export type IconSizeTokens = {
  sm: number;
  md: number;
  lg: number;
  xl: number;
};

export type ChartTokens = {
  categorical: string[];
  positive: string;
  negative: string;
};

/** MD3-flavored type scale — additive to the legacy `typography` numeric scale. */
export type TypeScaleEntry = {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
};

export type TypeScaleTokens = {
  titleLarge: TypeScaleEntry;
  titleMedium: TypeScaleEntry;
  titleSmall: TypeScaleEntry;
  bodyLarge: TypeScaleEntry;
  bodyMedium: TypeScaleEntry;
  bodySmall: TypeScaleEntry;
  labelLarge: TypeScaleEntry;
  labelMedium: TypeScaleEntry;
  labelSmall: TypeScaleEntry;
};

export type ThemeMode = "system" | "light" | "dark" | "custom";

export type ThemeTokens = {
  name: ThemeName;
  accentColor: AccentColorName;
  colors: ColorTokens;
  space: SpaceTokens;
  radius: RadiusTokens;
  typography: TypographyTokens;
  fontFamily: FontFamilyTokens;
  elevation: ElevationTokens;
  iconSize: IconSizeTokens;
  chart: ChartTokens;
  type: TypeScaleTokens;
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
  sheet: 28,
};

const typography: TypographyTokens = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
};

/** Inter, loaded via @expo-google-fonts/inter in app/_layout.tsx. Falls back to the system font until loaded. */
const fontFamily: FontFamilyTokens = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

function elevationLevel(
  elevation: number,
  shadowOpacity: number,
  shadowRadius: number,
  offsetY: number
): ElevationLevel {
  return {
    elevation,
    shadowColor: "#000000",
    shadowOpacity,
    shadowRadius,
    shadowOffset: { width: 0, height: offsetY },
  };
}

/** MD3 elevation levels 0–5 (Android `elevation` + cross-platform shadow*). */
const elevation: ElevationTokens = {
  0: elevationLevel(0, 0, 0, 0),
  1: elevationLevel(1, 0.08, 3, 1),
  2: elevationLevel(3, 0.1, 6, 2),
  3: elevationLevel(6, 0.14, 10, 4),
  4: elevationLevel(8, 0.16, 12, 6),
  5: elevationLevel(12, 0.2, 16, 8),
};

const iconSize: IconSizeTokens = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

function typeEntry(fontSize: number, lineHeight: number, family: string): TypeScaleEntry {
  return { fontSize, lineHeight, fontFamily: family };
}

const type: TypeScaleTokens = {
  titleLarge: typeEntry(22, 28, fontFamily.semibold),
  titleMedium: typeEntry(18, 24, fontFamily.semibold),
  titleSmall: typeEntry(16, 22, fontFamily.semibold),
  bodyLarge: typeEntry(16, 24, fontFamily.regular),
  bodyMedium: typeEntry(14, 20, fontFamily.regular),
  bodySmall: typeEntry(12, 16, fontFamily.regular),
  labelLarge: typeEntry(14, 20, fontFamily.medium),
  labelMedium: typeEntry(12, 16, fontFamily.medium),
  labelSmall: typeEntry(11, 16, fontFamily.medium),
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
  primaryContainer: "#E4E1FF",
  onPrimaryContainer: "#150066",
  secondaryContainer: "#E7EAF3",
  onSecondaryContainer: "#1E293B",
  surfaceVariant: "#EEF1F6",
  onSurfaceVariant: "#44464F",
  outline: "#C9CDD6",
  outlineVariant: "#E1E4EA",
  scrim: "rgba(15, 23, 42, 0.5)",
  info: "#3B82F6",
  infoForeground: "#F8FAFC",
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
  primaryContainer: "#2C2470",
  onPrimaryContainer: "#E4E1FF",
  secondaryContainer: "#1F2436",
  onSecondaryContainer: "#E2E8F0",
  surfaceVariant: "#181C2C",
  onSurfaceVariant: "#C5CAD6",
  outline: "#3A3F55",
  outlineVariant: "#252A3D",
  scrim: "rgba(0, 0, 0, 0.7)",
  info: "#60A5FA",
  infoForeground: "#080A14",
};

export type AccentColorName =
  | "indigo"
  | "emerald"
  | "sapphire"
  | "amethyst"
  | "amber"
  | "rose"
  | "teal"
  | "orange"
  | "slate";

export const ACCENT_COLOR_NAMES: AccentColorName[] = [
  "indigo",
  "emerald",
  "sapphire",
  "amethyst",
  "amber",
  "rose",
  "teal",
  "orange",
  "slate",
];

export type AccentPalette = {
  name: AccentColorName;
  label: string;
  hex: string;
  light: {
    primary: string;
    primaryForeground: string;
    tint: string;
    tabIconSelected: string;
    primaryContainer: string;
    onPrimaryContainer: string;
  };
  dark: {
    primary: string;
    primaryForeground: string;
    tint: string;
    tabIconSelected: string;
    primaryContainer: string;
    onPrimaryContainer: string;
  };
};

export const ACCENT_PALETTES: Record<AccentColorName, AccentPalette> = {
  indigo: {
    name: "indigo",
    label: "Indigo",
    hex: "#4F46FF",
    light: {
      primary: "#4F46FF",
      primaryForeground: "#F8FAFC",
      tint: "#4F46FF",
      tabIconSelected: "#4F46FF",
      primaryContainer: "#E4E1FF",
      onPrimaryContainer: "#150066",
    },
    dark: {
      primary: "#6B63FF",
      primaryForeground: "#080A14",
      tint: "#6B63FF",
      tabIconSelected: "#6B63FF",
      primaryContainer: "#2C2470",
      onPrimaryContainer: "#E4E1FF",
    },
  },
  emerald: {
    name: "emerald",
    label: "Emerald",
    hex: "#10B981",
    light: {
      primary: "#059669",
      primaryForeground: "#FFFFFF",
      tint: "#059669",
      tabIconSelected: "#059669",
      primaryContainer: "#D1FAE5",
      onPrimaryContainer: "#064E3B",
    },
    dark: {
      primary: "#10B981",
      primaryForeground: "#080A14",
      tint: "#10B981",
      tabIconSelected: "#10B981",
      primaryContainer: "#064E3B",
      onPrimaryContainer: "#A7F3D0",
    },
  },
  sapphire: {
    name: "sapphire",
    label: "Sapphire",
    hex: "#3B82F6",
    light: {
      primary: "#2563EB",
      primaryForeground: "#FFFFFF",
      tint: "#2563EB",
      tabIconSelected: "#2563EB",
      primaryContainer: "#DBEAFE",
      onPrimaryContainer: "#1E3A8A",
    },
    dark: {
      primary: "#3B82F6",
      primaryForeground: "#080A14",
      tint: "#3B82F6",
      tabIconSelected: "#3B82F6",
      primaryContainer: "#1E3A8A",
      onPrimaryContainer: "#BFDBFE",
    },
  },
  amethyst: {
    name: "amethyst",
    label: "Amethyst",
    hex: "#8B5CF6",
    light: {
      primary: "#7C3AED",
      primaryForeground: "#FFFFFF",
      tint: "#7C3AED",
      tabIconSelected: "#7C3AED",
      primaryContainer: "#EDE9FE",
      onPrimaryContainer: "#4C1D95",
    },
    dark: {
      primary: "#8B5CF6",
      primaryForeground: "#080A14",
      tint: "#8B5CF6",
      tabIconSelected: "#8B5CF6",
      primaryContainer: "#4C1D95",
      onPrimaryContainer: "#DDD6FE",
    },
  },
  amber: {
    name: "amber",
    label: "Amber Gold",
    hex: "#F59E0B",
    light: {
      primary: "#D97706",
      primaryForeground: "#FFFFFF",
      tint: "#D97706",
      tabIconSelected: "#D97706",
      primaryContainer: "#FEF3C7",
      onPrimaryContainer: "#78350F",
    },
    dark: {
      primary: "#F59E0B",
      primaryForeground: "#080A14",
      tint: "#F59E0B",
      tabIconSelected: "#F59E0B",
      primaryContainer: "#78350F",
      onPrimaryContainer: "#FDE68A",
    },
  },
  rose: {
    name: "rose",
    label: "Rose",
    hex: "#F43F5E",
    light: {
      primary: "#E11D48",
      primaryForeground: "#FFFFFF",
      tint: "#E11D48",
      tabIconSelected: "#E11D48",
      primaryContainer: "#FFE4E6",
      onPrimaryContainer: "#881337",
    },
    dark: {
      primary: "#F43F5E",
      primaryForeground: "#080A14",
      tint: "#F43F5E",
      tabIconSelected: "#F43F5E",
      primaryContainer: "#881337",
      onPrimaryContainer: "#FECDD3",
    },
  },
  teal: {
    name: "teal",
    label: "Teal Mint",
    hex: "#14B8A6",
    light: {
      primary: "#0D9488",
      primaryForeground: "#FFFFFF",
      tint: "#0D9488",
      tabIconSelected: "#0D9488",
      primaryContainer: "#CCFBF1",
      onPrimaryContainer: "#134E4A",
    },
    dark: {
      primary: "#14B8A6",
      primaryForeground: "#080A14",
      tint: "#14B8A6",
      tabIconSelected: "#14B8A6",
      primaryContainer: "#134E4A",
      onPrimaryContainer: "#99F6E4",
    },
  },
  orange: {
    name: "orange",
    label: "Sunset Orange",
    hex: "#F97316",
    light: {
      primary: "#EA580C",
      primaryForeground: "#FFFFFF",
      tint: "#EA580C",
      tabIconSelected: "#EA580C",
      primaryContainer: "#FFEDD5",
      onPrimaryContainer: "#7C2D12",
    },
    dark: {
      primary: "#F97316",
      primaryForeground: "#080A14",
      tint: "#F97316",
      tabIconSelected: "#F97316",
      primaryContainer: "#7C2D12",
      onPrimaryContainer: "#FED7AA",
    },
  },
  slate: {
    name: "slate",
    label: "Monochrome Slate",
    hex: "#64748B",
    light: {
      primary: "#334155",
      primaryForeground: "#FFFFFF",
      tint: "#334155",
      tabIconSelected: "#334155",
      primaryContainer: "#E2E8F0",
      onPrimaryContainer: "#0F172A",
    },
    dark: {
      primary: "#94A3B8",
      primaryForeground: "#080A14",
      tint: "#94A3B8",
      tabIconSelected: "#94A3B8",
      primaryContainer: "#1E293B",
      onPrimaryContainer: "#E2E8F0",
    },
  },
};

export function isAccentColorName(value: unknown): value is AccentColorName {
  return (
    typeof value === "string" &&
    (ACCENT_COLOR_NAMES as string[]).includes(value)
  );
}

export function createTheme(
  name: ThemeName,
  accentColor: AccentColorName = "indigo"
): ThemeTokens {
  const isDark = themeUsesDarkPalette(name);
  const baseColors = isDark ? { ...darkColors } : { ...lightColors };
  const palette = ACCENT_PALETTES[accentColor] || ACCENT_PALETTES.indigo;
  const accentOverrides = isDark ? palette.dark : palette.light;

  const colors: ColorTokens = {
    ...baseColors,
    ...accentOverrides,
  };

  const chartColors: ChartTokens = {
    categorical: [
      palette.hex,
      "#25965A",
      "#F59E0B",
      "#EF4444",
      "#3B82F6",
      "#EC4899",
      "#14B8A6",
    ],
    positive: "#25965A",
    negative: "#EF4444",
  };

  return {
    name,
    accentColor,
    colors,
    space,
    radius,
    typography,
    fontFamily,
    elevation,
    iconSize,
    chart: chartColors,
    type,
  };
}

export const THEME_STORAGE_KEY = "expense-tracker-theme";
export const ACCENT_STORAGE_KEY = "expense-tracker-accent-color";

export const THEME_LABELS: Record<ThemeName, string> = {
  light: "Light",
  dark: "Dark",
  midnight: "Midnight",
  "midnight-olive": "Midnight Olive",
  "vintage-parchment": "Vintage Parchment",
  "sakura-bloom": "Sakura Bloom",
  cyberpunk: "Cyberpunk",
  nordic: "Nordic",
  "deep-sea": "Deep Sea",
  "glass-3d": "Glass 3D",
  claymorphism: "Claymorphism",
};
