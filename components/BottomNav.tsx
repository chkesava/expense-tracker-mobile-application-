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

import { AddFab } from "@/components/ui/AddFab";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  CORE_NAV_ITEMS,
  isNavItemActive,
  type NavSectionId,
} from "@/shared/config/navigation";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { setIsAddExpenseOpen } = useModals();
  const { settings } = useSettings();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const iconMap: Record<string, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
    home: Home,
    ledger: Wallet,
    investments: TrendingUp,
    vaults: Users,
    insights: BarChart3,
  };

  const navLinks = CORE_NAV_ITEMS.filter(
    (item) => item.includeInBottomNav && (!item.requiresInvestmentsFeature || settings.enableInvestments)
  );

  const mid = Math.ceil(navLinks.length / 2);
  const leftLinks = navLinks.slice(0, mid);
  const rightLinks = navLinks.slice(mid);

  const renderTab = (link: (typeof navLinks)[number]) => {
    const isActive = isNavItemActive(pathname, link.id as NavSectionId);
    const Icon = iconMap[link.id] || Home;

    return (
      <Pressable
        key={link.id}
        onPress={() => {
          if (!isActive) {
            Haptics.selectionAsync().catch(() => undefined);
            const route = link.path.startsWith("/") ? link.path : `/${link.path}`;
            router.push(route as any);
          }
        }}
        style={({ pressed }) => [
          styles.tabButton,
          isActive && [
            styles.tabButtonActive,
            {
              backgroundColor: isDark
                ? "rgba(107, 99, 255, 0.12)"
                : "rgba(79, 70, 255, 0.08)",
            },
          ],
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="tab"
        accessibilityLabel={`Go to ${link.label}`}
        accessibilityState={{ selected: isActive }}
      >
        <Icon
          size={20}
          color={isActive ? theme.colors.primary : theme.colors.mutedForeground}
          strokeWidth={isActive ? 2.5 : 2}
        />
        <Text
          style={[
            styles.tabLabel,
            {
              color: isActive
                ? theme.colors.primary
                : theme.colors.mutedForeground,
              fontWeight: isActive ? "800" : "600",
            },
          ]}
        >
          {link.mobileLabel || link.label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          bottom: Math.max(insets.bottom, 12),
        },
      ]}
    >
      <View
        style={[
          styles.dockCard,
          {
            backgroundColor: theme.colors.card,
            borderColor: theme.colors.border,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: isDark ? 0.35 : 0.12,
            shadowRadius: 16,
            elevation: 12,
          },
        ]}
      >
        {leftLinks.map(renderTab)}

        {/* Center Add Button */}
        <View style={styles.fabContainer}>
          <AddFab
            size="md"
            onPress={() => setIsAddExpenseOpen(true)}
            accessibilityLabel="Add transaction"
          />
        </View>

        {rightLinks.map(renderTab)}
      </View>
    </View>
  );
}

export default BottomNav;

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 90,
  },
  dockCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    maxWidth: 440,
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    borderRadius: 18,
    gap: 3,
  },
  tabButtonActive: {},
  tabLabel: {
    fontSize: 10,
    letterSpacing: 0.1,
  },
  fabContainer: {
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
});
