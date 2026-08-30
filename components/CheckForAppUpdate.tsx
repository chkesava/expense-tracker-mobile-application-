import { useState } from "react";
import { Platform } from "react-native";

import { Button } from "@/components/ui/Button";
import {
  fetchLatestRelease,
  getInstalledVersionCode,
  useAppUpdate,
} from "@/hooks/useAppUpdate";
import {
  installAppRelease,
  installProgressLabel,
  type InstallProgress,
} from "@/lib/apkUpdate";
import { productAppName } from "@/lib/activeProduct";
import { friendlyErrorMessage } from "@/lib/errors";
import { toast } from "@/lib/toast";

/**
 * Manual "Check for updates" — Expense Settings already had this; Ganesh
 * only showed a version label, so a published APK never had a way to start
 * the install if the auto sheet missed the first snapshot.
 */
export function CheckForAppUpdate() {
  const { resetDismissal } = useAppUpdate();
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<InstallProgress>({ phase: "idle" });
  const busy = checking || progress.phase !== "idle";
  const appName = productAppName();

  if (Platform.OS !== "android") return null;

  const onCheck = async () => {
    setChecking(true);
    try {
      const release = await fetchLatestRelease();
      const versionCode = getInstalledVersionCode();

      if (!release) {
        toast.info("No release information available right now");
        return;
      }

      if (versionCode !== null && release.versionCode > versionCode) {
        resetDismissal();
        toast.success(`Version ${release.versionName} is available`);
        const outcome = await installAppRelease(release, setProgress);
        if (outcome === "needs-permission") {
          toast.info(`Allow ${appName} to install updates, then tap Check for updates again`);
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
    <Button variant="outline" loading={busy} disabled={busy} onPress={() => void onCheck()}>
      {progress.phase !== "idle" ? installProgressLabel(progress) : "Check for updates"}
    </Button>
  );
}
