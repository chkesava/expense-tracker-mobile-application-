/**
 * Saved screener screens: the pure rules (SPENDLY-623, story SPENDLY-649).
 *
 * Saved screens live on the device only (decided 2026-10-30): no Firestore,
 * rules or read-model work. `lib/screenerSavedScreens.ts` stores them; this
 * file decides what a valid list is, so a corrupt or old copy on disk can
 * never break the screener.
 */

import { validateScreen, type Screen } from "./screener";

export const SAVED_SCREENS_VERSION = 1 as const;
export const MAX_SAVED_SCREENS = 10;
export const MAX_SCREEN_NAME_LENGTH = 40;

export type SavedScreen = {
  id: string;
  name: string;
  screen: Screen;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
};

export type SavedScreensFile = { version: typeof SAVED_SCREENS_VERSION; screens: SavedScreen[] };

/** Trimmed name, or an error message for the name field. */
export function checkScreenName(
  raw: string,
  existing: readonly SavedScreen[],
  exceptId?: string
): { ok: true; name: string } | { ok: false; message: string } {
  const name = (raw ?? "").replace(/\s+/g, " ").trim();
  if (name.length === 0) return { ok: false, message: "Give the screen a name." };
  if (name.length > MAX_SCREEN_NAME_LENGTH) {
    return { ok: false, message: `Keep the name to ${MAX_SCREEN_NAME_LENGTH} characters.` };
  }
  const clash = existing.some((s) => s.id !== exceptId && s.name.toLowerCase() === name.toLowerCase());
  if (clash) return { ok: false, message: "You already have a screen with that name." };
  return { ok: true, name };
}

function isSavedScreen(value: unknown): value is SavedScreen {
  const s = value as Partial<SavedScreen> | null;
  if (!s || typeof s !== "object") return false;
  if (typeof s.id !== "string" || s.id === "" || typeof s.name !== "string") return false;
  if (typeof s.createdAt !== "number" || typeof s.updatedAt !== "number") return false;
  const screen = s.screen as Screen | undefined;
  if (!screen || !Array.isArray(screen.ranges) || !Array.isArray(screen.sectors) || typeof screen.sort !== "object") return false;
  return validateScreen(screen).ok;
}

/**
 * Reads whatever was on disk. Anything unparseable, from another version or
 * invalid is dropped, entry by entry: one bad screen does not lose the rest.
 * Duplicate ids and names keep the first; the list is capped at the limit.
 */
export function parseSavedScreens(raw: string | null | undefined): SavedScreen[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  const file = parsed as Partial<SavedScreensFile> | null;
  if (!file || file.version !== SAVED_SCREENS_VERSION || !Array.isArray(file.screens)) return [];
  const out: SavedScreen[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const entry of file.screens) {
    if (!isSavedScreen(entry)) continue;
    const name = entry.name.trim();
    if (!name || name.length > MAX_SCREEN_NAME_LENGTH) continue;
    if (ids.has(entry.id) || names.has(name.toLowerCase())) continue;
    ids.add(entry.id);
    names.add(name.toLowerCase());
    const validated = validateScreen(entry.screen);
    out.push({ ...entry, name, screen: validated.ok ? validated.screen : entry.screen });
    if (out.length >= MAX_SAVED_SCREENS) break;
  }
  return out;
}

export function serializeSavedScreens(screens: readonly SavedScreen[]): string {
  const file: SavedScreensFile = { version: SAVED_SCREENS_VERSION, screens: [...screens] };
  return JSON.stringify(file);
}

export type SaveResult = { ok: true; screens: SavedScreen[]; saved: SavedScreen } | { ok: false; message: string };

/** Adds a screen, newest first. Pure: the caller supplies the id and time. */
export function addSavedScreen(
  existing: readonly SavedScreen[],
  name: string,
  screen: Screen,
  id: string,
  nowMs: number
): SaveResult {
  if (existing.length >= MAX_SAVED_SCREENS) {
    return { ok: false, message: `You can keep up to ${MAX_SAVED_SCREENS} screens. Delete one to save another.` };
  }
  const checkedName = checkScreenName(name, existing);
  if (!checkedName.ok) return checkedName;
  const validated = validateScreen(screen);
  if (!validated.ok) return { ok: false, message: validated.errors[0].message };
  const saved: SavedScreen = { id, name: checkedName.name, screen: validated.screen, createdAt: nowMs, updatedAt: nowMs };
  return { ok: true, screens: [saved, ...existing], saved };
}

/** Renames, and optionally replaces the filters of, an existing screen. */
export function updateSavedScreen(
  existing: readonly SavedScreen[],
  id: string,
  changes: { name?: string; screen?: Screen },
  nowMs: number
): SaveResult {
  const current = existing.find((s) => s.id === id);
  if (!current) return { ok: false, message: "That screen no longer exists." };
  let name = current.name;
  if (changes.name !== undefined) {
    const checked = checkScreenName(changes.name, existing, id);
    if (!checked.ok) return checked;
    name = checked.name;
  }
  let screen = current.screen;
  if (changes.screen !== undefined) {
    const validated = validateScreen(changes.screen);
    if (!validated.ok) return { ok: false, message: validated.errors[0].message };
    screen = validated.screen;
  }
  const saved: SavedScreen = { ...current, name, screen, updatedAt: nowMs };
  return { ok: true, screens: existing.map((s) => (s.id === id ? saved : s)), saved };
}

export function removeSavedScreen(existing: readonly SavedScreen[], id: string): SavedScreen[] {
  return existing.filter((s) => s.id !== id);
}
