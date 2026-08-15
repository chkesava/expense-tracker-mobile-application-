/**
 * Single shared listener for `users/{realUid}`.
 * Theme, settings, and role all read from this (no extra snapshots).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { doc, onSnapshot, type DocumentData } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { snapshotErrorHandler, type LoadFailure } from "@/lib/firestoreErrors";
import { useAuth } from "@/providers/AuthProvider";
import type { UserRole } from "@/shared/types/user";

type UserDocContextType = {
  data: DocumentData | null;
  /**
   * True only when the document was read and found. Always false while
   * `error` is set — a failed read tells us nothing about existence.
   */
  exists: boolean;
  /** Non-null when the listener failed. */
  error: LoadFailure | null;
  loading: boolean;
  role: UserRole;
  isAdmin: boolean;
};

const UserDocContext = createContext<UserDocContextType | undefined>(undefined);

export function UserDocProvider({ children }: { children: ReactNode }) {
  const { realUser, user } = useAuth();
  const uid = realUser?.uid ?? null;

  const [data, setData] = useState<DocumentData | null>(null);
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<LoadFailure | null>(null);
  /** Only equals `uid` after the first snapshot (or error) for that user. */
  const [observedUid, setObservedUid] = useState<string | null>(null);

  useEffect(() => {
    const db = getFirestoreDb();
    if (!uid || !db) {
      setData(null);
      setExists(false);
      setObservedUid(null);
      return;
    }

    // Mark this uid as not-yet-observed so Settings cannot seed defaults mid-race.
    setData(null);
    setExists(false);
    setError(null);
    setObservedUid(null);

    const ref = doc(db, "users", uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setData(snap.data());
          setExists(true);
        } else {
          setData(null);
          setExists(false);
        }
        setError(null);
        setObservedUid(uid);
      },
      snapshotErrorHandler(
        "snapshot.userDoc",
        (failure) => {
          // Deliberately does NOT set `exists`/`data`: a read failure is not
          // evidence the document is missing. Reporting "missing" here made
          // SettingsProvider fall back to defaults, visibly resetting the
          // user's currency, budget, theme and accent on a transient error.
          setError(failure);
          setObservedUid(uid);
        },
        "Couldn't load your profile."
      )
    );

    return unsub;
  }, [uid]);

  const loading = Boolean(uid) && observedUid !== uid;

  const isDuress = Boolean(realUser && user && realUser.uid !== user.uid);

  const role: UserRole = useMemo(() => {
    if (isDuress) return "USER";
    return data?.role === "SUPER_ADMIN" ? "SUPER_ADMIN" : "USER";
  }, [data?.role, isDuress]);

  const value = useMemo<UserDocContextType>(
    () => ({
      data,
      exists,
      error,
      loading,
      role,
      isAdmin: role === "SUPER_ADMIN",
    }),
    [data, exists, error, loading, role]
  );

  return (
    <UserDocContext.Provider value={value}>{children}</UserDocContext.Provider>
  );
}

export function useUserDoc() {
  const context = useContext(UserDocContext);
  if (context === undefined) {
    throw new Error("useUserDoc must be used within a UserDocProvider");
  }
  return context;
}
