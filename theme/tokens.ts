/**
 * Design tokens. `light` and `dark` serve Ganesh Seva and Nutrition; the four
 * dark `midnight-*` themes and the six light `expense-*` themes are the
 * Expense palettes (SPENDLY-618, SPENDLY-677). The other presets were removed
 * in SPENDLY-619; a stored value naming one is ignored.
 */

export type ThemeName =
  | "light"
  | "dark"
  | "midnight-emerald"
  | "midnight-forest"
  | "midnight-plum"
  | "midnight-cocoa"
  | "expense-rose"
  | "expense-violet"
  | "expense-ocean"
  | "expense-sunset"
  | "expense-lavender"
  | "expense-sage";

export const THEME_NAMES: ThemeName[] = [
  "light",
  "dark",
  "midnight-emerald",
  "midnight-forest",
  "midnight-plum",
  "midnight-cocoa",
  "expense-rose",
  "expense-violet",
  "expense-ocean",
  "expense-sunset",
  "expense-lavender",
  "expense-sage",
];

const DARK_APPEARANCE: ReadonlySet<ThemeName> = new Set([
  "dark",
  "midnight-emerald",
  "midnight-forest",
  "midnight-plum",
  "midnight-cocoa",
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
  /**
   * SPENDLY-677: the brand highlight, kept apart from `primary` (the main
   * action). For decoration and non-text marks (rings, dots, chart series);
   * text in the accent colour uses `tint`, which always reads at AA.
   */
  accent: string;
  accentForeground: string;
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
  /**
   * SPENDLY-677: per-palette ramps for the spending slices
   * (`spendingSliceColor`) and category bars (`categoryRamp`). Only the light
   * Expense palettes set them; every other theme keeps the shared ramps
   * those helpers build from its primary.
   */
  slices?: string[];
  bars?: string[];
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

/**
 * A saved theme mode, or null if it isn't one. SPENDLY-619: "custom" only
 * makes sense with a theme that still exists. A preset removed in 619 is
 * ignored, so its "custom" mode becomes "system" and the app follows the
 * device's light/dark setting again.
 */
export function normalizeThemeMode(mode: unknown, theme: unknown): ThemeMode | null {
  if (mode === "custom") return isThemeName(theme) ? "custom" : "system";
  return mode === "system" || mode === "light" || mode === "dark" ? mode : null;
}

/**
 * The theme a saved preference resolves to, with the theme name always
 * derived from the mode, so the two can never disagree: `system` follows
 * the device, `light`/`dark` are themselves, `custom` keeps its (valid)
 * theme. A valid theme with no valid mode is kept as it is. Null when
 * neither is usable.
 */
export function resolveThemePreference(
  mode: unknown,
  theme: unknown,
  system: string | null | undefined
): { mode: ThemeMode | null; name: ThemeName } | null {
  const normalized = normalizeThemeMode(mode, theme);
  if (normalized === "system") return { mode: normalized, name: system === "dark" ? "dark" : "light" };
  if (normalized === "light" || normalized === "dark") return { mode: normalized, name: normalized };
  if (normalized === "custom") return { mode: normalized, name: theme as ThemeName };
  return isThemeName(theme) ? { mode: null, name: theme } : null;
}

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

export const space: SpaceTokens = {
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
  accent: "#4F46FF",
  accentForeground: "#F8FAFC",
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
  accent: "#6B63FF",
  accentForeground: "#080A14",
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

/**
 * Midnight Slate (SPENDLY-617, replacing SPENDLY-532's emerald) — the Expense
 * preset. Six blue-greys carry the whole surface and the brand:
 *
 *   #06141B background · #11212D cards · #253745 raised surfaces and borders
 *   #4A5C6A lines only (too faint for text) · #9BA8AB secondary text
 *   #CCD0CF primary text and the accent
 *
 * plus one in-between step, #1A2B38, for secondaryContainer so nested
 * containers don't flatten into the cards.
 *
 * Colour is kept only where it means something about money: green for money
 * in and gains, red for losses, overspend and destructive actions, amber for
 * warnings, blue for info and plain spending.
 *
 * The theme id stays `midnight-emerald` so saved preferences need no
 * migration; only the label and the values changed.
 */
export const midnightSlateColors: ColorTokens = {
  background: "#06141B",
  foreground: "#CCD0CF",
  card: "#11212D",
  cardForeground: "#CCD0CF",
  primary: "#CCD0CF",
  primaryForeground: "#06141B",
  secondary: "#253745",
  secondaryForeground: "#CCD0CF",
  muted: "#253745",
  mutedForeground: "#9BA8AB",
  destructive: "#FF7777",
  destructiveForeground: "#1A0707",
  success: "#35E889",
  successForeground: "#04130C",
  warning: "#F5C451",
  warningForeground: "#1C1407",
  border: "#253745",
  tint: "#CCD0CF",
  tabIconDefault: "#9BA8AB",
  tabIconSelected: "#CCD0CF",
  accent: "#CCD0CF",
  accentForeground: "#06141B",
  primaryContainer: "#253745",
  onPrimaryContainer: "#CCD0CF",
  secondaryContainer: "#1A2B38",
  onSecondaryContainer: "#CCD0CF",
  surfaceVariant: "#253745",
  onSurfaceVariant: "#9BA8AB",
  outline: "#4A5C6A",
  outlineVariant: "#253745",
  scrim: "rgba(0, 0, 0, 0.72)",
  info: "#78B8FF",
  infoForeground: "#06111F",
};

/**
 * SPENDLY-618: a six-colour dark palette, darkest first, plus the derived
 * steps it needs. Every Expense palette maps onto the tokens the same way as
 * Midnight Slate, so screens never special-case a palette:
 *
 *   background · card · step (secondaryContainer) · raised (secondary, muted,
 *   surfaceVariant) · edge (border, outlineVariant, primaryContainer) ·
 *   line (outline only) · muted text · text and accent
 *
 * `raised` is the palette's third colour unless that is too light for muted
 * text at 4.5:1, in which case it is a darker mix of card and third colour.
 * Money and status colours are shared by every palette (SPENDLY-617).
 */
export type ExpensePaletteSpec = {
  background: string;
  card: string;
  step: string;
  raised: string;
  edge: string;
  line: string;
  mutedText: string;
  text: string;
};

export function expensePaletteColors(p: ExpensePaletteSpec): ColorTokens {
  return {
    background: p.background,
    foreground: p.text,
    card: p.card,
    cardForeground: p.text,
    primary: p.text,
    primaryForeground: p.background,
    secondary: p.raised,
    secondaryForeground: p.text,
    muted: p.raised,
    mutedForeground: p.mutedText,
    destructive: "#FF7777",
    destructiveForeground: "#1A0707",
    success: "#35E889",
    successForeground: "#04130C",
    warning: "#F5C451",
    warningForeground: "#1C1407",
    border: p.edge,
    tint: p.text,
    tabIconDefault: p.mutedText,
    tabIconSelected: p.text,
    accent: p.text,
    accentForeground: p.background,
    primaryContainer: p.edge,
    onPrimaryContainer: p.text,
    secondaryContainer: p.step,
    onSecondaryContainer: p.text,
    surfaceVariant: p.raised,
    onSurfaceVariant: p.mutedText,
    outline: p.line,
    outlineVariant: p.edge,
    scrim: "rgba(0, 0, 0, 0.72)",
    info: "#78B8FF",
    infoForeground: "#06111F",
  };
}

/** Forest: #051F20 #0B2B26 #163832 #235347 #8EB69B #DAF1DE. */
export const midnightForestColors = expensePaletteColors({
  background: "#051F20",
  card: "#0B2B26",
  step: "#11322C",
  raised: "#163832",
  edge: "#163832",
  line: "#235347",
  mutedText: "#8EB69B",
  text: "#DAF1DE",
});

/** Plum: #17151C #292531 #45404F #716879 #AAA2B3 #E2DDE7. #45404F is too light under muted text, so raised is #373340. */
export const midnightPlumColors = expensePaletteColors({
  background: "#17151C",
  card: "#292531",
  step: "#302C39",
  raised: "#373340",
  edge: "#45404F",
  line: "#716879",
  mutedText: "#AAA2B3",
  text: "#E2DDE7",
});

/** Cocoa: #211B1A #382A28 #60433D #916B60 #C1A094 #E8D8CE. #60433D is too light under muted text, so raised is #483430. */
export const midnightCocoaColors = expensePaletteColors({
  background: "#211B1A",
  card: "#382A28",
  step: "#402F2C",
  raised: "#483430",
  edge: "#60433D",
  line: "#916B60",
  mutedText: "#C1A094",
  text: "#E8D8CE",
});

/**
 * SPENDLY-677: the six light Expense palettes. Each comes from a five- or
 * six-colour reference (primary, accent, secondary, surface, background) plus
 * the steps a full token set needs. theme/expensePalettes.test.ts holds every
 * text pair to WCAG AA.
 *
 *   background · card (white, or a lifted tone) · container (secondary,
 *   muted, surfaceVariant, primaryContainer) · step (secondaryContainer) ·
 *   edge (border, outlineVariant) · line (outline only) · text · muted text
 *   action + actionText: the main button (primary / primaryForeground)
 *   accent: the raw brand highlight, for non-text marks
 *   accentText: the accent darkened to read as text (tint, active tab)
 *   brand: the reference's deep primary, as text on the primary container
 *
 * Money and status colours are one shared light set, so gains, losses and
 * warnings mean the same thing in every light palette.
 */
export type ExpenseLightPaletteSpec = {
  background: string;
  card: string;
  container: string;
  step: string;
  edge: string;
  line: string;
  text: string;
  mutedText: string;
  action: string;
  actionText: string;
  accent: string;
  accentText: string;
  brand: string;
};

export const EXPENSE_LIGHT_STATUS = {
  success: "#15803D",
  destructive: "#C81E1E",
  warning: "#B45309",
  info: "#1D4ED8",
} as const;

export function expenseLightPaletteColors(p: ExpenseLightPaletteSpec): ColorTokens {
  return {
    background: p.background,
    foreground: p.text,
    card: p.card,
    cardForeground: p.text,
    primary: p.action,
    primaryForeground: p.actionText,
    secondary: p.container,
    secondaryForeground: p.text,
    muted: p.container,
    mutedForeground: p.mutedText,
    destructive: EXPENSE_LIGHT_STATUS.destructive,
    destructiveForeground: "#FFFFFF",
    success: EXPENSE_LIGHT_STATUS.success,
    successForeground: "#FFFFFF",
    warning: EXPENSE_LIGHT_STATUS.warning,
    warningForeground: "#FFFFFF",
    border: p.edge,
    tint: p.accentText,
    tabIconDefault: p.mutedText,
    tabIconSelected: p.accentText,
    accent: p.accent,
    accentForeground: p.actionText,
    primaryContainer: p.container,
    onPrimaryContainer: p.brand,
    secondaryContainer: p.step,
    onSecondaryContainer: p.text,
    surfaceVariant: p.container,
    onSurfaceVariant: p.mutedText,
    outline: p.line,
    outlineVariant: p.edge,
    scrim: "rgba(15, 15, 25, 0.45)",
    info: EXPENSE_LIGHT_STATUS.info,
    infoForeground: "#FFFFFF",
  };
}

/** Rose Elegance: #6D0D3F #EC4899 #F9A8D4 #FCE7F3 #FFF9FB. Burgundy actions, pink highlights. */
export const roseEleganceColors = expenseLightPaletteColors({
  background: "#FFF9FB",
  card: "#FFFFFF",
  container: "#FCE7F3",
  step: "#FDF1F7",
  edge: "#F6CFE2",
  line: "#F9A8D4",
  text: "#2A0717",
  mutedText: "#7A4560",
  action: "#6D0D3F",
  actionText: "#FFFFFF",
  accent: "#EC4899",
  accentText: "#BE185D",
  brand: "#6D0D3F",
});

/** Royal Violet: #5B21B6 #8B5CF6 #C7B3FF #EDE9FE #FAF9FF. Deep violet actions, purple highlights. */
export const royalVioletColors = expenseLightPaletteColors({
  background: "#FAF9FF",
  card: "#FFFFFF",
  container: "#EDE9FE",
  step: "#F4F1FE",
  edge: "#DDD3FD",
  line: "#C7B3FF",
  text: "#1E1035",
  mutedText: "#5E5674",
  action: "#5B21B6",
  actionText: "#FFFFFF",
  accent: "#8B5CF6",
  accentText: "#6D28D9",
  brand: "#5B21B6",
});

/** Ocean Blue: #0B1F3B #2563EB #60A5FA #DBEAFE #F0F7FF. Navy ink, blue actions. */
export const oceanBlueColors = expenseLightPaletteColors({
  background: "#F0F7FF",
  card: "#FFFFFF",
  container: "#DBEAFE",
  step: "#E8F1FE",
  edge: "#C6DCFB",
  line: "#60A5FA",
  text: "#0B1F3B",
  mutedText: "#4A5D77",
  action: "#2563EB",
  actionText: "#FFFFFF",
  accent: "#2563EB",
  accentText: "#1D4ED8",
  brand: "#0B1F3B",
});

/** Sunset Orange: #1F1D2B #FF7A00 #FFA94D #FFE4C7 #FFF8EF. Charcoal ink, orange actions with charcoal labels. */
export const sunsetOrangeColors = expenseLightPaletteColors({
  background: "#FFF8EF",
  card: "#FFFFFF",
  container: "#FFE4C7",
  step: "#FFF0DF",
  edge: "#FFD6AD",
  line: "#FFA94D",
  text: "#1F1D2B",
  mutedText: "#675F6E",
  action: "#FF7A00",
  actionText: "#1F1D2B",
  accent: "#FF7A00",
  accentText: "#B84A00",
  brand: "#1F1D2B",
});

/** Lavender Glass: #0D0B2D #5B4BFF #A78BFA #E6E0FF #F7F8FF. Midnight ink, electric indigo actions. */
export const lavenderGlassColors = expenseLightPaletteColors({
  background: "#F7F8FF",
  card: "#FFFFFF",
  container: "#E6E0FF",
  step: "#EFEBFF",
  edge: "#D9D0FF",
  line: "#A78BFA",
  text: "#0D0B2D",
  mutedText: "#57557A",
  action: "#5B4BFF",
  actionText: "#FFFFFF",
  accent: "#5B4BFF",
  accentText: "#4A3AE8",
  brand: "#0D0B2D",
});

/**
 * Midnight Sage: #191D23 #57707A #7B919C #989DAA #C5BAC4 #DEDCDC. #989DAA is
 * too dark for a card, so cards are a lifted #F4F3F3 and #989DAA / #C5BAC4
 * become the line and edge; #57707A is darkened to #45585F for muted text.
 */
export const midnightSageColors = expenseLightPaletteColors({
  background: "#DEDCDC",
  card: "#F4F3F3",
  container: "#E7E2E6",
  step: "#EAE8E8",
  edge: "#C5BAC4",
  line: "#989DAA",
  text: "#191D23",
  mutedText: "#45585F",
  action: "#191D23",
  actionText: "#F4F3F3",
  accent: "#57707A",
  accentText: "#45585F",
  brand: "#191D23",
});

/**
 * SPENDLY-604: every screen under the Expense shell renders in the user's
 * Expense palette (SPENDLY-618), Midnight Slate by default, whatever theme
 * they saved; Ganesh Seva and Nutrition still follow the saved theme. The
 * shell is dark unless the user picks a light palette (SPENDLY-677).
 */
export const EXPENSE_THEME_NAME: ExpensePaletteName = "midnight-emerald";

export type ExpensePaletteName =
  | "midnight-emerald"
  | "midnight-forest"
  | "midnight-plum"
  | "midnight-cocoa"
  | "expense-rose"
  | "expense-violet"
  | "expense-ocean"
  | "expense-sunset"
  | "expense-lavender"
  | "expense-sage";

export const EXPENSE_DARK_PALETTE_NAMES: ExpensePaletteName[] = [
  "midnight-emerald",
  "midnight-forest",
  "midnight-plum",
  "midnight-cocoa",
];

export const EXPENSE_LIGHT_PALETTE_NAMES: ExpensePaletteName[] = [
  "expense-rose",
  "expense-violet",
  "expense-ocean",
  "expense-sunset",
  "expense-lavender",
  "expense-sage",
];

export const EXPENSE_PALETTE_NAMES: ExpensePaletteName[] = [
  ...EXPENSE_DARK_PALETTE_NAMES,
  ...EXPENSE_LIGHT_PALETTE_NAMES,
];

export const EXPENSE_PALETTE_COLORS: Record<ExpensePaletteName, ColorTokens> = {
  "midnight-emerald": midnightSlateColors,
  "midnight-forest": midnightForestColors,
  "midnight-plum": midnightPlumColors,
  "midnight-cocoa": midnightCocoaColors,
  "expense-rose": roseEleganceColors,
  "expense-violet": royalVioletColors,
  "expense-ocean": oceanBlueColors,
  "expense-sunset": sunsetOrangeColors,
  "expense-lavender": lavenderGlassColors,
  "expense-sage": midnightSageColors,
};

/**
 * The source colours of each palette, for the picker. Dark palettes list six,
 * darkest first. Light palettes follow the reference order: primary, accent,
 * secondary, surface, (Sage's muted,) background.
 */
export const EXPENSE_PALETTE_SWATCHES: Record<ExpensePaletteName, readonly string[]> = {
  "midnight-emerald": ["#06141B", "#11212D", "#253745", "#4A5C6A", "#9BA8AB", "#CCD0CF"],
  "midnight-forest": ["#051F20", "#0B2B26", "#163832", "#235347", "#8EB69B", "#DAF1DE"],
  "midnight-plum": ["#17151C", "#292531", "#45404F", "#716879", "#AAA2B3", "#E2DDE7"],
  "midnight-cocoa": ["#211B1A", "#382A28", "#60433D", "#916B60", "#C1A094", "#E8D8CE"],
  "expense-rose": ["#6D0D3F", "#EC4899", "#F9A8D4", "#FCE7F3", "#FFF9FB"],
  "expense-violet": ["#5B21B6", "#8B5CF6", "#C7B3FF", "#EDE9FE", "#FAF9FF"],
  "expense-ocean": ["#0B1F3B", "#2563EB", "#60A5FA", "#DBEAFE", "#F0F7FF"],
  "expense-sunset": ["#1F1D2B", "#FF7A00", "#FFA94D", "#FFE4C7", "#FFF8EF"],
  "expense-lavender": ["#0D0B2D", "#5B4BFF", "#A78BFA", "#E6E0FF", "#F7F8FF"],
  "expense-sage": ["#191D23", "#57707A", "#7B919C", "#989DAA", "#C5BAC4", "#DEDCDC"],
};

export function isExpensePaletteName(value: unknown): value is ExpensePaletteName {
  return typeof value === "string" && (EXPENSE_PALETTE_NAMES as string[]).includes(value);
}

/** A stored value, or the default when it is missing or unknown. */
export function resolveExpensePalette(value: unknown): ExpensePaletteName {
  return isExpensePaletteName(value) ? value : EXPENSE_THEME_NAME;
}

/**
 * SPENDLY-677: which scheme the vendored Gluestack button and input apply
 * their `dark:` styles for. NativeWind resolves `dark:` from the device
 * (tailwind `darkMode: 'media'`), so a light Expense palette on a dark phone
 * would get the dark styles. Expense palettes pin the scheme to the palette;
 * every other theme keeps following the device as before.
 */
export type GluestackScheme = "device" | "light" | "dark";

export function gluestackSchemeFor(name: ThemeName): GluestackScheme {
  if (!isExpensePaletteName(name)) return "device";
  return themeUsesDarkPalette(name) ? "dark" : "light";
}

/** Presets that ship their own accent; the accent picker does not apply. */
export function themeOwnsAccent(name: ThemeName): boolean {
  return isExpensePaletteName(name);
}

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

/**
 * Category series carry no money meaning, so they leave out the green and
 * red reserved for gains and losses (SPENDLY-617). Light palettes lead with
 * their own accent and deep primary, then fill with hues that read on a
 * light card (SPENDLY-677). The pale reference secondaries are left out:
 * they vanish on white.
 */
const EXPENSE_LIGHT_CHART_FILL = ["#0E7490", "#7C3AED", "#C2410C", "#DB2777", "#2563EB", "#A16207", "#475569"];

/**
 * Category ramps for the light palettes, led by each palette's own hues. No
 * money green or red; every stop holds 3:1 on the palette's card.
 */
const EXPENSE_LIGHT_CATEGORY_RAMPS: Partial<Record<ExpensePaletteName, string[]>> = {
  "expense-rose": ["#DB2777", "#6D0D3F", "#9333EA", "#D97706", "#0E7490", "#64748B"],
  "expense-violet": ["#7C3AED", "#5B21B6", "#DB2777", "#0E7490", "#D97706", "#64748B"],
  "expense-ocean": ["#2563EB", "#0B1F3B", "#0891B2", "#7C3AED", "#D97706", "#DB2777"],
  "expense-sunset": ["#EA580C", "#0E7490", "#7C3AED", "#BE185D", "#A16207", "#475569"],
  "expense-lavender": ["#5B4BFF", "#0891B2", "#9333EA", "#DB2777", "#D97706", "#475569"],
  "expense-sage": ["#57707A", "#8E6F8A", "#A16207", "#0E7490", "#7B5E57", "#191D23"],
};

function expensePaletteChart(name: ExpensePaletteName): ChartTokens {
  const c = EXPENSE_PALETTE_COLORS[name];
  if (themeUsesDarkPalette(name)) {
    return {
      categorical: ["#78B8FF", "#F5C451", "#B794F6", "#4FD1C5", "#F28CC0", c.foreground, "#FF9F6B"],
      positive: "#35E889",
      negative: "#FF7777",
    };
  }
  const swatch = EXPENSE_PALETTE_SWATCHES[name];
  const own = [c.accent, swatch[0]];
  const ramp = EXPENSE_LIGHT_CATEGORY_RAMPS[name] ?? [];
  return {
    categorical: [...new Set([...own, ...EXPENSE_LIGHT_CHART_FILL])].slice(0, 7),
    positive: c.success,
    negative: c.destructive,
    slices: ramp.slice(0, 5),
    // Bars lead with ink, like the shared ramp.
    bars: [c.foreground, ...ramp.filter((hex) => hex !== c.foreground)].slice(0, 6),
  };
}

export function createTheme(
  name: ThemeName,
  accentColor: AccentColorName = "indigo"
): ThemeTokens {
  const isDark = themeUsesDarkPalette(name);
  const baseColors = isDark ? { ...darkColors } : { ...lightColors };
  const palette = ACCENT_PALETTES[accentColor] || ACCENT_PALETTES.indigo;
  const accentOverrides = isDark ? palette.dark : palette.light;

  if (themeOwnsAccent(name)) {
    return {
      name,
      accentColor,
      colors: { ...EXPENSE_PALETTE_COLORS[name as ExpensePaletteName] },
      space,
      radius,
      typography,
      fontFamily,
      elevation,
      iconSize,
      chart: expensePaletteChart(name as ExpensePaletteName),
      type,
    };
  }

  const colors: ColorTokens = {
    ...baseColors,
    ...accentOverrides,
    accent: accentOverrides.tint,
    accentForeground: accentOverrides.primaryForeground,
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
  "midnight-emerald": "Midnight Slate",
  "midnight-forest": "Midnight Forest",
  "midnight-plum": "Midnight Plum",
  "midnight-cocoa": "Midnight Cocoa",
  "expense-rose": "Rose Elegance",
  "expense-violet": "Royal Violet",
  "expense-ocean": "Ocean Blue",
  "expense-sunset": "Sunset Orange",
  "expense-lavender": "Lavender Glass",
  "expense-sage": "Midnight Sage",
};
