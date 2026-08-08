import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeIn,
  FadeInRight,
  FadeOut,
  SlideInRight,
} from "react-native-reanimated";
import {
  Activity,
  ArrowLeftRight,
  BarChart3,
  Home,
  LogOut,
  Settings,
  Shield,
  TrendingUp,
  Users,
  Wallet,
  X,
} from "lucide-react-native";

import { useUserRole } from "@/hooks/useUserRole";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import {
  ADMIN_NAV_ITEM,
  CORE_NAV_ITEMS,
  isNavItemActive,
  type NavSectionId,
} from "@/shared/config/navigation";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface SideDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SideDrawer({ isOpen, onClose }: SideDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const { isAdmin } = useUserRole();
  const { settings } = useSettings();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const iconMap: Record<NavSectionId, React.ComponentType<{ size: number; color: string }>> = {
    home: Home,
    ledger: Wallet,
    investments: TrendingUp,
    vaults: Users,
    insights: BarChart3,
    settings: Settings,
    admin: Shield,
  };

  const navLinks = [
    ...CORE_NAV_ITEMS.filter(
      (item) => item.includeInDrawer && (!item.requiresInvestmentsFeature || settings.enableInvestments)
    ),
    ...(isAdmin ? [ADMIN_NAV_ITEM] : []),
  ];

  const handleNavigate = (path: string) => {
    void haptic.navigation();
    onClose();
    const route = path.startsWith("/") ? path : `/${path}`;
    router.push(route as any);
  };

  const handleSwitchApp = () => {
    void haptic.navigation();
    onClose();
    router.push("/app-selector" as any);
  };

  const handleLogout = async () => {
    void haptic.impact();
    onClose();
    await logout();
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.container}>
        {/* Backdrop with Animated Fade */}
        <AnimatedPressable
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={[
            styles.backdrop,
            { backgroundColor: isDark ? "rgba(0,0,0,0.65)" : "rgba(15,23,42,0.4)" },
          ]}
          onPress={onClose}
          accessibilityLabel="Close navigation drawer"
        />

        {/* Drawer Panel with Reanimated slide-in */}
        <Animated.View
          entering={SlideInRight.springify().damping(24).stiffness(250)}
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors.card,
              borderLeftColor: theme.colors.border,
              paddingTop: insets.top + 12,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.brandContainer}>
              <View style={[styles.brandIcon, { backgroundColor: theme.colors.foreground }]}>
                <Activity size={18} color={theme.colors.background} strokeWidth={2.5} />
              </View>
              <Text
                style={[
                  styles.brandTitle,
                  { color: theme.colors.foreground, fontSize: theme.typography.lg },
                ]}
              >
                VAULT
              </Text>
            </View>

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : "rgba(0,0,0,0.05)",
                },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel="Close menu"
            >
              <X size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          {/* Links List with Staggered Entrance */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.linksContainer}
          >
            {navLinks.map((link, idx) => {
              const isActive = isNavItemActive(pathname, link.id);
              const Icon = iconMap[link.id];

              return (
                <Animated.View
                  key={link.id}
                  entering={FadeInRight.delay(idx * 35).springify().damping(18)}
                >
                  <Pressable
                    onPress={() => handleNavigate(link.path)}
                    style={({ pressed }) => [
                      styles.navItem,
                      {
                        backgroundColor: isActive
                          ? isDark
                            ? "rgba(107, 99, 255, 0.15)"
                            : "rgba(79, 70, 255, 0.1)"
                          : "transparent",
                      },
                      pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] },
                    ]}
                  >
                    <Icon
                      size={20}
                      color={isActive ? theme.colors.primary : theme.colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.navItemLabel,
                        {
                          color: isActive
                            ? theme.colors.primary
                            : theme.colors.foreground,
                          fontWeight: isActive ? "800" : "600",
                          fontSize: theme.typography.md,
                        },
                      ]}
                    >
                      {link.label}
                    </Text>
                  </Pressable>
                </Animated.View>
              );
            })}
          </ScrollView>

          {/* Footer & User Profile */}
          <View
            style={[
              styles.footer,
              { borderTopColor: theme.colors.border },
            ]}
          >
            <View style={styles.userProfile}>
              <View
                style={[
                  styles.avatar,
                  {
                    backgroundColor: theme.colors.primary,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.avatarText,
                    { color: theme.colors.primaryForeground },
                  ]}
                >
                  {(user?.displayName?.[0] || user?.email?.[0] || "U").toUpperCase()}
                </Text>
              </View>

              <View style={styles.userInfo}>
                <Text
                  style={[
                    styles.userName,
                    { color: theme.colors.foreground, fontSize: theme.typography.sm },
                  ]}
                  numberOfLines={1}
                >
                  {user?.displayName || "User"}
                </Text>
                <Text
                  style={[
                    styles.userEmail,
                    { color: theme.colors.mutedForeground, fontSize: theme.typography.xs },
                  ]}
                  numberOfLines={1}
                >
                  {user?.email || ""}
                </Text>
              </View>
            </View>

            <View style={styles.actionButtons}>
              <Pressable
                onPress={handleSwitchApp}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: isDark
                      ? "rgba(52, 211, 153, 0.12)"
                      : "rgba(16, 185, 129, 0.1)",
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <ArrowLeftRight size={16} color={theme.colors.success} />
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: theme.colors.success, fontSize: theme.typography.xs },
                  ]}
                >
                  Switch Space
                </Text>
              </Pressable>

              <Pressable
                onPress={handleLogout}
                style={({ pressed }) => [
                  styles.actionButton,
                  {
                    backgroundColor: isDark
                      ? "rgba(239, 68, 68, 0.12)"
                      : "rgba(239, 68, 68, 0.1)",
                  },
                  pressed && { opacity: 0.8 },
                ]}
              >
                <LogOut size={16} color={theme.colors.destructive} />
                <Text
                  style={[
                    styles.actionButtonText,
                    { color: theme.colors.destructive, fontSize: theme.typography.xs },
                  ]}
                >
                  Sign Out
                </Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default SideDrawer;


const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  backdrop: {
    flex: 1,
  },
  panel: {
    width: "78%",
    maxWidth: 320,
    borderLeftWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: -4, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  brandContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  brandTitle: {
    fontWeight: "900",
    letterSpacing: 1,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  linksContainer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    gap: 14,
  },
  navItemLabel: {
    letterSpacing: 0.2,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    gap: 14,
  },
  userProfile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 16,
    fontWeight: "800",
  },
  userInfo: {
    flex: 1,
    minWidth: 0,
  },
  userName: {
    fontWeight: "800",
  },
  userEmail: {
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  actionButtonText: {
    fontWeight: "700",
  },
});
