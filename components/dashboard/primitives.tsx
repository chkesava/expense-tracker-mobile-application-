/**
 * Dashboard design primitives.
 *
 * The dashboard used to stack heavyweight `Card`s, which produced a lot of
 * repeated chrome (borders, radii, elevation, header styles) at slightly
 * different values per widget. These primitives are the single source of truth
 * for dashboard surfaces so every section shares one radius scale, one border
 * treatment, one type hierarchy, and semantic-only colour.
 *
 * `Card` is still used by the rest of the app and is intentionally untouched.
 */

import React, { type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { ChevronRight } from "lucide-react-native";

import { haptic } from "@/lib/haptics";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/** One radius per role — no per-component radii. */
export const DASH_RADIUS = {
  section: 20,
  tile: 14,
  pill: 999,
} as const;

export const DASH_SPACE = {
  sectionPadding: 16,
  sectionGap: 12,
  rowGap: 10,
} as const;

/** Semantic tones — the only colour vocabulary dashboard widgets may use. */
export type Tone =
  | "default"
  | "muted"
  | "positive"
  | "negative"
  | "warning"
  | "accent"
  | "info";

type Colors = ReturnType<typeof useTheme>["theme"]["colors"];

/** Purple secondary accent, per the Vault identity. */
export const ACCENT_PURPLE = "#7C5CFC";

/**
 * Non-semantic ramp for category bars. Deliberately excludes the success green
 * and destructive red so a large category never reads as "good" or "bad".
 */
export const CATEGORY_RAMP = [
  "#1E293B",
  ACCENT_PURPLE,
  "#EC4899",
  "#F59E0B",
  "#0EA5E9",
  "#14B8A6",
] as const;

export function toneColor(colors: Colors, tone: Tone = "default"): string {
  switch (tone) {
    case "muted":
      return colors.mutedForeground;
    case "positive":
      return colors.success;
    case "negative":
      return colors.destructive;
    case "warning":
      return colors.warning;
    case "accent":
      return ACCENT_PURPLE;
    case "info":
      return colors.info;
    default:
      return colors.foreground;
  }
}

/**
 * Subtle fills used inside sections. Kept extremely low-contrast so nesting a
 * tile inside a section never reads as a second card.
 */
export function useSurfaces() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return {
    isDark,
    /** Inset tile fill. */
    tile: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.025)",
    /** Progress / meter track. */
    track: isDark ? "rgba(255,255,255,0.09)" : "rgba(15,23,42,0.07)",
    /** Hairline divider between list rows. */
    divider: theme.colors.outlineVariant ?? theme.colors.border,
    /** Tint a semantic colour down to a background wash. */
    wash: (hex: string) => withAlpha(hex, isDark ? 0.16 : 0.1),
  };
}

/** #RRGGBB → rgba(). Accepts already-rgba strings unchanged. */
export function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith("#")) return color;
  const hex = color.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((c) => c + c)
          .join("")
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return color;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* ------------------------------------------------------------------ Section */

