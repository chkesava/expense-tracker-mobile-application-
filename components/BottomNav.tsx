import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  BarChart3,
  Home,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react-native";

import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  CORE_NAV_ITEMS,
  isNavItemActive,
  type NavSectionId,
} from "@/shared/config/navigation";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

/**
 * Material Design 3 Navigation Bar for Android
 * 
 * Spec:
 * - 80dp container height + safe area bottom inset
 * - Pill active indicator (64x32dp) with primaryContainer fill
 * - 24dp icons with primary / onSurfaceVariant colors
 * - 12sp labels (labelMedium)
 * - Android ripple and haptic feedback
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

  const handleTabPress = (link: (typeof navLinks)[number], isActive: boolean) => {
    if (isActive) return;
    Haptics.selectionAsync().catch(() => undefined);
    const route = link.path.startsWith("/") ? link.path : `/${link.path}`;
    // Replace to keep tab navigation clean and prevent endless stack accumulation
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
          backgroundColor: theme.colors.card,
          borderTopColor: theme.colors.border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      <View style={styles.destinationsRow}>
        {navLinks.map((link) => {
          const isActive = isNavItemActive(pathname, link.id as NavSectionId);
          const Icon = iconMap[link.id] || Home;

          return (
            <Pressable
              key={link.id}
              onPress={() => handleTabPress(link, isActive)}
              android_ripple={{
                color: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
                borderless: false,
              }}
              style={styles.tabButton}
              accessibilityRole="tab"
              accessibilityLabel={`Go to ${link.label}`}
              accessibilityState={{ selected: isActive }}
            >
              {/* Material 3 Active Indicator Pill */}
              <View
                style={[
                  styles.indicatorPill,
                  {
                    backgroundColor: isActive
                      ? isDark
                        ? "rgba(107, 99, 255, 0.22)"
                        : "rgba(79, 70, 255, 0.12)"
                      : "transparent",
                  },
                ]}
              >
                <Icon
                  size={24}
                  color={
                    isActive
                      ? theme.colors.primary
                      : theme.colors.mutedForeground
                  }
                  strokeWidth={isActive ? 2.4 : 1.8}
                />
              </View>

              {/* Material 3 Label */}
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isActive
                      ? theme.colors.foreground
                      : theme.colors.mutedForeground,
                    fontWeight: isActive ? "700" : "500",
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
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    zIndex: 90,
  },
  destinationsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    height: 72,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  indicatorPill: {
    width: 60,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
