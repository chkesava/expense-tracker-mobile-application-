/**
 * Device biometrics via expo-local-authentication.
 * Enrollment flag stored in SecureStore (key: vault_biometric_id).
 */

import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { logError } from "@/lib/errors";

const BIOMETRIC_KEY = "vault_biometric_id";
// expo-local-authentication/expo-secure-store have no web hardware to back
// them — their web stubs already fail safely (hasHardwareAsync() -> false,
// SecureStore calls reject), this just skips the calls outright so nothing
// logs spurious errors on the public web pages.
const SUPPORTED = Platform.OS !== "web";

export function useBiometrics() {
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    if (!SUPPORTED) return;
    let cancelled = false;

    (async () => {
      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!cancelled) setIsSupported(hasHardware && enrolled);

        const stored = await SecureStore.getItemAsync(BIOMETRIC_KEY);
        if (!cancelled) setIsRegistered(Boolean(stored));
      } catch {
        if (!cancelled) {
          setIsSupported(false);
          setIsRegistered(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const register = useCallback(async (): Promise<boolean> => {
    if (!SUPPORTED) return false;
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) return false;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable biometrics for Vault",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      if (!result.success) return false;

      await SecureStore.setItemAsync(BIOMETRIC_KEY, "enabled");
      setIsRegistered(true);
      setIsSupported(true);
      return true;
    } catch (err) {
      logError("biometrics.biometricRegistration", err);
      return false;
    }
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
    if (!SUPPORTED) return false;
    try {
      const stored = await SecureStore.getItemAsync(BIOMETRIC_KEY);
      if (!stored) return false;

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Unlock Vault",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      return result.success;
    } catch (err) {
      logError("biometrics.biometricVerification", err);
      return false;
    }
  }, []);

  const unregister = useCallback(async () => {
    if (!SUPPORTED) {
      setIsRegistered(false);
      return;
    }
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
    } catch {
      /* ignore */
    }
    setIsRegistered(false);
  }, []);

  return { isSupported, isRegistered, register, authenticate, unregister };
}
