/**
 * Device-local privacy PIN state — SPENDLY-22 (AUTH-04).
 *
 * The PIN used to live on `users/{uid}` and arrive through `SettingsProvider`,
 * so every consumer read it synchronously from settings. It now lives in
 * `lib/pinVault.ts` behind SecureStore, which is async, so this provider owns
 * the state and the one-time migration off Firestore.
 *
 * A provider rather than a hook: `PrivacyLock` and the Settings screen sit in
 * different subtrees and must agree instantly — removing the PIN has to drop
 * the lock, and two independent `useState`s would drift.
 *
 * Mounted once in `app/_layout.tsx`, which covers Spendly, Ganesh Seva and
 * Nutrition — all three render `PrivacyLock`.
 */

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
import { deleteField, doc, setDoc } from "firebase/firestore";

import { getFirestoreDb } from "@/lib/firebase";
import { logError } from "@/lib/errors";
import { commitWrite } from "@/lib/firestoreWrite";
import {
  clearAllPins,
  clearDuressPin,
  getPinStatus,
  importLegacyPins,
  setDuressPin as writeDuressPin,
  setRealPin as writeRealPin,
  verifyPin as verifyStoredPin,
  type PinVerdict,
} from "@/lib/pinVault";
import { forgetPrivacyLockout, hydratePrivacyLockout } from "@/lib/privacyLockout";
import { planIsEmpty, planPinMigration } from "@/lib/privacyPinMigration";
import { useAuth } from "@/providers/AuthProvider";
import { useUserDoc } from "@/providers/UserDocProvider";

type PrivacyPinContextType = {
  /**
   * False until the vault has been read.
   *
   * `PrivacyLock` must not render its children unlocked while this is false —
   * "no PIN yet" and "we have not looked" are different answers.
   */
  ready: boolean;
  hasRealPin: boolean;
  hasDuressPin: boolean;
  /** True for one launch after the PIN moved off Firestore, to explain it. */
  migratedThisLaunch: boolean;
  setRealPin: (pin: string) => Promise<void>;
  setDuressPin: (pin: string) => Promise<boolean>;
  removeDuressPin: () => Promise<void>;
  removeAllPins: () => Promise<void>;
  verifyPin: (pin: string) => Promise<PinVerdict>;
};

const PrivacyPinContext = createContext<PrivacyPinContextType | undefined>(
  undefined,
);

export function PrivacyPinProvider({ children }: { children: ReactNode }) {
  const { realUser } = useAuth();
  const { data, loading, error } = useUserDoc();
  const uid = realUser?.uid ?? null;

  const [ready, setReady] = useState(false);
  const [hasRealPin, setHasRealPin] = useState(false);
  const [hasDuressPin, setHasDuressPin] = useState(false);
  const [migratedThisLaunch, setMigratedThisLaunch] = useState(false);
  /** Uid whose migration has already run this session. */
  const migratedFor = useRef<string | null>(null);

  const refresh = useCallback(async (forUid: string) => {
    const status = await getPinStatus(forUid);
    setHasRealPin(status.hasReal);
    setHasDuressPin(status.hasDuress);
    return status;
  }, []);

  // Signed out: forget everything this provider knows, but leave the vault and
  // the lockout record on disk — they belong to the device, not the session.
  useEffect(() => {
    if (uid) return;
    migratedFor.current = null;
    setHasRealPin(false);
    setHasDuressPin(false);
    setMigratedThisLaunch(false);
    setReady(true);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;

    (async () => {
      // Read the vault and the lockout first and open the gate on those alone.
      // The lock must never wait on the network.
      const status = await refresh(uid);
      await hydratePrivacyLockout(uid);
      if (cancelled) return;
      setReady(true);

      if (migratedFor.current === uid) return;
      // Never migrate off a failed or pending read: an unread doc looks
      // exactly like a user with no PIN, and acting on that would quietly
      // turn the lock off.
      if (loading || error || !data) return;
      migratedFor.current = uid;

      const plan = planPinMigration({
        docData: data as Record<string, unknown>,
        vault: status,
      });
      if (planIsEmpty(plan)) return;

      try {
        // Local first: it cannot fail offline, and it is what keeps the user
        // unlocked if the clear below never lands.
        if (plan.importReal || plan.importDuress) {
          await importLegacyPins(uid, {
            real: plan.importReal,
            duress: plan.importDuress,
          });
          if (!cancelled) await refresh(uid);
        }

        const db = getFirestoreDb();
        if (db && plan.firestoreFieldsToClear.length > 0) {
          // `deleteField`, not "", so a follow-up ticket can deny these keys
          // outright in the rules.
          const payload: Record<string, unknown> = {};
          for (const path of plan.firestoreFieldsToClear) {
            const [head, nested] = path.split(".");
            if (nested) {
              const existing = (payload[head] as Record<string, unknown>) ?? {};
              existing[nested] = deleteField();
              payload[head] = existing;
            } else {
              payload[head] = deleteField();
            }
          }
          // Offline, the SDK queues this and the local cache reflects it at
          // once, so the migration does not spin. If the process dies first,
          // the next launch finds the vault populated and re-issues the clear.
          await commitWrite(
            () => setDoc(doc(db, "users", uid), payload, { merge: true }),
            { label: "privacyPinMigration" },
          );
        }

        if (!cancelled && (plan.importReal || plan.importDuress)) {
          setMigratedThisLaunch(true);
        }
      } catch (e) {
        // The vault write is what matters and it happens first; a failed clear
        // retries next launch.
        logError("privacyPin.migration", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uid, data, loading, error, refresh]);

  const value = useMemo<PrivacyPinContextType>(
    () => ({
      ready,
      hasRealPin,
      hasDuressPin,
      migratedThisLaunch,
      async setRealPin(pin: string) {
        if (!uid) return;
        await writeRealPin(uid, pin);
        await refresh(uid);
      },
      async setDuressPin(pin: string) {
        if (!uid) return false;
        const stored = await writeDuressPin(uid, pin);
        await refresh(uid);
        return stored;
      },
      async removeDuressPin() {
        if (!uid) return;
        await clearDuressPin(uid);
        await refresh(uid);
      },
      async removeAllPins() {
        if (!uid) return;
        await clearAllPins(uid);
        // No PIN means nothing to be locked out of.
        await forgetPrivacyLockout(uid);
        await refresh(uid);
      },
      async verifyPin(pin: string) {
        if (!uid) return "none";
        return verifyStoredPin(uid, pin);
      },
    }),
    [ready, hasRealPin, hasDuressPin, migratedThisLaunch, uid, refresh],
  );

  return (
    <PrivacyPinContext.Provider value={value}>
      {children}
    </PrivacyPinContext.Provider>
  );
}

export function usePrivacyPin(): PrivacyPinContextType {
  const context = useContext(PrivacyPinContext);
  if (!context) {
    throw new Error("usePrivacyPin must be used within a PrivacyPinProvider");
  }
  return context;
}
