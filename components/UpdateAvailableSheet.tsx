import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Sparkles } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { buildsBehind } from "@/lib/appRelease";
import {
  installAppRelease,
  installProgressLabel,
  type InstallProgress,
} from "@/lib/apkUpdate";
import { productAppName } from "@/lib/activeProduct";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";
import { haptic } from "@/lib/haptics";

/**
 * Prompts the user to install a newer build published by the release workflow.
 * Mandatory releases cannot be dismissed.
 */
export function UpdateAvailableSheet() {
  const { theme } = useTheme();
  const { release, visible, dismiss, installedVersionName, installedVersionCode } =
    useAppUpdate();
  const [progress, setProgress] = useState<InstallProgress>({ phase: "idle" });

  if (!release) return null;

  const busy = progress.phase !== "idle";
  const behind = buildsBehind(installedVersionCode, release.versionCode);
  const downloadPercent =
    progress.phase === "downloading" ? progress.percent : busy ? 100 : 0;

  const handleUpdate = async () => {
    haptic.medium().catch(() => undefined);

    try {
      const outcome = await installAppRelease(release, setProgress);
      if (outcome === "needs-permission") {
        toast.info(`Allow ${productAppName()} to install updates, then tap Update again`);
      } else if (outcome === "aborted") {
        toast.info("Update cancelled");
      } else if (outcome === "fallback") {
        toast.info("Opened the download page");
      } else if (outcome === "up-to-date") {
        toast.success("You are on the latest version");
        dismiss();
      }
    } catch {
      toast.error("Could not start the update");
    } finally {
      setProgress({ phase: "idle" });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!busy) dismiss();
      }}
    >
      <View style={styles.backdrop}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.card,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.xl,
              padding: theme.space.xl,
              gap: theme.space.md,
            },
          ]}
        >
          <View
            style={[
              styles.iconWrap,
              { backgroundColor: theme.colors.primary + "22" },
            ]}
          >
            <Sparkles color={theme.colors.primary} size={30} />
          </View>

          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: theme.typography.xl,
              fontWeight: "800",
              textAlign: "center",
            }}
          >
            {release.mandatory ? "Update required" : "New version launched"}
          </Text>

          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.sm,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Version {release.versionName} is ready. You are on {installedVersionName}
            {behind > 1
              ? `. You are ${behind} builds behind — Install latest jumps straight to this version.`
              : "."}
          </Text>

          {release.notes ? (
            <View
              style={[
                styles.notes,
                {
                  backgroundColor: theme.colors.muted,
                  borderRadius: theme.radius.md,
                  padding: theme.space.md,
                },
              ]}
            >
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.xs,
                  lineHeight: 18,
                }}
              >
                {release.notes}
              </Text>
            </View>
          ) : null}

          {busy ? (
            <View
              style={[
                styles.track,
                { backgroundColor: theme.colors.muted },
              ]}
            >
              <View
                style={[
                  styles.fill,
                  {
                    width: `${downloadPercent}%`,
                    backgroundColor: theme.colors.primary,
                  },
                ]}
              />
            </View>
          ) : null}

          <Button
            variant="primary"
            size="lg"
            loading={busy}
            disabled={busy}
            onPress={handleUpdate}
            style={styles.action}
          >
            {busy ? installProgressLabel(progress) : "Install latest"}
          </Button>

          {release.mandatory ? (
            <Text
              style={{
                color: theme.colors.mutedForeground,
                fontSize: theme.typography.xs,
                textAlign: "center",
              }}
            >
              This update is required to keep using the app.
            </Text>
          ) : busy ? null : (
            <Pressable onPress={dismiss} style={styles.later} hitSlop={8}>
              <Text
                style={{
                  color: theme.colors.mutedForeground,
                  fontSize: theme.typography.sm,
                  fontWeight: "600",
                }}
              >
                Not now
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderCurve: "continuous",
    alignItems: "center",
  },
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  notes: {
    width: "100%",
    borderCurve: "continuous",
  },
  track: {
    width: "100%",
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: 999,
  },
  action: {
    width: "100%",
  },
  later: {
    paddingVertical: 6,
  },
});
