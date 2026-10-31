/**
 * Saved screener screens, kept on this device (SPENDLY-623, story SPENDLY-649).
 *
 * One AsyncStorage item holds the whole list (at most 10 small screens), so a
 * save is a single write. The version is part of the key and of the file;
 * `parseSavedScreens` drops anything it does not recognise, entry by entry.
 * Storage failures fall back to memory only, as the other local stores do:
 * the screens still work this session and are written on the next save.
 *
 * No Firestore: saved screens are not synced between devices (decided
 * 2026-10-30), so there are no rules, read-model or purge changes.
 */

import type { Screen } from "@/shared/utils/screener";
import {
  addSavedScreen,
  parseSavedScreens,
  removeSavedScreen,
  serializeSavedScreens,
  updateSavedScreen,
  type SavedScreen,
  type SaveResult,
} from "@/shared/utils/savedScreens";

export const SAVED_SCREENS_KEY = "spendly.screener.savedScreens.v1";

let screens: SavedScreen[] = [];
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function persist(): Promise<void> {
  const text = serializeSavedScreens(screens);
  const write = writeChain.then(async () => {
    try {
      const storage = await getStorage();
      await storage.setItem(SAVED_SCREENS_KEY, text);
    } catch {
      // Memory still has them; the next save writes them again.
    }
  });
  writeChain = write;
  return write;
}

/** Reads the list from disk once per app session. Never rejects. */
export function hydrateSavedScreens(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const storage = await getStorage();
        const fromDisk = parseSavedScreens(await storage.getItem(SAVED_SCREENS_KEY));
        // A screen saved while the disk read was in flight is kept on top.
        const ids = new Set(screens.map((s) => s.id));
        screens = [...screens, ...fromDisk.filter((s) => !ids.has(s.id))];
      } catch {
        // Unreadable storage: memory only this session.
      } finally {
        hydrated = true;
        emit();
      }
    })();
  }
  return hydratePromise;
}

export function isSavedScreensHydrated(): boolean {
  return hydrated;
}

/** The current list, newest first. Stable between changes (for useSyncExternalStore). */
export function getSavedScreens(): readonly SavedScreen[] {
  return screens;
}

export function subscribeSavedScreens(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function newId(nowMs: number): string {
  return `scr_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function commit(result: SaveResult): Promise<SaveResult> {
  if (!result.ok) return result;
  screens = result.screens;
  emit();
  await persist();
  return result;
}

export async function saveScreen(name: string, screen: Screen, nowMs: number = Date.now()): Promise<SaveResult> {
  await hydrateSavedScreens();
  return commit(addSavedScreen(screens, name, screen, newId(nowMs), nowMs));
}

export async function updateScreen(
  id: string,
  changes: { name?: string; screen?: Screen },
  nowMs: number = Date.now()
): Promise<SaveResult> {
  await hydrateSavedScreens();
  return commit(updateSavedScreen(screens, id, changes, nowMs));
}

export async function deleteScreen(id: string): Promise<void> {
  await hydrateSavedScreens();
  const next = removeSavedScreen(screens, id);
  if (next.length === screens.length) return;
  screens = next;
  emit();
  await persist();
}

export function resetSavedScreensForTests(): void {
  screens = [];
  hydrated = false;
  hydratePromise = null;
  writeChain = Promise.resolve();
  listeners.clear();
}
