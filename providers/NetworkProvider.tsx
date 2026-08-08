/**
 * NetworkProvider — real-time connectivity state for the app.
 *
 * Uses @react-native-community/netinfo for reliable iOS/Android/web detection.
 * Exposes: isOnline, connectionType, wasOffline, lastOnlineAt, retryNow.
 */

import NetInfo, {
  type NetInfoState,
  type NetInfoSubscription,
} from "@react-native-community/netinfo";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectionType =
  | "wifi"
  | "cellular"
  | "ethernet"
  | "bluetooth"
  | "wimax"
  | "vpn"
  | "other"
  | "none"
  | "unknown";

export type NetworkContextType = {
  /** Whether the device currently has internet access */
  isOnline: boolean;
  /** Type of active connection */
  connectionType: ConnectionType;
  /** True if the session has experienced any offline period.
   *  Used to trigger "back online" toasts and animations. */
  wasOffline: boolean;
  /** Timestamp of the last confirmed online moment */
  lastOnlineAt: Date | null;
  /** Force an immediate connectivity recheck */
  retryNow: () => void;
  /** Clear wasOffline after the synced toast has dismissed */
  clearWasOffline: () => void;
};

// ─── Context ──────────────────────────────────────────────────────────────────

const NetworkContext = createContext<NetworkContextType>({
  isOnline: true,
  connectionType: "unknown",
  wasOffline: false,
  lastOnlineAt: null,
  retryNow: () => undefined,
  clearWasOffline: () => undefined,
});

// ─── Provider ─────────────────────────────────────────────────────────────────

function resolveConnectionType(state: NetInfoState): ConnectionType {
  if (!state.isConnected || !state.isInternetReachable) return "none";
  const t = state.type as string;
  const valid: ConnectionType[] = [
    "wifi",
    "cellular",
    "ethernet",
    "bluetooth",
    "wimax",
    "vpn",
    "other",
  ];
  return (valid.find((v) => v === t) as ConnectionType) ?? "unknown";
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const [connectionType, setConnectionType] = useState<ConnectionType>("unknown");
  const [wasOffline, setWasOffline] = useState(false);
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(new Date());

  const netInfoUnsubRef = useRef<NetInfoSubscription | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const handleNetInfoChange = useCallback((state: NetInfoState) => {
    const online =
      state.isConnected === true && state.isInternetReachable !== false;
    const type = resolveConnectionType(state);

    setIsOnline((prev) => {
      if (prev && !online) {
        // Going offline
        setWasOffline(true);
      }
      if (!prev && online) {
        // Coming back online
        setLastOnlineAt(new Date());
      }
      return online;
    });
    setConnectionType(type);
  }, []);

  const retryNow = useCallback(() => {
    NetInfo.refresh().then(handleNetInfoChange).catch(() => undefined);
  }, [handleNetInfoChange]);

  const clearWasOffline = useCallback(() => {
    setWasOffline(false);
  }, []);

  // Subscribe to NetInfo on mount
  useEffect(() => {
    // Initial fetch
    NetInfo.fetch().then(handleNetInfoChange).catch(() => undefined);

    // Real-time subscription
    netInfoUnsubRef.current = NetInfo.addEventListener(handleNetInfoChange);

    return () => {
      netInfoUnsubRef.current?.();
    };
  }, [handleNetInfoChange]);

  // Re-check connectivity when app comes to foreground
  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (
        (prev === "background" || prev === "inactive") &&
        nextState === "active"
      ) {
        retryNow();
      }
    });
    return () => sub.remove();
  }, [retryNow]);

  const value = useMemo<NetworkContextType>(
    () => ({
      isOnline,
      connectionType,
      wasOffline,
      lastOnlineAt,
      retryNow,
      clearWasOffline,
    }),
    [isOnline, connectionType, wasOffline, lastOnlineAt, retryNow, clearWasOffline]
  );

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNetwork() {
  return useContext(NetworkContext);
}
