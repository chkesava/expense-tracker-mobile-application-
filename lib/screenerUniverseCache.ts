/**
 * On-device copy of the last good screener universe (SPENDLY-623, story SPENDLY-650).
 *
 * Lets the screener draw at once and keep working offline (about 160 KB). It
 * holds public market prices only — no holdings, no user data — and is never
 * a source of truth: the screen always labels it with its own time (see
 * `screenerFreshnessLabel`), and losing it costs one request.
 *
 * One AsyncStorage item. The schema version is part of the key, so a version
 * bump simply starts fresh. Storage failures fall back to memory only, as the
 * other local stores do.
 */

import type { ScreenerUniverseDTO } from "@/shared/types/market";
import { SCREENER_SCHEMA_VERSION, isScreenerUniverse } from "@/shared/utils/screenerUniverse";

export const SCREENER_UNIVERSE_CACHE_KEY = `spendly.screenerUniverse.v${SCREENER_SCHEMA_VERSION}`;

let memory: ScreenerUniverseDTO | undefined;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

/** Loads the copy from disk once per app session. Never rejects. */
export function hydrateScreenerUniverseCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const storage = await getStorage();
        const raw = await storage.getItem(SCREENER_UNIVERSE_CACHE_KEY);
        const dto: unknown = raw ? JSON.parse(raw) : null;
        // A newer copy saved while hydrating wins over the disk copy.
        if (isScreenerUniverse(dto) && !memory) memory = dto;
      } catch {
        // Unreadable or corrupt storage: run memory-only this session.
      } finally {
        hydrated = true;
      }
    })();
  }
  return hydratePromise;
}

export function isScreenerUniverseCacheHydrated(): boolean {
  return hydrated;
}

/** Synchronous read for React Query's `initialData`. */
export function peekScreenerUniverse(): ScreenerUniverseDTO | undefined {
  return memory;
}

/**
 * Saves a freshly fetched copy. A copy the server marked stale is not kept
 * over a fresh one, and an older copy never replaces a newer one.
 */
export function rememberScreenerUniverse(dto: ScreenerUniverseDTO): Promise<void> {
  // A stale stand-in, or an unavailable universe with no rows, is never kept over a good copy.
  if (dto.stale || !dto.available) return Promise.resolve();
  if (memory && Date.parse(memory.fetchedAt) > Date.parse(dto.fetchedAt)) return Promise.resolve();
  memory = dto;
  const write = writeChain.then(async () => {
    try {
      const storage = await getStorage();
      await storage.setItem(SCREENER_UNIVERSE_CACHE_KEY, JSON.stringify(dto));
    } catch {
      // Memory still has it; disk catches up on the next save.
    }
  });
  writeChain = write;
  return write;
}

export function resetScreenerUniverseCacheForTests(): void {
  memory = undefined;
  hydrated = false;
  hydratePromise = null;
  writeChain = Promise.resolve();
}
