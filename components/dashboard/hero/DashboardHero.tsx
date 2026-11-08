import { memo, type ComponentType } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, Moon, Sun, Sunrise, Sunset } from "lucide-react-native";

import { AppBarActions } from "@/components/layout/AppBarActions";
import { AppBarBrand } from "@/components/layout/AppBarBrand";
import {
  APP_BAR_CONTENT_HEIGHT,
  APP_BAR_HORIZONTAL_PADDING,
} from "@/components/layout/chrome";
import { useDayPeriod } from "@/hooks/useDayPeriod";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { formatDisplayDate } from "@/shared/utils/dateDisplay";
import { todayDateKey } from "@/shared/utils/dates";
import { greetingFor, type DayPeriod } from "@/shared/utils/dayPeriod";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";

import { DASHBOARD_BACKGROUNDS, DASHBOARD_SCENE_FOCUS } from "./dashboardBackgrounds";

/** Visible hero height below the status bar; the net-worth card overlaps its foot. */
export const DASHBOARD_HERO_HEIGHT = 300;
/** How far the first card rides up over the hero's fade. */
export const DASHBOARD_HERO_OVERLAP = 64;
/**
 * SPENDLY-718: the desktop header is a compact band — greeting, search,
 * inbox, profile and today's date — so the net-worth row starts in the
 * first fold of a 1080px monitor.
 */
export const DASHBOARD_DESKTOP_HERO_HEIGHT = 196;
export const DASHBOARD_DESKTOP_HERO_OVERLAP = 52;

const HERO_INK = "#FFFFFF";
/** Warm accent for the period glyph, as in the reference. */
const PERIOD_GLYPH_COLOR = "#FFD25A";

/** A neutral line per period — no claims about the user's finances. */
const PERIOD_LINES: Record<DayPeriod, string> = {
  morning: "Here's where your money stands this morning.",
  afternoon: "A quick look at your money this afternoon.",
  evening: "Here's how your money looks this evening.",
  night: "Your money, wrapped up for the day.",
};

type IconType = ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
const PERIOD_ICONS: Record<DayPeriod, IconType> = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
};

/**
 * The Visual First hero (SPENDLY-566; polished in SPENDLY-572): a bundled
 * mountain scene for the time of day, a dark scrim so white text reads over
 * every image, and a fade into the page. It also carries the dashboard's app
 * bar (brand, search, reminders, profile), since the shared `Header` steps
 * aside on this route.
 *
 * `expo-image` keeps each scene's focal point (sun or moon and the ridgeline)
 * in view at any width via `contentPosition`, and crossfades when the period
 * changes. The parent `PageShell` pads by `insets.top + space.md`; the hero
 * pulls itself up and out by the same amounts so the image runs edge to edge
 * under the status bar.
 */
