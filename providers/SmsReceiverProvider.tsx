/**
 * Starts/stops the runtime SMS BroadcastReceiver based on automation prefs.
 * Event-driven only — no inbox polling loop.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform, type AppStateStatus } from "react-native";

import { useAuth } from "@/providers/AuthProvider";
import {
  checkSmsPermission,
  type SmsPermissionStatus,
} from "@/services/sms/smsPermissions";
import {
  loadSmsAutomationPrefs,
  subscribeSmsAutomationPrefs,
  type SmsAutomationPrefs,
  SMS_AUTOMATION_PREFS_DEFAULTS,
} from "@/services/sms/smsAutomationPrefs";
import {
  addSmsReceivedListener,
  isSmsListening,
  startSmsListening,
  stopSmsListening,
} from "@/services/sms/smsListener";
import {
  loadSmsInboundStatus,
  patchSmsInboundStatus,
  type SmsInboundStatus,
  SMS_INBOUND_STATUS_DEFAULTS,
} from "@/services/sms/smsInboundStatus";
import { processIncomingSmsMessages } from "@/services/sms/smsTransactionProcessor";

type SmsReceiverContextValue = {
  listening: boolean;
  inboundStatus: SmsInboundStatus;
  refreshListening: () => Promise<void>;
};

const SmsReceiverContext = createContext<SmsReceiverContextValue | undefined>(
  undefined
);

export function SmsReceiverProvider({ children }: { children: ReactNode }) {
  const supported = Platform.OS === "android";
  const { isDuress, user } = useAuth();
  const [prefs, setPrefs] = useState<SmsAutomationPrefs>(
    SMS_AUTOMATION_PREFS_DEFAULTS
  );
  const [permissionStatus, setPermissionStatus] =
    useState<SmsPermissionStatus>(supported ? "denied" : "unavailable");
  const [listening, setListening] = useState(false);
  const [inboundStatus, setInboundStatus] = useState<SmsInboundStatus>(
    SMS_INBOUND_STATUS_DEFAULTS
  );
  const [ready, setReady] = useState(false);

  const refreshListening = useCallback(async () => {
    if (!supported) {
      setListening(false);
      return;
    }
    try {
      setListening(await isSmsListening());
    } catch {
      setListening(false);
    }
  }, [supported]);

  const syncPermission = useCallback(async () => {
    if (!supported) {
      setPermissionStatus("unavailable");
      return "unavailable" as const;
    }
    const status = await checkSmsPermission();
    setPermissionStatus(status);
    return status;
  }, [supported]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [storedPrefs, status] = await Promise.all([
        loadSmsAutomationPrefs(),
        loadSmsInboundStatus(),
        syncPermission(),
      ]);
      if (cancelled) return;
      setPrefs(storedPrefs);
      setInboundStatus(status);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [syncPermission]);

  useEffect(() => {
    return subscribeSmsAutomationPrefs((next) => {
      setPrefs(next);
    });
  }, []);

  // Subscribe to inbound events once; processor gates on prefs/duress.
  useEffect(() => {
    if (!supported) return;

    const sub = addSmsReceivedListener((messages) => {
      void (async () => {
        await processIncomingSmsMessages(messages, {
          blockImport: isDuress,
          uid: user?.uid,
        });
        const status = await loadSmsInboundStatus();
        setInboundStatus(status);
      })();
    });

    return () => sub.remove();
  }, [supported, isDuress, user?.uid]);

  // Register receiver only while Enabled + permission granted (and not duress).
  useEffect(() => {
    if (!supported || !ready) return;

    let cancelled = false;

    (async () => {
      const shouldListen =
        prefs.enabled && permissionStatus === "granted" && !isDuress;

      await patchSmsInboundStatus({ listeningRequested: shouldListen });
      const status = await loadSmsInboundStatus();
      if (!cancelled) setInboundStatus(status);

      try {
        if (shouldListen) {
          await startSmsListening();
        } else {
          await stopSmsListening();
        }
      } catch (err) {
        console.warn("[sms] listener start/stop failed", err);
        try {
          await stopSmsListening();
        } catch {
          /* ignore */
        }
      }

      if (!cancelled) await refreshListening();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    supported,
    ready,
    prefs.enabled,
    permissionStatus,
    isDuress,
    refreshListening,
  ]);

  // Re-assert listening when returning to foreground.
  useEffect(() => {
    if (!supported) return;
    const onChange = (state: AppStateStatus) => {
      if (state !== "active") return;
      void (async () => {
        await syncPermission();
        const latestPrefs = await loadSmsAutomationPrefs();
        setPrefs(latestPrefs);
        const granted = (await checkSmsPermission()) === "granted";
        const shouldListen = latestPrefs.enabled && granted && !isDuress;
        if (!shouldListen) {
          await stopSmsListening();
        } else {
          try {
            const active = await isSmsListening();
            if (!active) await startSmsListening();
          } catch {
            /* ignore */
          }
        }
        await refreshListening();
        setInboundStatus(await loadSmsInboundStatus());
      })();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [supported, isDuress, refreshListening, syncPermission]);

  useEffect(() => {
    return () => {
      if (supported) {
        void stopSmsListening();
      }
    };
  }, [supported]);

  const value = useMemo(
    () => ({ listening, inboundStatus, refreshListening }),
    [listening, inboundStatus, refreshListening]
  );

  return (
    <SmsReceiverContext.Provider value={value}>
      {children}
    </SmsReceiverContext.Provider>
  );
}

export function useSmsReceiver(): SmsReceiverContextValue {
  const ctx = useContext(SmsReceiverContext);
  if (!ctx) {
    return {
      listening: false,
      inboundStatus: SMS_INBOUND_STATUS_DEFAULTS,
      refreshListening: async () => undefined,
    };
  }
  return ctx;
}
