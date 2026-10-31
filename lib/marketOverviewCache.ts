/**
 * On-device copy of the last good market overview (SPENDLY-622, story SPENDLY-644).
 *
 * Lets the Markets tab draw at once on launch and show something useful
 * offline. It holds public market prices only — no holdings, no user data —
 * and is never a source of truth: the screen always labels it with its own
 * as-of time (see `freshnessLabel`), and losing it costs one request.
 *
 * One AsyncStorage item. The schema version is part of the key, so a version
 * bump simply starts fresh. Storage failures fall back to memory only, as the
 * other local stores do.
 */

import type { MarketOverviewDTO } from "@/shared/types/market";
import { MARKET_OVERVIEW_SCHEMA_VERSION, isMarketOverview } from "@/shared/utils/marketOverview";

export const MARKET_OVERVIEW_CACHE_KEY = `spendly.marketOverview.v${MARKET_OVERVIEW_SCHEMA_VERSION}`;

let memory: MarketOverviewDTO | undefined;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

/** Loads the copy from disk once per app session. Never rejects. */
export function hydrateMarketOverviewCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const storage = await getStorage();
        const raw = await storage.getItem(MARKET_OVERVIEW_CACHE_KEY);
        const dto: unknown = raw ? JSON.parse(raw) : null;
        // A newer copy saved while hydrating wins over the disk copy.
        if (isMarketOverview(dto) && !memory) memory = dto;
      } catch {
        // Unreadable or corrupt storage: run memory-only this session.
      } finally {
        hydrated = true;
      }
    })();
  }
  return hydratePromise;
}

export function isMarketOverviewCacheHydrated(): boolean {
  return hydrated;
}

/** Synchronous read for React Query's `initialData`. */
export function peekMarketOverview(): MarketOverviewDTO | undefined {
  return memory;
}

/**
 * Saves a freshly fetched copy. A copy the server marked stale is not kept
 * over a fresh one, and an older copy never replaces a newer one.
 */
export function rememberMarketOverview(dto: MarketOverviewDTO): Promise<void> {
  if (dto.stale) return Promise.resolve();
  if (memory && Date.parse(memory.fetchedAt) > Date.parse(dto.fetchedAt)) return Promise.resolve();
  memory = dto;
  const write = writeChain.then(async () => {
    try {
      const storage = await getStorage();
      await storage.setItem(MARKET_OVERVIEW_CACHE_KEY, JSON.stringify(dto));
    } catch {
      // Memory still has it; disk catches up on the next save.
    }
  });
  writeChain = write;
  return write;
}

export function resetMarketOverviewCacheForTests(): void {
  memory = undefined;
  hydrated = false;
  hydratePromise = null;
  writeChain = Promise.resolve();
}
