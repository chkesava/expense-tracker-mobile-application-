import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { usePathname, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  BarChart3,
  Home,
  Receipt,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import {
  CAPSULE_FAB_EDGE,
  CAPSULE_FAB_GAP,
  CAPSULE_FAB_SIZE,
  CAPSULE_HEIGHT,
  CAPSULE_RADIUS,
  CAPSULE_SIDE_MARGIN,
  capsuleOffset,
} from "@/components/layout/chrome";
import {
  NAV_LABEL_MAX_FONT_SCALE,
  shouldCompactNavLabels,
} from "@/shared/config/bottomChrome";
import { AddFab } from "@/components/ui/AddFab";
import { GlassSurface } from "@/components/ui/GlassSurface";
import {
  SMOKE_INACTIVE_ALPHA,
  SMOKE_INACTIVE_ICON_ALPHA,
  SMOKE_LENS_BORDER,
  SMOKE_LENS_BOTTOM,
  SMOKE_LENS_TOP,
  glassAccent,
  rgbaString,
  smokeActiveLens,
  smokeActivePill,
} from "@/components/ui/glassTokens";
import { haptic } from "@/lib/haptics";
import { useModals } from "@/providers/ModalProvider";
import { useTranslation } from "@/providers/LocalizationProvider";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import {
  CORE_NAV_ITEMS,
  isNavItemActive,
  type NavigationItem,
  type NavSectionId,
} from "@/shared/config/navigation";
import { durations, easing } from "@/theme/motion";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const ICON_MAP: Record<
  string,
  React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
> = {
  home: Home,
  ledger: Receipt,
  investments: TrendingUp,
  vaults: Shield,
  insights: BarChart3,
};

/** Inner padding between the capsule edge and the tab row. */
const CAPSULE_PADDING = 8;
/** How far the active lens reaches into that padding: just enough to stay contained. */
const PILL_OVERHANG = 2;

function NavDestination({
  link,
  isActive,
  activeColor,
  inactiveColor,
  inactiveIconColor,
  compact,
  onPress,
}: {
  link: NavigationItem;
  isActive: boolean;
  activeColor: string;
  inactiveColor: string;
  inactiveIconColor: string;
  /** Icon-only: the row is too narrow for labels at this font scale. */
  compact: boolean;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const Icon = ICON_MAP[link.id] || Wallet;
  const label = t(link.translationKey, link.mobileLabel || link.label);
  const color = isActive ? activeColor : inactiveColor;
  const iconColor = isActive ? activeColor : inactiveIconColor;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, pressed && !isActive && styles.tabPressed]}
      accessibilityRole="tab"
      accessibilityLabel={`Go to ${label}`}
      accessibilityState={{ selected: isActive }}
    >
      <Icon size={22} color={iconColor} strokeWidth={isActive ? 2.4 : 2} />
      {compact ? null : (
        <Text
          style={[
            styles.tabLabel,
            { color, fontWeight: isActive ? "700" : "500" },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          maxFontSizeMultiplier={NAV_LABEL_MAX_FONT_SCALE}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Floating glass capsule navigation, nearly full width, with the add FAB
 * floating above its trailing end (SPENDLY-161/172). Geometry comes from `shared/config/bottomChrome`, which is
 * also what every list pads by, so content always scrolls clear of both.
 */
export function BottomNav() {
  const { navigate, dismissTo } = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { theme, themeName } = useTheme();
  const { setIsAddSheetOpen } = useModals();
  const investmentsEnabled = useInvestmentsEnabled();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const keyboardProgress = useSharedValue(0);

  const navLinks = CORE_NAV_ITEMS.filter(
    (item) =>
      item.includeInBottomNav &&
      (!item.requiresInvestmentsFeature || investmentsEnabled)
  );
  const { fontScale } = useWindowDimensions();
  const [rowWidth, setRowWidth] = useState(0);
  const compactLabels = shouldCompactNavLabels(rowWidth, navLinks.length, fontScale);

  const activeIndex = navLinks.findIndex((link) =>
    isNavItemActive(pathname, link.id as NavSectionId)
  );

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const show = Keyboard.addListener(showEvent, () => {
      setKeyboardOpen(true);
      keyboardProgress.set(
        withTiming(1, { duration: durations.medium, easing: easing.standard })
      );
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      setKeyboardOpen(false);
      keyboardProgress.set(
        withTiming(0, { duration: durations.medium, easing: easing.standard })
      );
    });

    return () => {
      show.remove();
      hide.remove();
    };
  }, [keyboardProgress]);

  // ---- Sliding active indicator -------------------------------------------
  // SPENDLY-172: React owns where the lens is and whether it shows; Reanimated
  // only animates a transient offset that slides it in from the previous tab.
  // The tabs are equal-width flex children, so the lens's frame follows from
  // the measured row width. The old version placed it from per-tab layout
  // events with an animated opacity, and on a cold start (the saved route is
  // restored after the first render) those animated values could fail to reach
  // the view, leaving no lens at all. If the slide is ever interrupted now, the
  // lens still lands on the right tab.
  const tabWidth = rowWidth > 0 && navLinks.length > 0 ? rowWidth / navLinks.length : 0;
  const slideOffset = useSharedValue(0);
  const previousIndex = useRef(activeIndex);

  // Layout effect: set the offset before the new `left` paints, so the lens
  // doesn't flash at its destination for a frame before sliding.
  useLayoutEffect(() => {
    const from = previousIndex.current;
    previousIndex.current = activeIndex;
    if (from < 0 || activeIndex < 0 || from === activeIndex || tabWidth <= 0) return;
    slideOffset.set(
      withSequence(
        withTiming((from - activeIndex) * tabWidth, { duration: 0 }),
        withTiming(0, { duration: durations.medium, easing: easing.standard })
      )
    );
  }, [activeIndex, tabWidth, slideOffset]);

  const slideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slideOffset.get() }],
  }));
  const showLens = activeIndex >= 0 && tabWidth > 0;

  // ---- Actions --------------------------------------------------------------
  const handleTabPress = (link: NavigationItem, isActive: boolean) => {
    if (isActive) return;
    void haptic.navigation();
    const route = link.path.startsWith("/") ? link.path : `/${link.path}`;
    if (route === "/dashboard") {
      dismissTo("/dashboard");
    } else {
      navigate(route as never);
    }
  };

  const keyboardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(keyboardProgress.get(), [0, 1], [1, 0]),
    transform: [
      {
        translateY: interpolate(keyboardProgress.get(), [0, 1], [0, 96]),
      },
    ],
  }));

  // SPENDLY-170/172: the capsule is blue-indigo glass in every theme, so its
  // content is white; the active tab takes the user's accent, lifted toward
  // white only as far as it needs to read, inside a blue/purple lens.
  // lib/navContrast.test.ts pins both against the lightest backdrops.
  const isDark = themeUsesDarkPalette(themeName);
  const { primary, background, card } = theme.colors;
  const activeColor = useMemo(
    () =>
      glassAccent(
        primary,
        smokeActivePill([background, card], isDark),
        smokeActiveLens([background, card], isDark)
      ),
    [primary, background, card, isDark]
  );
  const inactiveColor = `rgba(255, 255, 255, ${SMOKE_INACTIVE_ALPHA})`;
  const inactiveIconColor = `rgba(255, 255, 255, ${SMOKE_INACTIVE_ICON_ALPHA})`;

  return (
    <Animated.View
      pointerEvents={keyboardOpen ? "none" : "box-none"}
      style={[
        styles.navContainer,
        { bottom: capsuleOffset(insets.bottom) },
        keyboardStyle,
      ]}
    >
      <View style={styles.fabSlot} pointerEvents="box-none">
        <AddFab
          size="lg"
          onPress={() => setIsAddSheetOpen(true)}
          accessibilityLabel="Add"
        />
      </View>

      <GlassSurface
        tone="smoke"
        radius={CAPSULE_RADIUS}
        style={styles.capsule}
        contentStyle={styles.capsuleContent}
      >
        <View
          style={styles.row}
          accessibilityRole="tablist"
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        >
          {/* A subtle blue/purple lens, contained inside the capsule. */}
          {showLens ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.indicator,
                styles.indicatorLens,
                { left: activeIndex * tabWidth, width: tabWidth },
                slideStyle,
              ]}
            >
              <LinearGradient
                colors={[rgbaString(SMOKE_LENS_TOP), rgbaString(SMOKE_LENS_BOTTOM)]}
                style={StyleSheet.absoluteFill}
              />
              {/* The lens's own glint along its top edge. */}
              <LinearGradient
                colors={["rgba(220, 225, 255, 0)", "rgba(220, 225, 255, 0.4)", "rgba(220, 225, 255, 0)"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.lensGlint}
              />
            </Animated.View>
          ) : null}
          {navLinks.map((link, index) => {
            const isActive = index === activeIndex;
            return (
              <NavDestination
                key={link.id}
                link={link}
                isActive={isActive}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                inactiveIconColor={inactiveIconColor}
                compact={compactLabels}
                onPress={() => handleTabPress(link, isActive)}
              />
            );
          })}
        </View>
      </GlassSurface>
    </Animated.View>
  );
}

