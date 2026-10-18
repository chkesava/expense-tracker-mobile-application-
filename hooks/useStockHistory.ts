import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { logWarning } from '@/lib/errors';
import { isAbortError } from '@/lib/fetchWithTimeout';
import {
  hydrateStockHistoryCache,
  isStockHistoryCacheHydrated,
  peekStockHistory,
  rememberStockHistory,
} from '@/lib/stockHistoryCache';
import { fetchStockHistory, MarketDataError } from '@/services/marketDataService';
import type { StockHistoryDTO, StockHistoryRange } from '@/shared/types/market';
import {
  RANGE_CONFIG,
  STOCK_HISTORY_SCHEMA_VERSION,
  historyFreshSeconds,
  isIndianListing,
  isIndianMarketOpen,
} from '@/shared/utils/stockHistory';

/** True once the on-device chart cache has been read (once per app session). */
export function useStockHistoryCacheReady(): boolean {
  const [ready, setReady] = useState(isStockHistoryCacheHydrated);
  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void hydrateStockHistoryCache().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);
  return ready;
}

/** Codes where an immediate retry cannot help. */
const NO_RETRY = new Set(['THROTTLED', 'NOT_FOUND', 'NO_DATA', 'MALFORMED', 'BAD_REQUEST']);

/**
 * Historical series for the stock chart (SPENDLY-558).
 *
 * - Source is /api/stock-history only. No Firestore read happens here, and
 *   changing range never touches Firebase.
 * - Keyed by schema, symbol and range. Chart type is not part of the key, so
 *   switching line ↔ candles is free.
 * - Freshness follows the server's range rules; a series seen earlier draws
 *   straight from the on-device cache and refetches only when stale. Mount
 *   this only after `useStockHistoryCacheReady()` so that cache is loaded.
 * - React Query merges concurrent identical requests and cancels a superseded
 *   one through `signal` when the range changes.
 * - Kept separate from the quote (`useMarketQuotes`), which has its own policy.
 */
export function useStockHistory(
  symbol: string | null,
  range: StockHistoryRange,
  { enabled = true }: { enabled?: boolean } = {}
) {
  const isFocused = useIsFocused();
  const now = Date.now();
  const staleMs = symbol ? historyFreshSeconds(range, symbol, now) * 1000 : 0;
  const marketOpen = !!symbol && (!isIndianListing(symbol) || isIndianMarketOpen(now));

  return useQuery<StockHistoryDTO | null>({
    queryKey: ['stock-history', STOCK_HISTORY_SCHEMA_VERSION, symbol, range],
    queryFn: async ({ signal }) => {
      try {
        const dto = await fetchStockHistory(symbol as string, range, { signal });
        if (dto) void rememberStockHistory(dto);
        return dto;
      } catch (error) {
        if (!isAbortError(error) || !signal.aborted) {
          logWarning('portfolio.stockHistory', error, {
            range,
            code: error instanceof MarketDataError ? error.code : undefined,
          });
        }
        throw error;
      }
    },
    enabled: enabled && !!symbol && isFocused,
    staleTime: staleMs,
    gcTime: RANGE_CONFIG[range].clientGcMs,
    initialData: () => (symbol ? peekStockHistory(symbol, range) : undefined),
    initialDataUpdatedAt: () => {
      const cached = symbol ? peekStockHistory(symbol, range) : undefined;
      return cached ? Date.parse(cached.fetchedAt) : undefined;
    },
    // While a new range loads, keep this stock's previous chart on screen
    // (dimmed by the card) rather than flashing a skeleton.
    placeholderData: (previous) => (previous && previous.symbol === symbol ? previous : undefined),
    // Only the intraday view moves enough to poll, and only while trading.
    refetchInterval: range === '1D' && marketOpen && isFocused ? 60_000 : false,
    refetchIntervalInBackground: false,
    retry: (failureCount, error) =>
      failureCount < 1 && !(error instanceof MarketDataError && error.code && NO_RETRY.has(error.code)),
  });
}
