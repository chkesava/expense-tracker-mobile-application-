/**
 * SPENDLY-28 / AUTH-02 — in-app APK install is only as trustworthy as the
 * URL we fetch and the bytes we hand to PackageInstaller.
 *
 * CI already publishes `sha256` + `contentLength` on `latest_release*`.
 * This module is the client-side check that those fields are actually used:
 * HTTPS host allowlist before download, size/hash match before install.
 */

import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

import { env } from "@/lib/env";

/** GitHub repo whose Release assets the Android workflow uploads. */
export const GITHUB_APK_RELEASE_REPO = "chkesava/expense-tracker-mobile-application-";

const GITHUB_RELEASE_PREFIX = `/${GITHUB_APK_RELEASE_REPO}/releases/download/`;
const SHA256_HEX = /^[a-f0-9]{64}$/;

export function normalizeSha256(value: string | undefined): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().toLowerCase();
  return SHA256_HEX.test(hex) ? hex : null;
}

export function hashApkBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes));
}

export function isMandatoryRelease(release: {
  mandatory: boolean;
  sha256?: string;
}): boolean {
  return release.mandatory === true && normalizeSha256(release.sha256) !== null;
}

function parseHttpsUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isGithubReleaseApkUrl(parsed: URL): boolean {
  if (parsed.hostname !== "github.com") return false;
  if (!parsed.pathname.startsWith(GITHUB_RELEASE_PREFIX)) return false;
  const rest = parsed.pathname.slice(GITHUB_RELEASE_PREFIX.length);
  const parts = rest.split("/");
  if (parts.length !== 2) return false;
  const [tag, fileName] = parts;
  if (!tag || tag === "." || tag === "..") return false;
  if (!fileName || fileName === "." || fileName === "..") return false;
  return fileName.toLowerCase().endsWith(".apk");
}

function isFirebaseStorageApkUrl(parsed: URL, storageBucket: string): boolean {
  if (!storageBucket) return false;
  if (parsed.hostname !== "firebasestorage.googleapis.com") return false;
  const prefix = `/v0/b/${storageBucket}/o/`;
  if (!parsed.pathname.startsWith(prefix)) return false;
  return parsed.pathname.length > prefix.length;
}

/**
 * True when `url` is an HTTPS APK we are willing to download.
 *
 * Redirects after the request (GitHub → `*.githubusercontent.com`) are fine;
 * those hosts are not accepted as the *starting* URL.
 */
export function isAllowedApkDownloadUrl(
  url: string,
  storageBucket: string = env.firebase.storageBucket
): boolean {
  const parsed = parseHttpsUrl(url);
  if (!parsed) return false;
  return isGithubReleaseApkUrl(parsed) || isFirebaseStorageApkUrl(parsed, storageBucket);
}

export function assertApkIntegrity(
  actual: { size: number; sha256: string },
  expected: { sha256?: string; contentLength?: number }
): void {
  const expectedHash = normalizeSha256(expected.sha256);
  if (!expectedHash) {
    throw new Error("This update is missing a checksum and cannot be installed in-app.");
  }

  if (
    typeof expected.contentLength === "number" &&
    expected.contentLength > 0 &&
    actual.size !== expected.contentLength
  ) {
    throw new Error("The downloaded update is the wrong size.");
  }

  const actualHash = normalizeSha256(actual.sha256);
  if (!actualHash || actualHash !== expectedHash) {
    throw new Error("The downloaded update did not match its checksum.");
  }
}
