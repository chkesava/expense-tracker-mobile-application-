/**
 * Detects newer sideloaded builds published by the release workflow.
 *
 * CI writes `system_settings/latest_release` after uploading the APK to
 * Firebase App Distribution. The app compares that versionCode against the
 * installed one and prompts the user to download the new build.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";

export type AppRelease = {
  versionName: string;
  versionCode: number;
  downloadUrl: string;
  notes: string;
  mandatory: boolean;
  apkFileName?: string;
  publishedAt?: string;
};

const RELEASE_DOC_PATH = ["system_settings", "latest_release"] as const;
const DISMISSED_KEY_PREFIX = "@update_dismissed_v";

/** Build number of the running app, or null when it cannot be determined. */
export function getInstalledVersionCode(): number | null {
  const native = Application.nativeBuildVersion;
  if (native) {
    const parsed = Number.parseInt(native, 10);
    if (Number.isInteger(parsed)) return parsed;
  }

  // Expo Go and web have no native build number; fall back to the manifest.
  const fromManifest = Constants.expoConfig?.android?.versionCode;
  return typeof fromManifest === "number" ? fromManifest : null;
}

/** Human-readable version of the running app, e.g. "1.1.0". */
export function getInstalledVersionName(): string {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    "unknown"
  );
}

function parseRelease(data: Record<string, unknown> | undefined): AppRelease | null {
  if (!data) return null;

  const versionCode = Number(data.versionCode);
  const downloadUrl = typeof data.downloadUrl === "string" ? data.downloadUrl : "";

  if (!Number.isInteger(versionCode) || !downloadUrl) return null;

  return {
    versionName: typeof data.versionName === "string" ? data.versionName : "",
    versionCode,
    downloadUrl,
    notes: typeof data.notes === "string" ? data.notes : "",
    mandatory: data.mandatory === true,
    apkFileName: typeof data.apkFileName === "string" ? data.apkFileName : undefined,
    publishedAt: typeof data.publishedAt === "string" ? data.publishedAt : undefined,
  };
}

/** One-shot read, used by the manual "Check for updates" action. */
export async function fetchLatestRelease(): Promise<AppRelease | null> {
  const db = getFirestoreDb();
  if (!db) return null;

  try {
    const snapshot = await getDoc(doc(db, ...RELEASE_DOC_PATH));
    if (!snapshot.exists()) return null;
    return parseRelease(snapshot.data());
  } catch {
    return null;
  }
}

export function useAppUpdate() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [dismissedCode, setDismissedCode] = useState<number | null>(null);

  // Only Android receives sideloaded APK builds from the release workflow.
  const supported = Platform.OS === "android";
  const installedVersionCode = useMemo(getInstalledVersionCode, []);
  const installedVersionName = useMemo(getInstalledVersionName, []);

  useEffect(() => {
    if (!supported) return;

    const db = getFirestoreDb();
    if (!db) return;

    const unsubscribe = onSnapshot(
      doc(db, ...RELEASE_DOC_PATH),
      (snapshot) => {
        setRelease(snapshot.exists() ? parseRelease(snapshot.data()) : null);
      },
      () => {
        // A missing doc or denied read simply means "no update to show".
        setRelease(null);
      }
    );

    return unsubscribe;
  }, [supported]);

  const availableCode = release?.versionCode ?? null;

  useEffect(() => {
    if (availableCode === null) return;

    let active = true;
    AsyncStorage.getItem(`${DISMISSED_KEY_PREFIX}${availableCode}`)
      .then((stored) => {
        if (active && stored) setDismissedCode(availableCode);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [availableCode]);

  const updateAvailable = Boolean(
    supported &&
      release &&
      installedVersionCode !== null &&
      release.versionCode > installedVersionCode
  );

  const visible =
    updateAvailable && release
      ? release.mandatory || dismissedCode !== release.versionCode
      : false;

  const dismiss = useCallback(() => {
    if (!release || release.mandatory) return;

    setDismissedCode(release.versionCode);
    AsyncStorage.setItem(
      `${DISMISSED_KEY_PREFIX}${release.versionCode}`,
      new Date().toISOString()
    ).catch(() => undefined);
  }, [release]);

  /** Re-show the prompt for a release the user previously dismissed. */
  const resetDismissal = useCallback(() => {
    setDismissedCode(null);
    if (release) {
      AsyncStorage.removeItem(`${DISMISSED_KEY_PREFIX}${release.versionCode}`).catch(
        () => undefined
      );
    }
  }, [release]);

  return {
    release,
    updateAvailable,
    visible,
    dismiss,
    resetDismissal,
    installedVersionCode,
    installedVersionName,
  };
}
