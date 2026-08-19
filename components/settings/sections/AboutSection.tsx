import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { EyeOff, ListChecks, RotateCcw } from "lucide-react-native";

import { SettingsPanel } from "@/components/settings/SettingsControls";
import { Button } from "@/components/ui/Button";
import {
  fetchLatestRelease,
  getInstalledVersionCode,
  getInstalledVersionName,
  useAppUpdate,
} from "@/hooks/useAppUpdate";
import {
  installAppRelease,
  installProgressLabel,
  type InstallProgress,
} from "@/lib/apkUpdate";
import { friendlyErrorMessage } from "@/lib/errors";
import { haptic } from "@/lib/haptics";
import { toast } from "@/lib/toast";
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
  const { resetDismissal } = useAppUpdate();
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<InstallProgress>({ phase: "idle" });

  const versionName = getInstalledVersionName();
  const versionCode = getInstalledVersionCode();
  const busy = checking || progress.phase !== "idle";

  const onCheck = async () => {
    setChecking(true);
    try {
      const release = await fetchLatestRelease();

      if (!release) {
        toast.info("No release information available right now");
        return;
      }

      if (versionCode !== null && release.versionCode > versionCode) {
        resetDismissal();
        toast.success(`Version ${release.versionName} is available`);
        const outcome = await installAppRelease(release, setProgress);
        if (outcome === "needs-permission") {
          toast.info(
            "Allow Spendly to install updates, then tap Check for updates again"
          );
        } else if (outcome === "aborted") {
          toast.info("Update cancelled");
        } else if (outcome === "fallback") {
          toast.info("Opened the download page");
        } else if (outcome === "up-to-date") {
          toast.success("You are on the latest version");
        }
        return;
      }

      toast.success("You are on the latest version");
    } catch (error) {
      toast.error(friendlyErrorMessage(error, "Could not check for updates"));
    } finally {
      setChecking(false);
      setProgress({ phase: "idle" });
    }
  };

  return (
    <SettingsPanel
      title="App version"
      subtitle="Updates download and install inside the app"
    >
      <Text style={{ color: theme.colors.mutedForeground, fontSize: theme.typography.sm }}>
        Installed: v{versionName}
        {versionCode !== null ? ` (build ${versionCode})` : ""}
      </Text>
      <Button variant="outline" loading={busy} disabled={busy} onPress={onCheck}>
        {progress.phase !== "idle" ? installProgressLabel(progress) : "Check for updates"}
      </Button>
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
