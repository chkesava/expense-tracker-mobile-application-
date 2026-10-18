/**
 * Per-instance memory cache for stock-history (SPENDLY-558).
 * Not an entrypoint: esbuild inlines it into the stock-history bundle.
 *
 * This is NOT the shared cache. The shared layer is Netlify's durable CDN
 * cache (see the headers in stock-history.ts), which every user and every
 * function instance reads. This layer lives in one warm Lambda and does two
 * jobs the CDN cannot:
 *  - keep the last good copy, so a provider failure can be answered with
 *    stale-but-real data instead of an error (stale-if-error);
 *  - merge concurrent misses for the same key inside this instance into one
 *    upstream call.
 * A cold start begins empty. Bounded by entry count, least recently used out.
 */

import type { StockHistoryDTO } from "../../shared/types/market";

export type HistoryCacheEntry = { dto: StockHistoryDTO; storedAt: number };

export class HistoryCache {
  private readonly entries = new Map<string, HistoryCacheEntry>();
  private readonly inFlight = new Map<string, Promise<unknown>>();

  constructor(private readonly maxEntries = 64) {}

  get size(): number {
    return this.entries.size;
  }

  /** Reads an entry and marks it most recently used. */
  get(key: string): HistoryCacheEntry | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry;
  }

  set(key: string, dto: StockHistoryDTO, storedAt: number): void {
    this.entries.delete(key);
    this.entries.set(key, { dto, storedAt });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  /** Runs `load` once per key at a time; concurrent callers share its promise. */
  dedupe<T>(key: string, load: () => Promise<T>): Promise<T> {
    const pending = this.inFlight.get(key);
    if (pending) return pending as Promise<T>;
    const promise = load().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }
}
