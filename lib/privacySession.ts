/**
 * Session-scoped privacy lock state (mirrors web sessionStorage).
 * Cleared when the JS process dies — app starts locked if PIN is set.
 *
 * SPENDLY-22 moved the failed-attempt count and the lockout timestamp out to
 * `lib/privacyLockout.ts`, which persists them. Starting locked after a
 * restart is intended; forgetting how many times someone just guessed wrong
 * was not. The accessors below stay here, and stay synchronous, because
 * `AuthProvider` and `PrivacyLock` read them during render.
 */

import { logError } from "./errors";
import {
  clearActiveLockout,
  clearLockoutAfterSuccess,
  getFailedAttempts as lockoutFailedAttempts,
  getLockoutUntil as lockoutUntil,
  recordFailedAttempt as recordLockoutFailure,
} from "./privacyLockout";

type Listener = () => void;

const KEYS = {
  unlocked: "app_unlocked",
  duress: "app_duress",
} as const;

const store = new Map<string, string>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      // One misbehaving subscriber must not stop the rest from being notified.
      logError("privacySession.notifyListener", e);
    }
  });
}

function get(key: string): string | null {
  return store.has(key) ? store.get(key)! : null;
}

function set(key: string, value: string) {
  store.set(key, value);
  emit();
}

function remove(key: string) {
  store.delete(key);
  emit();
}

export const privacySession = {
  KEYS,

  isUnlocked(): boolean {
    return get(KEYS.unlocked) === "true";
  },

  isDuress(): boolean {
    return get(KEYS.duress) === "true";
  },

  getFailedAttempts(): number {
    return lockoutFailedAttempts();
  },

  getLockoutUntil(): number | null {
    return lockoutUntil();
  },

  markUnlocked(options: { duress: boolean }) {
    set(KEYS.unlocked, "true");
    if (options.duress) {
      set(KEYS.duress, "true");
    } else {
      remove(KEYS.duress);
    }
    // A PIN that works — real or duress — is the only thing that forgives
    // previous failures.
    clearLockoutAfterSuccess();
    emit();
  },

  lock() {
    remove(KEYS.unlocked);
    // Keep duress flag until next successful real unlock clears it —
    // matching web: lock only removes app_unlocked.
  },

  recordFailedAttempt(): {
    attempts: number;
    lockedOut: boolean;
    lockoutUntil: number | null;
  } {
    const state = recordLockoutFailure();
    emit();
    return {
      attempts: state.attempts,
      lockedOut: state.lockoutUntil !== null && state.lockoutUntil > Date.now(),
      lockoutUntil: state.lockoutUntil,
    };
  },

  /**
   * Retire an expired lockout. Keeps the attempt count, so the next failure
   * escalates — zeroing it here is what made backoff impossible before.
   */
  clearLockout() {
    clearActiveLockout();
    emit();
  },

  /**
   * Full reset on Firebase logout.
   *
   * Deliberately does **not** touch the lockout. This is reachable from the
   * lock screen's own "Forgot PIN? Sign Out" button, so clearing the counter
   * here would turn five failed guesses into a one-tap reset.
   */
  clearAll() {
    remove(KEYS.unlocked);
    remove(KEYS.duress);
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Same event name as web for parity. */
export const DURESS_CHANGED_EVENT = "duress_changed";
