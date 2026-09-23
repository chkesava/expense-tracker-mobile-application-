/**
 * Downloads a published APK and hands it to the Android PackageInstaller.
 * The system Install sheet is required — Android does not allow silent replace.
 */

import { File, Directory, Paths } from "expo-file-system";
import { getDownloadURL, ref } from "firebase/storage";
import { AppState, Linking, Platform } from "react-native";

import ApkInstaller from "@/lib/apkInstaller";
import { productAppName } from "@/lib/activeProduct";
import { isTesterWebpageUrl, type AppRelease } from "@/lib/appRelease";
import {
  assertApkIntegrity,
  hashApkStream,
  isAllowedApkDownloadUrl,
  normalizeSha256,
} from "@/lib/apkUpdateSecurity";
import { logWarning } from "@/lib/errors";
import { getFirebaseStorage } from "@/lib/firebase";
import { fetchLatestRelease, getInstalledVersionCode } from "@/hooks/useAppUpdate";

export type InstallProgress =
  | { phase: "idle" }
  | { phase: "resolving" }
  | { phase: "permission" }
  | { phase: "downloading"; percent: number }
  | { phase: "finalizing" }
  | { phase: "verifying" }
  | { phase: "starting-installer" }
  | { phase: "waiting" };

export type InstallOutcome =
  | "installed"
  | "installer-started"
  | "aborted"
  | "fallback"
  | "needs-permission"
  | "up-to-date";

export type ApkUpdateErrorCode =
  | "metadata"
  | "download"
  | "download-timeout"
  | "integrity"
  | "verification-timeout"
  | "installer"
  | "installer-timeout";

export class ApkUpdateError extends Error {
  constructor(
    readonly code: ApkUpdateErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ApkUpdateError";
  }
}

const DOWNLOAD_STALL_TIMEOUT_MS = 120_000;
const VERIFICATION_TIMEOUT_MS = 120_000;
const INSTALLER_HANDOFF_TIMEOUT_MS = 120_000;

export function installProgressLabel(progress: InstallProgress): string {
  switch (progress.phase) {
    case "resolving":
      return "Preparing update…";
    case "permission":
      return `Allow installs from ${productAppName()}`;
    case "downloading":
      return `Downloading ${progress.percent}%`;
    case "finalizing":
      return "Finalizing download…";
    case "verifying":
      return "Verifying update…";
    case "starting-installer":
      return "Starting installer…";
    case "waiting":
      return "Waiting for Android…";
    default:
      return "Update";
  }
}

async function resolveApkUrl(release: AppRelease): Promise<string | null> {
  if (release.storagePath) {
    const storage = getFirebaseStorage();
    if (storage) {
      try {
        return await getDownloadURL(ref(storage, release.storagePath));
      } catch {
        // Storage is optional — fall through to the GitHub Release URL.
      }
    }
  }

  if (release.downloadUrl && !isTesterWebpageUrl(release.downloadUrl)) {
    return release.downloadUrl;
  }

  return null;
}

export function hasTrustedAppReleaseFallback(release: AppRelease): boolean {
  return (
    (Boolean(release.testerUrl) && isTesterWebpageUrl(release.testerUrl!)) ||
    (Boolean(release.downloadUrl) && isAllowedApkDownloadUrl(release.downloadUrl!))
  );
}

export async function openAppReleaseFallback(release: AppRelease): Promise<void> {
  if (release.testerUrl && isTesterWebpageUrl(release.testerUrl)) {
    await Linking.openURL(release.testerUrl);
    return;
  }
  if (release.downloadUrl && isAllowedApkDownloadUrl(release.downloadUrl)) {
    await Linking.openURL(release.downloadUrl);
    return;
  }
  throw new Error(
    "No trusted download page is available for this update."
  );
}

function deleteCachedApk(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup is best-effort.
  }
}

