import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import {
  BarChart3,
  Home,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react-native";

import { haptic } from "@/lib/haptics";

import { useSettings } from "@/providers/SettingsProvider";
import {
  CORE_NAV_ITEMS,
  isNavItemActive,
  type NavSectionId,
} from "@/shared/config/navigation";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/**
 * Bottom tab bar — purple active indicator matching the Vault dashboard reference.
 */
export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { settings } = useSettings();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const iconMap: Record<
    string,
    React.ComponentType<{ size: number; color: string; strokeWidth?: number }>
  > = {
    home: Home,
    ledger: Wallet,
    investments: TrendingUp,
    vaults: Users,
    insights: BarChart3,
  };

  const navLinks = CORE_NAV_ITEMS.filter(
    (item) =>
      item.includeInBottomNav &&
      (!item.requiresInvestmentsFeature || settings.enableInvestments)
  );

  const handleTabPress = (
    link: (typeof navLinks)[number],
    isActive: boolean
  ) => {
    if (isActive) return;
    void haptic.navigation();
    const route = link.path.startsWith("/") ? link.path : `/${link.path}`;
    if (route === "/dashboard") {
      router.replace("/dashboard");
    } else {
      router.navigate(route as any);
    }
  };

  return (
    <View
      style={[
        styles.navContainer,
        {
          backgroundColor: isDark ? "rgba(8, 10, 20, 0.96)" : theme.colors.card,
          borderTopColor: isDark
            ? "rgba(107, 99, 255, 0.14)"
            : theme.colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <View style={styles.destinationsRow}>
        {navLinks.map((link) => {
          const isActive = isNavItemActive(pathname, link.id as NavSectionId);
          const Icon = iconMap[link.id] || Home;
          const activeColor = theme.colors.primary;
          const inactiveColor = theme.colors.mutedForeground;

          return (
            <Pressable
              key={link.id}
              onPress={() => handleTabPress(link, isActive)}
              android_ripple={{
                color: isDark ? "rgba(107,99,255,0.18)" : "rgba(79,70,255,0.1)",
                borderless: false,
              }}
              style={styles.tabButton}
              accessibilityRole="tab"
              accessibilityLabel={`Go to ${link.label}`}
              accessibilityState={{ selected: isActive }}
            >
              {isActive ? (
                <View
                  style={[
                    styles.activeGlowLine,
                    { backgroundColor: activeColor, shadowColor: activeColor },
                  ]}
                />
              ) : (
                <View style={styles.activeGlowLinePlaceholder} />
              )}

              <View
                style={[
                  styles.iconWrap,
                  isActive && {
                    backgroundColor: isDark
                      ? "rgba(107, 99, 255, 0.2)"
                      : "rgba(79, 70, 255, 0.12)",
                  },
                ]}
              >
                <Icon
                  size={22}
                  color={isActive ? activeColor : inactiveColor}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
              </View>

              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive ? activeColor : inactiveColor,
                    fontWeight: isActive ? "800" : "500",
                  },
                ]}
                numberOfLines={1}
              >
                {link.mobileLabel || link.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default BottomNav;

const styles = StyleSheet.create({
  navContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    shadowColor: "#6B63FF",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    zIndex: 90,
  },
  destinationsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: 72,
    paddingHorizontal: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-start",
    height: "100%",
    paddingTop: 4,
    paddingBottom: 6,
    borderRadius: 16,
    gap: 4,
  },
  activeGlowLine: {
    width: 28,
    height: 3,
    borderRadius: 2,
    marginBottom: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 3,
  },
  activeGlowLinePlaceholder: {
    width: 28,
    height: 3,
    marginBottom: 4,
    opacity: 0,
  },
  iconWrap: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 11,
    letterSpacing: 0.2,
  },
});