export const DashboardHero = memo(function DashboardHero({
  onOpenProfile,
  variant = "stack",
  bleed,
}: {
  onOpenProfile: () => void;
  /** SPENDLY-718: `desktop` is the compact wide-screen header (web ≥ 1280). */
  variant?: "stack" | "desktop";
  /** Horizontal page padding to bleed through; defaults to PageShell's. */
  bleed?: number;
}) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const { settings } = useSettings();
  const desktop = variant === "desktop";
  const period = useDayPeriod();
  const isFocused = useIsFocused();
  const PeriodIcon = PERIOD_ICONS[period];

  const firstName =
    user?.displayName?.trim()?.split(/\s+/)[0] ||
    user?.email?.split("@")[0] ||
    "there";

  const bleedTop = insets.top + theme.space.md;
  const height = insets.top + (desktop ? DASHBOARD_DESKTOP_HERO_HEIGHT : DASHBOARD_HERO_HEIGHT);
  const overlap = desktop ? DASHBOARD_DESKTOP_HERO_OVERLAP : DASHBOARD_HERO_OVERLAP;
  const todayLabel = desktop ? todayChipLabel(todayDateKey(settings.timezone), settings.dateFormat) : "";

  return (
    <>
      {/* Light status-bar icons over the image while the dashboard is on
          screen; the global bar takes over elsewhere. */}
      {isFocused ? <StatusBar style="light" /> : null}

      <View
        style={[
          styles.hero,
          {
            height,
            marginTop: -bleedTop,
            marginHorizontal: -(bleed ?? theme.space.md),
            marginBottom: -overlap,
            backgroundColor: theme.colors.background,
          },
        ]}
        testID="dashboard-hero"
      >
        <Image
          source={DASHBOARD_BACKGROUNDS[period]}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          contentPosition={DASHBOARD_SCENE_FOCUS[period]}
          transition={300}
          cachePolicy="memory-disk"
          accessible={false}
        />
        {/* Top scrim: status bar, app bar and greeting. */}
        <LinearGradient
          colors={["rgba(0,0,0,0.62)", "rgba(0,0,0,0.30)", "rgba(0,0,0,0)"]}
          locations={[0, 0.38, 0.62]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Foot: melts into the page so the cards below sit on the theme. */}
        <LinearGradient
          colors={[withAlpha(theme.colors.background, 0), withAlpha(theme.colors.background, 0.7), theme.colors.background]}
          locations={[0, 0.55, 1]}
          style={styles.fade}
          pointerEvents="none"
        />

        {desktop ? (
          <View style={[styles.desktopBar, { paddingHorizontal: bleed ?? theme.space.md }]}>
            <View style={styles.desktopCopy}>
              <View style={styles.greetingRow}>
                <Text
                  style={[styles.greeting, styles.greetingDesktop, { fontFamily: theme.fontFamily.bold }]}
                  numberOfLines={1}
                  accessibilityRole="header"
                >
                  {greetingFor(period)}, {firstName}
                </Text>
                <PeriodIcon size={24} color={PERIOD_GLYPH_COLOR} strokeWidth={2.2} />
              </View>
              <Text style={[styles.line, { fontFamily: theme.fontFamily.regular }]} numberOfLines={1}>
                {PERIOD_LINES[period]}
              </Text>
            </View>
            <View style={styles.desktopTools}>
              <AppBarActions ink={HERO_INK} onOpenProfile={onOpenProfile} searchField />
              <View
                style={[styles.dateChip, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}
                accessibilityLabel={`Today, ${todayLabel}`}
              >
                <CalendarDays size={15} color={theme.colors.mutedForeground} strokeWidth={2.1} />
                <Text style={[styles.dateText, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}>
                  {todayLabel}
                </Text>
              </View>
            </View>
          </View>
        ) : (
        <>
        <View style={[styles.bar, { marginTop: insets.top }]}>
          <AppBarBrand ink={HERO_INK} />
          <AppBarActions ink={HERO_INK} onOpenProfile={onOpenProfile} />
        </View>

        <View style={styles.copy}>
          <View style={styles.greetingRow}>
            <Text
              style={[styles.greeting, { fontFamily: theme.fontFamily.semibold }]}
              numberOfLines={1}
              accessibilityRole="header"
            >
              {greetingFor(period)}, {firstName}
            </Text>
            <PeriodIcon size={22} color={PERIOD_GLYPH_COLOR} strokeWidth={2.2} />
          </View>
          <Text
            style={[styles.line, { fontFamily: theme.fontFamily.regular }]}
            numberOfLines={2}
          >
            {PERIOD_LINES[period]}
          </Text>
        </View>
        </>
        )}
      </View>
    </>
  );
});

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "Sun, 08/11/2026" — today in the user's timezone and date format. */
function todayChipLabel(todayKey: string, dateFormat: Parameters<typeof formatDisplayDate>[1]): string {
  const [y, m, d] = todayKey.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(y, (m || 1) - 1, d || 1).getDay()] ?? "";
  return `${weekday}, ${formatDisplayDate(todayKey, dateFormat)}`;
}

const textShadow = {
  textShadowColor: "rgba(0,0,0,0.4)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 8,
} as const;

const styles = StyleSheet.create({
  hero: {
    overflow: "hidden",
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "34%",
  },
  bar: {
    height: APP_BAR_CONTENT_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: APP_BAR_HORIZONTAL_PADDING,
  },
  desktopBar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 24,
    paddingTop: 22,
  },
  desktopCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
    paddingTop: 8,
  },
  desktopTools: {
    alignItems: "flex-end",
    gap: 10,
  },
  greetingDesktop: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  dateChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  dateText: {
    fontSize: 13,
  },
  copy: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 4,
  },
  greetingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  greeting: {
    color: HERO_INK,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.4,
    flexShrink: 1,
    ...textShadow,
  },
  line: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 15,
    lineHeight: 20,
    ...textShadow,
  },
});
