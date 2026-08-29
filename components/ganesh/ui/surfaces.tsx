/**
 * Ganesh Seva surfaces — the product's own layout language.
 *
 * This file was forked from `components/dashboard/primitives.tsx`. The two are
 * deliberately independent now: Ganesh Seva is a pandal operating platform, not
 * a skin over the Expense Tracker, and a change to one must never move the
 * other. Nothing here may import from `components/dashboard/*`.
 *
 * What differs from the Expense Tracker's primitives, and why:
 *
 * - **Warm surfaces.** Tile and track washes are mixed from the ink brown of
 *   this palette, not slate. On an ivory ground a slate wash reads grey-blue
 *   and immediately looks like a finance app.
 * - **Softer geometry.** Section radius 18 (vs 20) and tile radius 12 (vs 14),
 *   with squircle glyph niches instead of circles.
 * - **A gold rule** under section headers — the one piece of festival
 *   decoration in the system, one hairline, never repeated inside a section.
 * - **`accent` means the festival colour.** The Expense version hardcodes a
 *   purple belonging to the Vault feature, which has no meaning here.
 * - **Taller rows** (52dp vs 48dp), for one-handed use during an event.
 *
 * Amounts render in `foreground`. Colour marks actions, identity and status —
 * never value. See `components/ganesh/ui/tokens.ts`.
 */

import { type ReactNode } from "react";
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
export const GANESH_RADIUS = {
  section: 18,
  tile: 12,
  glyph: 12,
  pill: 999,
} as const;

export const GANESH_SPACE = {
  sectionPadding: 16,
  sectionGap: 12,
  rowGap: 10,
} as const;

/** Semantic tones — the only colour vocabulary Ganesh widgets may use. */
export type Tone =
  | "default"
  | "muted"
  | "positive"
  | "negative"
  | "warning"
  | "accent"
  | "info";

type Colors = ReturnType<typeof useTheme>["theme"]["colors"];

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
      // The festival colour, from the palette — not a hardcoded hex.
      return colors.primary;
    default:
      return colors.foreground;
  }
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

/**
 * Subtle fills used inside sections, mixed from the palette's warm ink so they
 * sit on ivory without turning grey. Kept very low-contrast so a tile nested in
 * a section never reads as a second card.
 */
