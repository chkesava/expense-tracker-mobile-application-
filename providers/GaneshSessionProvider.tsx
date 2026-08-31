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
import AsyncStorage from "@react-native-async-storage/async-storage";

import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import type { GaneshActor } from "@/services/ganesh/ganeshWrites";
import {
  GANESH_SESSION_LEGACY_KEY,
  emptyGaneshSession,
  ganeshSessionStorageKey,
  hasGaneshSession,
  parseGaneshSession,
  type GaneshSessionState,
} from "@/shared/utils/ganeshSessionStorage";

export const GANESH_SESSION_STORAGE_KEY = GANESH_SESSION_LEGACY_KEY;

type GaneshSessionContextValue = GaneshSessionState & {
  ready: boolean;
  actor: GaneshActor | null;
  setSession: (next: GaneshSessionState) => Promise<void>;
  clearSession: () => Promise<void>;
};

const GaneshSessionContext = createContext<GaneshSessionContextValue | undefined>(undefined);

export function GaneshSessionProvider({ children }: { children: ReactNode }) {
  const { realUser } = useAuth();
  const uid = realUser?.uid ?? null;
  const [state, setState] = useState<GaneshSessionState>(emptyGaneshSession());
  const [ready, setReady] = useState(false);
  const uidRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const previousUid = uidRef.current;
    uidRef.current = uid;

    const load = async () => {
      if (!uid) {
        setState(emptyGaneshSession());
        if (previousUid) {
          await AsyncStorage.removeItem(ganeshSessionStorageKey(previousUid)).catch((error) => {
            logError("ganeshSession.clearPrevious", error);
          });
        }
        if (!cancelled) setReady(true);
        return;
      }

      setReady(false);
      try {
        const namespaced = await AsyncStorage.getItem(ganeshSessionStorageKey(uid));
        const parsed = parseGaneshSession(namespaced);
        if (hasGaneshSession(parsed)) {
          if (!cancelled) setState(parsed!);
          return;
        }
        const legacy = await AsyncStorage.getItem(GANESH_SESSION_LEGACY_KEY);
        const legacyParsed = parseGaneshSession(legacy);
        if (hasGaneshSession(legacyParsed)) {
          await AsyncStorage.setItem(ganeshSessionStorageKey(uid), JSON.stringify(legacyParsed));
          await AsyncStorage.removeItem(GANESH_SESSION_LEGACY_KEY);
          if (!cancelled) setState(legacyParsed!);
          return;
        }
        if (!cancelled) setState(emptyGaneshSession());
      } catch (error) {
        logError("ganeshSession.load", error);
        if (!cancelled) setState(emptyGaneshSession());
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const setSession = useCallback(
    async (next: GaneshSessionState) => {
      setState(next);
      if (!uid) return;
      await AsyncStorage.setItem(ganeshSessionStorageKey(uid), JSON.stringify(next));
    },
    [uid]
  );

  const clearSession = useCallback(async () => {
    setState(emptyGaneshSession());
    if (uid) {
      await AsyncStorage.removeItem(ganeshSessionStorageKey(uid));
    }
    await AsyncStorage.removeItem(GANESH_SESSION_LEGACY_KEY);
  }, [uid]);

  const actor = useMemo<GaneshActor | null>(() => {
    if (!realUser) return null;
    return {
      uid: realUser.uid,
      displayName: realUser.displayName?.trim() || realUser.phoneNumber || "Member",
      phone: realUser.phoneNumber ?? undefined,
    };
  }, [realUser]);

  const value = useMemo(
    () => ({
      ...state,
      ready,
      actor,
      setSession,
      clearSession,
    }),
    [state, ready, actor, setSession, clearSession]
  );

  return (
    <GaneshSessionContext.Provider value={value}>{children}</GaneshSessionContext.Provider>
  );
}

export function useGaneshSession() {
  const context = useContext(GaneshSessionContext);
  if (!context) {
    throw new Error("useGaneshSession must be used within GaneshSessionProvider");
  }
  return context;
}
