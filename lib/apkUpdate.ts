/**
 * Downloads a published APK and hands it to the Android PackageInstaller.
 * The system Install sheet is required — Android does not allow silent replace.
 */

import { File, Directory, Paths } from "expo-file-system";
import { getDownloadURL, ref } from "firebase/storage";
import { AppState, Linking, Platform } from "react-native";

import ApkInstaller from "@/lib/apkInstaller";
import { isTesterWebpageUrl, type AppRelease } from "@/lib/appRelease";
import { getFirebaseStorage } from "@/lib/firebase";
import { fetchLatestRelease, getInstalledVersionCode } from "@/hooks/useAppUpdate";

export type InstallProgress =
  | { phase: "idle" }
  | { phase: "resolving" }
  | { phase: "permission" }
  | { phase: "downloading"; percent: number }
  | { phase: "installing" }
  | { phase: "waiting" };

export type InstallOutcome =
  | "installed"
  | "aborted"
  | "fallback"
  | "needs-permission"
  | "up-to-date";

export function installProgressLabel(progress: InstallProgress): string {
  switch (progress.phase) {
    case "resolving":
      return "Preparing update…";
    case "permission":
      return "Allow installs from Spendly";
    case "downloading":
      return `Downloading ${progress.percent}%`;
    case "installing":
      return "Installing…";
    case "waiting":
      return "Waiting for Install…";
    default:
      return "Update";
  }
}

async function resolveApkUrl(release: AppRelease): Promise<string | null> {
  if (release.storagePath) {
    const storage = getFirebaseStorage();
    if (storage) {
      return getDownloadURL(ref(storage, release.storagePath));
    }
  }

  if (release.downloadUrl && !isTesterWebpageUrl(release.downloadUrl)) {
    return release.downloadUrl;
  }

  return null;
}

async function openFallback(release: AppRelease): Promise<InstallOutcome> {
  const url = release.testerUrl || release.downloadUrl;
  if (!url) {
    throw new Error("No download page is available for this release.");
  }
  await Linking.openURL(url);
  return "fallback";
}

function waitForInstallPermission(timeoutMs = 120_000): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      subscription.remove();
      clearTimeout(timer);
      resolve(value);
    };

    const check = async () => {
      if (await ApkInstaller.canRequestPackageInstalls()) finish(true);
    };

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check().catch(() => finish(false));
    });

    const timer = setTimeout(() => finish(false), timeoutMs);
    check().catch(() => finish(false));
  });
}

async function downloadApk(
  url: string,
  versionCode: number,
  onProgress: (percent: number) => void
): Promise<File> {
  const dir = new Directory(Paths.cache, "apk-updates");
  dir.create({ idempotent: true });

  const destination = new File(dir, `spendly-${versionCode}.apk`);
  if (destination.exists) {
    destination.delete();
  }

  const task = File.createDownloadTask(url, destination, {
    onProgress: ({ bytesWritten, totalBytes }) => {
      if (totalBytes > 0) {
        onProgress(Math.min(100, Math.round((bytesWritten / totalBytes) * 100)));
        return;
      }
      onProgress(0);
    },
  });

  const file = await task.downloadAsync();
  if (!file) {
    throw new Error("The update download was interrupted.");
  }
  return file;
}

/**
 * Always installs the current `latest_release` APK.
 *
 * `hint` is the prompt the user tapped; we re-read Firestore first so someone
 * who skipped several versions still jumps straight to the newest build.
 */
export async function installAppRelease(
  hint?: AppRelease | null,
  onProgress?: (progress: InstallProgress) => void
): Promise<InstallOutcome> {
  const report = (progress: InstallProgress) => onProgress?.(progress);

  report({ phase: "resolving" });
  const latest = await fetchLatestRelease().catch(() => null);
  const target =
    latest && (!hint || latest.versionCode >= hint.versionCode) ? latest : hint ?? null;

  if (!target) {
    report({ phase: "idle" });
    throw new Error("No release information available right now");
  }

  const installed = getInstalledVersionCode();
  if (installed !== null && target.versionCode <= installed) {
    report({ phase: "idle" });
    return "up-to-date";
  }

  if (Platform.OS !== "android") {
    report({ phase: "idle" });
    return openFallback(target);
  }

  try {
    const apkUrl = await resolveApkUrl(target);
    if (!apkUrl) {
      return openFallback(target);
    }

    const allowed = await ApkInstaller.canRequestPackageInstalls();
    if (!allowed) {
      report({ phase: "permission" });
      await ApkInstaller.openUnknownSourcesSettings();
      const granted = await waitForInstallPermission();
      if (!granted) return "needs-permission";
    }

    report({ phase: "downloading", percent: 0 });
    const file = await downloadApk(apkUrl, target.versionCode, (percent) => {
      report({ phase: "downloading", percent });
    });

    report({ phase: "waiting" });
    try {
      const status = await ApkInstaller.installApk(file.uri);
      if (status === "aborted") return "aborted";
      report({ phase: "installing" });
      return "installed";
    } finally {
      try {
        if (file.exists) file.delete();
      } catch {
        // Cache cleanup is best-effort.
      }
    }
  } catch {
    return openFallback(target);
  }
}
