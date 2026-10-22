import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Bell, Search } from "lucide-react-native";

import {
  APP_BAR_ICON_SIZE,
  APP_BAR_TOUCH_SIZE,
} from "@/components/layout/chrome";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useRemindersInbox } from "@/providers/RemindersInboxProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function AppBarActions({
  onOpenProfile,
  ink,
}: {
  onOpenProfile: () => void;
  /** Icon colour override for a bar drawn over an image (SPENDLY-566). */
  ink?: string;
}) {
  const { push } = useRouter();
  const { user } = useAuth();
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const iconColor = ink ?? theme.colors.foreground;
  const ripple = isDark || ink ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.08)";

  // SPENDLY-569: reminders inbox; the dot is the count of dues this device
  // hasn't seen, never a placeholder.
  const { unread } = useRemindersInbox();
  const handleInbox = () => {
    void haptic.navigation();
    push("/inbox" as never);
  };

  const handleSearch = () => {
    void haptic.navigation();
    push("/ledger" as never);
  };

  const handleOpenProfile = () => {
    void haptic.navigation();
    onOpenProfile();
  };

  const initial = (
    user?.displayName?.[0] ||
    user?.email?.[0] ||
    "U"
  ).toUpperCase();

  return (
    <View style={styles.rightSection}>
      <Pressable
        onPress={handleSearch}
        android_ripple={{ color: ripple, borderless: true, radius: 24 }}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Search transactions"
      >
        <Search size={APP_BAR_ICON_SIZE} color={iconColor} strokeWidth={2} />
      </Pressable>

      <Pressable
        onPress={handleInbox}
        android_ripple={{ color: ripple, borderless: true, radius: 24 }}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Reminders, ${unread} new` : "Reminders"}
      >
        <Bell size={APP_BAR_ICON_SIZE} color={iconColor} strokeWidth={2} />
        {unread > 0 ? (
          <View style={[styles.dot, { backgroundColor: theme.colors.destructive, borderColor: ink ? "rgba(0,0,0,0.35)" : theme.colors.background }]} />
        ) : null}
      </Pressable>

      <Pressable
        onPress={handleOpenProfile}
        android_ripple={{
          color: "rgba(255,255,255,0.25)",
          borderless: true,
          radius: 24,
        }}
        style={({ pressed }) => [styles.avatarHit, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Open profile and settings"
      >
        <View style={styles.avatarButton}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconButton: {
    width: APP_BAR_TOUCH_SIZE,
    height: APP_BAR_TOUCH_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: APP_BAR_TOUCH_SIZE / 2,
  },
  dot: {
    position: "absolute",
    top: 11,
    right: 11,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  avatarHit: {
    width: APP_BAR_TOUCH_SIZE,
    height: APP_BAR_TOUCH_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FBBF24",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1C1917",
  },
  pressed: {
    opacity: 0.72,
  },
});