async function verifyDownloadedApk(file: File, release: AppRelease): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

  try {
    const size = file.size;
    if (typeof size !== "number" || size <= 0) {
      throw new ApkUpdateError("integrity", "The downloaded update is empty.");
    }
    const sha256 = await hashApkStream(file.readableStream(), controller.signal);
    assertApkIntegrity({ size, sha256 }, release);
  } catch (error) {
    deleteCachedApk(file);
    if (controller.signal.aborted) {
      throw new ApkUpdateError(
        "verification-timeout",
        "Update verification took too long. Try again or use the trusted download page.",
        { cause: error }
      );
    }
    if (error instanceof ApkUpdateError) throw error;
    throw new ApkUpdateError(
      "integrity",
      error instanceof Error
        ? error.message
        : "The downloaded update could not be verified.",
      { cause: error }
    );
  } finally {
    clearTimeout(timer);
  }
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
  onProgress: (percent: number) => void,
  onFinalizing: () => void
): Promise<File> {
  const dir = new Directory(Paths.cache, "apk-updates");
  dir.create({ idempotent: true });

  const destination = new File(dir, `spendly-${versionCode}.apk`);
  if (destination.exists) {
    destination.delete();
  }

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const armTimeout = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), DOWNLOAD_STALL_TIMEOUT_MS);
  };
  armTimeout();

  try {
    const task = File.createDownloadTask(url, destination, {
      signal: controller.signal,
      onProgress: ({ bytesWritten, totalBytes }) => {
        armTimeout();
        if (totalBytes > 0) {
          const percent = Math.min(
            100,
            Math.round((bytesWritten / totalBytes) * 100)
          );
          if (percent >= 100) {
            onFinalizing();
          } else {
            onProgress(percent);
          }
          return;
        }
        onProgress(0);
      },
    });

    const file = await task.downloadAsync();
    if (!file) {
      throw new ApkUpdateError(
        "download",
        "The update download was interrupted. Try again."
      );
    }
    return file;
  } catch (error) {
    deleteCachedApk(destination);
    if (controller.signal.aborted) {
      throw new ApkUpdateError(
        "download-timeout",
        "The update download stopped responding. Try again or use the trusted download page.",
        { cause: error }
      );
    }
    if (error instanceof ApkUpdateError) throw error;
    throw new ApkUpdateError(
      "download",
      "The update could not be downloaded. Check your connection and try again.",
      { cause: error }
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function withInstallerTimeout(
  operation: Promise<Awaited<ReturnType<typeof ApkInstaller.installApk>>>
) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new ApkUpdateError(
            "installer-timeout",
            "Android did not open the installer. Try again or use the trusted download page."
          )
        ),
      INSTALLER_HANDOFF_TIMEOUT_MS
    );
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    clearTimeout(timer!);
  }
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
    throw new ApkUpdateError("metadata", "No release information available right now.");
  }

  const installed = getInstalledVersionCode();
  if (installed !== null && target.versionCode <= installed) {
    report({ phase: "idle" });
    return "up-to-date";
  }

  if (Platform.OS !== "android") {
    report({ phase: "idle" });
    await openAppReleaseFallback(target);
    return "fallback";
  }

  try {
    if (!normalizeSha256(target.sha256)) {
      throw new ApkUpdateError(
        "integrity",
        "This update is missing a checksum and cannot be installed in-app."
      );
    }

    const apkUrl = await resolveApkUrl(target);
    if (!apkUrl || !isAllowedApkDownloadUrl(apkUrl)) {
      throw new ApkUpdateError(
        "metadata",
        "No trusted in-app APK is available for this update."
      );
    }

    const allowed = await ApkInstaller.canRequestPackageInstalls();
    if (!allowed) {
      report({ phase: "permission" });
      await ApkInstaller.openUnknownSourcesSettings();
      const granted = await waitForInstallPermission();
      if (!granted) return "needs-permission";
    }

    report({ phase: "downloading", percent: 0 });
    const file = await downloadApk(
      apkUrl,
      target.versionCode,
      (percent) => report({ phase: "downloading", percent }),
      () => report({ phase: "finalizing" })
    );

    report({ phase: "verifying" });
    await verifyDownloadedApk(file, target);

    report({ phase: "starting-installer" });
    try {
      const status = await withInstallerTimeout(ApkInstaller.installApk(file.uri));
      if (status === "aborted") return "aborted";
      if (status === "pending") {
        report({ phase: "waiting" });
        return "installer-started";
      }
      return "installed";
    } finally {
      deleteCachedApk(file);
    }
  } catch (error) {
    logWarning("apkUpdate.installAppRelease", error, {
      versionCode: target.versionCode,
    });
    if (error instanceof ApkUpdateError) throw error;
    throw new ApkUpdateError(
      "installer",
      "Android could not start the installer. Try again or use the trusted download page.",
      { cause: error }
    );
  }
}
