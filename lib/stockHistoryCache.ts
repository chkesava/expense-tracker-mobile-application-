/**
 * On-device cache of recently viewed stock chart series (SPENDLY-558).
 *
 * Lets a chart the user has seen before draw instantly on the next visit,
 * while React Query decides whether it is stale enough to refetch. It holds
 * public market prices only — no holdings, no user data — and is never a
 * source of truth: losing it costs one network request.
 *
 * Bounded: at most `MAX_ENTRIES` series, least recently used out, each trimmed
 * to its newest `MAX_CANDLES` bars. Layout is one AsyncStorage item per series
 * plus an index of keys in LRU order, so saving one series never rewrites the
 * others. The schema version is part of every key; a version bump simply
 * starts a fresh cache.
 *
 * Storage failures fall back to memory only, as the other local stores do.
 */

import type { StockHistoryDTO, StockHistoryRange } from "@/shared/types/market";
import { STOCK_HISTORY_SCHEMA_VERSION, historyCacheKey } from "@/shared/utils/stockHistory";

const PREFIX = `spendly.stockHistory.v${STOCK_HISTORY_SCHEMA_VERSION}`;
export const STOCK_HISTORY_INDEX_KEY = `${PREFIX}.index`;
export const MAX_ENTRIES = 20;
export const MAX_CANDLES = 500;

/** Most recently used last. */
const memory = new Map<string, StockHistoryDTO>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

function entryKey(cacheKey: string): string {
  return `${PREFIX}:${cacheKey}`;
}

function isUsable(value: unknown): value is StockHistoryDTO {
  const dto = value as Partial<StockHistoryDTO> | null;
  return (
    !!dto &&
    dto.success === true &&
    dto.schemaVersion === STOCK_HISTORY_SCHEMA_VERSION &&
    typeof dto.symbol === "string" &&
    typeof dto.range === "string" &&
    typeof dto.fetchedAt === "string" &&
    Array.isArray(dto.candles)
  );
}

/** Loads the cache from disk once per app session. Never rejects. */
export function hydrateStockHistoryCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const storage = await getStorage();
        const rawIndex = await storage.getItem(STOCK_HISTORY_INDEX_KEY);
        const index: unknown = rawIndex ? JSON.parse(rawIndex) : [];
        if (Array.isArray(index)) {
          for (const key of index.slice(-MAX_ENTRIES)) {
            if (typeof key !== "string") continue;
            try {
              const raw = await storage.getItem(entryKey(key));
              const dto: unknown = raw ? JSON.parse(raw) : null;
              if (isUsable(dto) && historyCacheKey(dto.symbol, dto.range) === key) {
                memory.set(key, dto);
              }
            } catch {
              // One corrupt entry is just a miss.
            }
          }
        }
      } catch {
        // Unreadable storage: run memory-only this session.
      } finally {
        hydrated = true;
      }
    })();
  }
  return hydratePromise;
}

export function isStockHistoryCacheHydrated(): boolean {
  return hydrated;
}

/** Synchronous read for React Query's `initialData`. */
export function peekStockHistory(symbol: string, range: StockHistoryRange): StockHistoryDTO | undefined {
  return memory.get(historyCacheKey(symbol, range));
}

/** Saves a freshly fetched series and evicts the least recently used beyond the cap. */
export function rememberStockHistory(dto: StockHistoryDTO): Promise<void> {
  // A copy the server marked stale is not worth keeping over a fresh one.
  if (dto.stale) return Promise.resolve();
  const key = historyCacheKey(dto.symbol, dto.range);
  const trimmed: StockHistoryDTO =
    dto.candles.length > MAX_CANDLES ? { ...dto, candles: dto.candles.slice(-MAX_CANDLES) } : dto;

  memory.delete(key);
  memory.set(key, trimmed);
  const evicted: string[] = [];
  while (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
    evicted.push(oldest);
  }
  const index = [...memory.keys()];

  const write = writeChain.then(async () => {
    try {
      const storage = await getStorage();
      await storage.setItem(entryKey(key), JSON.stringify(trimmed));
      await storage.setItem(STOCK_HISTORY_INDEX_KEY, JSON.stringify(index));
      for (const old of evicted) await storage.removeItem(entryKey(old));
    } catch {
      // Memory still has it; disk catches up on the next save.
    }
  });
  writeChain = write;
  return write;
}

export function resetStockHistoryCacheForTests(): void {
  memory.clear();
  hydrated = false;
  hydratePromise = null;
  writeChain = Promise.resolve();
}
