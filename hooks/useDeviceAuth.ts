import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";

import { logError } from "@/lib/errors";

/**
 * SPENDLY-614 — "confirm it's you" with the device's own lock (biometrics or
 * passcode), for the per-goal lock. Unlike `useBiometrics` (the Vault's
 * enrolment), this needs no app-side registration: any device screen lock
 * works, and a device without one can't use goal locks.
 *
 * Web has no device authentication: `available` is false there.
 */
export function useDeviceAuth() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let cancelled = false;
    LocalAuthentication.getEnrolledLevelAsync()
      .then((level) => {
        if (!cancelled) setAvailable(level !== LocalAuthentication.SecurityLevel.NONE);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const confirm = useCallback(async (promptMessage: string): Promise<boolean> => {
    if (Platform.OS === "web") return false;
    try {
      const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: "Cancel", disableDeviceFallback: false });
      return result.success;
    } catch (error) {
      logError("deviceAuth.confirm", error);
      return false;
    }
  }, []);

  return { available, confirm };
}
