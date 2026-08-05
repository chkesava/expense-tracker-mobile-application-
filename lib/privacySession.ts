/**
 * Session-scoped privacy lock state (mirrors web sessionStorage).
 * Cleared when the JS process dies — app starts locked if PIN is set.
 */

type Listener = () => void;

const KEYS = {
  unlocked: "app_unlocked",
  duress: "app_duress",
  failedAttempts: "lock_failed_attempts",
  lockoutUntil: "lock_lockout_until",
} as const;

const store = new Map<string, string>();
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {
      console.error(e);
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
    return Number(get(KEYS.failedAttempts) || "0");
  },

  getLockoutUntil(): number | null {
    const raw = get(KEYS.lockoutUntil);
    return raw ? Number(raw) : null;
  },

  markUnlocked(options: { duress: boolean }) {
    set(KEYS.unlocked, "true");
    if (options.duress) {
      set(KEYS.duress, "true");
    } else {
      remove(KEYS.duress);
    }
    set(KEYS.failedAttempts, "0");
    remove(KEYS.lockoutUntil);
  },

  lock() {
    remove(KEYS.unlocked);
    // Keep duress flag until next successful real unlock clears it —
    // matching web: lock only removes app_unlocked.
  },

  recordFailedAttempt(): { attempts: number; lockedOut: boolean } {
    const attempts = privacySession.getFailedAttempts() + 1;
    set(KEYS.failedAttempts, String(attempts));
    if (attempts >= 5) {
      set(KEYS.lockoutUntil, String(Date.now() + 30_000));
      return { attempts, lockedOut: true };
    }
    return { attempts, lockedOut: false };
  },

  clearLockout() {
    remove(KEYS.lockoutUntil);
    set(KEYS.failedAttempts, "0");
  },

  /** Full reset on Firebase logout. */
  clearAll() {
    remove(KEYS.unlocked);
    remove(KEYS.duress);
    remove(KEYS.failedAttempts);
    remove(KEYS.lockoutUntil);
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

/** Same event name as web for parity. */
export const DURESS_CHANGED_EVENT = "duress_changed";
