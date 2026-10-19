import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  BarChart3,
  CalendarDays,
  FlaskConical,
  Home,
  Plus,
  Receipt,
  Settings,
  Shield,
  TrendingUp,
} from "lucide-react-native";

import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { useUserRole } from "@/hooks/useUserRole";
import { haptic } from "@/lib/haptics";
import { useModals } from "@/providers/ModalProvider";
import { useTranslation } from "@/providers/LocalizationProvider";
import {
  ADMIN_NAV_ITEM,
  CORE_NAV_ITEMS,
  isNavItemActive,
  type NavSectionId,
} from "@/shared/config/navigation";
import { SPENDLY_SIDEBAR_WIDTH } from "@/shared/utils/responsiveLayout";
import { useSurfaces } from "@/theme/surfaces";
import { useTheme } from "@/theme/ThemeProvider";

const ICON_MAP: Record<NavSectionId, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  home: Home,
  ledger: Receipt,
  investments: TrendingUp,
  vaults: Shield,
  insights: BarChart3,
  calendar: CalendarDays,
  whatIf: FlaskConical,
  settings: Settings,
  admin: Shield,
};

/**
 * Desktop web navigation (SPENDLY-559). Replaces the bottom nav, dock and
 * swipe-tabs at the expanded layout; phones and native never mount it.
 *
 * Same destinations and visibility rules as the side drawer, so a feature or
 * role never shows here but not there. Profile, ghost mode, switch app and
 * sign out stay in the drawer, opened from the header as before.
 */
export function DesktopSidebar() {
  const { navigate, dismissTo } = useRouter();
  const pathname = usePathname();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  const investmentsEnabled = useInvestmentsEnabled();
  const { setIsAddSheetOpen } = useModals();

  const links = [
    ...CORE_NAV_ITEMS.filter(
      (item) => item.includeInDrawer && (!item.requiresInvestmentsFeature || investmentsEnabled)
    ),
    ...(isAdmin ? [ADMIN_NAV_ITEM] : []),
  ];

  const handleNavigate = (path: string, isActive: boolean) => {
    if (isActive) return;
    void haptic.navigation();
    const route = path.startsWith("/") ? path : `/${path}`;
    // Top-level sections, not a drill-down: reuse the screen if it is
    // already in the stack, exactly like the bottom nav and drawer.
    if (route === "/dashboard") {
      dismissTo("/dashboard");
    } else {
      navigate(route as never);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.card, borderRightColor: theme.colors.outlineVariant },
      ]}
      role="navigation"
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Pressable
          onPress={() => setIsAddSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Add"
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.addButton,
            { backgroundColor: theme.colors.primary },
            (pressed || hovered) && styles.addButtonActive,
          ]}
        >
          <Plus size={18} color={theme.colors.primaryForeground} strokeWidth={2.4} />
          <Text
            style={[
              styles.addLabel,
              { color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.semibold },
            ]}
          >
            Add
          </Text>
        </Pressable>

        <View style={styles.list}>
          {links.map((link) => {
            const isActive = isNavItemActive(pathname, link.id);
            const Icon = ICON_MAP[link.id] ?? Home;
            const label = t(link.translationKey, link.label);
            const color = isActive ? theme.colors.primary : theme.colors.mutedForeground;
            return (
              <Pressable
                key={link.id}
                onPress={() => handleNavigate(link.path, isActive)}
                accessibilityRole="link"
                accessibilityLabel={label}
                accessibilityState={{ selected: isActive }}
                style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
                  styles.item,
                  isActive
                    ? { backgroundColor: surfaces.wash(theme.colors.primary) }
                    : (pressed || hovered) && { backgroundColor: surfaces.control },
                ]}
              >
                <Icon size={20} color={color} strokeWidth={isActive ? 2.4 : 2} />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.itemLabel,
                    {
                      color: isActive ? theme.colors.foreground : theme.colors.mutedForeground,
                      fontFamily: isActive ? theme.fontFamily.semibold : theme.fontFamily.medium,
                    },
                  ]}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SPENDLY_SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 16,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 12,
  },
  addButtonActive: {
    opacity: 0.88,
  },
  addLabel: {
    fontSize: 15,
  },
  list: {
    gap: 2,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  itemLabel: {
    flex: 1,
    fontSize: 14,
  },
});
