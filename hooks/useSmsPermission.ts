import { useCallback, useEffect, useState } from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import {
  loadSmsAutomationPrefs,
  normalizeSmsAutomationPrefs,
  saveSmsAutomationPrefs,
  subscribeSmsAutomationPrefs,
  type SmsAutomationPrefs,
  type SmsHandlingMode,
  SMS_AUTOMATION_PREFS_DEFAULTS,
} from "@/services/sms/smsAutomationPrefs";
import {
  checkSmsPermission,
  openSmsPermissionSettings,
  requestSmsPermission,
  type SmsPermissionStatus,
} from "@/services/sms/smsPermissions";

export type UseSmsPermissionResult = {
  supported: boolean;
  permissionStatus: SmsPermissionStatus;
  permissionLoading: boolean;
  prefs: SmsAutomationPrefs;
  prefsLoading: boolean;
  refreshPermission: () => Promise<SmsPermissionStatus>;
  requestPermission: () => Promise<SmsPermissionStatus>;
  openSystemSettings: () => Promise<void>;
  setEnabled: (enabled: boolean) => Promise<SmsPermissionStatus | null>;
  setHandlingMode: (mode: SmsHandlingMode) => Promise<void>;
};

export function useSmsPermission(): UseSmsPermissionResult {
  const supported = Platform.OS === "android";
  const [permissionStatus, setPermissionStatus] =
    useState<SmsPermissionStatus>(supported ? "denied" : "unavailable");
  const [permissionLoading, setPermissionLoading] = useState(supported);
  const [prefs, setPrefs] = useState<SmsAutomationPrefs>(
    SMS_AUTOMATION_PREFS_DEFAULTS
  );
  const [prefsLoading, setPrefsLoading] = useState(true);

  const refreshPermission = useCallback(async () => {
    if (!supported) {
      setPermissionStatus("unavailable");
      setPermissionLoading(false);
      return "unavailable" as const;
    }
    setPermissionLoading(true);
    try {
      const status = await checkSmsPermission();
      setPermissionStatus(status);
      return status;
    } finally {
      setPermissionLoading(false);
    }
  }, [supported]);

  const requestPermission = useCallback(async () => {
    if (!supported) return "unavailable" as const;
    setPermissionLoading(true);
    try {
      const status = await requestSmsPermission();
      setPermissionStatus(status);
      return status;
    } finally {
      setPermissionLoading(false);
    }
  }, [supported]);

  const openSystemSettings = useCallback(async () => {
    await openSmsPermissionSettings();
  }, []);

  const persistPrefs = useCallback(async (next: SmsAutomationPrefs) => {
    const normalized = normalizeSmsAutomationPrefs(next);
    setPrefs(normalized);
    await saveSmsAutomationPrefs(normalized);
  }, []);

  const setEnabled = useCallback(
    async (enabled: boolean) => {
      if (!enabled) {
        await persistPrefs({ ...prefs, enabled: false });
        return null;
      }

      if (!supported) {
        await persistPrefs({ ...prefs, enabled: false });
        return "unavailable" as const;
      }

      let status = await checkSmsPermission();
      if (status !== "granted") {
        status = await requestSmsPermission();
        setPermissionStatus(status);
      }

      if (status === "granted") {
        await persistPrefs({ ...prefs, enabled: true });
        void import("@/services/sms/smsNotifications").then((m) =>
          m.requestSmsNotificationPermission()
        );
      } else {
        await persistPrefs({ ...prefs, enabled: false });
      }
      return status;
    },
    [persistPrefs, prefs, supported]
  );

  const setHandlingMode = useCallback(
    async (handlingMode: SmsHandlingMode) => {
      await persistPrefs({ ...prefs, handlingMode });
    },
    [persistPrefs, prefs]
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const storedPrefs = await loadSmsAutomationPrefs();
      await refreshPermission();
      if (!cancelled) {
        setPrefs(storedPrefs);
        setPrefsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshPermission]);

  useEffect(() => {
    return subscribeSmsAutomationPrefs((next) => {
      setPrefs(next);
    });
  }, []);

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === "active") {
        void refreshPermission();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refreshPermission]);

  return {
    supported,
    permissionStatus,
    permissionLoading,
    prefs,
    prefsLoading,
    refreshPermission,
    requestPermission,
    openSystemSettings,
    setEnabled,
    setHandlingMode,
  };
}
