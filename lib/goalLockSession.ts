import { useSyncExternalStore } from "react";
import { AppState } from "react-native";

/**
 * SPENDLY-614 — which locked goals were unlocked on this device in this
 * session. Unlocks are forgotten as soon as the app goes to the background,
 * so a phone handed to someone else re-asks. In memory only.
 *
 * The lock is a privacy screen on this device, not data security: the goal's
 * data is protected by the user's own sign-in and Firestore rules, like every
 * other record.
 */
let unlocked: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
let watching = false;

function watchAppState() {
  if (watching) return;
  watching = true;
  try {
    AppState.addEventListener("change", (state) => {
      if (state !== "active" && unlocked.size > 0) goalLockSession.lockAll();
    });
  } catch {
    // Non-RN test environments.
  }
}

export const goalLockSession = {
  isUnlocked: (goalId: string) => unlocked.has(goalId),
  unlock(goalId: string) {
    watchAppState();
    if (unlocked.has(goalId)) return;
    unlocked = new Set([...unlocked, goalId]);
    emit();
  },
  lockAll() {
    unlocked = new Set();
    emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  snapshot: () => unlocked,
};

/** True when the goal's amounts should be hidden on this device right now. */
export function useGoalHidden(goal: { id: string; locked?: boolean } | undefined): boolean {
  const set = useSyncExternalStore(goalLockSession.subscribe, goalLockSession.snapshot, goalLockSession.snapshot);
  return Boolean(goal?.locked) && !set.has(goal!.id);
}

/** For lists: the ids currently unlocked. */
export function useUnlockedGoalIds(): ReadonlySet<string> {
  return useSyncExternalStore(goalLockSession.subscribe, goalLockSession.snapshot, goalLockSession.snapshot);
}
