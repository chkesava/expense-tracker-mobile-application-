import { Pressable, StyleSheet, Text, View } from "react-native";
import { Calendar, Wallet } from "lucide-react-native";

import { useSurfaces, withAlpha } from "@/components/dashboard/primitives";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/providers/AuthProvider";
import { useTheme } from "@/theme/ThemeProvider";

function greetingForHour(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * Compact dashboard hero. Deliberately lightweight — it establishes identity
 * and the active month, then hands vertical space to the data below.
 */
export function DashboardWelcome({
  monthLabel,
  onOpenMonthPicker,
}: {
  monthLabel?: string;
  onOpenMonthPicker?: () => void;
}) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const surfaces = useSurfaces();

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
          Your financial overview
        </Text>

        {!!monthLabel && onOpenMonthPicker ? (
          <Pressable
            onPress={() => {
              void haptic.selection();
              onOpenMonthPicker();
            }}
            android_ripple={{
              color: withAlpha(theme.colors.success, 0.16),
              borderless: false,
            }}
            style={({ pressed }) => [
              styles.monthChip,
              { backgroundColor: surfaces.wash(theme.colors.success) },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Change month, currently ${monthLabel}`}
          >
            <Calendar size={13} color={theme.colors.success} strokeWidth={2.2} />
            <Text
              style={[
                styles.monthChipText,
                {
                  color: theme.colors.success,
                  fontFamily: theme.fontFamily.semibold,
                },
              ]}
            >
              {monthLabel}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View
        style={[
          styles.mark,
          { backgroundColor: withAlpha(theme.colors.primary, 0.92) },
        ]}
      >
        <Wallet size={22} color="#FFFFFF" strokeWidth={2.2} />
        <View
          style={[
            styles.dot,
            styles.dotTop,
            { backgroundColor: theme.colors.warning },
          ]}
        />
        <View
          style={[
            styles.dot,
            styles.dotBottom,
            { backgroundColor: theme.colors.success },
          ]}
        />
      </View>
    </View>
  );
}

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
  mark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  dot: {
    position: "absolute",
    width: 11,
    height: 11,
    borderRadius: 6,
  },
  dotTop: {
    top: -3,
    right: -3,
  },
  dotBottom: {
    bottom: -3,
    left: -3,
  },
});
