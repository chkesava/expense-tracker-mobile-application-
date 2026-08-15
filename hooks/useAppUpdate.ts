/**
 * Detects newer sideloaded builds published by the release workflow.
 *
 * CI overwrites `system_settings/latest_release` with the newest APK on every
 * release. The prompt reappears each time the user opens the app while behind.
 * Tapping Update always installs that latest APK — skipped versions are jumped.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState, Platform } from "react-native";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { doc, getDoc, onSnapshot } from "firebase/firestore";

import {
  parseRelease,
  RELEASE_DOC_PATH,
  type AppRelease,
} from "@/lib/appRelease";
import { logWarning } from "@/lib/errors";
import { getFirestoreDb } from "@/lib/firebase";

export type { AppRelease };

/** One-shot read, used by the manual "Check for updates" action. */
export async function fetchLatestRelease(): Promise<AppRelease | null> {
  const db = getFirestoreDb();
  if (!db) {
    const error = new Error("Firebase is not configured.");
    (error as { code?: string }).code = "unavailable";
    throw error;
  }

  const snapshot = await getDoc(doc(db, ...RELEASE_DOC_PATH));
  if (!snapshot.exists()) return null;
  return parseRelease(snapshot.data());
}

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

export function useAppUpdate() {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [dismissedThisSession, setDismissedThisSession] = useState(false);

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
      (error) => {
        logWarning("snapshot.latestRelease", error);
        setRelease(null);
      }
    );

    return unsubscribe;
  }, [supported]);

  // "Not now" only hides the sheet until they leave and open the app again.
  useEffect(() => {
    if (!supported) return;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setDismissedThisSession(false);
    });

    return () => subscription.remove();
  }, [supported]);

  const updateAvailable = Boolean(
    supported &&
      release &&
      installedVersionCode !== null &&
      release.versionCode > installedVersionCode
  );

  const visible =
    updateAvailable && release
      ? release.mandatory || !dismissedThisSession
      : false;

  const dismiss = useCallback(() => {
    if (!release || release.mandatory) return;
    setDismissedThisSession(true);
  }, [release]);

  const resetDismissal = useCallback(() => {
    setDismissedThisSession(false);
  }, []);

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
