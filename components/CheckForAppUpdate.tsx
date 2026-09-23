import { useState } from "react";
import { Alert, Platform } from "react-native";

import { Button } from "@/components/ui/Button";
import {
  fetchLatestRelease,
  getInstalledVersionCode,
} from "@/hooks/useAppUpdate";
import {
  hasTrustedAppReleaseFallback,
  installAppRelease,
  installProgressLabel,
  openAppReleaseFallback,
  type InstallProgress,
} from "@/lib/apkUpdate";
import type { AppRelease } from "@/lib/appRelease";
import { productAppName } from "@/lib/activeProduct";
import { friendlyErrorMessage, logError } from "@/lib/errors";
import { toast } from "@/lib/toast";

/**
 * Manual "Check for updates" — Expense Settings already had this; Ganesh
 * only showed a version label, so a published APK never had a way to start
 * the install if the auto sheet missed the first snapshot.
 */
export function CheckForAppUpdate() {
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<InstallProgress>({ phase: "idle" });
  const busy = checking || progress.phase !== "idle";
  const appName = productAppName();

  if (Platform.OS !== "android") return null;

  const onCheck = async () => {
    setChecking(true);
    let fallbackRelease: AppRelease | null = null;
    try {
      const release = await fetchLatestRelease();
      fallbackRelease = release;
      const versionCode = getInstalledVersionCode();

      if (!release) {
        toast.info("No release information available right now");
        return;
      }

      if (versionCode !== null && release.versionCode > versionCode) {
        toast.success(`Version ${release.versionName} is available`);
        const outcome = await installAppRelease(release, setProgress);
        if (outcome === "needs-permission") {
          toast.info(`Allow ${appName} to install updates, then tap Check for updates again`);
        } else if (outcome === "aborted") {
          toast.info("Update cancelled");
        } else if (outcome === "fallback") {
          toast.info("Opened the download page");
        } else if (outcome === "installer-started") {
          toast.info("Continue in the Android installer");
        } else if (outcome === "up-to-date") {
          toast.success("You are on the latest version");
        }
        return;
      }

      toast.success("You are on the latest version");
    } catch (error) {
      logError("checkForAppUpdate", error);
      const message = friendlyErrorMessage(error, "Could not check for updates");
      if (fallbackRelease && hasTrustedAppReleaseFallback(fallbackRelease)) {
        const release = fallbackRelease;
        Alert.alert("Update could not start", message, [
          { text: "Cancel", style: "cancel" },
          {
            text: "Open download page",
            onPress: () => {
              void openAppReleaseFallback(release).catch((fallbackError) => {
                toast.error(
                  friendlyErrorMessage(
                    fallbackError,
                    "Could not open the download page"
                  )
                );
              });
            },
          },
        ]);
      } else {
        toast.error(message);
      }
    } finally {
      setChecking(false);
      setProgress({ phase: "idle" });
    }
  };

  return (
    <Button variant="outline" loading={busy} disabled={busy} onPress={() => void onCheck()}>
      {progress.phase !== "idle" ? installProgressLabel(progress) : "Check for updates"}
    </Button>
  );
}
