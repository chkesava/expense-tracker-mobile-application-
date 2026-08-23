import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { logError } from "@/lib/errors";
import { useAuth } from "@/providers/AuthProvider";
import type { GaneshActor } from "@/services/ganesh/ganeshWrites";

const STORAGE_KEY = "@ganesh_session";

type SessionState = {
  pandalId: string | null;
  festivalId: string | null;
};

type GaneshSessionContextValue = SessionState & {
  ready: boolean;
  actor: GaneshActor | null;
  setSession: (next: SessionState) => Promise<void>;
  clearSession: () => Promise<void>;
};

const GaneshSessionContext = createContext<GaneshSessionContextValue | undefined>(undefined);

export function GaneshSessionProvider({ children }: { children: ReactNode }) {
  const { realUser } = useAuth();
  const [state, setState] = useState<SessionState>({ pandalId: null, festivalId: null });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw) as SessionState;
        if (parsed.pandalId || parsed.festivalId) setState(parsed);
      })
      .catch((error) => logError("ganeshSession.load", error))
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setSession = useCallback(async (next: SessionState) => {
    setState(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const clearSession = useCallback(async () => {
    setState({ pandalId: null, festivalId: null });
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

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
