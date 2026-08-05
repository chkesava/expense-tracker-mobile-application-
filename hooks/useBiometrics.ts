/**
 * Device biometrics via expo-local-authentication.
 * Enrollment flag stored in SecureStore (key: vault_biometric_id).
 */

import { useCallback, useEffect, useState } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const BIOMETRIC_KEY = "vault_biometric_id";

export function useBiometrics() {
  const [isSupported, setIsSupported] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
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
      console.error("Biometric registration failed:", err);
      return false;
    }
  }, []);

  const authenticate = useCallback(async (): Promise<boolean> => {
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
      console.error("Biometric verification failed:", err);
      return false;
    }
  }, []);

  const unregister = useCallback(async () => {
    try {
      await SecureStore.deleteItemAsync(BIOMETRIC_KEY);
    } catch {
      /* ignore */
    }
    setIsRegistered(false);
  }, []);

  return { isSupported, isRegistered, register, authenticate, unregister };
}
