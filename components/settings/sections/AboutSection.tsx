import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EyeOff, ListChecks, RotateCcw } from "lucide-react-native";

import { CheckForAppUpdate } from "@/components/CheckForAppUpdate";
import { SettingsPanel } from "@/components/settings/SettingsControls";
import { getInstalledVersionCode, getInstalledVersionName } from "@/hooks/useAppUpdate";
import { haptic } from "@/lib/haptics";
import { useSetupProgress } from "@/providers/SetupProgressProvider";
import { useTheme } from "@/theme/ThemeProvider";
import { themeUsesDarkPalette } from "@/theme/tokens";

export function AboutSection() {
  return (
    <View style={{ gap: 16 }}>
      <GettingStartedCard />
      <AppVersionCard />
    </View>
  );
}

function AppVersionCard() {
  const { theme } = useTheme();
  const versionName = getInstalledVersionName();
  const versionCode = getInstalledVersionCode();

  return (
    <SettingsPanel
      title="App version"
      subtitle="Updates download and install inside the app"
    >
      <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm }}>
        Installed: v{versionName}
        {versionCode !== null ? ` (build ${versionCode})` : ""}
      </Text>
      <CheckForAppUpdate />
    </SettingsPanel>
  );
}

function GettingStartedCard() {
  const { theme, themeName } = useTheme();
  const isDark = themeUsesDarkPalette(themeName);
  const router = useRouter();

  let setupProgress: ReturnType<typeof useSetupProgress> | null = null;
  try {
    setupProgress = useSetupProgress();
  } catch {
    return null;
  }

  if (!setupProgress) return null;

  const {
    completedCount,
    totalCount,
    progress,
    isOnboarding,
    dismissOnboarding,
    resetOnboarding,
  } = setupProgress;

  return (
    <SettingsPanel
      title="Getting started"
      subtitle={
        isOnboarding
          ? `${completedCount} / ${totalCount} steps completed`
          : "Setup complete"
      }
    >
      <View
        style={[
          styles.track,
          {
            backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
          },
        ]}
      >
        <View
          style={[
            styles.trackFill,
            {
              backgroundColor: theme.colors.primary,
              width: `${Math.round(progress * 100)}%`,
            },
          ]}
        />
      </View>

      <Pressable
        onPress={() => {
          void haptic.selection();
          router.dismissTo("/dashboard");
        }}
        style={styles.actionRow}
        accessibilityRole="button"
        accessibilityLabel="View setup checklist"
      >
        <ListChecks size={20} color={theme.colors.primary} />
        <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
          View Setup Checklist
        </Text>
      </Pressable>

      <Pressable
        onPress={() => {
          void haptic.impact();
          resetOnboarding();
        }}
        style={styles.actionRow}
        accessibilityRole="button"
        accessibilityLabel="Restart onboarding"
      >
        <RotateCcw size={20} color={theme.colors.mutedForeground} />
        <Text style={[styles.actionLabel, { color: theme.colors.foreground }]}>
          Restart Onboarding
        </Text>
      </Pressable>

      {isOnboarding ? (
        <Pressable
          onPress={() => {
            void haptic.selection();
            dismissOnboarding();
          }}
          style={styles.actionRow}
          accessibilityRole="button"
          accessibilityLabel="Hide onboarding"
        >
          <EyeOff size={20} color={theme.colors.mutedForeground} />
          <Text style={[styles.actionLabel, { color: theme.colors.mutedForeground }]}>
            Hide Onboarding
          </Text>
        </Pressable>
      ) : null}
    </SettingsPanel>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  trackFill: {
    height: 6,
    borderRadius: 3,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
  },
  actionLabel: {
    fontSize: 15,
    fontWeight: "700",
  },
});
