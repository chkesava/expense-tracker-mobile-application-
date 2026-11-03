/**
 * Last known quote per symbol, kept on this device (SPENDLY-624, story
 * SPENDLY-656).
 *
 * Lets a watchlist show prices at once, and offline, labelled with their own
 * time. Kept per symbol (not per list) so any list — or a stock in two lists —
 * draws from the same copy. Public market prices only, never a source of
 * truth, capped at MAX_SYMBOLS (least recently priced out). One AsyncStorage
 * item; storage failures fall back to memory only, as the other local stores do.
 */

import type { BatchQuoteDTO, StockQuotesDTO } from "@/shared/types/market";
import { STOCK_QUOTES_SCHEMA_VERSION } from "@/shared/utils/stockQuotes";

export const STOCK_QUOTE_CACHE_KEY = `spendly.stockQuotes.v${STOCK_QUOTES_SCHEMA_VERSION}`;
export const MAX_SYMBOLS = 200;

type Saved = { quote: BatchQuoteDTO; fetchedAt: string };

/** Least recently priced first. */
const memory = new Map<string, Saved>();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let writeChain: Promise<unknown> = Promise.resolve();

async function getStorage() {
  return (await import("@react-native-async-storage/async-storage")).default;
}

function isSaved(value: unknown): value is Saved {
  const v = value as Partial<Saved> | null;
  const q = v?.quote as Partial<BatchQuoteDTO> | undefined;
  return (
    !!v &&
    typeof v.fetchedAt === "string" &&
    !!q &&
    typeof q.symbol === "string" &&
    typeof q.price === "number" &&
    Number.isFinite(q.price) &&
    typeof q.asOf === "string"
  );
}

/** Reads the cache from disk once per app session. Never rejects. */
export function hydrateStockQuoteCache(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = (async () => {
      try {
        const storage = await getStorage();
        const raw = await storage.getItem(STOCK_QUOTE_CACHE_KEY);
        const list: unknown = raw ? JSON.parse(raw) : [];
        if (Array.isArray(list)) {
          for (const entry of list.slice(-MAX_SYMBOLS)) {
            // A quote priced while hydrating is newer than the disk copy.
            if (isSaved(entry) && !memory.has(entry.quote.symbol)) memory.set(entry.quote.symbol, entry);
          }
        }
      } catch {
        // Unreadable or corrupt storage: memory only this session.
      } finally {
        hydrated = true;
      }
    })();
  }
  return hydratePromise;
}

export function isStockQuoteCacheHydrated(): boolean {
  return hydrated;
}

/** Saved quotes for these symbols (those we have). */
export function peekStockQuotes(symbols: readonly string[]): Map<string, Saved> {
  const out = new Map<string, Saved>();
  for (const s of symbols) {
    const saved = memory.get(s);
    if (saved) out.set(s, saved);
  }
  return out;
}

/** Keeps each priced quote from a fresh response. A stale stand-in is not saved. */
export function rememberStockQuotes(dto: StockQuotesDTO): Promise<void> {
  if (dto.stale || dto.quotes.length === 0) return Promise.resolve();
  for (const quote of dto.quotes) {
    const prev = memory.get(quote.symbol);
    if (prev && Date.parse(prev.fetchedAt) > Date.parse(dto.fetchedAt)) continue;
    memory.delete(quote.symbol);
    memory.set(quote.symbol, { quote, fetchedAt: dto.fetchedAt });
  }
  while (memory.size > MAX_SYMBOLS) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
  const snapshot = JSON.stringify([...memory.values()]);
  const write = writeChain.then(async () => {
    try {
      const storage = await getStorage();
      await storage.setItem(STOCK_QUOTE_CACHE_KEY, snapshot);
    } catch {
      // Memory still has them; disk catches up on the next save.
    }
  });
  writeChain = write;
  return write;
}

export function resetStockQuoteCacheForTests(): void {
  memory.clear();
  hydrated = false;
  hydratePromise = null;
  writeChain = Promise.resolve();
}
