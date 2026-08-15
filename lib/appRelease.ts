/**
 * Shape of `system_settings/latest_release`, written by the Android release
 * workflow. `downloadUrl` is the GitHub Release APK; `storagePath` is set
 * only when Firebase Storage also received the file.
 *
 * CI overwrites this document on every release, so it always points at the
 * newest APK — skipped intermediate versions are never installed.
 */

export type AppRelease = {
  versionName: string;
  versionCode: number;
  /** Direct APK URL (GitHub Release, or a Storage token). */
  downloadUrl: string;
  /** Firebase Storage object path when that optional upload succeeded. */
  storagePath?: string;
  /** App Distribution tester webpage — fallback if in-app install fails. */
  testerUrl?: string;
  notes: string;
  mandatory: boolean;
  apkFileName?: string;
  publishedAt?: string;
  contentLength?: number;
  sha256?: string;
};

export const RELEASE_DOC_PATH = ["system_settings", "latest_release"] as const;

export function parseRelease(
  data: Record<string, unknown> | undefined
): AppRelease | null {
  if (!data) return null;

  const versionCode = Number(data.versionCode);
  const downloadUrl = typeof data.downloadUrl === "string" ? data.downloadUrl : "";
  const storagePath = typeof data.storagePath === "string" ? data.storagePath.trim() : "";

  if (!Number.isInteger(versionCode) || versionCode <= 0) return null;
  if (!downloadUrl && !storagePath) return null;

  const contentLength = Number(data.contentLength);

  return {
    versionName: typeof data.versionName === "string" ? data.versionName : "",
    versionCode,
    downloadUrl,
    storagePath: storagePath || undefined,
    testerUrl: typeof data.testerUrl === "string" ? data.testerUrl : undefined,
    notes: typeof data.notes === "string" ? data.notes : "",
    mandatory: data.mandatory === true,
    apkFileName: typeof data.apkFileName === "string" ? data.apkFileName : undefined,
    publishedAt: typeof data.publishedAt === "string" ? data.publishedAt : undefined,
    contentLength: Number.isFinite(contentLength) && contentLength > 0 ? contentLength : undefined,
    sha256: typeof data.sha256 === "string" ? data.sha256 : undefined,
  };
}

/** True when the URL is a webpage (App Tester / console) rather than an APK. */
export function isTesterWebpageUrl(url: string): boolean {
  return (
    url.includes("appdistribution.firebase") ||
    url.includes("console.firebase.google.com")
  );
}

/** How many published builds the installed app is behind. */
export function buildsBehind(
  installedVersionCode: number | null,
  latestVersionCode: number
): number {
  if (installedVersionCode === null || latestVersionCode <= installedVersionCode) {
    return 0;
  }
  return latestVersionCode - installedVersionCode;
}
