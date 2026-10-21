import { memo, useState } from "react";
import { Image, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBarActions } from "@/components/layout/AppBarActions";
import { AppBarBrand } from "@/components/layout/AppBarBrand";
import {
  APP_BAR_CONTENT_HEIGHT,
  APP_BAR_HORIZONTAL_PADDING,
} from "@/components/layout/chrome";
import { SideDrawer } from "@/components/SideDrawer";
import { useDayPeriod } from "@/hooks/useDayPeriod";
import { useAuth } from "@/providers/AuthProvider";
import { greetingFor, type DayPeriod } from "@/shared/utils/dayPeriod";
import { useTheme } from "@/theme/ThemeProvider";
import { withAlpha } from "@/theme/surfaces";

import { DASHBOARD_BACKGROUNDS } from "./dashboardBackgrounds";

/**
 * The backdrops are roughly square scenes with the mountains in their lower
 * half. The image is drawn as a square the hero's width and lifted so this
 * fraction of it sits above the hero's bottom edge: the ridgeline lands
 * between the greeting and the net-worth card instead of being cropped to sky.
 */
const SCENE_VISIBLE_FRACTION = 0.74;

/** Visible hero height below the status bar; the net-worth card overlaps its foot. */
export const DASHBOARD_HERO_HEIGHT = 236;
/** How far the first card rides up over the hero's fade. */
export const DASHBOARD_HERO_OVERLAP = 52;

const HERO_INK = "#FFFFFF";

/** A neutral line per period — no claims about the user's finances. */
const PERIOD_LINES: Record<DayPeriod, string> = {
  morning: "Here's where your money stands this morning.",
  afternoon: "A quick look at your money this afternoon.",
  evening: "Here's how your money looks this evening.",
  night: "Your money, wrapped up for the day.",
};

/**
 * SPENDLY-566 — the Visual First hero: a bundled mountain scene for the time
 * of day, a dark scrim so white text reads over every image, and a fade into
 * the theme background. It also carries the dashboard's app bar (brand,
 * search, profile), since the shared `Header` steps aside on this route.
 *
 * The parent `PageShell` pads by `insets.top + space.md`; the hero pulls itself
 * up and out by the same amounts so the image runs edge to edge under the
 * status bar.
 */
export const DashboardHero = memo(function DashboardHero() {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const { user } = useAuth();
  const period = useDayPeriod();
  const isFocused = useIsFocused();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [heroWidth, setHeroWidth] = useState(0);

  const firstName =
    user?.displayName?.trim()?.split(/\s+/)[0] ||
    user?.email?.split("@")[0] ||
    "there";

  const bleedTop = insets.top + theme.space.md;
  const height = insets.top + DASHBOARD_HERO_HEIGHT;
  // Square scene, never shorter than the hero needs, with its bottom
  // (1 - fraction) hidden below the hero. Until the first layout, fill it.
  const sceneSize = Math.max(heroWidth, height / SCENE_VISIBLE_FRACTION);
  const sceneStyle =
    heroWidth > 0
      ? {
          position: "absolute" as const,
          left: 0,
          right: 0,
          height: sceneSize,
          bottom: -Math.round(sceneSize * (1 - SCENE_VISIBLE_FRACTION)),
        }
      : StyleSheet.absoluteFill;

  const onHeroLayout = (event: LayoutChangeEvent) => {
    const w = Math.round(event.nativeEvent.layout.width);
    if (w !== heroWidth) setHeroWidth(w);
  };

  return (
    <>
      {/* Light status-bar icons over the image, on every theme, only while
          the dashboard is on screen; the global bar takes over elsewhere. */}
      {isFocused ? <StatusBar style="light" /> : null}

      <View
        style={[
          styles.hero,
          {
            height,
            marginTop: -bleedTop,
            marginHorizontal: -theme.space.md,
            marginBottom: -DASHBOARD_HERO_OVERLAP,
          },
        ]}
        testID="dashboard-hero"
        onLayout={onHeroLayout}
      >
        <Image
          source={DASHBOARD_BACKGROUNDS[period]}
          style={sceneStyle}
          resizeMode="cover"
          fadeDuration={0}
          accessible={false}
        />
        {/* Top scrim: status bar, app bar and greeting. */}
        <LinearGradient
          colors={["rgba(0,0,0,0.58)", "rgba(0,0,0,0.28)", "rgba(0,0,0,0)"]}
          locations={[0, 0.45, 0.75]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        {/* Foot: melts into the page so the cards below sit on the theme. */}
        <LinearGradient
          colors={[withAlpha(theme.colors.background, 0), theme.colors.background]}
          locations={[0, 1]}
          style={styles.fade}
          pointerEvents="none"
        />

        <View style={[styles.bar, { marginTop: insets.top }]}>
          <AppBarBrand ink={HERO_INK} />
          <AppBarActions ink={HERO_INK} onOpenProfile={() => setIsDrawerOpen(true)} />
        </View>

        <View style={styles.copy}>
          <Text
            style={[styles.greeting, { fontFamily: theme.fontFamily.semibold }]}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {greetingFor(period)}, {firstName}
          </Text>
          <Text
            style={[styles.line, { fontFamily: theme.fontFamily.regular }]}
            numberOfLines={2}
          >
            {PERIOD_LINES[period]}
          </Text>
        </View>
      </View>

      <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
});

const textShadow = {
  textShadowColor: "rgba(0,0,0,0.35)",
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
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
    height: "38%",
  },
  bar: {
    height: APP_BAR_CONTENT_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: APP_BAR_HORIZONTAL_PADDING,
  },
  copy: {
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 4,
  },
  greeting: {
    color: HERO_INK,
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    ...textShadow,
  },
  line: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 14,
    lineHeight: 19,
    ...textShadow,
  },
});
