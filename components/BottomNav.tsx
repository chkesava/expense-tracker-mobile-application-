import { useEffect, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { usePathname, useRouter } from "expo-router";
import {
  BarChart3,
  Home,
  Plus,
  Receipt,
  Shield,
  TrendingUp,
  Wallet,
} from "lucide-react-native";

import {
  BOTTOM_NAV_BAR_HEIGHT,
  BOTTOM_NAV_FAB_EDGE,
  BOTTOM_NAV_FAB_GAP,
  BOTTOM_NAV_FAB_SIZE,
} from "@/components/layout/chrome";
import { haptic } from "@/lib/haptics";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
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

type ThemeColors = ReturnType<typeof useTheme>["theme"]["colors"];

function NavDestination({
  link,
  isActive,
  colors,
  isDark,
  onPress,
}: {
  link: NavigationItem;
  isActive: boolean;
  colors: ThemeColors;
  isDark: boolean;
  onPress: () => void;
}) {
  const progress = useSharedValue(isActive ? 1 : 0);
  const Icon = ICON_MAP[link.id] || Wallet;

  useEffect(() => {
    progress.set(
      withTiming(isActive ? 1 : 0, {
        duration: durations.medium,
        easing: easing.standard,
      })
    );
  }, [isActive, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.88, 1]) }],
  }));

  const label = link.mobileLabel || link.label;
  const activeColor = colors.success;
  const inactiveColor = colors.mutedForeground;
  const ripple = isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)";

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: ripple, borderless: false }}
      style={styles.tabButton}
      accessibilityRole="tab"
      accessibilityLabel={`Go to ${label}`}
      accessibilityState={{ selected: isActive }}
    >
      <View style={styles.tabInner}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activePill,
            {
              backgroundColor: isDark
                ? "rgba(52, 179, 122, 0.18)"
                : "rgba(37, 150, 90, 0.12)",
            },
            pillStyle,
          ]}
        />
        <Icon
          size={22}
          color={isActive ? activeColor : inactiveColor}
          strokeWidth={isActive ? 2.4 : 1.85}
        />
        <Text
          style={[
            styles.tabLabel,
            {
              color: isActive ? activeColor : inactiveColor,
              fontWeight: isActive ? "700" : "500",
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function AddExpenseFab({
  onPress,
  colors,
  bottomOffset,
}: {
  onPress: () => void;
  colors: ThemeColors;
  bottomOffset: number;
}) {
  const pressed = useSharedValue(0);

  const handlePress = () => {
    void haptic.impact();
    onPress();
  };

  const tap = Gesture.Tap()
    .onBegin(() => {
      pressed.set(withTiming(1, { duration: durations.short }));
    })
    .onFinalize(() => {
      pressed.set(withTiming(0, { duration: durations.medium }));
    })
    .onEnd(() => {
      runOnJS(handlePress)();
    });

  const fabStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pressed.get(), [0, 1], [1, 0.92]) }],
  }));

  return (
    <View
      pointerEvents="box-none"
      style={[styles.fabAnchor, { bottom: bottomOffset }]}
    >
      <GestureDetector gesture={tap}>
        <Animated.View
          accessible
          accessibilityRole="button"
          accessibilityLabel="Add Expense"
          style={[
            styles.fab,
            {
              backgroundColor: colors.success,
              shadowColor: colors.success,
            },
            fabStyle,
          ]}
        >
          <Plus size={26} color={colors.successForeground} strokeWidth={2.6} />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * Compact Android bottom navigation with an even tab row and a trailing FAB.
 */
export function BottomNav() {
  const { navigate, dismissTo } = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { setIsAddExpenseOpen } = useModals();
  const { settings } = useSettings();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const keyboardProgress = useSharedValue(0);

  const navLinks = CORE_NAV_ITEMS.filter(
    (item) =>
      item.includeInBottomNav &&
      (!item.requiresInvestmentsFeature || settings.enableInvestments)
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

  const handleAddExpense = () => {
    setIsAddExpenseOpen(true);
  };

  const keyboardStyle = useAnimatedStyle(() => ({
    opacity: interpolate(keyboardProgress.get(), [0, 1], [1, 0]),
    transform: [
      {
        translateY: interpolate(keyboardProgress.get(), [0, 1], [0, 96]),
      },
    ],
  }));

  const bottomInset = Math.max(insets.bottom, 8);
  const fabBottomOffset = BOTTOM_NAV_BAR_HEIGHT + bottomInset + BOTTOM_NAV_FAB_GAP;

  return (
    <Animated.View
      pointerEvents={keyboardOpen ? "none" : "box-none"}
      style={[styles.navContainer, keyboardStyle]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.barFill,
          {
            backgroundColor: isDark ? theme.colors.card : "#FFFFFF",
            borderTopColor: theme.colors.outlineVariant,
            height: BOTTOM_NAV_BAR_HEIGHT + bottomInset,
          },
        ]}
      />

      <View
        style={[
          styles.destinationsRow,
          { marginBottom: bottomInset },
        ]}
      >
        {navLinks.map((link) => {
          const isActive = isNavItemActive(pathname, link.id as NavSectionId);
          return (
            <NavDestination
              key={link.id}
              link={link}
              isActive={isActive}
              colors={theme.colors}
              isDark={isDark}
              onPress={() => handleTabPress(link, isActive)}
            />
          );
        })}
      </View>

      <AddExpenseFab
        onPress={handleAddExpense}
        colors={theme.colors}
        bottomOffset={fabBottomOffset}
      />
    </Animated.View>
  );
}

export default BottomNav;

const styles = StyleSheet.create({
  navContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 90,
    overflow: "visible",
  },
  barFill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  destinationsRow: {
    flexDirection: "row",
    alignItems: "stretch",
    height: BOTTOM_NAV_BAR_HEIGHT,
    paddingHorizontal: 4,
    zIndex: 2,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  tabInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 2,
    minWidth: 0,
    width: "100%",
    borderRadius: 16,
    borderCurve: "continuous",
  },
  activePill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 16,
    borderCurve: "continuous",
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.1,
    textAlign: "center",
  },
  fabAnchor: {
    position: "absolute",
    right: BOTTOM_NAV_FAB_EDGE,
    zIndex: 4,
  },
  fab: {
    width: BOTTOM_NAV_FAB_SIZE,
    height: BOTTOM_NAV_FAB_SIZE,
    borderRadius: BOTTOM_NAV_FAB_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },
});
