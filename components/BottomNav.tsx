import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { usePathname, useRouter } from "expo-router";
import {
  BarChart3,
  Home,
  Receipt,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import {
  CAPSULE_FAB_GAP,
  CAPSULE_HEIGHT,
  CAPSULE_SIDE_MARGIN,
  capsuleOffset,
} from "@/components/layout/chrome";
import { AddFab } from "@/components/ui/AddFab";
import { GlassSurface } from "@/components/ui/GlassSurface";
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
const CAPSULE_PADDING = 6;

/** #RRGGBB -> rgba(). Anything else is returned unchanged. */
function alpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

type TabFrame = { x: number; width: number };

function NavDestination({
  link,
  isActive,
  activeColor,
  inactiveColor,
  onPress,
  onLayout,
}: {
  link: NavigationItem;
  isActive: boolean;
  activeColor: string;
  inactiveColor: string;
  onPress: () => void;
  onLayout: (event: LayoutChangeEvent) => void;
}) {
  const { t } = useTranslation();
  const Icon = ICON_MAP[link.id] || Wallet;
  const label = t(link.translationKey, link.mobileLabel || link.label);
  const color = isActive ? activeColor : inactiveColor;

  return (
    <Pressable
      onPress={onPress}
      onLayout={onLayout}
      style={({ pressed }) => [styles.tab, pressed && !isActive && styles.tabPressed]}
      accessibilityRole="tab"
      accessibilityLabel={`Go to ${label}`}
      accessibilityState={{ selected: isActive }}
    >
      <Icon size={22} color={color} strokeWidth={isActive ? 2.4 : 1.85} />
      <Text
        style={[
          styles.tabLabel,
          { color, fontWeight: isActive ? "700" : "500" },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * Floating glass capsule navigation with the add FAB riding beside it
 * (SPENDLY-161). Geometry comes from `shared/config/bottomChrome`, which is
 * also what every list pads by, so content always scrolls clear of both.
 */
export function BottomNav() {
  const { navigate, dismissTo } = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { setIsAddSheetOpen } = useModals();
  const investmentsEnabled = useInvestmentsEnabled();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const keyboardProgress = useSharedValue(0);

  const navLinks = CORE_NAV_ITEMS.filter(
    (item) =>
      item.includeInBottomNav &&
      (!item.requiresInvestmentsFeature || investmentsEnabled)
  );
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
  // Tab frames are read imperatively; keeping them in state would re-render
  // the whole row on every layout pass.
  const frames = useRef<Record<number, TabFrame>>({});
  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);
  const indicatorOpacity = useSharedValue(0);
  const placedOnce = useRef(false);

  const moveIndicator = useCallback(
    (index: number) => {
      const frame = frames.current[index];
      if (index < 0 || !frame) {
        indicatorOpacity.set(withTiming(0, { duration: durations.short }));
        return;
      }
      const timing = { duration: durations.medium, easing: easing.standard };
      if (!placedOnce.current) {
        // First placement snaps; only later changes slide.
        indicatorX.set(frame.x);
        indicatorWidth.set(frame.width);
        placedOnce.current = true;
      } else {
        indicatorX.set(withTiming(frame.x, timing));
        indicatorWidth.set(withTiming(frame.width, timing));
      }
      indicatorOpacity.set(withTiming(1, { duration: durations.short }));
    },
    [indicatorOpacity, indicatorWidth, indicatorX]
  );

  useEffect(() => {
    moveIndicator(activeIndex);
  }, [activeIndex, moveIndicator]);

  const handleTabLayout = (index: number) => (event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    frames.current[index] = { x, width };
    if (index === activeIndex) moveIndicator(activeIndex);
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    opacity: indicatorOpacity.get(),
    width: indicatorWidth.get(),
    transform: [{ translateX: indicatorX.get() }],
  }));

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

  const activeColor = theme.colors.primary;
  const inactiveColor = theme.colors.mutedForeground;

  return (
    <Animated.View
      pointerEvents={keyboardOpen ? "none" : "box-none"}
      style={[
        styles.navContainer,
        { bottom: capsuleOffset(insets.bottom) },
        keyboardStyle,
      ]}
    >
      <GlassSurface style={styles.capsule} contentStyle={styles.capsuleContent}>
        <View style={styles.row} accessibilityRole="tablist">
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              { backgroundColor: alpha(activeColor, isDark ? 0.2 : 0.12) },
              indicatorStyle,
            ]}
          />
          {navLinks.map((link, index) => {
            const isActive = index === activeIndex;
            return (
              <NavDestination
                key={link.id}
                link={link}
                isActive={isActive}
                activeColor={activeColor}
                inactiveColor={inactiveColor}
                onPress={() => handleTabPress(link, isActive)}
                onLayout={handleTabLayout(index)}
              />
            );
          })}
        </View>
      </GlassSurface>

      <AddFab
        size="lg"
        onPress={() => setIsAddSheetOpen(true)}
        accessibilityLabel="Add"
      />
    </Animated.View>
  );
}

export default BottomNav;

const styles = StyleSheet.create({
  navContainer: {
    position: "absolute",
    left: CAPSULE_SIDE_MARGIN,
    right: CAPSULE_SIDE_MARGIN,
    zIndex: 90,
    flexDirection: "row",
    alignItems: "center",
    gap: CAPSULE_FAB_GAP,
    height: CAPSULE_HEIGHT,
  },
  capsule: {
    flex: 1,
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
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
    borderCurve: "continuous",
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
    fontSize: 11,
    letterSpacing: 0.1,
    textAlign: "center",
  },
});
