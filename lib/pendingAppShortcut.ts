/**
 * One-shot pending home-screen shortcut.
 *
 * Captured as soon as the OS hands us an action (cold `QuickActions.initial`
 * or a warm listener) and consumed once the Spendly shell is ready — after
 * auth, splash, and PrivacyLock. Route restoration reads `hasPendingAppShortcut`
 * so a saved screen cannot override the shortcut destination.
 */

import type { ShortcutLaunch, ShortcutPlatform } from "@/shared/config/appShortcuts";

export type PendingAppShortcut = {
  id: string;
  platform: ShortcutPlatform;
  launch: ShortcutLaunch;
};

type Listener = () => void;

let pending: PendingAppShortcut | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      // One subscriber must not block the rest.
    }
  });
}

export function hasPendingAppShortcut(): boolean {
  return pending !== null;
}

export function peekPendingAppShortcut(): PendingAppShortcut | null {
  return pending;
}

export function setPendingAppShortcut(next: PendingAppShortcut): void {
  pending = next;
  emit();
}

/** Consume the pending action so a repeated apply cannot fire twice. */
export function takePendingAppShortcut(): PendingAppShortcut | null {
  const current = pending;
  pending = null;
  if (current) emit();
  return current;
}

export function subscribePendingAppShortcut(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetPendingAppShortcutForTests(): void {
  pending = null;
  listeners.clear();
}
