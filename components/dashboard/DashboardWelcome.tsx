import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar, Eye, EyeOff } from "lucide-react-native";

import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useSettings } from "@/providers/SettingsProvider";
import { useTheme } from "@/theme/ThemeProvider";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Compact dashboard header. Deliberately lightweight — it establishes identity
 * and the active month, then hands vertical space to the data below. Branding,
 * search, inbox and profile live in the app bar above it, so they are not
 * repeated here; the one control is the amount-privacy toggle (SPENDLY-532).
 */
export const DashboardWelcome = memo(function DashboardWelcome({
  monthLabel,
  onOpenMonthPicker,
}: {
  monthLabel?: string;
  onOpenMonthPicker?: () => void;
}) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const surfaces = useSurfaces();
  const { settings, setGhostMode } = useSettings();
  const hidden = Boolean(settings.ghostMode);

  const firstName =
    user?.displayName?.trim()?.split(/\s+/)[0] ||
    user?.email?.split("@")[0] ||
    "there";
  const greeting = greetingForHour(new Date().getHours());

  return (
    <View style={styles.container}>
      <View style={styles.textCol}>
        <Text
          style={[
            styles.greeting,
            {
              color: theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.medium,
            },
          ]}
          numberOfLines={1}
        >
          {greeting}, {firstName}
        </Text>
        <Text
          style={[
            styles.title,
            {
              color: theme.colors.foreground,
              fontFamily: theme.fontFamily.bold,
            },
          ]}
          numberOfLines={1}
        >
          Dashboard
        </Text>
        <Text
          style={[
            styles.subtitle,
            {
              color: theme.colors.mutedForeground,
              fontFamily: theme.fontFamily.regular,
            },
          ]}
          numberOfLines={1}
        >
          Your money at a glance
        </Text>

        {!!monthLabel && onOpenMonthPicker ? (
          <Pressable
            onPress={() => {
              void haptic.selection();
              onOpenMonthPicker();
            }}
            android_ripple={{
              color: withAlpha(theme.colors.primary, 0.16),
              borderless: false,
            }}
            style={({ pressed }) => [
              styles.monthChip,
              { backgroundColor: surfaces.wash(theme.colors.primary) },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Change month, currently ${monthLabel}`}
          >
            <Calendar size={13} color={theme.colors.primary} strokeWidth={2.2} />
            <Text
              style={[
                styles.monthChipText,
                {
                  color: theme.colors.primary,
                  fontFamily: theme.fontFamily.semibold,
                },
              ]}
            >
              {monthLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        onPress={() => {
          void haptic.selection();
          setGhostMode(!hidden);
        }}
        hitSlop={6}
        android_ripple={{ color: surfaces.control, borderless: true }}
        style={({ pressed }) => [
          styles.privacy,
          {
            backgroundColor: hidden ? surfaces.wash(theme.colors.primary) : surfaces.control,
            borderColor: hidden ? theme.colors.primary : theme.colors.border,
          },
          pressed && { opacity: 0.8 },
        ]}
        accessibilityRole="switch"
        accessibilityState={{ checked: hidden }}
        accessibilityLabel={hidden ? "Show amounts" : "Hide amounts"}
      >
        {hidden ? (
          <EyeOff size={18} color={theme.colors.primary} strokeWidth={2.2} />
        ) : (
          <Eye size={18} color={theme.colors.foreground} strokeWidth={2.2} />
        )}
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 14,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  greeting: {
    fontSize: 13,
    marginBottom: 2,
  },
  title: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 1,
  },
  monthChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 7,
    minHeight: 34,
    borderRadius: 999,
    overflow: "hidden",
  },
  monthChipText: {
    fontSize: 12.5,
  },
  privacy: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
});
