import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Gift, Home, Landmark, Receipt, Wallet, type LucideIcon } from "lucide-react-native";

import { BOTTOM_NAV_BAR_HEIGHT } from "@/components/layout/chrome";
import { useGaneshTokens } from "@/components/ganesh/ui/tokens";
import { haptic } from "@/lib/haptics";
import { durations, easing } from "@/theme/motion";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Five destinations, matching the Expense Tracker's bottom nav.
 *
 * Committee used to be a sixth tab; it now lives one tap inside Pandal, which
 * is the app's "more" surface (committee, assets, sponsors, permanent fund,
 * admin, settings). Six evenly-split destinations forced 10px labels.
 */
const TABS: Array<{ name: string; label: string; Icon: LucideIcon }> = [
  { name: "index", label: "Home", Icon: Home },
  { name: "collections", label: "Collections", Icon: Wallet },
  { name: "expenses", label: "Expenses", Icon: Receipt },
  { name: "contributions", label: "Contributions", Icon: Gift },
  { name: "pandal", label: "Pandal", Icon: Landmark },
];

function TabDestination({
  label,
  Icon,
  isFocused,
  onPress,
}: {
  label: string;
  Icon: LucideIcon;
  isFocused: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const progress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    progress.set(
      withTiming(isFocused ? 1 : 0, {
        duration: durations.medium,
        easing: easing.standard,
      })
    );
  }, [isFocused, progress]);

  const pillStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: interpolate(progress.get(), [0, 1], [0.88, 1]) }],
  }));

  const color = isFocused ? g.saffron : theme.colors.mutedForeground;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={`Go to ${label}`}
      onPress={onPress}
      android_ripple={{
        color: g.isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
        borderless: false,
      }}
      style={styles.item}
    >
      <View style={styles.itemInner}>
        <Animated.View
          pointerEvents="none"
          style={[styles.activePill, { backgroundColor: g.wash(g.saffron) }, pillStyle]}
        />
        <Icon size={22} color={color} strokeWidth={isFocused ? 2.4 : 1.85} />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={[
            styles.label,
            { color, fontFamily: isFocused ? theme.fontFamily.semibold : theme.fontFamily.medium },
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export function GaneshTabBar({
  state,
  navigation,
}: {
  state: { routes: Array<{ key: string; name: string }>; index: number };
  navigation: {
    emit: (event: object) => { defaultPrevented?: boolean };
    navigate: (name: string, params?: object) => void;
  };
}) {
  const { theme } = useTheme();
  const g = useGaneshTokens();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  const visibleRoutes = state.routes.filter((route) =>
    TABS.some((tab) => tab.name === route.name)
  );

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: g.isDark ? theme.colors.card : "#FFFFFF",
          borderTopColor: theme.colors.outlineVariant ?? theme.colors.border,
          paddingBottom: bottomInset,
          height: BOTTOM_NAV_BAR_HEIGHT + bottomInset,
        },
      ]}
    >
      {visibleRoutes.map((route) => {
        const meta = TABS.find((tab) => tab.name === route.name);
        if (!meta) return null;
        const isFocused = state.routes[state.index]?.name === route.name;

        return (
          <TabDestination
            key={route.key}
            label={meta.label}
            Icon={meta.Icon}
            isFocused={isFocused}
            onPress={() => {
              if (isFocused) return;
              void haptic.navigation();
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!event.defaultPrevented) navigation.navigate(route.name);
            }}
          />
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "stretch",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    elevation: 2,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  item: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  itemInner: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 6,
    gap: 2,
    width: "100%",
    minWidth: 0,
    borderRadius: 16,
    borderCurve: "continuous",
  },
  activePill: {
    ...StyleSheet.absoluteFill,
    borderRadius: 16,
    borderCurve: "continuous",
  },
  label: {
    fontSize: 11,
    letterSpacing: 0.1,
    textAlign: "center",
  },
});
