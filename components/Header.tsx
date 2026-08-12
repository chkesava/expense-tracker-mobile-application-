import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Activity,
  Calendar,
  EyeOff,
  Settings as SettingsIcon,
} from "lucide-react-native";

import { MonthDrawer } from "@/components/MonthDrawer";
import { SideDrawer } from "@/components/SideDrawer";
import { useAuth } from "@/providers/AuthProvider";
import { useModals } from "@/providers/ModalProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { currentMonthKey } from "@/shared/utils/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";

function formatMonthLabel(month: string) {
  if (!month) return "This Month";
  try {
    const [year, m] = month.split("-");
    const date = new Date(parseInt(year, 10), parseInt(m, 10) - 1, 1);
    return date.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  } catch {
    return month;
  }
}

export function Header() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { setIsMonthDrawerOpen, globalMonth } = useModals();
  const { settings, setGhostMode } = useSettings();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const selectedMonth = globalMonth || currentMonthKey(settings.timezone);

  const handleToggleGhost = () => {
    void haptic.selection();
    setGhostMode(!settings.ghostMode);
  };

  const handleOpenMonthPicker = () => {
    void haptic.navigation();
    setIsMonthDrawerOpen(true);
  };

  const handleOpenSettings = () => {
    void haptic.navigation();
    router.push("/settings" as any);
  };

  const handleLogoPress = () => {
    void haptic.navigation();
    router.push("/dashboard" as any);
  };

  return (
    <>
      <View
        style={[
          styles.container,
          {
            paddingTop: insets.top + 6,
            backgroundColor: isDark
              ? "rgba(8, 10, 20, 0.92)"
              : "rgba(247, 249, 252, 0.92)",
            borderBottomColor: isDark
              ? "rgba(107, 99, 255, 0.12)"
              : theme.colors.border,
          },
        ]}
      >
        <View style={styles.content}>
          {/* Left: Brand & Status */}
          <View style={styles.leftSection}>
            <Pressable
              onPress={handleLogoPress}
              style={({ pressed }) => [
                styles.logoButton,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel="Go to dashboard"
            >
              <View
                style={[
                  styles.logoIcon,
                  {
                    backgroundColor: isDark ? "#7C3AED" : theme.colors.primary,
                    shadowColor: "#7C3AED",
                  },
                ]}
              >
                <Activity size={15} color="#FFFFFF" strokeWidth={2.6} />
              </View>
              <Text
                style={[
                  styles.logoText,
                  {
                    color: theme.colors.foreground,
                    fontSize: theme.typography.lg,
                  },
                ]}
              >
                Vault
              </Text>
            </Pressable>

            {/* Ghost / Online Mode Indicator */}
            <Pressable
              onPress={handleToggleGhost}
              style={({ pressed }) => [
                styles.statusBadge,
                {
                  backgroundColor: settings.ghostMode
                    ? isDark
                      ? "rgba(107, 99, 255, 0.18)"
                      : "rgba(79, 70, 255, 0.1)"
                    : isDark
                      ? "rgba(52, 211, 153, 0.1)"
                      : "rgba(37, 150, 90, 0.1)",
                  borderColor: settings.ghostMode
                    ? theme.colors.primary
                    : theme.colors.success,
                },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityLabel={
                settings.ghostMode ? "Disable ghost mode" : "Enable ghost mode"
              }
            >
              {settings.ghostMode ? (
                <EyeOff size={10} color={theme.colors.primary} />
              ) : (
                <View
                  style={[
                    styles.onlineDot,
                    { backgroundColor: theme.colors.success },
                  ]}
                />
              )}
              <Text
                style={[
                  styles.statusText,
                  {
                    color: settings.ghostMode
                      ? theme.colors.primary
                      : theme.colors.success,
                  },
                ]}
              >
                {settings.ghostMode ? "Ghost" : "Online"}
              </Text>
            </Pressable>
          </View>

          {/* Right: Month Selector, Settings gear, User Avatar */}
          <View style={styles.rightSection}>
            <Pressable
              onPress={handleOpenMonthPicker}
              android_ripple={{
                color: theme.colors.primary + "18",
                borderless: false,
              }}
              style={({ pressed }) => [
                styles.monthPill,
                {
                  backgroundColor: isDark
                    ? "rgba(107, 99, 255, 0.12)"
                    : theme.colors.card,
                  borderColor: isDark
                    ? "rgba(107, 99, 255, 0.28)"
                    : theme.colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
              accessibilityLabel="Choose month"
            >
              <Calendar
                size={13}
                color={theme.colors.primary}
                strokeWidth={2.2}
              />
              <Text
                style={[
                  styles.monthLabel,
                  {
                    color: theme.colors.foreground,
                    fontSize: theme.typography.xs,
                  },
                ]}
              >
                {formatMonthLabel(selectedMonth)}
              </Text>
            </Pressable>

            {/* Dedicated Settings — do not fold into profile menu */}
            <Pressable
              onPress={handleOpenSettings}
              android_ripple={{
                color: theme.colors.primary + "20",
                borderless: true,
                radius: 20,
              }}
              style={({ pressed }) => [
                styles.iconButton,
                {
                  backgroundColor: isDark
                    ? "rgba(255,255,255,0.06)"
                    : theme.colors.card,
                  borderColor: theme.colors.border,
                },
                pressed && { opacity: 0.8 },
              ]}
              accessibilityLabel="Open settings"
            >
              <SettingsIcon size={17} color={theme.colors.foreground} />
            </Pressable>

            <Pressable
              onPress={() => {
                void haptic.navigation();
                setIsDrawerOpen(true);
              }}
              android_ripple={{
                color: "rgba(255,255,255,0.25)",
                borderless: true,
                radius: 20,
              }}
              style={({ pressed }) => [
                styles.avatarButton,
                {
                  backgroundColor: "#FBBF24",
                  borderColor: isDark
                    ? "rgba(251, 191, 36, 0.5)"
                    : "rgba(251, 191, 36, 0.35)",
                },
                pressed && { opacity: 0.88 },
              ]}
              accessibilityLabel="Open user menu"
            >
              <Text style={styles.avatarText}>
                {(
                  user?.displayName?.[0] ||
                  user?.email?.[0] ||
                  "U"
                ).toUpperCase()}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      <MonthDrawer />
      <SideDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </>
  );
}

export default Header;

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 80,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 1,
    minWidth: 0,
  },
  logoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  logoIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  logoText: {
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexShrink: 0,
  },
  monthPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
  },
  monthLabel: {
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1C1917",
  },
});
