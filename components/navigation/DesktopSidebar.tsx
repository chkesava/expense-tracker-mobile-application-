import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  FlaskConical,
  Home,
  Palette,
  Plus,
  Receipt,
  Settings,
  Shield,
  Sparkles,
  TrendingUp,
} from "lucide-react-native";

import { SideDrawer } from "@/components/SideDrawer";
import { AppBarBrand } from "@/components/layout/AppBarBrand";
import { useInvestmentsEnabled } from "@/hooks/useInvestmentsEnabled";
import { useAuth } from "@/providers/AuthProvider";
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
import { EXPENSE_PALETTE_SWATCHES, THEME_LABELS } from "@/theme/tokens";

const ICON_MAP: Record<NavSectionId, React.ComponentType<{ size: number; color: string; strokeWidth?: number }>> = {
  home: Home,
  ledger: Receipt,
  investments: TrendingUp,
  vaults: Shield,
  insights: BarChart3,
  intelligence: Sparkles,
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
 *
 * SPENDLY-718: the brand sits on top, and a footer holds the current palette
 * (opening Settings › Appearance, the existing picker) and the profile row,
 * which opens that same drawer.
 */
export function DesktopSidebar() {
  const { navigate, dismissTo } = useRouter();
  const pathname = usePathname();
  const { theme, themeName, expensePalette } = useTheme();
  const { user } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
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

  const paletteLabel = THEME_LABELS[themeName] ?? THEME_LABELS[expensePalette];
  const swatches = EXPENSE_PALETTE_SWATCHES[expensePalette] ?? [];
  const displayName = user?.displayName?.trim() || user?.email?.split("@")[0] || "Profile";
  const initial = (user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase();
  const appearanceActive = pathname.startsWith("/settings/appearance");

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.card, borderRightColor: theme.colors.outlineVariant },
      ]}
      role="navigation"
    >
      <View style={styles.brand}>
        <AppBarBrand />
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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

      <View style={[styles.footer, { borderTopColor: theme.colors.outlineVariant }]}>
        <Pressable
          onPress={() => {
            if (appearanceActive) return;
            void haptic.navigation();
            navigate("/settings/appearance" as never);
          }}
          accessibilityRole="link"
          accessibilityLabel={`Appearance, ${paletteLabel} palette. Change`}
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.footerRow,
            { borderColor: theme.colors.border },
            (pressed || hovered || appearanceActive) && { backgroundColor: surfaces.control },
          ]}
        >
          <Palette size={18} color={theme.colors.mutedForeground} strokeWidth={2} />
          <Text
            numberOfLines={1}
            style={[styles.footerLabel, { color: theme.colors.foreground, fontFamily: theme.fontFamily.medium }]}
          >
            {paletteLabel}
          </Text>
          <View style={styles.swatches} accessible={false}>
            {swatches.slice(0, 3).map((hex) => (
              <View
                key={hex}
                style={[styles.swatch, { backgroundColor: hex, borderColor: theme.colors.outlineVariant }]}
              />
            ))}
          </View>
        </Pressable>

        <Pressable
          onPress={() => {
            void haptic.navigation();
            setIsProfileOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel="Open profile and settings"
          style={({ pressed, hovered }: { pressed: boolean; hovered?: boolean }) => [
            styles.profileRow,
            (pressed || hovered) && { backgroundColor: surfaces.control },
          ]}
        >
          <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}>
            <Text style={[styles.avatarText, { color: theme.colors.primaryForeground, fontFamily: theme.fontFamily.bold }]}>
              {initial}
            </Text>
          </View>
          <View style={styles.profileText}>
            <Text
              numberOfLines={1}
              style={[styles.profileName, { color: theme.colors.foreground, fontFamily: theme.fontFamily.semibold }]}
            >
              {displayName}
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.profileHint, { color: theme.colors.mutedForeground, fontFamily: theme.fontFamily.regular }]}
            >
              Profile & settings
            </Text>
          </View>
          <ChevronRight size={16} color={theme.colors.mutedForeground} strokeWidth={2.2} />
        </Pressable>
      </View>

      <SideDrawer isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SPENDLY_SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brand: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 16,
  },
  footer: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 42,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  footerLabel: {
    flex: 1,
    fontSize: 13.5,
  },
  swatches: {
    flexDirection: "row",
  },
  swatch: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 14,
  },
  profileText: {
    flex: 1,
    minWidth: 0,
  },
  profileName: {
    fontSize: 14,
  },
  profileHint: {
    fontSize: 12,
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