export function useSurfaces() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  return {
    isDark,
    /** Inset tile fill. */
    tile: isDark ? "rgba(255, 237, 226, 0.05)" : "rgba(36, 22, 9, 0.035)",
    /** Progress / meter track. */
    track: isDark ? "rgba(255, 237, 226, 0.11)" : "rgba(36, 22, 9, 0.09)",
    /** Hairline divider between list rows. */
    divider: theme.colors.outlineVariant ?? theme.colors.border,
    /** Tint a semantic colour down to a background wash. */
    wash: (hex: string) => withAlpha(hex, isDark ? 0.18 : 0.11),
    /** Android ripple over a surface. */
    ripple: isDark ? "rgba(255, 237, 226, 0.07)" : "rgba(36, 22, 9, 0.055)",
  };
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
  /** Right-aligned header content that is not an action (e.g. a status pill). */
  badge?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  /** Removes the outer surface — for sections that are just a titled list. */
  plain?: boolean;
  /**
   * Draws the gold rule beneath the header. On by default for titled sections;
   * turn it off for a section that is purely a container for other surfaces.
   */
  rule?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Ganesh Seva's only container. Hairline border, no elevation. */
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
  rule,
  style,
  contentStyle,
  testID,
}: SectionProps) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const g = useGaneshSurfaceAccents();

  const hasHeader = Boolean(title || subtitle || icon || action || badge);
  const showRule = (rule ?? Boolean(title)) && hasHeader && !plain;

  return (
    <View
      testID={testID}
      style={[
        plain
          ? null
          : {
              backgroundColor: theme.colors.card,
              borderRadius: GANESH_RADIUS.section,
              borderCurve: "continuous",
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: surfaces.divider,
              padding: GANESH_SPACE.sectionPadding,
            },
        style,
      ]}
    >
      {hasHeader ? (
        <View style={[styles.header, showRule ? styles.headerRuled : null]}>
          <View style={styles.headerLeft}>
            {icon ? (
              <View style={[styles.iconTile, { backgroundColor: iconTint ?? surfaces.tile }]}>
                {icon}
              </View>
            ) : null}
            <View style={styles.headerText}>
              {title ? (
                <Text
                  style={[
                    styles.sectionTitle,
                    { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold },
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
                    { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
                  ]}
                  numberOfLines={2}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
          </View>
          {(action ?? badge) ? <View style={styles.headerRight}>{action ?? badge}</View> : null}
        </View>
      ) : null}

      {showRule ? (
        <View style={[styles.rule, { backgroundColor: withAlpha(g.gold, 0.45) }]} />
      ) : null}

      <View style={contentStyle}>{children}</View>

      {footer ? (
        <View style={[styles.footer, { borderTopColor: surfaces.divider }]}>{footer}</View>
      ) : null}
    </View>
  );
}

/**
 * The gold used by the section rule.
 *
 * Defined here rather than imported from `./tokens` so `surfaces.tsx` has no
 * dependency on the token module — `tokens.ts` imports *this* file, and the
 * cycle would be fragile. `useGaneshTokens().gold` re-exports the same values.
 */
export function useGaneshSurfaceAccents() {
  const { themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  return { gold: isDark ? "#E0B558" : "#B98029" };
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
  const color = toneColor(theme.colors, tone);

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
      <Text style={[styles.actionLabel, { color, fontFamily: theme.fontFamily.semibold }]}>
        {label}
      </Text>
      <ChevronRight size={14} color={color} strokeWidth={2.4} />
    </Pressable>
  );
}

/* ------------------------------------------------------------------- Labels */

/** Small metadata label. */
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
        { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/* ---------------------------------------------------------------- StatTile */

export function StatTile({
  label,
  children,
  meta,
  align = "flex-start",
  style,
}: {
  label: string;
  /** The value node — usually `<Money />` or a `<Text />`. */
  children: ReactNode;
  meta?: ReactNode;
  align?: "flex-start" | "center" | "flex-end";
  style?: StyleProp<ViewStyle>;
}) {
  const surfaces = useSurfaces();

  return (
    <View style={[styles.tile, { backgroundColor: surfaces.tile, alignItems: align }, style]}>
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

/* ------------------------------------------------------------------ DataRow */

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
            { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium },
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {meta ? (
          <Text
            style={[
              styles.rowMeta,
              { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular },
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
    // Taller than the Expense Tracker's 48: this app is used standing up, in a
    // crowd, one-handed.
    minHeight: 52,
    paddingVertical: 8,
    ...(divider
      ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: surfaces.divider }
      : null),
  };

  if (!onPress) return <View style={rowStyle}>{body}</View>;

  return (
    <Pressable
      onPress={() => {
        void haptic.selection();
        onPress();
      }}
      android_ripple={{ color: surfaces.ripple, borderless: false }}
      style={({ pressed }) => [rowStyle, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
    >
      {body}
    </Pressable>
  );
}

/**
 * Leading glyph niche for list rows.
 *
 * A rounded square rather than the Expense Tracker's circle — closer to a
 * temple niche, and it distinguishes a Ganesh row at a glance.
 */
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
        borderRadius: Math.round(size * 0.34),
        borderCurve: "continuous",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: tint ?? surfaces.tile,
      }}
    >
      {children}
    </View>
  );
}

/* ---------------------------------------------------------------- TrendText */

/**
 * Period-over-period delta. `invert` flips the semantics for metrics where a
 * decrease is the good outcome (spending).
 */
export function TrendText({
  delta,
  invert = false,
  suffix = "vs last festival",
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
          { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.medium },
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
        style={[styles.stripText, { color, fontFamily: theme.fontFamily.medium }]}
        numberOfLines={2}
      >
        {message}
      </Text>
    </View>
  );
}

/* --------------------------------------------------------------------- Pill */

export function Pill({ label, tone = "accent" }: { label: string; tone?: Tone }) {
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const color = toneColor(theme.colors, tone);

  return (
    <View style={[styles.pill, { backgroundColor: surfaces.wash(color) }]}>
      <Text style={[styles.pillText, { color, fontFamily: theme.fontFamily.semibold }]}>
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
    marginBottom: 12,
  },
  headerRuled: {
    marginBottom: 10,
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
    borderRadius: GANESH_RADIUS.glyph,
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
  /** The one decorative element in the system. One hairline, header only. */
  rule: {
    height: 1,
    borderRadius: 1,
    marginBottom: 12,
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
    borderRadius: GANESH_RADIUS.tile,
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
    fontSize: 14.5,
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
    paddingVertical: 10,
    borderRadius: GANESH_RADIUS.tile,
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
    borderRadius: GANESH_RADIUS.pill,
  },
  pillText: {
    fontSize: 11,
    letterSpacing: 0.1,
  },
});