export type SectionProps = {
  title?: string;
  subtitle?: string;
  /** Small tinted glyph tile shown left of the title. */
  icon?: ReactNode;
  /** Tint for the icon tile background. */
  iconTint?: string;
  /** Right-aligned header affordance (usually `<SectionAction />`). */
  action?: ReactNode;
  /** Right-aligned header content that is not an action (e.g. a level pill). */
  badge?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** Removes the outer surface — for sections that are just a titled list. */
  plain?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/**
 * The dashboard's only container. Subtle border, no elevation, consistent
 * radius and padding.
 */
export function Section({
  title,
  subtitle,
  icon,
  iconTint,
  action,
  badge,
  footer,
  children,
  plain = false,
  style,
  contentStyle,
  testID,
}: SectionProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const hasHeader = Boolean(title || subtitle || icon || action || badge);

  return (
    <View
      testID={testID}
      style={[
        plain
          ? null
          : {
              backgroundColor: theme.colors.card,
              borderRadius: DASH_RADIUS.section,
              borderCurve: "continuous",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: surfaces.divider,
              padding: DASH_SPACE.sectionPadding,
            },
        style,
      ]}
    >
      {hasHeader ? (
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {icon ? (
              <View
                style={[
                  styles.iconTile,
                  { backgroundColor: iconTint ?? surfaces.tile },
                ]}
              >
                {icon}
              </View>
            ) : null}
            <View style={styles.headerText}>
              {title ? (
                <Text
                  style={[
                    styles.sectionTitle,
                    {
                      color: theme.colors.foreground,
                      fontFamily: theme.fontFamily.semibold,
                    },
                  ]}
                  numberOfLines={1}
                >
                  {title}
                </Text>
              ) : null}
              {subtitle ? (
                <Text
                  style={[
                    styles.sectionSubtitle,
                    {
                      color: theme.colors.mutedForeground,
                      fontFamily: theme.fontFamily.regular,
                    },
                  ]}
                  numberOfLines={2}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {(action ?? badge) ? (
            <View style={styles.headerRight}>{action ?? badge}</View>
          ) : null}
        </View>
      ) : null}

      <View style={contentStyle}>{children}</View>

      {footer ? (
        <View style={[styles.footer, { borderTopColor: surfaces.divider }]}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------ SectionAction */

export function SectionAction({
  label,
  onPress,
  tone = "accent",
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: Tone;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  const color = tone === "accent" ? theme.colors.primary : toneColor(theme.colors, tone);

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      hitSlop={8}
      style={({ pressed }) => [styles.action, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text
        style={[
          styles.actionLabel,
          { color, fontFamily: theme.fontFamily.semibold },
        ]}
      >
        {label}
      </Text>
      <ChevronRight size={14} color={color} strokeWidth={2.4} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------ Labels */

/** Small uppercase metadata label. */
export function MetaLabel({
  children,
  style,
  numberOfLines = 1,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const { theme } = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        styles.metaLabel,
        {
          color: theme.colors.mutedForeground,
          fontFamily: theme.fontFamily.medium,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* --------------------------------------------------------------- StatTile */

export function StatTile({
  label,
  children,
  meta,
  align = "flex-start",
  style,
}: {
  label: string;
  /** The value node — usually `<Amount />` or a `<Text />`. */
  children: ReactNode;
  meta?: ReactNode;
  align?: "flex-start" | "center" | "flex-end";
  style?: StyleProp<ViewStyle>;
}) {
  const surfaces = useSurfaces();

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: surfaces.tile, alignItems: align },
        style,
      ]}
    >
      <MetaLabel>{label}</MetaLabel>
      {children}
      {meta}
    </View>
  );
}

/* ------------------------------------------------------------ ProgressTrack */

export function ProgressTrack({
  pct,
  color,
  height = 6,
  style,
}: {
  /** 0–100. Clamped. */
  pct: number;
  color: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const surfaces = useSurfaces();
  const clamped = Math.max(0, Math.min(100, pct));

  return (
    <View
      style={[
        {
          height,
          borderRadius: height / 2,
          backgroundColor: surfaces.track,
          overflow: "hidden",
        },
        style,
      ]}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <View
        style={{
          width: `${clamped === 0 ? 0 : Math.max(2, clamped)}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

/* ----------------------------------------------------------------- DataRow */

export function DataRow({
  leading,
  title,
  meta,
  value,
  valueMeta,
  onPress,
  divider = false,
  accessibilityLabel,
}: {
  leading?: ReactNode;
  title: string;
  meta?: string;
  /** Right-aligned primary value node. */
  value?: ReactNode;
  valueMeta?: ReactNode;
  onPress?: () => void;
  divider?: boolean;
  accessibilityLabel?: string;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();

  const body = (
    <>
      {leading ? <View style={styles.rowLeading}>{leading}</View> : null}
      <View style={styles.rowText}>
        <Text
          style={[
            styles.rowTitle,
            {
              color: theme.colors.foreground,
              fontFamily: theme.fontFamily.medium,
            },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {meta ? (
          <Text
            style={[
              styles.rowMeta,
              {
                color: theme.colors.mutedForeground,
                fontFamily: theme.fontFamily.regular,
              },
            ]}
            numberOfLines={1}
          >
            {meta}
          </Text>
        ) : null}
      </View>
      {value || valueMeta ? (
        <View style={styles.rowValue}>
          {value}
          {valueMeta}
        </View>
      ) : null}
    </>
  );

  const rowStyle: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingVertical: 8,
    ...(divider
      ? {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: surfaces.divider,
        }
      : null),
  };

  if (!onPress) return <View style={rowStyle}>{body}</View>;

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      android_ripple={{
        color: surfaces.isDark ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)",
        borderless: false,
      }}
      style={({ pressed }) => [rowStyle, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      {body}
    </Pressable>
  );
}

/** Circular leading glyph for list rows. */
export function RowGlyph({
  children,
  tint,
  size = 36,
}: {
  children: ReactNode;
  tint?: string;
  size?: number;
}) {
  const surfaces = useSurfaces();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tint ?? surfaces.tile,
      }}
    >
      {children}
    </View>
  );
}

/* --------------------------------------------------------------- TrendText */

/**
 * Month-over-month delta. `invert` flips the semantics for metrics where a
 * decrease is the good outcome (spending).
 */
export function TrendText({
  delta,
  invert = false,
  suffix = "vs last month",
}: {
  delta: number | null;
  invert?: boolean;
  suffix?: string;
}) {
  const { theme } = useTheme();

  if (delta === null) {
    return (
      <Text
        style={[
          styles.trend,
          {
            color: theme.colors.mutedForeground,
            fontFamily: theme.fontFamily.medium,
          },
        ]}
        numberOfLines={2}
      >
        {suffix}
      </Text>
    );
  }

  const isGood = invert ? delta <= 0 : delta >= 0;
  const color = isGood ? theme.colors.success : theme.colors.destructive;

  return (
    <Text
      style={[styles.trend, { color, fontFamily: theme.fontFamily.medium }]}
      numberOfLines={2}
    >
      {delta >= 0 ? "↑" : "↓"} {Math.abs(delta)}% {suffix}
    </Text>
  );
}

/* -------------------------------------------------------------- StatusStrip */

/** Slim inline status message with a semantic wash. Replaces banner cards. */
export function StatusStrip({
  icon,
  message,
  tone = "accent",
}: {
  icon?: ReactNode;
  message: string;
  tone?: Tone;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const color = toneColor(theme.colors, tone);

  return (
    <View style={[styles.strip, { backgroundColor: surfaces.wash(color) }]}>
      {icon}
      <Text
        style={[
          styles.stripText,
          { color, fontFamily: theme.fontFamily.medium },
        ]}
        numberOfLines={2}
      >
        {message}
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------------- Pill */

export function Pill({
  label,
  tone = "accent",
}: {
  label: string;
  tone?: Tone;
}) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const color = toneColor(theme.colors, tone);

  return (
    <View style={[styles.pill, { backgroundColor: surfaces.wash(color) }]}>
      <Text
        style={[
          styles.pillText,
          { color, fontFamily: theme.fontFamily.semibold },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  sectionTitle: {
    fontSize: 16,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  headerRight: {
    alignItems: "flex-end",
    justifyContent: "center",
    minHeight: 32,
  },
  footer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    minHeight: 32,
  },
  actionLabel: {
    fontSize: 13,
  },
  metaLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    padding: 12,
    borderRadius: DASH_RADIUS.tile,
    borderCurve: "continuous",
    gap: 3,
  },
  rowLeading: {
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  rowTitle: {
    fontSize: 14,
  },
  rowMeta: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  rowValue: {
    alignItems: "flex-end",
    gap: 1,
  },
  trend: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: DASH_RADIUS.tile,
    borderCurve: "continuous",
  },
  stripText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: DASH_RADIUS.pill,
  },
  pillText: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
});
