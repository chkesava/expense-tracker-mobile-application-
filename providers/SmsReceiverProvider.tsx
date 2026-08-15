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
import { router, type Href } from "expo-router";

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
import { useAccounts } from "@/hooks/useAccounts";
import { useSmsRecurringSync } from "@/hooks/useSmsRecurringSync";
import { logWarning } from "@/lib/errors";

/**
 * `getLastNotificationResponseAsync` keeps returning the launch tap for the
 * lifetime of the process, so a remount of this provider (sign-out and back in,
 * privacy lock) must not replay that navigation.
 */
const handledColdStartResponseIds = new Set<string>();

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
  const { accounts } = useAccounts();
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

  useSmsRecurringSync();

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

  // Tap a transaction notification → inbox (detected) or dashboard (auto-added).
  // Not gated by `supported`: credit-card-bill reminders (unlike SMS) are
  // scheduled on every platform, so this has to run on iOS too — otherwise
  // tapping a bill reminder on iOS would never navigate anywhere.
  useEffect(() => {
    let cancelled = false;
    let sub: { remove: () => void } | undefined;

    const navigateToNotification = (response: {
      notification: { request: { content: { data?: unknown } } };
    }) => {
      const data = response.notification.request.content.data as
        | { source?: string; url?: string }
        | undefined;
      const source = data?.source;
      if (source !== "sms" && source !== "credit_card_bill") return;
      const url = data?.url;
      if (typeof url !== "string" || !url.startsWith("/")) return;
      // `dismissTo` reuses the screen when it is already in the stack, so
      // repeated notification taps cannot pile up duplicate copies of it.
      router.dismissTo(url as Href);
    };

    void import("expo-notifications").then(async (Notifications) => {
      if (cancelled) return;
      sub = Notifications.addNotificationResponseReceivedListener(
        navigateToNotification
      );

      // A tap that launched the app fires before this listener exists, so the
      // cold-start response has to be collected separately or it is lost.
      const initial = await Notifications.getLastNotificationResponseAsync().catch(
        () => null
      );
      if (cancelled || !initial) return;
      if (handledColdStartResponseIds.has(initial.notification.request.identifier)) {
        return;
      }
      handledColdStartResponseIds.add(initial.notification.request.identifier);
      navigateToNotification(initial);
    });

    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, []);

  // Ask for notification permission once SMS listening is on.
  useEffect(() => {
    if (!supported || !ready) return;
    if (!prefs.enabled || permissionStatus !== "granted" || isDuress) return;
    void import("@/services/sms/smsNotifications").then((m) =>
      m.requestSmsNotificationPermission()
    );
  }, [supported, ready, prefs.enabled, permissionStatus, isDuress]);

  // Subscribe to inbound events once; processor gates on prefs/duress.
  useEffect(() => {
    if (!supported) return;

    const sub = addSmsReceivedListener((messages) => {
      void (async () => {
        await processIncomingSmsMessages(messages, {
          blockImport: isDuress,
          uid: user?.uid,
          accounts,
        });
        const status = await loadSmsInboundStatus();
        setInboundStatus(status);
      })();
    });

    return () => sub.remove();
  }, [supported, isDuress, user?.uid, accounts]);

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
        logWarning("smsReceiverProvider.smsListenerStartStop", err);
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
