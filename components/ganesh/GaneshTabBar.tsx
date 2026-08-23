import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Gift,
  Home,
  Receipt,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react-native";

import { BOTTOM_NAV_BAR_HEIGHT } from "@/components/layout/chrome";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const TABS: Array<{ name: string; label: string; Icon: LucideIcon }> = [
  { name: "index", label: "Home", Icon: Home },
  { name: "collections", label: "Collections", Icon: Wallet },
  { name: "expenses", label: "Expenses", Icon: Receipt },
  { name: "contributions", label: "Contributions", Icon: Gift },
  { name: "pandal", label: "Pandal", Icon: Users },
];

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
  const { theme, themeName } = useTheme();
  const insets = useSafeAreaInsets();
  const isDark = themeUsesDarkPalette(themeName);
  const visibleRoutes = state.routes.filter((route) =>
    TABS.some((tab) => tab.name === route.name)
  );

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: isDark ? "rgba(12, 15, 26, 0.94)" : "rgba(255,255,255,0.94)",
          borderTopColor: theme.colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
          height: BOTTOM_NAV_BAR_HEIGHT + Math.max(insets.bottom, 8),
        },
      ]}
    >
      {visibleRoutes.map((route) => {
        const meta = TABS.find((tab) => tab.name === route.name);
        if (!meta) return null;
        const isFocused = state.routes[state.index]?.name === route.name;
        const color = isFocused ? theme.colors.primary : theme.colors.mutedForeground;
        const { Icon } = meta;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={meta.label}
            onPress={() => {
              const event = navigation.emit({
                type: "tabPress",
                target: route.key,
                canPreventDefault: true,
              });
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name);
              }
            }}
            style={({ pressed }) => [styles.item, pressed && { opacity: 0.8 }]}
          >
            <Icon size={22} color={color} strokeWidth={isFocused ? 2.5 : 2} />
            <Text style={{ color, fontSize: 11, fontWeight: isFocused ? "700" : "500" }}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
});
