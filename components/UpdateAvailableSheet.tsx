import { useState } from "react";
import { Linking, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Sparkles } from "lucide-react-native";

import { Button } from "@/components/ui/Button";
import { useAppUpdate } from "@/hooks/useAppUpdate";
import { toast } from "@/lib/toast";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Prompts the user to install a newer build published by the release workflow.
 * Mandatory releases cannot be dismissed.
 */
export function UpdateAvailableSheet() {
  const { theme } = useTheme();
  const { release, visible, dismiss, installedVersionName } = useAppUpdate();
  const [opening, setOpening] = useState(false);

  if (!release) return null;

  const handleDownload = async () => {
    setOpening(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    try {
      await Linking.openURL(release.downloadUrl);
    } catch {
      toast.error("Could not open the download link");
    } finally {
      setOpening(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
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
            {release.mandatory ? "Update required" : "Update available"}
          </Text>

          <Text
            style={{
              color: theme.colors.mutedForeground,
              fontSize: theme.typography.sm,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Version {release.versionName} is ready to install. You are on{" "}
            {installedVersionName}.
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

          <Button
            variant="primary"
            size="lg"
            loading={opening}
            onPress={handleDownload}
            style={styles.action}
          >
            Download update
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
          ) : (
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
  action: {
    width: "100%",
  },
  later: {
    paddingVertical: 6,
  },
});
