import {
  Dimensions,
  InteractionManager,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { usePathname, useRouter } from "expo-router";
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
  Eye,
  EyeOff,
  Home,
  LogOut,
  Receipt,
  Settings,
  Shield,
  TrendingUp,
  X,
} from "lucide-react-native";

import { useUserRole } from "@/hooks/useUserRole";
import { logError } from "@/lib/errors";
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

function runAfterDrawerClose(onClose: () => void, action: () => void) {
  onClose();
  InteractionManager.runAfterInteractions(() => {
    // Small delay so Android Modal fully dismisses before navigation / auth.
    setTimeout(action, 40);
  });
}

export function SideDrawer({ isOpen, onClose }: SideDrawerProps) {
  const { navigate, dismissTo } = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  // Android Modals often report 0 insets; fall back to the launch metrics.
  const topInset = Math.max(insets.top, initialWindowMetrics?.insets.top ?? 0);
  const bottomInset = Math.max(
    insets.bottom,
    initialWindowMetrics?.insets.bottom ?? 0,
    16
  );
  const { user, logout } = useAuth();
  const { isAdmin } = useUserRole();
  const { settings, setGhostMode } = useSettings();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  // Solid fills — avoid translucent theme tokens so content never bleeds through.
  const panelBg = isDark ? "#0C0F1A" : "#FFFFFF";
  const scrimBg = isDark ? "rgba(0,0,0,0.72)" : "rgba(15,23,42,0.55)";

  const iconMap: Record<
    NavSectionId,
    React.ComponentType<{ size: number; color: string }>
  > = {
    home: Home,
    ledger: Receipt,
    investments: TrendingUp,
    vaults: Shield,
    insights: BarChart3,
    settings: Settings,
    admin: Shield,
  };

  const navLinks = [
    ...CORE_NAV_ITEMS.filter(
      (item) =>
        item.includeInDrawer &&
        (!item.requiresInvestmentsFeature || settings.enableInvestments)
    ),
    ...(isAdmin ? [ADMIN_NAV_ITEM] : []),
  ];

  const handleNavigate = (path: string) => {
    void haptic.navigation();
    const route = path.startsWith("/") ? path : `/${path}`;
    runAfterDrawerClose(onClose, () => {
      // Drawer destinations are top-level sections, not a drill-down: reuse the
      // screen if it is already in the stack rather than pushing a second copy.
      if (route === "/dashboard") {
        dismissTo("/dashboard");
      } else {
        navigate(route as never);
      }
    });
  };

  const handleSwitchApp = () => {
    void haptic.navigation();
    runAfterDrawerClose(onClose, () => {
      navigate("/app-selector" as never);
    });
  };

  const handleLogout = () => {
    void haptic.impact();
    runAfterDrawerClose(onClose, () => {
      void logout().catch((error) => {
        logError("sideDrawer.logout", error);
      });
    });
  };

  const handleToggleGhost = () => {
    void haptic.selection();
    setGhostMode(!settings.ghostMode);
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View
        style={[
          styles.root,
          Platform.OS === "android"
            ? { height: Dimensions.get("screen").height }
            : null,
        ]}
        pointerEvents="box-none"
      >
        <AnimatedPressable
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(120)}
          style={[styles.scrim, { backgroundColor: scrimBg }]}
          onPress={onClose}
          accessibilityLabel="Close navigation drawer"
        />

        <Animated.View
          entering={SlideInRight.springify().damping(24).stiffness(250)}
          style={[
            styles.panel,
            {
              backgroundColor: panelBg,
              borderLeftColor: theme.colors.border,
              paddingTop: topInset + 12,
              paddingBottom: bottomInset,
            },
          ]}
        >
          <View style={[styles.panelSolidFill, { backgroundColor: panelBg }]} />

          <View style={styles.header}>
            <View style={styles.brandContainer}>
              <View
                style={[
                  styles.brandIcon,
                  { backgroundColor: theme.colors.foreground },
                ]}
              >
                <Activity
                  size={18}
                  color={theme.colors.background}
                  strokeWidth={2.5}
                />
              </View>
              <Text
                style={[
                  styles.brandTitle,
                  {
                    color: theme.colors.foreground,
                    fontSize: theme.typography.lg,
                  },
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
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)",
                },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Close menu"
            >
              <X size={18} color={theme.colors.mutedForeground} />
            </Pressable>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.linksScroll}
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
                            ? "rgba(52, 179, 122, 0.16)"
                            : "rgba(37, 150, 90, 0.1)"
                          : "transparent",
                      },
                      pressed && { opacity: 0.8 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={link.label}
                  >
                    <Icon
                      size={20}
                      color={
                        isActive
                          ? theme.colors.success
                          : theme.colors.mutedForeground
                      }
                    />
                    <Text
                      style={[
                        styles.navItemLabel,
                        {
                          color: isActive
                            ? theme.colors.success
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

          <View style={styles.footerBlock}>
              <Pressable
                onPress={handleToggleGhost}
                style={({ pressed }) => [
                  styles.ghostRow,
                  {
                    backgroundColor: settings.ghostMode
                      ? isDark
                        ? "rgba(107, 99, 255, 0.14)"
                        : "rgba(79, 70, 255, 0.08)"
                      : isDark
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(0,0,0,0.04)",
                    borderColor: settings.ghostMode
                      ? theme.colors.primary
                      : theme.colors.border,
                  },
                  pressed && { opacity: 0.8 },
                ]}
                accessibilityRole="switch"
                accessibilityState={{ checked: settings.ghostMode }}
                accessibilityLabel={
                  settings.ghostMode ? "Disable ghost mode" : "Enable ghost mode"
                }
              >
                {settings.ghostMode ? (
                  <EyeOff size={18} color={theme.colors.primary} />
                ) : (
                  <Eye size={18} color={theme.colors.mutedForeground} />
                )}
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.ghostTitle,
                      {
                        color: settings.ghostMode
                          ? theme.colors.primary
                          : theme.colors.foreground,
                      },
                    ]}
                  >
                    {settings.ghostMode ? "Ghost mode on" : "Ghost mode"}
                  </Text>
                  <Text
                    style={[
                      styles.ghostSubtitle,
                      { color: theme.colors.mutedForeground },
                    ]}
                  >
                    Hide amounts across the app
                  </Text>
                </View>
              </Pressable>

              <View
                style={[styles.footer, { borderTopColor: theme.colors.border }]}
              >
                <View style={styles.userProfile}>
                  <View
                    style={[
                      styles.avatar,
                      { backgroundColor: theme.colors.success },
                    ]}
                  >
                    <Text
                      style={[
                        styles.avatarText,
                        { color: theme.colors.successForeground },
                      ]}
                    >
                      {(
                        user?.displayName?.[0] ||
                        user?.email?.[0] ||
                        "U"
                      ).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.userInfo}>
                    <Text
                      style={[
                        styles.userName,
                        {
                          color: theme.colors.foreground,
                          fontSize: theme.typography.sm,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {user?.displayName || "User"}
                    </Text>
                    <Text
                      style={[
                        styles.userEmail,
                        {
                          color: theme.colors.mutedForeground,
                          fontSize: theme.typography.xs,
                        },
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
                    android_ripple={{
                      color: "rgba(16, 185, 129, 0.2)",
                      borderless: false,
                    }}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: isDark
                          ? "rgba(52, 211, 153, 0.16)"
                          : "rgba(16, 185, 129, 0.12)",
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Switch Space"
                  >
                    <ArrowLeftRight size={16} color={theme.colors.success} />
                    <Text
                      style={[
                        styles.actionButtonText,
                        {
                          color: theme.colors.success,
                          fontSize: theme.typography.xs,
                        },
                      ]}
                    >
                      Switch Space
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleLogout}
                    android_ripple={{
                      color: "rgba(239, 68, 68, 0.2)",
                      borderless: false,
                    }}
                    style={({ pressed }) => [
                      styles.actionButton,
                      {
                        backgroundColor: isDark
                          ? "rgba(239, 68, 68, 0.16)"
                          : "rgba(239, 68, 68, 0.12)",
                      },
                      pressed && { opacity: 0.85 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Sign Out"
                  >
                    <LogOut size={16} color={theme.colors.destructive} />
                    <Text
                      style={[
                        styles.actionButtonText,
                        {
                          color: theme.colors.destructive,
                          fontSize: theme.typography.xs,
                        },
                      ]}
                    >
                      Sign Out
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default SideDrawer;

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  panel: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    width: "82%",
    maxWidth: 340,
    borderLeftWidth: StyleSheet.hairlineWidth,
    // Sit above the app BottomNav (elevation ~8) so taps reach drawer actions.
    elevation: 48,
    shadowColor: "#000",
    shadowOffset: { width: -6, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    flexDirection: "column",
    overflow: "hidden",
    zIndex: 1000,
  },
  panelSolidFill: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  header: {
    zIndex: 1,
    flexShrink: 0,
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
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  linksScroll: {
    flex: 1,
    zIndex: 1,
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
    minHeight: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    gap: 14,
  },
  navItemLabel: {
    letterSpacing: 0.2,
  },
  footerBlock: {
    zIndex: 2,
    flexShrink: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  ghostRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
  },
  ghostTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  ghostSubtitle: {
    fontSize: 11,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
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
    minHeight: 48,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderCurve: "continuous",
    gap: 6,
    overflow: "hidden",
  },
  actionButtonText: {
    fontWeight: "700",
  },
});