export default BottomNav;

const styles = StyleSheet.create({
  // SPENDLY-172: a column, so the FAB floats above the capsule's trailing end
  // and the capsule keeps the full width. Both stay inside this box: Android
  // only delivers touches within a view's bounds.
  navContainer: {
    position: "absolute",
    left: CAPSULE_SIDE_MARGIN,
    right: CAPSULE_SIDE_MARGIN,
    zIndex: 90,
    flexDirection: "column",
    alignItems: "stretch",
    gap: CAPSULE_FAB_GAP,
    height: CAPSULE_FAB_SIZE + CAPSULE_FAB_GAP + CAPSULE_HEIGHT,
  },
  fabSlot: {
    alignSelf: "flex-end",
    marginRight: CAPSULE_FAB_EDGE - CAPSULE_SIDE_MARGIN,
  },
  capsule: {
    height: CAPSULE_HEIGHT,
  },
  capsuleContent: {
    flex: 1,
    padding: CAPSULE_PADDING,
  },
  row: {
    flex: 1,
    flexDirection: "row",
    alignItems: "stretch",
  },
  indicator: {
    // Reaches past the row into the capsule padding, so the lens fills
    // nearly the full height of the glass.
    position: "absolute",
    top: -PILL_OVERHANG,
    bottom: -PILL_OVERHANG,
    borderRadius: 999,
    borderCurve: "continuous",
  },
  lensGlint: {
    position: "absolute",
    top: 1,
    left: "22%",
    right: "22%",
    height: 1,
  },
  indicatorLens: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: SMOKE_LENS_BORDER,
  },
  tab: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingHorizontal: 2,
    borderRadius: 999,
  },
  tabPressed: {
    opacity: 0.7,
  },
  tabLabel: {
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0,
    textAlign: "center",
  },
});
